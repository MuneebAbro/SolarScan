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

	// Serve demo webpage on GET
	if (req.method === 'GET') {
		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		res.status(200).send(renderDemoPage());
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

function renderDemoPage() {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Analyze Bill Demo</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; line-height: 1.4; }
    .card { max-width: 940px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
    h1 { font-size: 22px; margin: 0 0 16px; }
    label { display: block; margin: 12px 0 6px; font-weight: 600; }
    input[type="file"], input[type="number"], textarea { width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; }
    textarea { min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    button { appearance: none; border: 0; background: #111827; color: white; padding: 10px 14px; border-radius: 8px; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .muted { color: #6b7280; font-size: 12px; }
    pre { background: #0b1020; color: #d1e7ff; padding: 12px; border-radius: 8px; overflow: auto; }
    .divider { height: 1px; background: #e5e7eb; margin: 16px 0; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
  <script>
    // Configure pdf.js worker
    if (window['pdfjsLib']) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }

    async function extractTextFromImage(file) {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng');
      return text;
    }

    async function renderPdfPageToImage(page) {
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL('image/png');
    }

    async function extractTextFromPdf(file) {
      const arrayBuf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const dataUrl = await renderPdfPageToImage(page);
        const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng');
        fullText += '\n\n' + text;
      }
      return fullText.trim();
    }

    async function onExtractClick() {
      const fileInput = document.getElementById('file');
      const textArea = document.getElementById('text');
      const status = document.getElementById('status');
      const file = fileInput.files && fileInput.files[0];
      if (!file) { alert('Please choose an image or PDF'); return; }
      status.textContent = 'Running OCR...';
      let text = '';
      try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          text = await extractTextFromPdf(file);
        } else {
          text = await extractTextFromImage(file);
        }
        textArea.value = text;
        status.textContent = 'OCR complete.';
      } catch (e) {
        console.error(e);
        status.textContent = 'OCR failed: ' + (e && e.message ? e.message : e);
      }
    }

    async function onAnalyzeClick() {
      const text = document.getElementById('text').value.trim();
      const budgetRaw = document.getElementById('budget').value;
      const result = document.getElementById('result');
      const status = document.getElementById('status');
      if (!text) { alert('Please paste or extract bill text first'); return; }
      const budget = budgetRaw ? Number(budgetRaw) : undefined;
      status.textContent = 'Analyzing...';
      result.textContent = '';
      try {
        const resp = await fetch(window.location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, budget })
        });
        const data = await resp.json();
        result.textContent = JSON.stringify(data, null, 2);
        status.textContent = 'Done.';
      } catch (e) {
        console.error(e);
        status.textContent = 'Analysis failed: ' + (e && e.message ? e.message : e);
      }
    }
  </script>
</head>
<body>
  <div class="card">
    <h1>Bill Analyzer + Solar Suggestion (Demo)</h1>
    <div class="row">
      <div style="flex:1 1 280px; min-width:280px;">
        <label for="file">Upload bill image/PDF</label>
        <input id="file" type="file" accept="image/*,.pdf" />
      </div>
      <div>
        <label>&nbsp;</label>
        <button onclick="onExtractClick()">Extract text (OCR)</button>
      </div>
    </div>

    <label for="text">Extracted or pasted bill text</label>
    <textarea id="text" placeholder="Paste bill text here or use OCR above..."></textarea>

    <div class="row">
      <div style="flex:1 1 220px; min-width:220px;">
        <label for="budget">Budget (optional)</label>
        <input id="budget" type="number" step="0.01" placeholder="e.g. 5000" />
        <div class="muted">If set, suggestions may size within budget.</div>
      </div>
      <div>
        <label>&nbsp;</label>
        <button onclick="onAnalyzeClick()">Analyze and suggest</button>
      </div>
    </div>

    <div class="divider"></div>
    <div id="status" class="muted"></div>
    <h3>Result</h3>
    <pre id="result"></pre>
  </div>
</body>
</html>`;
}

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


