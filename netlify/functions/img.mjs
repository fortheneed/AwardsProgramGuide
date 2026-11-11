import { wrap, requireToken, gh, branchHead, editBranch, defaultBranch, NAME_RE, IMAGE_DIR, HttpError } from '../lib/core.mjs';

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

// GET ?p=<file name>&t=<token> -> an image that was saved but not yet published (editing screens only).
export default wrap(async (req) => {
  requireToken(req);
  const name = new URL(req.url).searchParams.get('p') || '';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if(!NAME_RE.test(name) || !TYPES[ext]) throw new HttpError(400, 'Bad image name.');
  const branches = [];
  if(await branchHead(editBranch())) branches.push(editBranch());
  branches.push(await defaultBranch());
  for(const b of branches){
    const r = await gh(`/contents/${IMAGE_DIR}/${name}?ref=${encodeURIComponent(b)}`, { accept: 'application/vnd.github.raw', raw: true });
    if(r.ok) return new Response(await r.arrayBuffer(), { headers: { 'content-type': TYPES[ext], 'cache-control': 'private, max-age=60' } });
  }
  throw new HttpError(404, 'Image not found.');
});
export const config = { path: '/api/img' };
