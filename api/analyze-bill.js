// analyze-bill-with-pakistan-pricing.js
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ---- Config / market data (tweakable or load from a JSON file) ----
const PK_DEFAULTS = {
  costPerKw: 180000, // PKR per kW (default). Range: 150k - 200k per kW (2025 Pakistan market).
  panelPricePerWatt: { low: 24, high: 45 }, // PKR per watt for panels
  inverterPricePerKw: 25000, // PKR per kW (rough for inverter portion)
  installationPercent: 0.12, // installation + mounting as % of hardware
  prodByCityKwhPerKwPerMonth: {
    // typical monthly production by city (approx). Use these as defaults.
    karachi: 160,
    lahore: 150,
    islamabad: 150,
    peshawar: 155,
    default: 150
  },
  emissionKgPerKwh: 0.45 // default grid emission factor (kg CO2 / kWh)
};

// ---- Helper functions ----
function pickProductionForLocation(location) {
  if (!location) return PK_DEFAULTS.prodByCityKwhPerKwPerMonth.default;
  const key = location.toLowerCase();
  return PK_DEFAULTS.prodByCityKwhPerKwPerMonth[key] || PK_DEFAULTS.prodByCityKwhPerKwPerMonth.default;
}

function moneyRound(x) {
  return Math.round(x); // PKR rounding
}

function safeNum(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

// ---- Your existing handler with added recommendation processing ----
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, fields, budget, city } = req.body || {};

    if (!text && !fields) {
      return res.status(400).json({ error: 'Provide bill text or fields' });
    }

    const systemPrompt =
      'You are a precise bill parser and solar advisor. Always return strict JSON. Do not include explanations.';
    const userPrompt = buildPrompt({ text, fields, budget });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 2048,
      top_p: 1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const parsed = safeExtractJson(raw);
    if (!parsed || !parsed.parsedFields) {
      return res.status(502).json({ error: 'AI returned invalid JSON', raw });
    }

    // ---- Enrich & compute recommendations ----
    const pf = parsed.parsedFields;
    const unitsKWh = safeNum(pf.unitsKWh) ?? (fields && safeNum(fields.unitsKWh)) ?? null;
    const totalCost = safeNum(pf.totalCost) ?? (fields && safeNum(fields.totalCost)) ?? null;
    const costPerUnit = safeNum(pf.costPerUnit) ?? (totalCost && unitsKWh ? totalCost / unitsKWh : null);
    const billingDate = pf.billingDate || null;
    const loc = (pf.location || city || null);

    const prodPerKwPerMonth = pickProductionForLocation(loc);
    const costPerKw = PK_DEFAULTS.costPerKw;
    const emissionKgPerKwh = PK_DEFAULTS.emissionKgPerKwh;

    let recommendation = {
      suggestedSystemKw: null,
      estMonthlySavings: null,
      approxInstallCost: null,
      paybackYears: null,
      co2ReductionTonsPerYear: null,
      notes: []
    };

    if (unitsKWh && costPerUnit) {
      // Full system required to offset 100%:
      const requiredKw = unitsKWh / prodPerKwPerMonth;

      // If user set budget: compute maximum system within budget
      let budgetNum = typeof budget === 'number' && budget > 0 ? budget : null;
      let maxKwByBudget = budgetNum ? budgetNum / costPerKw : null;

      // Decide final suggested system size:
      let finalKw = requiredKw;
      if (budgetNum && maxKwByBudget < requiredKw) {
        finalKw = Math.max(0.5, maxKwByBudget); // floor to 0.5 kW minimum suggestion
        recommendation.notes.push('Budget insufficient for full offset — suggesting partial system.');
      }

      // Install cost estimate (includes inverter + mounting + installation)
      const rawHardware = finalKw * costPerKw;
      // Provide breakdown: panels (approx 60%), inverter+balance (25%), installation (15%)
      const approxPanels = moneyRound(rawHardware * 0.60);
      const approxInverter = moneyRound(rawHardware * 0.25);
      const approxInstall = moneyRound(rawHardware * 0.15);
      const totalInstallCost = moneyRound(approxPanels + approxInverter + approxInstall);

      const estMonthlyProduction = finalKw * prodPerKwPerMonth;
      const estMonthlySavings = moneyRound(Math.min(estMonthlyProduction, unitsKWh) * costPerUnit); // PKR

      let paybackYears = null;
      if (estMonthlySavings > 0) {
        paybackYears = (totalInstallCost / (estMonthlySavings * 12));
        paybackYears = Number(paybackYears.toFixed(2));
      }

      const co2TonsPerYear = Number(((estMonthlyProduction * 12 * emissionKgPerKwh) / 1000).toFixed(3));

      recommendation = {
        suggestedSystemKw: Number(finalKw.toFixed(2)),
        estMonthlyProductionKwh: Number(estMonthlyProduction.toFixed(1)),
        estMonthlySavings: estMonthlySavings,
        approxInstallCost: totalInstallCost,
        costBreakdown: {
          panels: approxPanels,
          inverterAndBalance: approxInverter,
          installation: approxInstall
        },
        paybackYears: paybackYears,
        co2ReductionTonsPerYear: co2TonsPerYear,
        percentOffset: Number(((estMonthlyProduction / unitsKWh) * 100).toFixed(1)),
        notes: recommendation.notes
      };
    } else {
      parsed.assumptions = parsed.assumptions || [];
      parsed.assumptions.push('Missing unitsKWh or costPerUnit — cannot compute solar recommendation.');
    }

    // Return merged object (original parsed + our computed recommendation)
    const out = {
      success: true,
      parsedFields: parsed.parsedFields,
      assumptions: parsed.assumptions || [],
      recommendation,
      budgetRequest: parsed.budgetRequest || { needsBudget: false, reason: null },
      meta: {
        usedDefaults: {
          costPerKw,
          prodPerKwPerMonth,
          emissionKgPerKwh
        }
      }
    };

    return res.status(200).json(out);
  } catch (err) {
    console.error('analyze-bill error', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};

// ---- helper builder / extractor (unchanged from your original file) ----
function buildPrompt(input) {
  const { text, fields, budget } = input;
  const base = [];
  if (text) {
    base.push('Electric bill text to parse:\n\n' + text);
  }
  if (fields) {
    base.push('Known fields (may override parsing): ' + JSON.stringify(fields));
  }
  if (typeof budget === 'number') {
    base.push('User budget for solar (currency): ' + budget);
  }

  return (
    base.join('\n\n') +
    `\n\nExtract and return STRICT JSON with this shape:
{
  "parsedFields": {
    "unitsKWh": number | null,
    "totalCost": number | null,
    "costPerUnit": number | null,
    "billingDate": string | null,
    "location": string | null,
    "tariff": string | null,
    "peakDemandKw": number | null
  },
  "assumptions": string[],
  "recommendation": {
    "suggestedSystemKw": number | null,
    "estMonthlySavings": number | null,
    "approxInstallCost": number | null,
    "paybackYears": number | null,
    "co2ReductionTonsPerYear": number | null,
    "notes": string[]
  },
  "budgetRequest": {
    "needsBudget": boolean,
    "reason": string | null
  }
}

Rules:
- If values cannot be found, use null, not strings.
- Compute costPerUnit from totalCost/unitsKWh when possible.
- If budget is insufficient for full offset, suggest partial system size within budget.
- Keep arrays concise and actionable.`
  );
}

function safeExtractJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/[\{\[][\s\S]*[\}\]]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (e2) {
      return null;
    }
  }
}
