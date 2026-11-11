// Shared helpers for the editing functions. No dependencies: Node's built-in crypto and fetch only.
//
// Secrets live ONLY in Netlify's environment variables (never in this repo):
//   EDIT_PASSWORD  the shared editing password
//   GITHUB_TOKEN   a GitHub key limited to this one repository (Contents: read and write)
// Optional: GITHUB_REPO (default below), EDIT_BRANCH (default "edits"), MAIN_BRANCH (default: the repo's default branch)
import crypto from 'node:crypto';

export const CONTENT_PATH = 'public/awards.json';
export const IMAGE_DIR = 'public/images';
export const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,90}$/i;
export const TOKEN_HOURS = 8;

const env = (k, d) => (process.env[k] ?? d);

export class HttpError extends Error {
  constructor(status, message){ super(message); this.status = status; }
}

export const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

// Wraps a handler so every failure comes back as a plain-language JSON message.
export const wrap = (fn) => async (req) => {
  try { return await fn(req); }
  catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error('[awards-guide]', e);
    return json(500, { error: 'Something went wrong on the server. Please try again.' });
  }
};

function need(name){
  const v = process.env[name];
  if(!v) throw new HttpError(500, `Editing isn't set up yet on this site (missing ${name}). Add it in Netlify under Environment variables.`);
  return v;
}

// ---------- password + session token ----------
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function passwordOk(input){
  return crypto.timingSafeEqual(sha(input ?? ''), sha(need('EDIT_PASSWORD')));
}

const sign = (exp) => crypto.createHmac('sha256', need('EDIT_PASSWORD')).update('awards-edit:' + exp).digest('hex');

// A token is "<expiry ms>.<signature>". The signature uses the password as its key, so changing the password ends every session.
export function makeToken(){
  const exp = Date.now() + TOKEN_HOURS * 3600e3;
  return { token: exp + '.' + sign(exp), expires: exp };
}

export function requireToken(req){
  const url = new URL(req.url);
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('t') || '';
  const [exp, sig] = t.split('.');
  const expired = new HttpError(401, 'Your editing session has ended. Please unlock editing again.');
  if(!exp || !sig || !(Number(exp) > Date.now())) throw expired;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw expired;
}

// ---------- GitHub ----------
const api = () => String(env('GITHUB_API_URL', 'https://api.github.com')).replace(/\/$/, '');
const repo = () => env('GITHUB_REPO', 'fortheneed/AwardsProgramGuide');
export const editBranch = () => env('EDIT_BRANCH', 'edits');

export async function gh(path, { method = 'GET', body, accept, raw = false } = {}){
  const res = await fetch(`${api()}/repos/${repo()}${path}`, {
    method,
    headers: {
      authorization: 'Bearer ' + need('GITHUB_TOKEN'),
      accept: accept || 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'awards-guide',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if(res.status === 401 || res.status === 403)
    throw new HttpError(500, "GitHub refused the saved key. Check the GitHub key in Netlify's Environment variables (it needs read and write access to Contents on this project).");
  if(raw) return res;
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, data };
}

export async function defaultBranch(){
  const forced = env('MAIN_BRANCH');
  if(forced) return forced;
  const r = await gh('');
  if(!r.ok) throw new HttpError(500, "Couldn't find the GitHub project. Check GITHUB_REPO in Netlify.");
  return r.data.default_branch;
}

const ref = (b) => `/git/ref/heads/${encodeURIComponent(b)}`;
export async function branchHead(branch){
  const r = await gh(ref(branch));
  if(r.status === 404) return null;
  if(!r.ok) throw new HttpError(500, "Couldn't read from GitHub.");
  return r.data.object.sha;
}

// The holding branch where edits wait until they are published. Created from the main branch the first time.
export async function ensureEditBranch(){
  const name = editBranch();
  let head = await branchHead(name);
  if(head) return head;
  const main = await branchHead(await defaultBranch());
  const r = await gh('/git/refs', { method: 'POST', body: { ref: 'refs/heads/' + name, sha: main } });
  if(!r.ok && r.status !== 422) throw new HttpError(500, "Couldn't set up the holding area for edits on GitHub.");
  return (await branchHead(name)) || main;
}

export async function readContent(branch){
  const r = await gh(`/contents/${CONTENT_PATH}?ref=${encodeURIComponent(branch)}`);
  if(!r.ok) throw new HttpError(500, "Couldn't load the guide's content from GitHub.");
  return { text: Buffer.from(r.data.content, 'base64').toString('utf8'), sha: r.data.sha };
}

export async function aheadBy(base, head){
  const r = await gh(`/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  return r.ok ? (r.data.ahead_by || 0) : 0;
}

// ---------- validating what the browser sends ----------
const bad = (msg) => { throw new HttpError(400, msg); };

export function checkContent(c){
  if(!c || typeof c !== 'object' || !Array.isArray(c.booklets) || !Array.isArray(c.pages)) bad("That content doesn't look right, so nothing was saved.");
  if(c.booklets.length > 12 || c.pages.length > 300) bad('Too many pages, so nothing was saved.');
  const walk = (v) => {
    if(typeof v === 'string'){ if(v.length > 5000) bad('One of the text boxes is too long, so nothing was saved.'); }
    else if(Array.isArray(v)) v.forEach(walk);
    else if(v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(c);
  const okName = (v) => v === undefined || v === null || v === '' || (typeof v === 'string' && NAME_RE.test(v));
  for(const p of c.pages){
    if(!p || typeof p.id !== 'string' || typeof p.title !== 'string') bad("A page is missing its title, so nothing was saved.");
    if(!okName(p.image) || !okName(p.photo) || !okName(p.photo2)) bad('An image name looks wrong, so nothing was saved.');
    for(const it of (p.items || [])) if(!okName(it && it.image)) bad('An image name looks wrong, so nothing was saved.');
    if(p.steps !== undefined && !Array.isArray(p.steps)) bad("A page's steps look wrong, so nothing was saved.");
  }
}

const MAGIC = {
  png: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.length > 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP'
};
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function checkImage(img){
  if(!img || typeof img.name !== 'string' || typeof img.data !== 'string') bad('An image upload looks wrong.');
  const m = /\.(png|jpe?g|webp)$/i.exec(img.name);
  if(!NAME_RE.test(img.name) || !m) bad('Images must be PNG, JPG or WebP.');
  const kind = m[1].toLowerCase().replace('jpeg', 'jpg');
  const buf = Buffer.from(img.data, 'base64');
  if(!buf.length || buf.length > MAX_IMAGE_BYTES) bad('That image is too large. Please use a smaller one.');
  if(!MAGIC[kind](buf)) bad("That file isn't a real image.");
  return buf;
}
