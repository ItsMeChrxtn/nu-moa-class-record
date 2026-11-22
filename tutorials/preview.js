// Shows what a downloaded file looks like: Excel files are printed to PDF by Excel itself (so the
// formulas are calculated and the school's print layout is kept), PDFs are drawn with pdf.js, and
// the pages are shown in a simple file viewer inside the recording.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { HERE, ROOT, launch } from './lib.js';

const run = promisify(execFile);
const PDFJS = path.join(ROOT, 'client', 'node_modules', 'pdfjs-dist', 'build');
const JSZip = createRequire(path.join(ROOT, 'server', 'package.json'))('jszip');

// { sheetName: pdfPath } for every visible sheet of a workbook.
export async function xlsxToPdfs(xlsx, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const { stdout } = await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'xlsx-to-pdf.ps1'), '-Xlsx', xlsx, '-OutDir', outDir], { maxBuffer: 1 << 22, timeout: 180000 });
  return Object.fromEntries(stdout.trim().split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')));
}

// The files inside a ZIP, written next to it.
export async function unzip(zipPath) {
  const dir = zipPath.replace(/\.zip$/i, '');
  fs.mkdirSync(dir, { recursive: true });
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const out = [];
  for (const f of Object.values(zip.files)) {
    if (f.dir) continue;
    const p = path.join(dir, path.basename(f.name));
    fs.writeFileSync(p, await f.async('nodebuffer'));
    out.push(p);
  }
  return out;
}

// PNG files for the given pages (1-based) of PDFs, drawn by pdf.js in a headless browser.
export async function pdfsToPngs(jobs, { width = 2400 } = {}) {
  const browser = await launch();
  const page = await browser.newPage();
  const files = new Map(jobs.map((j, i) => [`/doc${i}.pdf`, j.pdf]));
  await page.route('https://pdf.local/**', (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === '/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><script type="module">import * as pdfjs from "/pdf.mjs"; pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs"; window.pdfjs = pdfjs; window.ready = true;</script>' });
    if (p === '/pdf.mjs' || p === '/pdf.worker.mjs') return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(PDFJS, p.slice(1))) });
    if (files.has(p)) return r.fulfill({ contentType: 'application/pdf', body: fs.readFileSync(files.get(p)) });
    return r.fulfill({ status: 404 });
  });
  await page.goto('https://pdf.local/');
  await page.waitForFunction(() => window.ready);
  const out = [];
  for (let i = 0; i < jobs.length; i++) {
    const { png, pageNo = 1 } = jobs[i];
    const data = await page.evaluate(async ({ url, pageNo, width }) => {
      const doc = await window.pdfjs.getDocument(url).promise;
      const pg = await doc.getPage(pageNo);
      const base = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: width / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      // Trim the blank paper around the content (plus a small margin), so the page fills the viewer.
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let x0 = canvas.width, y0 = canvas.height, x1 = 0, y1 = 0;
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const i = (y * canvas.width + x) * 4;
          if (data[i + 3] && (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235)) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 <= x0 || y1 <= y0) return canvas.toDataURL('image/png').split(',')[1];
      const pad = Math.round(canvas.width * 0.02);
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
      x1 = Math.min(canvas.width, x1 + pad); y1 = Math.min(canvas.height, y1 + pad);
      const out = document.createElement('canvas');
      out.width = x1 - x0;
      out.height = y1 - y0;
      const octx = out.getContext('2d');
      octx.fillStyle = '#fff';
      octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      return out.toDataURL('image/png').split(',')[1];
    }, { url: `/doc${i}.pdf`, pageNo, width });
    fs.writeFileSync(png, Buffer.from(data, 'base64'));
    out.push(png);
  }
  await browser.close();
  return out;
}

// The viewer page: a dark backdrop, a title bar with the file name, and one page at a time that
// can be zoomed into (window.view(i), window.zoom(x, y, scale) with x/y as fractions of the page).
export function viewerHtml(pages) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#1e2433;font-family:Inter,system-ui,sans-serif}
  .bar{position:fixed;top:0;left:0;right:0;height:52px;display:flex;align-items:center;gap:12px;padding:0 20px;background:#0f172a;color:#fff;z-index:2}
  .ico{font:700 11px 'JetBrains Mono',monospace;padding:5px 7px;border-radius:4px;color:#fff}
  .ico.xlsx{background:#107c41}.ico.pdf{background:#d13438}.ico.zip{background:#7a5af8}
  .name{font-weight:600;font-size:15px}.sub{margin-left:auto;font:500 12px 'JetBrains Mono',monospace;color:#94a3b8}
  .stage{position:fixed;top:52px;left:0;right:0;bottom:0;display:grid;place-items:center;overflow:hidden}
  .paper{position:relative;transform-origin:0 0;transition:transform 1.4s cubic-bezier(.45,.05,.2,1);will-change:transform}
  .paper img{display:block;box-shadow:0 18px 50px #0008;background:#fff}
  .page{position:absolute;inset:0;opacity:0;transition:opacity .5s}.page.on{opacity:1;position:relative}
</style></head><body>
<div class="bar"><span class="ico" id="ico"></span><span class="name" id="name"></span><span class="sub" id="sub"></span></div>
<div class="stage" id="stage"><div class="paper" id="paper">
${pages.map((p, i) => `<div class="page" data-i="${i}"><img src="${p.src}"></div>`).join('')}
</div></div>
<script>
  const pages = ${JSON.stringify(pages.map(({ src, ...p }) => p))};
  const stage = document.getElementById('stage'), paper = document.getElementById('paper');
  let fit = 1, cur = 0;
  function layout() {
    const img = document.querySelectorAll('.page img')[cur];
    const sw = stage.clientWidth - 60, sh = stage.clientHeight - 40;
    fit = Math.min(sw / img.naturalWidth, sh / img.naturalHeight);
    document.querySelectorAll('.page img').forEach((im) => { im.style.width = im.naturalWidth * fit + 'px'; });
  }
  window.view = (i) => {
    cur = i;
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('on', +p.dataset.i === i));
    const p = pages[i];
    document.getElementById('ico').textContent = p.kind.toUpperCase();
    document.getElementById('ico').className = 'ico ' + p.kind;
    document.getElementById('name').textContent = p.name;
    document.getElementById('sub').textContent = p.sub || 'Opened from Downloads';
    layout();
    paper.style.transition = 'none'; paper.style.transform = 'none';
    requestAnimationFrame(() => (paper.style.transition = ''));
  };
  // Zoom so that point (x, y) of the page sits in the middle of the screen.
  window.zoom = (x, y, s) => {
    if (s <= 1) { paper.style.transform = 'none'; return; }
    const r = paper.getBoundingClientRect(), st = stage.getBoundingClientRect();
    const w = paper.offsetWidth, h = paper.offsetHeight;
    const left = r.left - st.left - (new DOMMatrix(getComputedStyle(paper).transform).e || 0);
    const top = r.top - st.top - (new DOMMatrix(getComputedStyle(paper).transform).f || 0);
    const tx = st.width / 2 - left - x * w * s, ty = st.height / 2 - top - y * h * s;
    paper.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
  };
  Promise.all([...document.images].map((im) => im.decode().catch(() => {}))).then(() => { window.view(0); window.ready = true; });
</script></body></html>`;
}
