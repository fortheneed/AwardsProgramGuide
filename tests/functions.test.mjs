// Run with: node --test tests/
// These use an in-memory fake of the GitHub API (scripts/fake-github.mjs), not real GitHub or Netlify.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGithub } from '../scripts/fake-github.mjs';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const content0 = {
  version: 2, booklets: [{ id: 'arrows', title: 'Arrows' }],
  pages: [{ id: 'p1', type: 'charm', title: 'Get a Job', audiences: ['arrows'], intro: '', steps: [], purpose: '', image: '', photo: '', photo2: '' }]
};

async function setup(extra = {}){
  const fake = await createFakeGithub({ 'public/awards.json': JSON.stringify(content0), 'public/index.html': '<html>v1</html>', ...extra }, 'Main');
  process.env.EDIT_PASSWORD = 'test-password-123';
  process.env.GITHUB_TOKEN = 'fake-token';
  process.env.GITHUB_API_URL = fake.url;
  process.env.GITHUB_REPO = 'o/r';
  process.env.AUTH_FAIL_DELAY_MS = '0';
  delete process.env.MAIN_BRANCH; delete process.env.EDIT_BRANCH;
  const mod = async (n) => (await import(`../netlify/functions/${n}.mjs?${Math.random()}`)).default;
  const fns = { auth: await mod('auth'), content: await mod('content'), save: await mod('save'), publish: await mod('publish'), img: await mod('img') };
  const call = async (fn, { method = 'GET', body, token, qs = '' } = {}) => {
    const res = await fns[fn](new Request('http://site/api/' + fn + qs, { method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }));
    const type = res.headers.get('content-type') || '';
    return { status: res.status, json: type.includes('json') ? await res.json() : null, buf: type.includes('json') ? null : Buffer.from(await res.arrayBuffer()), type };
  };
  const login = async () => (await call('auth', { method: 'POST', body: { password: 'test-password-123' } })).json.token;
  return { fake, call, login, close: fake.close };
}

test('password: wrong is refused, right gets a token, unset is explained', async () => {
  const { call, close } = await setup();
  assert.equal((await call('auth', { method: 'POST', body: { password: 'nope' } })).status, 401);
  assert.equal((await call('auth', { method: 'POST', body: {} })).status, 401);
  const ok = await call('auth', { method: 'POST', body: { password: 'test-password-123' } });
  assert.equal(ok.status, 200); assert.ok(ok.json.token.includes('.'));
  delete process.env.EDIT_PASSWORD;
  const unset = await call('auth', { method: 'POST', body: { password: 'x' } });
  assert.equal(unset.status, 500); assert.match(unset.json.error, /missing EDIT_PASSWORD/);
  close();
});

test('every editing endpoint needs a valid token', async () => {
  const { call, login, close } = await setup();
  for(const [fn, method] of [['content', 'GET'], ['save', 'POST'], ['publish', 'POST'], ['img', 'GET']]){
    assert.equal((await call(fn, { method, body: method === 'POST' ? {} : undefined })).status, 401, fn + ' without token');
    assert.equal((await call(fn, { method, token: '123.abc' })).status, 401, fn + ' with forged token');
    assert.equal((await call(fn, { method, token: '1.' + 'a'.repeat(64) })).status, 401, fn + ' with expired token');
  }
  const t = await login();
  assert.equal((await call('content', { token: t })).status, 200);
  process.env.EDIT_PASSWORD = 'changed-password-456'; // changing the password ends old sessions
  assert.equal((await call('content', { token: t })).status, 401);
  close();
});

