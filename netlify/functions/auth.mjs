import { wrap, json, passwordOk, makeToken, HttpError } from '../lib/core.mjs';

// POST { password } -> { token, expires }. Wrong passwords wait a moment before answering.
export default wrap(async (req) => {
  if(req.method !== 'POST') throw new HttpError(405, 'Not allowed.');
  let body = {};
  try { body = await req.json(); } catch { /* empty */ }
  if(!passwordOk(body.password)){
    await new Promise(r => setTimeout(r, Number(process.env.AUTH_FAIL_DELAY_MS ?? 800)));
    throw new HttpError(401, "That password didn't work.");
  }
  return json(200, makeToken());
});
export const config = { path: '/api/auth' };
