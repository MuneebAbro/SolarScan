import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
	// CORS for web/app usage
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

	// Redirect GET to static demo page
	if (req.method === 'GET') {
		res.writeHead(302, { Location: '/' });
		res.end();
		return;
	}

	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	try {
		// Accepts either: { text: string, budget?: number }
		// or structured overrides: { fields?: { units, cost, ... }, budget?: number }
		const { text, fields, budget } = req.body || {};

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
		const json = safeExtractJson(raw);
		if (!json) {
			return res.status(502).json({ error: 'AI returned invalid JSON', raw });
		}

		return res.status(200).json({ success: true, ...json });
	} catch (err) {
		console.error('analyze-bill error', err);
		return res.status(500).json({ error: 'Server error', message: err.message });
	}
}

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

// Removed inline demo page; now served from /public

function safeExtractJson(text) {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch (_) {
		// Try to locate a JSON block in markdown
		const match = text.match(/[\{\[][\s\S]*[\}\]]/);
		if (!match) return null;
		try {
			return JSON.parse(match[0]);
		} catch (e2) {
			return null;
		}
	}
}


