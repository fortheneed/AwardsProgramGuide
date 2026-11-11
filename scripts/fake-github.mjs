// A small in-memory stand-in for the parts of the GitHub API the editing functions use.
// Used only for local tests. It models branches, commits, trees, blobs, compare and merge.
import http from 'node:http';
import crypto from 'node:crypto';

export function createFakeGithub(initialFiles, defaultBranch = 'Main'){
  const blobs = new Map(), trees = new Map(), commits = new Map(), refs = new Map();
  const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
  const putBlob = (buf) => { const id = sha('blob ' + buf.length + '\0' + buf.toString('latin1')); blobs.set(id, buf); return id; };
  const putTree = (map) => { const id = sha('tree' + JSON.stringify([...map].sort())); trees.set(id, new Map(map)); return id; };
  const putCommit = (tree, parents, msg) => { const id = sha('commit' + tree + parents.join() + msg + Math.random()); commits.set(id, { tree, parents, msg }); return id; };
  const files = new Map(Object.entries(initialFiles).map(([p, v]) => [p, putBlob(Buffer.from(v))]));
  const root = putCommit(putTree(files), [], 'initial');
  refs.set(defaultBranch, root);
  const state = { calls: [], refs, commits, trees, blobs, defaultBranch };

  const ancestors = (c) => { const s = new Set(); const st = [c]; while(st.length){ const x = st.pop(); if(s.has(x)) continue; s.add(x); st.push(...commits.get(x).parents); } return s; };
  const fileAt = (branch, path) => { const c = refs.get(branch); if(!c) return null; const t = trees.get(commits.get(c).tree); return t.get(path) || null; };
  state.fileAt = (branch, path) => { const id = fileAt(branch, path); return id ? blobs.get(id) : null; };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    let raw = ''; for await (const ch of req) raw += ch;
    const body = raw ? JSON.parse(raw) : null;
    state.calls.push(req.method + ' ' + u.pathname);
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    if(!/^Bearer .+/.test(req.headers.authorization || '')) return send(401, { message: 'Bad credentials' });
    const m = u.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    let r;
    if(m === '' || m === '/') return send(200, { default_branch: defaultBranch });
    if((r = /^\/git\/ref\/heads\/(.+)$/.exec(m))){ const b = decodeURIComponent(r[1]); return refs.has(b) ? send(200, { object: { sha: refs.get(b) } }) : send(404, { message: 'Not Found' }); }
    if(m === '/git/refs' && req.method === 'POST'){ const b = body.ref.replace('refs/heads/', ''); if(refs.has(b)) return send(422, { message: 'exists' }); refs.set(b, body.sha); return send(201, {}); }
    if((r = /^\/git\/refs\/heads\/(.+)$/.exec(m)) && req.method === 'PATCH'){
      const b = decodeURIComponent(r[1]), cur = refs.get(b);
      if(!body.force && !ancestors(body.sha).has(cur)) return send(422, { message: 'Update is not a fast forward' });
      refs.set(b, body.sha); return send(200, {});
    }
    if((r = /^\/git\/commits\/(.+)$/.exec(m))){ const c = commits.get(r[1]); return c ? send(200, { sha: r[1], tree: { sha: c.tree } }) : send(404, {}); }
    if(m === '/git/blobs' && req.method === 'POST') return send(201, { sha: putBlob(Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8')) });
    if(m === '/git/trees' && req.method === 'POST'){
      const t = new Map(trees.get(body.base_tree)); body.tree.forEach(e => t.set(e.path, e.sha)); return send(201, { sha: putTree(t) });
    }
    if(m === '/git/commits' && req.method === 'POST') return send(201, { sha: putCommit(body.tree, body.parents, body.message) });
    if((r = /^\/contents\/(.+)$/.exec(m))){
      const path = decodeURIComponent(r[1]), b = u.searchParams.get('ref') || defaultBranch, id = fileAt(b, path);
      if(!id) return send(404, { message: 'Not Found' });
      if((req.headers.accept || '').includes('raw')){ res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(blobs.get(id)); }
      return send(200, { sha: id, content: blobs.get(id).toString('base64'), encoding: 'base64' });
    }
    if((r = /^\/compare\/(.+)\.\.\.(.+)$/.exec(m))){
      const base = refs.get(decodeURIComponent(r[1])), head = refs.get(decodeURIComponent(r[2]));
      const a = ancestors(base); const ahead = [...ancestors(head)].filter(x => !a.has(x)).length;
      return send(200, { ahead_by: ahead });
    }
    if(m === '/merges' && req.method === 'POST'){
      const base = refs.get(body.base), head = refs.get(body.head);
      if(ancestors(base).has(head)) return send(204);
      if(ancestors(head).has(base)){ refs.set(body.base, head); return send(201, { sha: head }); } // fast-forward
      const ab = ancestors(base), mb = [...ancestors(head)].find(x => ab.has(x));
      const tb = trees.get(commits.get(base).tree), th = trees.get(commits.get(head).tree), tm = trees.get(commits.get(mb).tree);
      const out = new Map(); let conflict = false;
      for(const p of new Set([...tb.keys(), ...th.keys()])){
        const b = tb.get(p), h = th.get(p), o = tm.get(p);
        if(b === h) { if(b) out.set(p, b); } else if(b === o) { if(h) out.set(p, h); } else if(h === o) { if(b) out.set(p, b); } else conflict = true;
      }
      if(conflict) return send(409, { message: 'Merge conflict' });
      const c = putCommit(putTree(out), [base, head], body.commit_message); refs.set(body.base, c); return send(201, { sha: c });
    }
    send(404, { message: 'Unhandled ' + req.method + ' ' + m });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ state, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}
