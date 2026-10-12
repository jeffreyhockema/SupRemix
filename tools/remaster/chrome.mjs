// Headless Chrome, driven over its DevTools protocol with Node's own WebSocket,
// so rasterising the remaster needs nothing installed. Set CHROME to point at
// a browser if it is not in the usual place.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch() {
  const exe = CANDIDATES.find(p => existsSync(p));
  if (!exe) throw new Error('no Chrome or Edge found; set CHROME to its path');
  const profile = mkdtempSync(join(tmpdir(), 'supremix-chrome-'));
  const proc = spawn(exe, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--allow-file-access-from-files', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const [port, path] = readFileSync(portFile, 'utf8').split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });

  let next = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) {
      for (const w of waiters.splice(0)) w(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = ++next;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const event = name => new Promise(ok => {
    const listen = msg => (msg.method === name ? ok(msg) : waiters.push(listen));
    waiters.push(listen);
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (m, p) => send(m, p, sessionId);
  await page('Page.enable');
  await page('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

  return {
    async shoot(file, width, height, clips) {
      await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const loaded = event('Page.loadEventFired');
      await page('Page.navigate', { url: pathToFileURL(resolve(file)).href });
      await loaded;
      await sleep(150);
      const out = [];
      for (const clip of clips ?? [{ x: 0, y: 0, width, height }]) {
        const { data } = await page('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true });
        out.push(Buffer.from(data, 'base64'));
      }
      return out;
    },
    async close() {
      try { await send('Browser.close'); } catch {}
      ws.close();
      proc.kill();
      await sleep(300);
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    },
  };
}

