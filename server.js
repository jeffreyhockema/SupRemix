'use strict';

// SupRemix server. Deliberately dependency-free: Node's own http/fs is all a
// static game client and a small score board need.
//
//   GET  /api/levels          the level pack (client parses it with tiles.js)
//   GET  /api/scores          every board, or ?level=N for one
//   POST /api/scores          { level, name, steps, ms }
//   GET  /api/health

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
// The original level set (levels/pack.js, imported from your own copy of the
// game by `npm run import`) when it is there; otherwise the twenty remix
// levels, which are this repository's own and all a fresh clone has.
const PACK_NAME = fs.existsSync(path.join(__dirname, 'levels', 'pack.js')) ? 'pack' : 'remix';
const PACK_PATH = require.resolve(`./levels/${PACK_NAME}.js`);
let LEVELS = require(PACK_PATH).LEVELS;
let packMtime = 0;

/**
 * Re-read the level pack when the file changes on disk, so authoring a level
 * only costs a browser refresh instead of a server restart. A pack that fails
 * to parse is ignored and the last good one stays live.
 */
const PACK_CHECK_MS = 500;
let packChecked = 0;

function levels() {
  const now = Date.now();
  if (now - packChecked < PACK_CHECK_MS) return LEVELS;
  packChecked = now;
  try {
    const mtime = fs.statSync(PACK_PATH).mtimeMs;
    if (mtime !== packMtime) {
      if (packMtime !== 0) console.log('level pack changed, reloading');
      delete require.cache[PACK_PATH];
      const next = require(PACK_PATH).LEVELS;
      if (Array.isArray(next) && next.length) LEVELS = next;
      packMtime = mtime;
      packBody = null;   // serialised form is stale now
    }
  } catch (err) {
    console.error('level pack reload failed, keeping the previous one:', err.message);
  }
  return LEVELS;
}

let packBody = null;
let packTag = '';

/** The pack as JSON bytes plus an ETag, rebuilt only when the file changes. */
function packPayload() {
  const list = levels();
  if (!packBody) {
    packBody = Buffer.from(JSON.stringify({ levels: list }));
    packTag = `W/"pack-${packBody.length.toString(16)}-${Math.round(packMtime).toString(36)}"`;
  }
  return { body: packBody, tag: packTag };
}

const ROOT = path.join(__dirname, 'public');
// Overridable so the test suite can point at a scratch directory instead of
// scribbling over a real score board.
const DATA_DIR = process.env.SUPREMIX_DATA
  ? path.resolve(process.env.SUPREMIX_DATA)
  : path.join(__dirname, 'data');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');

const PORT = readPort();
const HOST = process.env.HOST || '0.0.0.0';

const MAX_BODY = 4096;
const SCORES_PER_LEVEL = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.pak': 'application/octet-stream',   // the scrambled asset packs (public/js/asset-pack.js)
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest']);

// Internal plumbing that should never be reachable over HTTP.
const HIDDEN = new Set(['package.json']);

function readPort() {
  const flag = process.argv.indexOf('--port');
  const raw = flag !== -1 ? process.argv[flag + 1] : process.env.PORT;
  if (raw === undefined || raw === '') return 3000;
  const n = Number(raw);
  // listen(NaN) silently binds a random port, which looks like the server
  // ignoring you rather than like a typo.
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    console.error(`bad port ${JSON.stringify(raw)}, using 3000`);
    return 3000;
  }
  return n;
}

// --- scores -----------------------------------------------------------------

let scores = {};      // { [levelIndex]: [{ name, steps, ms, at }] }
let writing = null;

async function loadScores() {
  try {
    scores = JSON.parse(await fsp.readFile(SCORES_FILE, 'utf8'));
    if (typeof scores !== 'object' || scores === null) scores = {};
  } catch {
    scores = {};
  }
}

/**
 * Write via a temp file so a crash mid-write cannot truncate the board.
 *
 * A save requested while one is already running sets a dirty flag and runs
 * again afterwards. Returning the in-flight promise instead would silently drop
 * the newer scores: that write had already serialised its snapshot.
 */
let dirty = false;
async function saveScores() {
  if (writing) { dirty = true; return writing; }
  writing = (async () => {
    do {
      dirty = false;
      await fsp.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${SCORES_FILE}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(scores, null, 2));
      await fsp.rename(tmp, SCORES_FILE);
    } while (dirty);
  })().finally(() => { writing = null; });
  return writing;
}

function sanitiseName(raw) {
  return String(raw ?? '')
    .replace(/[^\w \-.]/g, '')
    .trim()
    .slice(0, 14) || 'MURPHY';
}

function addScore(entry) {
  const level = Number(entry.level);
  const steps = Number(entry.steps);
  const ms = Number(entry.ms);
  if (!Number.isInteger(level) || level < 0 || level >= levels().length) {
    return { error: 'unknown level' };
  }
  if (!Number.isFinite(steps) || steps < 0 || steps > 1e6) return { error: 'bad steps' };
  if (!Number.isFinite(ms) || ms < 0 || ms > 1e9) return { error: 'bad time' };

  const row = { name: sanitiseName(entry.name), steps: steps | 0, ms: Math.round(ms), at: Date.now() };
  const board = scores[level] || (scores[level] = []);
  board.push(row);
  board.sort((a, b) => a.steps - b.steps || a.ms - b.ms);
  board.length = Math.min(board.length, SCORES_PER_LEVEL);
  saveScores().catch((err) => console.error('score write failed:', err.message));

  // A run that misses the board entirely has no rank; indexOf would say -1 and
  // the caller would read that as rank 0.
  const at = board.indexOf(row);
  return { ok: true, rank: at < 0 ? null : at + 1, board };
}

