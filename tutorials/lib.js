// Recording engine: runs a scripted walkthrough of the app in Chromium, records the screen,
// speaks each step with a free neural voice (edge-tts) and merges everything into an MP4.

import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { chromium } from 'playwright';

const run = promisify(execFile);
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const OUT = path.join(HERE, 'output');
const CACHE = path.join(HERE, '.cache');
export const PORT = 5055;
export const BASE = `http://localhost:${PORT}`;
export const VOICE = process.env.VOICE || 'en-US-AvaNeural';
export const SIZE = { width: 1280, height: 720 };
// Use a Chromium that is already installed (any Playwright build) instead of downloading one.
export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    for (const sub of ['chrome-win64', 'chrome-win']) {
      const exe = path.join(base, d, sub, 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined; // Playwright's own default
}
export const launch = () => chromium.launch({ executablePath: chromiumPath() });
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// ---------- voice ----------

async function speak(text) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${createHash('sha1').update(VOICE + '|' + text).digest('hex').slice(0, 16)}.mp3`);
  if (!fs.existsSync(file)) {
    await run('py', ['-m', 'edge_tts', '--voice', VOICE, '--rate=+4%', '--text', text, '--write-media', file]);
  }
  return { file, duration: await mediaDuration(file) };
}

async function mediaDuration(file) {
  const { stderr } = await run(ffmpeg, ['-hide_banner', '-i', file]).catch((e) => e);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 : 0;
}

// ---------- demo server ----------

export function startDemoServer() {
  // Stand-in for Brevo so "emailed" account details go nowhere.
  const mail = http.createServer((req, res) => {
    req.resume();
    res.writeHead(201, { 'Content-Type': 'application/json' }).end('{"messageId":"<demo@example.com>"}');
  });
  mail.listen(5056);
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(ROOT, 'server'),
    env: {
      ...process.env,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/class-record-demo',
      PORT: String(PORT),
      APP_URL: BASE,
      BREVO_API_KEY: 'demo',
      MAIL_FROM_EMAIL: 'classrecord@example.com',
      BREVO_API_URL: 'http://127.0.0.1:5056/v3/smtp/email',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const ready = new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => /running|listening/i.test(String(d)) && resolve());
    server.on('exit', (code) => reject(new Error(`demo server exited (${code})`)));
  });
  return {
    ready,
    stop() {
      server.kill();
      mail.close();
    },
  };
}

export async function seed(...flags) {
  await run(process.execPath, ['scripts/seed-demo.js', ...flags], { cwd: path.join(ROOT, 'server') });
}

// ---------- recording ----------

const CURSOR = `
(() => {
  const mk = () => {
    if (document.getElementById('__cur') || !document.body) return;
    const c = document.createElement('div');
    c.id = '__cur';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.8L4 20z" fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(' + (window.__cx ?? -50) + 'px,' + (window.__cy ?? -50) + 'px)';
    document.body.appendChild(c);
  };
  document.addEventListener('mousemove', (e) => {
    window.__cx = e.clientX; window.__cy = e.clientY; mk();
    const c = document.getElementById('__cur');
    if (c) c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
  }, true);
  document.addEventListener('mousedown', (e) => {
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;border:3px solid #1d4ed8;width:10px;height:10px;left:' + (e.clientX - 5) + 'px;top:' + (e.clientY - 5) + 'px;transition:all .45s ease-out;opacity:.9';
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(5)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 500);
  }, true);
  document.addEventListener('DOMContentLoaded', mk);
})();`;

// Helpers the scripts use: a visible cursor that glides to elements, human-speed typing.
function helpers(page) {
  let pos = { x: SIZE.width / 2, y: SIZE.height / 2 };
  const h = {
    page,
    async moveTo(x, y, ms = 550) {
      const from = { ...pos };
      const steps = Math.max(8, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
        await sleep(12);
      }
      pos = { x, y };
    },
    async point(target, ms) {
      const loc = typeof target === 'string' ? page.locator(target).first() : target;
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      if (!b) throw new Error(`not visible: ${target}`);
      await h.moveTo(b.x + b.width / 2, b.y + Math.min(b.height / 2, 18), ms);
      return loc;
    },
    async click(target, { pause = 250 } = {}) {
      await h.point(target);
      await sleep(pause);
      await page.mouse.down();
      await page.mouse.up();
      await sleep(300);
    },
    async type(target, text, { delay = 55 } = {}) {
      await h.click(target);
      await page.keyboard.type(text, { delay });
    },
    async hover(target, ms = 1200) {
      await h.point(target);
      await sleep(ms);
    },
    async replaceCursor() {
      await page.mouse.move(pos.x, pos.y);
    },
    sleep,
  };
  return h;
}

// A step: { say: 'narration', act: async (h) => {...}, after: ms of silence after the voice }.
// The action runs while the narration plays; the next step starts when both are done.
export async function record(name, steps, { setup } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\n▶ ${name}: preparing ${steps.length} voice clips (${VOICE})`);
  const clips = [];
  for (const s of steps) clips.push(s.say ? await speak(s.say) : null);

  const videoDir = path.join(CACHE, `video-${name}`);
  fs.rmSync(videoDir, { recursive: true, force: true });
  const browser = await launch();
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: SIZE },
    acceptDownloads: true,
    timezoneId: 'Asia/Manila',
  });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  const t0 = Date.now();
  const h = helpers(page);
  if (setup) await setup(h);

  const timeline = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const clip = clips[i];
    const start = Date.now();
    if (clip) timeline.push({ file: clip.file, at: start - t0, dur: clip.duration, text: s.say });
    process.stdout.write(`  ${String(i + 1).padStart(2)}. ${(s.say || '(no voice)').slice(0, 70)}\n`);
    await sleep(s.lead || 0);
    if (s.act) await s.act(h);
    await sleep(start + (clip?.duration || 0) + (s.after ?? 450) - Date.now());
  }
  await sleep(600);
  const total = Date.now() - t0;
  const video = page.video();
  await context.close();
  await browser.close();
  const raw = await video.path();

  await mux(name, raw, timeline, total);
}

