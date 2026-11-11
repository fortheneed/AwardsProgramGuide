import { wrap, json, requireToken, gh, ensureEditBranch, readContent, editBranch, checkContent, checkImage, CONTENT_PATH, IMAGE_DIR, HttpError } from '../lib/core.mjs';

// POST { content?: "<awards.json text>", baseSha?: "<sha it was loaded from>", images?: [{ name, data(base64) }] }
// Saves to the holding branch as ONE commit. Never touches the live (main) branch, so it never triggers a deploy.
export default wrap(async (req) => {
  if(req.method !== 'POST') throw new HttpError(405, 'Not allowed.');
  requireToken(req);
  let body;
  try { body = await req.json(); } catch { throw new HttpError(400, "That didn't arrive in a form I can read."); }

  const images = Array.isArray(body.images) ? body.images : [];
  if(images.length > 20) throw new HttpError(400, 'Too many images at once.');
  const files = images.map(img => ({ name: img.name, buf: checkImage(img) }));

  let contentText = null;
  if(body.content !== undefined){
    let obj;
    try { obj = typeof body.content === 'string' ? JSON.parse(body.content) : body.content; } catch { throw new HttpError(400, "That content doesn't look right, so nothing was saved."); }
    checkContent(obj);
    contentText = JSON.stringify(obj, null, 1) + '\n';
  }
  if(!files.length && contentText === null) throw new HttpError(400, 'Nothing to save.');

  const branch = editBranch();
  const head = await ensureEditBranch();
  if(contentText !== null && body.baseSha){
    const cur = await readContent(branch);
    if(cur.sha !== body.baseSha)
      throw new HttpError(409, 'Someone else saved changes to the guide since you opened it. Reload the page to see their changes, then make your edits again.');
  }

  const headCommit = await gh(`/git/commits/${head}`);
  if(!headCommit.ok) throw new HttpError(500, "Couldn't read from GitHub.");
  const entries = [];
  for(const f of files){
    const b = await gh('/git/blobs', { method: 'POST', body: { content: f.buf.toString('base64'), encoding: 'base64' } });
    if(!b.ok) throw new HttpError(500, "Couldn't save an image.");
    entries.push({ path: `${IMAGE_DIR}/${f.name}`, mode: '100644', type: 'blob', sha: b.data.sha });
  }
  let newSha = null;
  if(contentText !== null){
    const b = await gh('/git/blobs', { method: 'POST', body: { content: contentText, encoding: 'utf-8' } });
    if(!b.ok) throw new HttpError(500, "Couldn't save the text.");
    newSha = b.data.sha;
    entries.push({ path: CONTENT_PATH, mode: '100644', type: 'blob', sha: newSha });
  }
  const tree = await gh('/git/trees', { method: 'POST', body: { base_tree: headCommit.data.tree.sha, tree: entries } });
  if(!tree.ok) throw new HttpError(500, "Couldn't save your changes.");
  const msg = 'Guide edit' + (files.length ? ` (${files.length} image${files.length > 1 ? 's' : ''})` : '') + (contentText !== null ? '' : ' - images only');
  const commit = await gh('/git/commits', { method: 'POST', body: { message: msg, tree: tree.data.sha, parents: [head] } });
  if(!commit.ok) throw new HttpError(500, "Couldn't save your changes.");
  const upd = await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: commit.data.sha, force: false } });
  if(!upd.ok) throw new HttpError(409, 'Someone else saved at the same moment. Reload the page and try again.');
  return json(200, { ok: true, sha: newSha });
});
export const config = { path: '/api/save' };