// --- http helpers -----------------------------------------------------------

/**
 * Compressed bodies, keyed by the caller's cache tag (an ETag for static files).
 * gzipSync runs on the event loop, and re-compressing the same unchanged script
 * on every reload is pure waste.
 */
const gzipCache = new Map();
const GZIP_CACHE_MAX = 64;

function gzipFor(buf, tag) {
  if (!tag) return zlib.gzipSync(buf);
  const hit = gzipCache.get(tag);
  if (hit) return hit;
  const gz = zlib.gzipSync(buf);
  if (gzipCache.size >= GZIP_CACHE_MAX) gzipCache.delete(gzipCache.keys().next().value);
  gzipCache.set(tag, gz);
  return gz;
}

function send(req, res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const headers = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra };

  const accepts = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (accepts && buf.length > 1024 && /text\/|json|javascript|svg/.test(type)) {
    const gz = gzipFor(buf, extra.ETag);
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = gz.length;
    headers.Vary = 'Accept-Encoding';
    res.writeHead(status, headers);
    return res.end(req.method === 'HEAD' ? undefined : gz);
  }

  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function sendJson(req, res, status, obj) {
  send(req, res, status, JSON.stringify(obj), 'application/json; charset=utf-8',
    { 'Cache-Control': 'no-store' });
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];

    req.on('data', (c) => {
      if (settled) return;
      size += c.length;
      if (size > limit) {
        settled = true;
        // Pause rather than destroy: destroying takes the socket with it, and
        // the 413 we are about to send would never leave the building.
        req.pause();
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

async function serveStatic(req, res, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return send(req, res, 400, 'Bad request');   // a broken %-escape is the caller's fault
  }
  if (rel.includes(' ')) return send(req, res, 400, 'Bad request');
  if (rel === '/' || rel === '') rel = '/index.html';

  // Resolve first, then confirm the result is still inside ROOT. This defeats
  // ../ traversal and any encoded variant of it.
  const full = path.resolve(ROOT, '.' + rel);
  const relCheck = path.relative(ROOT, full);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    return send(req, res, 403, 'Forbidden');
  }
  if (HIDDEN.has(path.basename(full)) || path.basename(full).startsWith('.')) {
    return send(req, res, 404, 'Not found');
  }

  let stat;
  try {
    stat = await fsp.stat(full);
  } catch {
    return send(req, res, 404, 'Not found');
  }
  if (stat.isDirectory()) return send(req, res, 404, 'Not found');

  const ext = path.extname(full).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(36)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    return res.end();
  }

  // Revalidate every time. The ETag above still saves the transfer on a hit,
  // and an edited file shows up on the next reload instead of minutes later.
  const body = await fsp.readFile(full);
  send(req, res, 200, body, type, { ETag: etag, 'Cache-Control': 'no-cache' });
}

// --- routing ----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return send(req, res, 400, 'Bad request');
  }
  const p = url.pathname;

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') {
      return send(req, res, 405, 'Method not allowed', 'text/plain; charset=utf-8',
        { Allow: 'GET, HEAD, POST' });
    }

    if (p === '/api/health') {
      return sendJson(req, res, 200, { ok: true, levels: levels().length, uptime: process.uptime() });
    }

    if (p === '/api/levels' && req.method !== 'POST') {
      const { body, tag } = packPayload();
      if (req.headers['if-none-match'] === tag) {
        res.writeHead(304, { ETag: tag });
        return res.end();
      }
      return send(req, res, 200, body, 'application/json; charset=utf-8',
        { ETag: tag, 'Cache-Control': 'no-cache' });
    }

    if (p === '/api/scores') {
      if (req.method === 'POST') {
        let payload;
        try {
          payload = JSON.parse(await readBody(req) || '{}');
        } catch (err) {
          const status = err.status || 400;
          // The rest of an oversized body is still coming; close rather than
          // try to parse the remainder as the next request on this connection.
          if (status === 413) res.setHeader('Connection', 'close');
          return sendJson(req, res, status,
            { error: status === 413 ? 'payload too large' : 'invalid JSON' });
        }
        const result = addScore(payload);
        return sendJson(req, res, result.error ? 400 : 200, result);
      }
      const lvl = url.searchParams.get('level');
      if (lvl !== null) {
        const n = Number(lvl);
        return sendJson(req, res, 200, { level: n, board: scores[n] || [] });
      }
      return sendJson(req, res, 200, { scores });
    }

    if (p.startsWith('/api/')) return sendJson(req, res, 404, { error: 'no such endpoint' });
    if (req.method === 'POST') return send(req, res, 404, 'Not found');

    return await serveStatic(req, res, p);
  } catch (err) {
    console.error(`${req.method} ${req.url} ->`, err);
    if (!res.headersSent) send(req, res, err.status || 500, 'Server error');
    else res.end();
  }
});

loadScores().then(() => {
  server.listen(PORT, HOST, () => {
    const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
    // Report what we actually bound: with --port 0 the OS chooses, and
    // printing the requested 0 tells the reader nothing.
    const bound = server.address()?.port ?? PORT;
    console.log(`SupRemix running at http://${shown}:${bound}`);
    console.log(`${levels().length} levels loaded (${PACK_NAME === 'pack' ? 'the original set' : 'the remix set'}). Ctrl+C to stop.`);
  });
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\nshutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

module.exports = { server, addScore, sanitiseName, readPort, saveScores };