test('saving writes only to the holding branch, never to the live branch', async () => {
  const { fake, call, login, close } = await setup();
  const t = await login();
  const first = (await call('content', { token: t })).json;
  assert.equal(first.pending, false);
  const liveBefore = fake.state.refs.get('Main');
  const edited = structuredClone(content0); edited.pages[0].intro = 'Hello';
  const r = await call('save', { method: 'POST', token: t, body: { content: JSON.stringify(edited), baseSha: first.sha } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(fake.state.refs.get('Main'), liveBefore, 'live branch must not move');
  assert.ok(fake.state.refs.has('edits'));
  assert.equal(JSON.parse(fake.state.fileAt('Main', 'public/awards.json')).pages[0].intro, '', 'live content unchanged');
  const again = (await call('content', { token: t })).json;
  assert.equal(JSON.parse(again.content).pages[0].intro, 'Hello'); assert.equal(again.pending, true); assert.equal(again.sha, r.json.sha);
  assert.ok(!fake.state.calls.some(c => c.startsWith('PATCH') && c.endsWith('/Main')), 'never updates Main directly');
  close();
});

test('a stale copy cannot overwrite newer edits', async () => {
  const { call, login, close } = await setup();
  const t = await login(); const a = (await call('content', { token: t })).json;
  const e1 = structuredClone(content0); e1.pages[0].intro = 'one';
  assert.equal((await call('save', { method: 'POST', token: t, body: { content: JSON.stringify(e1), baseSha: a.sha } })).status, 200);
  const e2 = structuredClone(content0); e2.pages[0].intro = 'two (from a stale copy)';
  const stale = await call('save', { method: 'POST', token: t, body: { content: JSON.stringify(e2), baseSha: a.sha } });
  assert.equal(stale.status, 409); assert.match(stale.json.error, /Someone else/);
  assert.equal(JSON.parse((await call('content', { token: t })).json.content).pages[0].intro, 'one');
  close();
});

test('bad content and bad images are refused', async () => {
  const { fake, call, login, close } = await setup();
  const t = await login();
  const save = (b) => call('save', { method: 'POST', token: t, body: b });
  assert.equal((await save({ content: '{not json' })).status, 400);
  assert.equal((await save({ content: JSON.stringify({ booklets: [] }) })).status, 400);
  const withBadName = structuredClone(content0); withBadName.pages[0].image = '../../secret.png';
  assert.equal((await save({ content: JSON.stringify(withBadName) })).status, 400);
  const long = structuredClone(content0); long.pages[0].intro = 'x'.repeat(6000);
  assert.equal((await save({ content: JSON.stringify(long) })).status, 400);
  assert.equal((await save({ images: [{ name: 'a.png', data: Buffer.from('not an image at all').toString('base64') }] })).status, 400);
  assert.equal((await save({ images: [{ name: '../x.png', data: PNG.toString('base64') }] })).status, 400);
  assert.equal((await save({ images: [{ name: 'x.exe', data: PNG.toString('base64') }] })).status, 400);
  assert.equal((await save({})).status, 400);
  assert.ok(!fake.state.refs.has('edits') || fake.state.fileAt('edits', 'public/awards.json').toString() === fake.state.fileAt('Main', 'public/awards.json').toString(), 'nothing bad got saved');
  close();
});

test('images are saved to the holding branch and served to editors only', async () => {
  const { fake, call, login, close } = await setup();
  const t = await login();
  const r = await call('save', { method: 'POST', token: t, body: { images: [{ name: 'p1-badge-abc12.png', data: PNG.toString('base64') }] } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(fake.state.fileAt('edits', 'public/images/p1-badge-abc12.png'), PNG);
  assert.equal(fake.state.fileAt('Main', 'public/images/p1-badge-abc12.png'), null, 'not live yet');
  const got = await call('img', { token: t, qs: '?p=p1-badge-abc12.png' });
  assert.equal(got.status, 200); assert.equal(got.type, 'image/png'); assert.deepEqual(got.buf, PNG);
  assert.equal((await call('img', { token: t, qs: '?p=../../awards.json' })).status, 400);
  assert.equal((await call('img', { qs: '?p=p1-badge-abc12.png' })).status, 401);
  close();
});

test('publish merges edits into the live branch once; nothing new means no change', async () => {
  const { fake, call, login, close } = await setup();
  const t = await login();
  const nothing = await call('publish', { method: 'POST', token: t });
  assert.equal(nothing.json.published, false);
  const a = (await call('content', { token: t })).json;
  const e = structuredClone(content0); e.pages[0].intro = 'Hi'; e.pages[0].image = 'p1-badge-abc12.png';
  await call('save', { method: 'POST', token: t, body: { images: [{ name: 'p1-badge-abc12.png', data: PNG.toString('base64') }] } });
  await call('save', { method: 'POST', token: t, body: { content: JSON.stringify(e), baseSha: a.sha } });
  const liveBefore = fake.state.refs.get('Main');
  const pub = await call('publish', { method: 'POST', token: t });
  assert.equal(pub.json.published, true);
  assert.notEqual(fake.state.refs.get('Main'), liveBefore);
  assert.equal(JSON.parse(fake.state.fileAt('Main', 'public/awards.json')).pages[0].intro, 'Hi');
  assert.deepEqual(fake.state.fileAt('Main', 'public/images/p1-badge-abc12.png'), PNG);
  const heads = fake.state.refs.get('Main');
  assert.equal((await call('publish', { method: 'POST', token: t })).json.published, false, 'second publish does nothing');
  assert.equal(fake.state.refs.get('Main'), heads, 'no extra commit, so no extra deploy');
  close();
});

test('code changes on the live branch do not block publishing edits', async () => {
  const { fake, call, login, close } = await setup();
  const t = await login(); const a = (await call('content', { token: t })).json;
  const e = structuredClone(content0); e.pages[0].intro = 'edited on site';
  await call('save', { method: 'POST', token: t, body: { content: JSON.stringify(e), baseSha: a.sha } });
  // someone changes a code file on main meanwhile (simulate by a direct commit on Main)
  const main = fake.state.refs.get('Main'); const c = fake.state.commits.get(main);
  const tree = new Map(fake.state.trees.get(c.tree)); const blob = Buffer.from('<html>v2</html>');
  const bid = 'b'.repeat(40); fake.state.blobs.set(bid, blob); tree.set('public/index.html', bid);
  const tid = 't'.repeat(40); fake.state.trees.set(tid, tree);
  const cid = 'c'.repeat(40); fake.state.commits.set(cid, { tree: tid, parents: [main], msg: 'code' }); fake.state.refs.set('Main', cid);
  assert.equal((await call('publish', { method: 'POST', token: t })).json.published, true);
  assert.equal(fake.state.fileAt('Main', 'public/index.html').toString(), '<html>v2</html>');
  assert.equal(JSON.parse(fake.state.fileAt('Main', 'public/awards.json')).pages[0].intro, 'edited on site');
  close();
});

test('no real password or GitHub key is written into site or function code', async () => {
  // The real values live only in Netlify's environment variables. Test files and the local dev server use dummy values.
  const { execSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const cwd = new URL('..', import.meta.url).pathname;
  const files = execSync('git ls-files -co --exclude-standard', { cwd }).toString().split('\n').filter(f => /\.(m?js|html|json|toml|ya?ml|md)$/.test(f))
    .filter(f => !f.startsWith('tests/') && f !== 'scripts/dev-server.mjs');
  const bad = [];
  for(const f of files){
    const text = readFileSync(cwd + f, 'utf8');
    if(/(EDIT_PASSWORD|GITHUB_TOKEN)\s*[:=]\s*['"][^'"\s]+['"]/.test(text)) bad.push(f + ' (assigns a secret)');
    if(/\b(ghp_|github_pat_|gho_)[A-Za-z0-9_]{10,}/.test(text)) bad.push(f + ' (looks like a GitHub key)');
  }
  assert.deepEqual(bad, []);
});

test('if the live branch and the edits both changed the content file, publishing says so and changes nothing', async () => {
  const { fake, call, login, close } = await setup();
  const t = await login(); const a = (await call('content', { token: t })).json;
  const e = structuredClone(content0); e.pages[0].intro = 'edited on site';
  await call('save', { method: 'POST', token: t, body: { content: JSON.stringify(e), baseSha: a.sha } });
  const main = fake.state.refs.get('Main'); const c = fake.state.commits.get(main);
  const tree = new Map(fake.state.trees.get(c.tree)); const bid = 'd'.repeat(40);
  fake.state.blobs.set(bid, Buffer.from(JSON.stringify({ ...content0, version: 99 }))); tree.set('public/awards.json', bid);
  const tid = 'e'.repeat(40); fake.state.trees.set(tid, tree);
  const cid = 'f'.repeat(40); fake.state.commits.set(cid, { tree: tid, parents: [main], msg: 'conflicting code change' }); fake.state.refs.set('Main', cid);
  const r = await call('publish', { method: 'POST', token: t });
  assert.equal(r.status, 409); assert.match(r.json.error, /can't be published automatically/);
  assert.equal(fake.state.refs.get('Main'), cid, 'live branch untouched');
  close();
});
