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
		const endpoint = new URL('/api/analyze-bill', window.location.origin).toString();
		const resp = await fetch(endpoint, {
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

document.getElementById('btnExtract').addEventListener('click', onExtractClick);
document.getElementById('btnAnalyze').addEventListener('click', onAnalyzeClick);


