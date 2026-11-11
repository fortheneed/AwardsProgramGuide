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

  // Decorative hexagons of mixed sizes. Each is [centerX, centerY, radius, opacity, outlineOnly].
  const BANNER_HEXES = [[40,48,36,.16,0],[96,150,22,.12,0],[22,190,16,.3,1],[150,36,14,.22,0],[205,196,32,.12,0],[112,92,9,.28,0],
    [250,22,12,.3,1],[395,40,26,.15,0],[470,112,42,.11,0],[535,28,16,.24,0],[524,196,24,.28,1],[362,172,14,.22,0],
    [312,216,20,.12,0],[442,216,11,.24,0],[330,104,8,.2,0],[80,215,10,.2,0],[548,100,12,.25,1]];
  const COVER_HEXES = [[60,70,54,.16,0],[150,150,30,.22,0],[205,52,18,.3,1],[40,190,20,.26,1],[262,132,12,.28,0],[78,300,14,.2,0],
    [756,986,56,.16,0],[666,906,32,.22,0],[612,1008,18,.3,1],[776,850,22,.26,1],[554,930,12,.28,0],[738,740,14,.2,0],
    [770,64,14,.2,0],[52,1000,14,.2,0]];

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

  const accentStyle = (booklet) => '--accent:' + booklet.color + ';--accent-ink:' + (booklet.ink || booklet.color);

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

  // Cover: just the title, a little above center (plus optional welcome text if one has been written).
  function renderCover(p, booklet, opts){
    const page = h('div', {class: 'page cover' + (opts.mobile ? ' mobile' : ''), style: accentStyle(booklet)});
    page.append(hexSvg(COVER_HEXES, PW, PH, booklet.color, opts.mobile ? 'xMidYMid slice' : 'xMidYMid meet'));
    page.append(h('div', {class: 'cover-box'},
      h('h1', null, p.title),
      p.intro ? h('p', null, p.intro) : null));
    return page;
  }

  // opts.mobile = reflowed single-column layout for phones (not used for printing).
  function render(p, booklet, data, pageNo, opts){
    opts = opts || {};
    if(p.type === 'cover') return renderCover(p, booklet, opts);
    const page = h('div', {class: 'page' + (opts.mobile ? ' mobile' : ''), style: accentStyle(booklet)});
    page.append(photoCol(p));

    const main = h('div', {class: 'pg-main'});
    main.append(h('div', {class: 'pg-banner'}, hexSvg(BANNER_HEXES, 566, 230, '#fff'),
      h('div', {class: 'badge'}, p.image ? img(p.image, p.title) : h('div', {class: 'b-empty'}, 'Charm'))));

    main.append(h('div', {class: 'pg-title' + (p.title.length > 22 ? ' long' : '')},
      p.label ? h('div', {class: 'pg-label'}, p.label) : null,
      h('h1', null, p.title),
      whoChips(p, data)));

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
          (it.tickets && p.audiences.some(a => a === 'arrows' || a === 'alumni')) ? h('div', {class: 'tx'}, it.tickets + ' tickets') : null)))));
      if(p.purpose){ body.append(h('div', {class: 'pg-h'}, 'Purpose')); body.append(h('p', {class: 'pg-purpose'}, h('strong', null, p.purpose))); }
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

  window.AwardsGuide = {
    load: () => fetch('awards.json', {cache: 'no-cache'}).then(r => r.json()),
    render, wrap, PW, PH
  };
})();
