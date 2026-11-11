import { wrap, json, requireToken, gh, branchHead, editBranch, defaultBranch, aheadBy, HttpError } from '../lib/core.mjs';

// POST -> merges the holding branch into the live branch. That one commit is what makes Netlify redeploy.
export default wrap(async (req) => {
  if(req.method !== 'POST') throw new HttpError(405, 'Not allowed.');
  requireToken(req);
  const main = await defaultBranch(), edits = editBranch();
  if(!(await branchHead(edits)) || (await aheadBy(main, edits)) === 0)
    return json(200, { published: false, message: "There's nothing new to publish." });
  const r = await gh('/merges', { method: 'POST', body: { base: main, head: edits, commit_message: 'Publish guide edits' } });
  if(r.status === 409) throw new HttpError(409, "These edits can't be published automatically because the site's code changed in the same place. Please ask for help.");
  if(r.status === 204) return json(200, { published: false, message: "There's nothing new to publish." });
  if(!r.ok) throw new HttpError(500, "Couldn't publish. Please try again.");
  return json(200, { published: true, message: 'Published. The live site updates in about a minute.' });
});
export const config = { path: '/api/publish' };