// ---------- audio + captions + mp4 ----------

const srtTime = (ms) => {
  const t = Math.max(0, Math.round(ms));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(t / 3600000))}:${p(Math.floor(t / 60000) % 60)}:${p(Math.floor(t / 1000) % 60)},${p(t % 1000, 3)}`;
};

// Long narration lines are split into caption chunks of about 12 words, timed by length.
function captions(timeline) {
  const out = [];
  for (const c of timeline) {
    const sentences = c.text.match(/[^.!?]+[.!?]*/g).map((s) => s.trim()).filter(Boolean);
    const chunks = sentences.flatMap((s) => {
      const w = s.split(/\s+/);
      if (w.length <= 14) return [s];
      const n = Math.ceil(w.length / 12);
      const size = Math.ceil(w.length / n);
      return Array.from({ length: n }, (_, i) => w.slice(i * size, (i + 1) * size).join(' '));
    });
    const chars = chunks.reduce((a, s) => a + s.length, 0);
    let t = c.at;
    for (const s of chunks) {
      const d = (c.dur * s.length) / chars;
      out.push({ from: t, to: t + d, text: s });
      t += d;
    }
  }
  return out.map((c, i) => `${i + 1}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${c.text}\n`).join('\n');
}

async function mux(name, raw, timeline, total) {
  const srt = path.join(OUT, `${name}.srt`);
  fs.writeFileSync(srt, captions(timeline));
  const mp4 = path.join(OUT, `${name}.mp4`);
  const inputs = ['-i', raw, ...timeline.flatMap((c) => ['-i', c.file])];
  const delays = timeline.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.at)}|${Math.round(c.at)}[a${i}]`);
  const mix = `${timeline.map((_, i) => `[a${i}]`).join('')}amix=inputs=${timeline.length}:normalize=0:dropout_transition=0,apad[aout]`;
  // The subtitles filter needs the path escaped for its own syntax (drive colon, backslashes).
  const srtArg = srt.replace(/\\/g, '/').replace(':', '\\:');
  const style = "FontName=Arial,FontSize=15,PrimaryColour=&H00FFFFFF,BackColour=&H990F172A,BorderStyle=4,Outline=0,Shadow=0,MarginV=22";
  const filter = [...delays, mix, `[0:v]subtitles='${srtArg}':force_style='${style}'[vout]`].join(';');
  await run(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...inputs,
    '-filter_complex', filter,
    '-map', '[vout]', '-map', '[aout]',
    '-t', String(total / 1000),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    mp4,
  ], { maxBuffer: 1 << 24 });
  console.log(`✓ ${path.relative(ROOT, mp4)}  (${Math.round(total / 1000)}s, captions: ${path.relative(ROOT, srt)})`);
}

// ---------- title cards ----------

export function card({ kicker, title, lines = [], foot = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800;900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;height:100%}
  body{background:#f4f5f7;background-image:linear-gradient(#0f172a0b 1px,transparent 1px),linear-gradient(90deg,#0f172a0b 1px,transparent 1px);background-size:28px 28px;
    font-family:Inter,system-ui,sans-serif;color:#0f172a;display:grid;place-items:center}
  .box{width:880px;background:#fff;border:2px solid #0f172a;box-shadow:8px 8px 0 #0f172a;padding:48px 56px}
  .brand{display:flex;align-items:center;gap:12px;font:700 13px 'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase}
  .mark{width:22px;height:22px;background:#1d4ed8;clip-path:polygon(0 0,100% 0,100% 70%,70% 100%,0 100%)}
  .kicker{margin-top:34px;font:700 14px 'JetBrains Mono',monospace;color:#1d4ed8;letter-spacing:.1em;text-transform:uppercase}
  h1{font:900 64px/1.02 Archivo,sans-serif;margin:10px 0 18px;text-transform:uppercase;letter-spacing:-.01em}
  h1 em{font-style:normal;color:#1d4ed8}
  ol{margin:0;padding:0;list-style:none;display:grid;gap:10px}
  li{font-size:20px;display:flex;gap:14px;align-items:baseline}
  li b{font:700 13px 'JetBrains Mono',monospace;color:#fff;background:#0f172a;padding:3px 7px}
  .foot{margin-top:28px;font:500 13px 'JetBrains Mono',monospace;color:#475569}
</style></head><body><div class="box">
<div class="brand"><span class="mark"></span>Class Record · National University MOA</div>
<div class="kicker">${kicker}</div><h1>${title}</h1>
<ol>${lines.map((l, i) => `<li><b>${String(i + 1).padStart(2, '0')}</b>${l}</li>`).join('')}</ol>
${foot ? `<div class="foot">${foot}</div>` : ''}
</div></body></html>`;
}
