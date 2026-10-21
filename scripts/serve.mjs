import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runCode } from './runner.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 5173);
const token = randomUUID();
let busy = false;
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
function trustedRequest(req) {
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowed.includes(req.headers.host)) return false;
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  return true;
}
async function body(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 600000) throw new Error('请求超过大小限制');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jsonl': 'application/x-ndjson; charset=utf-8', '.json': 'application/json; charset=utf-8', '.hpp': 'text/plain; charset=utf-8', '.cpp': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!trustedRequest(req)) { json(res, 403, { error: '仅允许本机同源请求' }); return; }
    if (pathname === '/api/session' && req.method === 'GET') { json(res, 200, { token, capabilities: { leetcode: true } }); return; }
    if (pathname === '/api/run' && req.method === 'POST') {
      if (req.headers['x-structure-token'] !== token || !req.headers['content-type']?.startsWith('application/json')) {
        json(res, 403, { error: '请刷新页面后再运行' }); return;
      }
      if (busy) { json(res, 409, { error: '上一次运行尚未结束，请稍后重试' }); return; }
      busy = true;
      const controller = new AbortController();
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      try {
        const result = await runCode(await body(req), controller.signal);
        if (!controller.signal.aborted) json(res, 200, result);
      } catch (error) {
        if (!controller.signal.aborted) json(res, 400, { error: error.message, phase: error.phase || 'validation', diagnostics: error.diagnostics || '', stdout: error.stdout || '' });
      } finally { busy = false; }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(p => p.startsWith('.')) || relative.startsWith('build' + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Structure Lab · http://127.0.0.1:${port}`));
