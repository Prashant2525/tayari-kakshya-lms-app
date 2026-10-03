/**
 * The in-app PDF reader (T-038): a small page served by the API that renders PDFs with pdf.js (self-hosted from
 * `pdfjs-dist`, never a CDN, so premium PDFs only travel between our API and the app). The app opens the page in a
 * WebView (phones) or an iframe (web build) and posts `{ type: 'open', token, itemId, page }`; the page fetches the
 * watermarked PDF with that token, renders pages as images (no selectable text layer) and reports the page number.
 */
export const VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>PDF</title>
<link rel="stylesheet" href="assets/viewer.css">
<script type="module" src="assets/viewer.mjs"></script>
</head>
<body>
<main id="pages" aria-label="PDF pages"></main>
<p id="status" role="status"></p>
</body>
</html>
`;

export const VIEWER_CSS = `html,body{margin:0;background:#EEF1F6;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#pages{display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0 24px}
.page{position:relative;width:calc(100% - 24px);max-width:900px;background:#fff;box-shadow:0 1px 3px rgba(15,27,61,.12)}
.page canvas{display:block;width:100%;height:100%}
#status{position:fixed;inset:auto 0 16px 0;margin:0;text-align:center;font:500 14px system-ui,sans-serif;color:#475569}
#status:empty{display:none}
`;

export const VIEWER_JS = `import * as pdfjs from './pdf.min.mjs';

const asset = (path) => new URL(path, import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = asset('./pdf.worker.min.mjs');

const pagesEl = document.getElementById('pages');
const statusEl = document.getElementById('status');
let opened = false;

function send(message) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  else if (window.parent !== window) window.parent.postMessage(message, '*');
}

function onMessage(event) {
  let data = event.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return; }
  }
  if (!data || data.type !== 'open' || opened) return;
  // In a browser only the embedding app may open a document; WebView messages come from the app itself.
  if (!window.ReactNativeWebView && event.source !== window.parent) return;
  opened = true;
  open(data).catch(() => send({ type: 'error', status: 0, code: 'RENDER_FAILED' }));
}
window.addEventListener('message', onMessage);
document.addEventListener('message', onMessage);

async function open({ token, itemId, page }) {
  if (!/^[0-9a-f-]{36}$/i.test(String(itemId))) return;
  statusEl.textContent = '…';
  const res = await fetch(new URL('../learning-items/' + itemId + '/pdf', location.href), {
    headers: { Authorization: 'Bearer ' + token },
    cache: 'no-store',
  });
  if (!res.ok) {
    let code = 'ERROR';
    try { code = (await res.json()).error.code; } catch {}
    statusEl.textContent = '';
    send({ type: 'error', status: res.status, code });
    return;
  }
  const data = new Uint8Array(await res.arrayBuffer());
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    standardFontDataUrl: asset('./standard_fonts/'),
    cMapUrl: asset('./cmaps/'),
    cMapPacked: true,
    wasmUrl: asset('./wasm/'),
  }).promise;
  statusEl.textContent = '';
  const first = await doc.getPage(1);
  const ratio = first.getViewport({ scale: 1 }).height / first.getViewport({ scale: 1 }).width;
  const holders = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const holder = document.createElement('div');
    holder.className = 'page';
    holder.dataset.page = String(n);
    holder.style.aspectRatio = String(1 / ratio);
    holder.setAttribute('aria-label', 'Page ' + n);
    pagesEl.appendChild(holder);
    holders.push(holder);
  }

  const rendered = new Set();
  async function render(holder) {
    const n = Number(holder.dataset.page);
    if (rendered.has(n)) return;
    rendered.add(n);
    const pdfPage = await doc.getPage(n);
    const base = pdfPage.getViewport({ scale: 1 });
    holder.style.aspectRatio = String(base.width / base.height);
    const scale = (holder.clientWidth * Math.min(window.devicePixelRatio || 1, 3)) / base.width;
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    holder.appendChild(canvas);
    await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }

  // Render pages as they come near the screen; report the page most in view.
  const near = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && render(e.target)),
    { rootMargin: '150% 0px' },
  );
  const visible = new Map();
  let reported = 0;
  let timer = 0;
  const current = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => visible.set(Number(e.target.dataset.page), e.intersectionRatio));
      let best = reported || 1;
      let bestRatio = -1;
      visible.forEach((r, n) => { if (r > bestRatio) { bestRatio = r; best = n; } });
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (best !== reported) {
          reported = best;
          send({ type: 'page', page: best, pageCount: doc.numPages });
        }
      }, 600);
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  holders.forEach((h) => { near.observe(h); current.observe(h); });

  send({ type: 'loaded', pageCount: doc.numPages });
  const start = Math.min(Math.max(Number(page) || 1, 1), doc.numPages);
  if (start > 1) holders[start - 1].scrollIntoView();
}

send({ type: 'ready' });
`;
