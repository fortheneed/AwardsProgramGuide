/* Awards Program Guide — page renderer (no framework). Text is always inserted as text, never as HTML. */
(function(){
  const PW = 816, PH = 1056; // 8.5in x 11in @ 96dpi
  const LOGO = 'assets/logo.png'; // full-color logo with white wordmark; always shown on a brand-navy plate

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

  // Decorative hexagons of mixed sizes. Each is [centerX, centerY, radius, opacity, outlineOnly].
  const BANNER_HEXES = [[40,48,36,.16,0],[96,150,22,.12,0],[22,190,16,.3,1],[150,36,14,.22,0],[205,196,32,.12,0],[112,92,9,.28,0],
    [250,22,12,.3,1],[395,40,26,.15,0],[470,112,42,.11,0],[535,28,16,.24,0],[524,196,24,.28,1],[362,172,14,.22,0],
    [312,216,20,.12,0],[442,216,11,.24,0],[330,104,8,.2,0],[80,215,10,.2,0],[548,100,12,.25,1]];
  const COVER_HEXES = [[60,70,54,.16,0],[150,150,30,.22,0],[205,52,18,.3,1],[40,190,20,.26,1],[262,132,12,.28,0],[78,300,14,.2,0],
    [756,986,56,.16,0],[666,906,32,.22,0],[612,1008,18,.3,1],[776,850,22,.26,1],[554,930,12,.28,0],[738,740,14,.2,0],
    [770,64,14,.2,0],[52,1000,14,.2,0]];
  const WIDE_HEXES = [[60,40,36,.16,0],[130,120,22,.12,0],[24,150,16,.3,1],[210,36,14,.22,0],[300,150,30,.12,0],
    [420,50,12,.3,1],[560,30,26,.15,0],[690,120,40,.11,0],[770,38,16,.24,0],[780,160,22,.28,1],[500,160,14,.22,0],[610,170,10,.24,0]];

  function hexSvg(list, w, hgt, color, slice){
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'hexes'); svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hgt);
    svg.setAttribute('preserveAspectRatio', slice || 'xMidYMid slice'); svg.setAttribute('aria-hidden', 'true');
    list.forEach(([cx, cy, r, op, outline]) => {
      const pts = [0,1,2,3,4,5].map(k => { const a = Math.PI / 180 * (60 * k + 30); return (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1); }).join(' ');
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', pts); poly.setAttribute('stroke-linejoin', 'round');
      if(outline){ poly.setAttribute('fill', 'none'); poly.setAttribute('stroke', color); poly.setAttribute('stroke-width', '3'); poly.setAttribute('stroke-opacity', op); }
      else { poly.setAttribute('fill', color); poly.setAttribute('fill-opacity', op); }
      svg.append(poly);
    });
    return svg;
  }

  const accentStyle = (b) => '--accent:' + b.color + ';--accent-ink:' + (b.ink || b.color) + ';--cover-text:' + (b.coverText || '#201F1F');
  const mob = (opts) => (opts && opts.mobile) ? ' mobile' : '';

  function photoCol(p){
    const col = h('div', {class: 'pg-photo'});
    col.append(p.photo ? img(p.photo, '') : h('div', {class: 'ph-empty'}, 'Photo'));
    if(p.quote && p.quote.text) col.append(quoteBox(p));
    return col;
  }
  function quoteBox(p){
    return h('div', {class: 'pg-quote'}, '“' + p.quote.text + '”', p.quote.by ? h('span', {class: 'by'}, '—' + p.quote.by) : null);
  }

  // Cover: booklet-color background, title a little above center, our logo at the bottom.
  function renderCover(p, booklet, opts){
    const page = h('div', {class: 'page cover' + mob(opts), style: accentStyle(booklet)});
    page.append(hexSvg(COVER_HEXES, PW, PH, '#fff', opts.mobile ? 'xMidYMid slice' : 'xMidYMid meet'));
    page.append(h('div', {class: 'cover-box'},
      h('h1', null, p.title),
      p.intro ? h('p', null, p.intro) : null));
    page.append(h('div', {class: 'cover-logo'}, h('img', {src: LOGO, alt: 'For the Need Foundation'})));
    return page;
  }

  // Table of contents (page 2). Each entry links to its page: p.entries = [{title, section, idx}]
  function renderToc(p, booklet, opts){
    const page = h('div', {class: 'page toc' + mob(opts), style: accentStyle(booklet)});
    page.append(h('div', {class: 'toc-banner'}, hexSvg(WIDE_HEXES, PW, 190, '#fff'), h('h1', null, 'Table of Contents')));
    const body = h('div', {class: 'toc-body'});
    let cur = null, list = null;
    p.entries.forEach(e => {
      if(e.section !== cur){
        cur = e.section;
        list = h('div', {class: 'toc-sec'}, h('div', {class: 'toc-h'}, cur));
        body.append(list);
      }
      list.append(h('a', {class: 'toc-link', href: '#' + booklet.id + '/' + (e.idx + 1), 'data-page': String(e.idx)},
        h('span', {class: 'tt'}, e.title), h('span', {class: 'dots'}), h('span', {class: 'pn'}, String(e.idx + 1))));
    });
    page.append(body);
    page.append(h('div', {class: 'pg-foot'}, booklet.title, h('b', null, '|'), '2'));
    return page;
  }

  const labelText = (p) => [p.label, p.tickets ? p.tickets + ' Tickets' : ''].filter(Boolean).join(' – ');

  // opts.mobile = reflowed single-column layout for phones (never used for printing).
  function render(p, booklet, data, pageNo, opts){
    opts = opts || {};
    if(p.type === 'cover') return renderCover(p, booklet, opts);
    if(p.type === 'toc') return renderToc(p, booklet, opts);
    const page = h('div', {class: 'page' + mob(opts), style: accentStyle(booklet)});
    if(!opts.mobile) page.append(photoCol(p)); // phones skip the big side photo so the charm shows right away

    const main = h('div', {class: 'pg-main'});
    main.append(h('div', {class: 'pg-banner'}, hexSvg(BANNER_HEXES, 566, 230, '#fff'),
      h('div', {class: 'badge'}, p.image ? img(p.image, p.title) : h('div', {class: 'b-empty'}, 'Charm'))));

    main.append(h('div', {class: 'pg-title' + (p.title.length > 22 ? ' long' : '')},
      labelText(p) ? h('div', {class: 'pg-label'}, labelText(p)) : null,
      h('h1', null, p.title)));

    const body = h('div', {class: 'pg-body'});
    body.append(h('p', {class: 'pg-intro' + (p.intro ? '' : ' nodrop')}, p.intro || blank('Intro paragraph goes here.')));

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
          // per-charm tickets only when the page doesn't already state one amount (e.g. Bronze/Silver/Gold)
          (it.tickets && !p.tickets && p.audiences.some(a => a === 'arrows' || a === 'alumni')) ? h('div', {class: 'tx'}, it.tickets + ' tickets') : null)))));
      if(p.purpose){ body.append(h('div', {class: 'pg-h'}, 'Purpose')); body.append(h('p', {class: 'pg-purpose'}, h('strong', null, p.purpose))); }
    }

    // On phones the quote (normally over photo 1) moves into the page body.
    if(opts.mobile && p.quote && p.quote.text) body.append(h('div', {class: 'pg-quote-m'}, quoteBox(p)));

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

  // Cover + contents + the booklet's charm pages, in order. Contents is generated, not stored.
  function booklet(data, id){
    const b = data.booklets.find(x => x.id === id) || data.booklets[0];
    const own = data.pages.filter(p => p.audiences.includes(b.id));
    const cover = own.filter(p => p.type === 'cover');
    const rest = own.filter(p => p.type !== 'cover');
    const toc = {id: 'toc-' + b.id, type: 'toc', title: 'Table of Contents', audiences: [b.id],
      entries: rest.map((p, i) => ({title: p.title, section: p.section || p.label || '', idx: i + 2}))};
    return {booklet: b, pages: [...cover, toc, ...rest]};
  }

  window.AwardsGuide = {
    load: () => fetch('awards.json', {cache: 'no-cache'}).then(r => r.json()),
    render, wrap, booklet, PW, PH
  };
})();
