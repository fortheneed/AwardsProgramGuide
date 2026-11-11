// Local test server: serves public/ and runs the real Netlify functions against an in-memory fake of GitHub.
// Usage: node scripts/dev-server.mjs [port]      (the editing password here is "test-password-123")
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeGithub } from './fake-github.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = { 'public/awards.json': fs.readFileSync(path.join(root, 'public/awards.json'), 'utf8'), 'public/index.html': fs.readFileSync(path.join(root, 'public/index.html'), 'utf8') };
const fake = await createFakeGithub(files, 'Main');
Object.assign(process.env, { EDIT_PASSWORD: 'test-password-123', GITHUB_TOKEN: 'fake', GITHUB_API_URL: fake.url, GITHUB_REPO: 'o/r', AUTH_FAIL_DELAY_MS: '0' });

const routes = {};
for(const f of fs.readdirSync(path.join(root, 'netlify/functions'))){
  const m = await import(path.join(root, 'netlify/functions', f));
  routes[m.config.path] = m.default;
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const pub = path.join(root, 'public');

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if(u.pathname === '/__state'){ res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ refs: Object.fromEntries(fake.state.refs), live: fake.state.fileAt('Main', 'public/awards.json')?.toString(), edits: fake.state.fileAt('edits', 'public/awards.json')?.toString(), calls: fake.state.calls.length })); }
  const fn = routes[u.pathname];
  if(fn){
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await fn(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let p = path.join(pub, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if(!p.startsWith(pub) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
});
server.listen(Number(process.argv[2] || 8766), () => console.log('dev server on', server.address().port));
