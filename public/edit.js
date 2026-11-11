/* Awards Program Guide — edit mode. Loaded on every visit but does nothing until someone unlocks editing.
   All saving goes through /api/* (Netlify Functions), which check the password and write to GitHub. */
(function(){
  const G = window.AwardsGuide;
  const $ = (id) => document.getElementById(id);
  const E = { active: false, token: null, expires: 0, baseSha: null, dirty: false, pending: {}, host: null };
  const defaultSrc = G.src;
  const PLAIN = (() => { try { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only'; } catch(e){ return false; } })();

  // ---------- small helpers ----------
  const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, path, v){
    const ks = path.split('.'); let t = o;
    for(let i = 0; i < ks.length - 1; i++){
      if(t[ks[i]] == null) t[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      t = t[ks[i]];
    }
    t[ks[ks.length - 1]] = v;
  }
  const readText = (el) => el.textContent.replace(/\s*\n+\s*/g, ' ');
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'page';

  async function api(path, { method = 'GET', body } = {}){
    const res = await fetch(path, { method, headers: { ...(E.token ? { authorization: 'Bearer ' + E.token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await res.json(); } catch(e){ /* not JSON */ }
    if(!res.ok){
      if(res.status === 404 && !j) throw Object.assign(new Error("Editing isn't turned on for this site yet."), { status: 404 });
      throw Object.assign(new Error((j && j.error) || 'Something went wrong. Please try again.'), { status: res.status });
    }
    return j;
  }

  function setStatus(msg, kind){
    const el = $('editStatus'); if(!el) return;
    el.textContent = msg || ''; el.className = 'edit-status' + (kind ? ' ' + kind : '');
  }
  function refreshButtons(){
    const s = $('saveBtn'); if(s) s.disabled = !E.dirty;
    $('editBtn').style.display = E.active ? 'none' : '';
    $('editTools').style.display = E.active ? 'flex' : 'none';
  }
  function markDirty(){
    if(!E.dirty){ E.dirty = true; setStatus('You have changes that are not saved yet.', 'warn'); refreshButtons(); }
  }

  // ---------- session ----------
  function loadSession(){
    try {
      const s = JSON.parse(sessionStorage.getItem('awardsEdit') || 'null');
      if(s && s.expires > Date.now()){ E.token = s.token; E.expires = s.expires; return true; }
    } catch(e){ /* sessionStorage unavailable */ }
    return false;
  }
  function saveSession(){ try { sessionStorage.setItem('awardsEdit', JSON.stringify({ token: E.token, expires: E.expires })); } catch(e){ /* ignore */ } }

  async function unlock(){
    if(!E.token || E.expires <= Date.now()){
      const dlg = $('pwDlg'), input = $('pwInput'), err = $('pwErr');
      err.textContent = ''; input.value = '';
      dlg.showModal(); input.focus();
      const ok = await new Promise((resolve) => {
        const form = $('pwForm');
        const done = (v) => { form.onsubmit = null; $('pwCancel').onclick = null; dlg.close(); resolve(v); };
        $('pwCancel').onclick = () => done(false);
        dlg.oncancel = () => done(false);
        form.onsubmit = async (e) => {
          e.preventDefault();
          err.textContent = ''; $('pwGo').disabled = true;
          try {
            const r = await api('/api/auth', { method: 'POST', body: { password: input.value } });
            E.token = r.token; E.expires = r.expires; saveSession(); done(true);
          } catch(ex){ err.textContent = ex.message; input.select(); }
          $('pwGo').disabled = false;
        };
      });
      if(!ok) return;
    }
    await enter();
  }

  async function enter(){
    setStatus('Loading the latest saved version…');
    let r;
    try { r = await api('/api/content'); }
    catch(ex){
      if(ex.status === 401){ E.token = null; try { sessionStorage.removeItem('awardsEdit'); } catch(e){} return unlock(); }
      alert(ex.message); setStatus(''); return;
    }
    E.baseSha = r.sha; E.dirty = false; E.active = true;
    G.src = (name) => (E.pending[name] && E.pending[name].dataUrl) || ('/api/img?p=' + encodeURIComponent(name) + '&t=' + encodeURIComponent(E.token));
    document.body.classList.add('editing');
    E.host.setData(JSON.parse(r.content));
    refreshButtons();
    setStatus(r.pending ? 'There are saved edits waiting to be published.' : 'Click any text to edit it. Click a picture to add or change it.');
    E.host.refresh();
  }

  function exit(){
    if(E.dirty && !confirm('You have changes that are not saved. Leave without saving them?')) return;
    E.dirty = false; location.reload();
  }

  // ---------- turning a page's markers into editing controls ----------
  function decorate(root, p){
    root.querySelectorAll('[data-f]').forEach((el) => {
      el.contentEditable = PLAIN ? 'plaintext-only' : 'true';
      el.spellcheck = true;
      el.addEventListener('input', () => { setPath(p, el.dataset.f, readText(el)); markDirty(); });
      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const t = (e.clipboardData || window.clipboardData).getData('text').replace(/\s*\n+\s*/g, ' ');
        document.execCommand('insertText', false, t);
      });
      el.addEventListener('keydown', (e) => {
        const stepMatch = /^steps\.(\d+)$/.exec(el.dataset.f);
        if(e.key === 'Enter'){
          e.preventDefault();
          if(stepMatch){ const i = +stepMatch[1]; p.steps.splice(i + 1, 0, ''); markDirty(); E.host.refresh(); focusField('steps.' + (i + 1)); }
          else el.blur();
        } else if(e.key === 'Backspace' && stepMatch && el.textContent === '' && (p.steps || []).length > 1){
          e.preventDefault(); const i = +stepMatch[1]; p.steps.splice(i, 1); markDirty(); E.host.refresh(); focusField('steps.' + Math.max(0, i - 1), true);
        }
      });
    });
    // Steps need a list that always has an up-to-date array, plus an "Add a step" button.
    const ol = root.querySelector('ol[data-steps]');
    if(ol){
      if(!Array.isArray(p.steps) || !p.steps.length) p.steps = [''];
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'edit-add'; add.textContent = '+ Add a step';
      add.onclick = () => { p.steps.push(''); markDirty(); E.host.refresh(); focusField('steps.' + (p.steps.length - 1)); };
      ol.after(add);
    }
    root.querySelectorAll('[data-slot]').forEach((slot) => {
      const path = slot.dataset.slot;
      const has = !!getPath(p, path);
      const bar = document.createElement('div');
      bar.className = 'img-edit'; bar.contentEditable = 'false';
      const pick = document.createElement('button');
      pick.type = 'button'; pick.textContent = has ? 'Change' : 'Add image';
      pick.onclick = (e) => { e.stopPropagation(); choose(p, path); };
      bar.append(pick);
      if(has){
        const rm = document.createElement('button');
        rm.type = 'button'; rm.textContent = 'Remove'; rm.className = 'rm';
        rm.onclick = (e) => { e.stopPropagation(); setPath(p, path, ''); markDirty(); E.host.refresh(); };
        bar.append(rm);
      }
      slot.append(bar);
    });
  }

  function focusField(path, atEnd){
    const el = document.querySelector('[data-f="' + path + '"]'); if(!el) return;
    el.focus();
    if(atEnd && window.getSelection){ const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  }

  // ---------- pictures ----------
  function choose(p, path){
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const file = input.files && input.files[0]; if(!file) return;
      try {
        setStatus('Preparing the picture…');
        const out = await processImage(file, path);
        const name = slug(p.id) + '-' + path.replace(/\./g, '-') + '-' + Math.random().toString(36).slice(2, 7) + '.' + out.ext;
        E.pending[name] = { b64: out.b64, dataUrl: out.dataUrl, saved: false };
        setPath(p, path, name); E.dirty = false; markDirty(); E.host.refresh(); // markDirty resets the status line
      } catch(ex){ setStatus(ex.message, 'err'); alert(ex.message); }
    };
    input.click();
  }

  const MAX_DIM = (path) => path === 'photo' ? 1400 : path === 'photo2' ? 800 : path === 'image' ? 700 : 300;
  const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));
  const readAsDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

  async function processImage(file, path){
    let bmp;
    try { bmp = await createImageBitmap(file); } catch(e){ throw new Error("That file couldn't be opened as a picture. Please use a PNG or JPG."); }
    const keepPng = file.type === 'image/png' && path !== 'photo' && path !== 'photo2'; // charm art keeps its see-through background
    let scale = Math.min(1, MAX_DIM(path) / Math.max(bmp.width, bmp.height));
    for(let attempt = 0; attempt < 4; attempt++){
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = c.getContext('2d');
      if(!keepPng){ ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await toBlob(c, keepPng ? 'image/png' : 'image/jpeg', 0.85 - attempt * 0.08);
      if(blob && blob.size <= 1.5 * 1024 * 1024){
        const dataUrl = await readAsDataUrl(blob);
        return { ext: keepPng ? 'png' : 'jpg', dataUrl, b64: dataUrl.split(',')[1] };
      }
      scale *= 0.75;
    }
    throw new Error('That picture is too large. Please try a smaller one.');
  }

  // ---------- saving and publishing ----------
  function tidy(data){
    const t = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s);
    data.pages.forEach((p) => {
      ['title', 'intro', 'purpose'].forEach((k) => { if(k in p) p[k] = t(p[k]); });
      if(Array.isArray(p.steps)) p.steps = p.steps.map(t).filter(Boolean);
      if(p.quote){ p.quote.text = t(p.quote.text); p.quote.by = t(p.quote.by); }
      (p.items || []).forEach((it) => { it.blurb = t(it.blurb); });
    });
  }
  function usedImages(data){
    const s = new Set();
    data.pages.forEach((p) => { [p.image, p.photo, p.photo2].forEach((n) => n && s.add(n)); (p.items || []).forEach((it) => it.image && s.add(it.image)); });
    return s;
  }

  async function save(){
    if(!E.dirty) return true;
    $('saveBtn').disabled = true; setStatus('Saving…');
    try {
      const data = E.host.getData(); tidy(data);
      const used = usedImages(data);
      const unsent = Object.entries(E.pending).filter(([n, v]) => !v.saved && used.has(n));
      const batches = []; let cur = [], size = 0;
      unsent.forEach(([n, v]) => { if(size + v.b64.length > 3.3e6 && cur.length){ batches.push(cur); cur = []; size = 0; } cur.push({ name: n, data: v.b64 }); size += v.b64.length; });
      for(const b of batches){ await api('/api/save', { method: 'POST', body: { images: b } }); b.forEach((x) => { E.pending[x.name].saved = true; }); }
      const r = await api('/api/save', { method: 'POST', body: { content: JSON.stringify(data), baseSha: E.baseSha, images: cur } });
      cur.forEach((x) => { E.pending[x.name].saved = true; });
      E.baseSha = r.sha; E.dirty = false;
      setStatus('Saved. It goes live at 6 am, or when you press Publish now.', 'ok');
      E.host.refresh();
      return true;
    } catch(ex){
      setStatus(ex.message, 'err');
      if(ex.status === 409 && confirm(ex.message + '\n\nReload now? (Your unsaved changes on this screen will be lost.)')){ E.dirty = false; location.reload(); }
      else if(ex.status === 401){ E.token = null; try { sessionStorage.removeItem('awardsEdit'); } catch(e){} alert(ex.message); }
      return false;
    } finally { refreshButtons(); }
  }

  async function publish(){
    if(E.dirty){
      if(!confirm('You have changes that are not saved yet. Save them first?')) return;
      if(!(await save())) return;
    }
    if(!confirm('Publish now?\n\nThis updates the live site right away and uses one Netlify deploy, which uses up some of your Netlify credits.\n\nIf you do nothing, your saved edits go live automatically at 6 am.')) return;
    $('pubBtn').disabled = true; setStatus('Publishing…');
    try {
      const r = await api('/api/publish', { method: 'POST' });
      setStatus(r.message, r.published ? 'ok' : '');
    } catch(ex){ setStatus(ex.message, 'err'); alert(ex.message); }
    $('pubBtn').disabled = false;
  }

  // ---------- wiring ----------
  window.AwardsEdit = {
    init(host){
      E.host = host;
      loadSession();
      $('editBtn').onclick = () => { if(window.innerWidth < 700){ alert('Please open this page on a computer or tablet to edit.'); return; } unlock(); };
      $('saveBtn').onclick = save; $('pubBtn').onclick = publish; $('exitBtn').onclick = exit;
      window.addEventListener('beforeunload', (e) => { if(E.dirty){ e.preventDefault(); e.returnValue = ''; } });
      refreshButtons();
    },
    get active(){ return E.active; },
    decorate
  };
})();
