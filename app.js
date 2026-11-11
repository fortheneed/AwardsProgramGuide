/* Awards Program Guide — page renderer (no framework). Text is always inserted as text, never as HTML. */
(function(){
  const PW = 816, PH = 1056; // 8.5in x 11in @ 96dpi

  function h(tag, attrs, ...kids){
    const el = document.createElement(tag);
    for(const k in (attrs||{})){
      if(k === 'class') el.className = attrs[k];
      else if(k === 'style') el.setAttribute('style', attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach(c => { if(c == null || c === false) return; el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }
  const img = (src, alt) => h('img', {src: 'images/' + src.replace(/^\/?images\//, ''), alt: alt || ''});
  const blank = (t) => h('span', {style: 'color:#9aa0b4;font-style:italic'}, t);

  function photoCol(p){
    const col = h('div', {class: 'pg-photo'});
    col.append(p.photo ? img(p.photo, '') : h('div', {class: 'ph-empty'}, 'Photo'));
    if(p.quote && p.quote.text){
      col.append(h('div', {class: 'pg-quote'}, '“' + p.quote.text + '”', p.quote.by ? h('span', {class: 'by'}, '—' + p.quote.by) : null));
    }
    return col;
  }

  function whoChips(p, data){
    const names = {}; data.booklets.forEach(b => names[b.id] = b.title);
    return h('div', {class: 'who'}, p.audiences.map(a => h('span', null, names[a])));
  }

  function render(p, booklet, data, pageNo){
    const page = h('div', {class: 'page', style: '--accent:' + booklet.color});
    page.append(photoCol(p));

    const main = h('div', {class: 'pg-main'});
    main.append(h('div', {class: 'pg-banner'},
      h('div', {class: 'badge'}, p.image ? img(p.image, p.title) : h('div', {class: 'b-empty'}, 'Charm'))));

    main.append(h('div', {class: 'pg-title' + (p.title.length > 22 ? ' long' : '')},
      p.label ? h('div', {class: 'pg-label'}, p.label) : null,
      h('h1', null, p.title),
      p.type === 'cover' ? null : whoChips(p, data)));

    const body = h('div', {class: 'pg-body'});
    body.append(h('p', {class: 'pg-intro'}, p.intro || blank('Intro paragraph goes here.')));

    if(p.type === 'charm'){
      body.append(h('div', {class: 'pg-h'}, 'Steps'));
      const steps = (p.steps || []).filter(Boolean);
      body.append(h('ol', {class: 'pg-steps'}, steps.length ? steps.map(s => h('li', null, s)) : [h('li', null, blank('Steps go here.'))]));
      body.append(h('div', {class: 'pg-h'}, 'Purpose'));
      body.append(h('p', {class: 'pg-purpose'}, p.purpose ? h('strong', null, p.purpose) : blank('Purpose goes here.')));
    } else if(p.type === 'group'){
      body.append(h('div', {class: 'pg-h'}, 'The charms'));
      body.append(h('div', {class: 'cards'}, p.items.map(it => h('div', {class: 'card'},
        h('div', {class: 'mini'}, it.image ? img(it.image, it.name) : 'Charm'),
        h('div', null,
          h('div', {class: 'nm'}, it.name),
          h('div', {class: 'bl'}, it.blurb || blank('One-line description.')),
          (it.tickets && p.audiences.some(a => a === 'arrows' || a === 'alumni')) ? h('div', {class: 'tx'}, it.tickets + ' tickets') : null)))));
      if(p.purpose){ body.append(h('div', {class: 'pg-h'}, 'Purpose')); body.append(h('p', {class: 'pg-purpose'}, h('strong', null, p.purpose))); }
    } else { /* cover */
      body.append(h('p', {class: 'pg-purpose'}, blank('Welcome text goes here.')));
    }

    if(p.photo2) body.append(h('div', {class: 'pg-photo2'}, img(p.photo2, '')));
    else if(p.type === 'charm') body.append(h('div', {class: 'pg-photo2 empty'}, 'Photo 2'));

    body.append(h('div', {class: 'pg-foot'}, booklet.title, h('b', null, '|'), String(pageNo)));
    main.append(body);
    page.append(main);
    return page;
  }

  function wrap(pageEl){
    const scaler = h('div', {class: 'sheet-scaler'}, pageEl);
    const wrapEl = h('div', {class: 'sheet-wrap'}, scaler);
    wrapEl._scaler = scaler;
    return wrapEl;
  }

  function fit(wraps){
    const avail = Math.min(window.innerWidth - 24, PW);
    const s = avail / PW;
    wraps.forEach(w => {
      w._scaler.style.transform = 'scale(' + s + ')';
      w.style.height = (PH * s) + 'px';
      w.style.width = '';
      w._scaler.style.width = PW + 'px';
      w.style.justifyContent = 'flex-start';
      w.style.paddingLeft = Math.max(0, (window.innerWidth - PW * s) / 2) + 'px';
    });
  }

  window.AwardsGuide = {
    load: () => fetch('awards.json', {cache: 'no-cache'}).then(r => r.json()),
    render, wrap, fit, PW, PH
  };
})();
