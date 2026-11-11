import { wrap, json, requireToken, branchHead, editBranch, defaultBranch, readContent, aheadBy, HttpError } from '../lib/core.mjs';

// GET -> the newest saved content (from the holding branch if it exists), and whether unpublished edits are waiting.
export default wrap(async (req) => {
  if(req.method !== 'GET') throw new HttpError(405, 'Not allowed.');
  requireToken(req);
  const main = await defaultBranch();
  const editsHead = await branchHead(editBranch());
  const { text, sha } = await readContent(editsHead ? editBranch() : main);
  const pending = editsHead ? (await aheadBy(main, editBranch())) > 0 : false;
  return json(200, { content: text, sha, pending });
});
export const config = { path: '/api/content' };
