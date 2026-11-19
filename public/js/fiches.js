/* ==========================================================================
   js/fiches.js — fiches visuelles des leçons (espace de cours).

   Chaque leçon a sa fiche d'une page : l'objectif, le fil de la leçon étape
   par étape, les repères (tableau), ce qu'il faut retenir, le piège à éviter
   et la mise en pratique. La fiche est CONSTRUITE À PARTIR DE LA LEÇON
   elle-même (titres, listes, « À retenir », « Le piège à éviter », sources) :
   elle n'ajoute aucun fait, elle condense ce qui est déjà enseigné et sourcé.
   Elle rappelle le référentiel pris en repère par la formation.

   Bouton « Fiche visuelle » en tête de chaque leçon ; la fiche s'agrandit,
   s'imprime seule, ou avec toutes les fiches déjà ouvertes de la formation.
   Aucun gestionnaire en ligne : tout passe par addEventListener.
   ========================================================================== */
(function () {
  'use strict';
  var W = window, D = document;
  /* École du site (cook, sell, care, manage, ia) : nom affiché sur les fiches ; les couleurs suivent la charte du site. */
  var ECO_ID = String((W.SW_PONT && W.SW_PONT.ECOLE) || W.__ECOLE__ || 'cook').toLowerCase(), ECO_NOM = (ECO_ID === 'ia' || ECO_ID === 'code') ? 'IA' : ECO_ID.charAt(0).toUpperCase() + ECO_ID.slice(1), ECO = ECO_NOM.toUpperCase();
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function mod() { try { return typeof modCourant !== 'undefined' ? modCourant : null; } catch (e) { return null; } }
  function cours(id) { try { return typeof COURS !== 'undefined' ? COURS[id] : null; } catch (e) { return null; } }
  function st(id) { try { return typeof etat !== 'undefined' ? etat[id] : null; } catch (e) { return null; } }
  function net(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  /* Première phrase d'un paragraphe, sans la couper au milieu d'un nombre (« +3 °C », « 1,5 kg », « n° 83-50 »). */
  function phrase(t, max) {
    t = net(t); if (!t) return '';
    var m = t.match(/^[\s\S]*?[.!?…](?=\s+[A-ZÀÂÉÈÊÎÔÛÇŒ«]|$)/), p = m ? m[0] : t;
    if (p.length > max) { p = p.slice(0, max); p = p.slice(0, Math.max(p.lastIndexOf(' '), max - 30)).replace(/[,;:\s]+$/, '') + '…'; }
    return p;
  }
  function court(t, max) { t = net(t); if (t.length <= max) return t; t = t.slice(0, max); return t.slice(0, Math.max(t.lastIndexOf(' '), max - 20)).replace(/[,;:\s]+$/, '') + '…'; }

  /* Lit la leçon (HTML d'origine) et en tire les éléments de la fiche. Les activités et leurs corrigés sont écartés. */
  function lire(l) {
    var z = D.createElement('div'); z.innerHTML = l.h || '';
    z.querySelectorAll('.sw-act,.sw-corrige,details,script,style').forEach(function (x) { x.remove(); });
    var f = { titre: net(l.t), obj: '', etapes: [], table: null, cles: [], piege: '', cas: '', sources: [], temps: '' };
    var o = z.querySelector('.sw-obj'); f.obj = o ? net(o.textContent).replace(/^Objectif\s*:\s*/i, '') : net(l.o);
    var tp = z.querySelector('.sw-temps b'); if (tp) f.temps = net(tp.textContent);
    z.querySelectorAll('h4.sw-h4, h4').forEach(function (h) {
      var e = { t: net(h.textContent), p: '', li: [] }, n = h.nextElementSibling;
      while (n && !/^H[34]$/.test(n.tagName) && !(n.classList && (n.classList.contains('sw-cles') || n.classList.contains('lc-tip') || n.classList.contains('sw-cas') || n.classList.contains('sw-src')))) {
        if (n.tagName === 'P' && !e.p) e.p = phrase(n.textContent, 190);
        if ((n.tagName === 'UL' || n.tagName === 'OL') && !e.li.length) n.querySelectorAll(':scope > li').forEach(function (li) { e.li.push(court(li.textContent, 110)); });
        if (n.tagName === 'TABLE' && !f.table) f.table = n;
        n = n.nextElementSibling;
      }
      if (e.t && (e.p || e.li.length)) f.etapes.push(e);
    });
    if (!f.table) f.table = z.querySelector('table');
    z.querySelectorAll('.sw-cles li').forEach(function (li) { f.cles.push(net(li.textContent)); });
    var tip = z.querySelector('.lc-tip'); if (tip) f.piege = net(tip.textContent).replace(/^Le piège à éviter\s*:\s*/i, '');
    var cas = z.querySelector('.sw-cas'); if (cas) f.cas = net(cas.textContent).replace(/^Mise en pratique\s*:\s*/i, '');
    z.querySelectorAll('.sw-src a').forEach(function (a) { f.sources.push(net(a.textContent)); });
    return f;
  }
  function utile(f) { return f.etapes.length >= 2 || f.cles.length >= 2; }

  var ICO = {
    cible: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
    ok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    alerte: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5" stroke-linecap="round"/><circle cx="12" cy="17.2" r=".9" fill="currentColor"/></svg>',
    main: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13 7l4 4"/></svg>',
    fiche: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5" stroke-linecap="round"/></svg>'
  };

  /* Une fiche = une page. `num` et `tot` : rang de la leçon dans la formation. */
  function page(id, i) {
    var m = cours(id), l = m && m.lecons[i]; if (!l || !l.h) return '';
    var f = lire(l); if (!utile(f)) return '';
    var titre = f.titre.replace(/^\s*[\d.]+\s*[—–-]\s*/, ''), code = (f.titre.match(/^\s*([\d.]+)\s*[—–-]/) || [])[1] || String(i + 1);
    var etapes = f.etapes.slice(0, 7).map(function (e, k) {
      return '<li><span class="fv-n">' + (k + 1) + '</span><div><b>' + esc(e.t) + '</b>' + (e.p ? '<p>' + esc(e.p) + '</p>' : '') +
        (e.li.length ? '<ul>' + e.li.slice(0, 5).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + (e.li.length > 5 ? '<li class="fv-plus">et ' + (e.li.length - 5) + ' autre' + (e.li.length - 5 > 1 ? 's' : '') + ' dans la leçon</li>' : '') + '</ul>' : '') + '</div></li>';
    }).join('');
    var table = '';
    if (f.table) { var t = f.table.cloneNode(true); t.removeAttribute('class'); t.removeAttribute('style'); if (t.querySelectorAll('tr').length <= 12) table = '<section class="fv-rep"><h4>Repères</h4><div class="fv-tw">' + t.outerHTML + '</div></section>'; }
    return '<article class="fv-page">' +
      '<header class="fv-top"><div><b>SWIPE LEARN SCHOOL</b><span>' + ECO + ' · ' + esc(court(m.titre || '', 70)) + '</span></div><div class="fv-code">Leçon ' + esc(code) + '<small>fiche ' + (i + 1) + ' / ' + m.lecons.length + '</small></div></header>' +
      '<h3 class="fv-titre">' + esc(titre) + '</h3>' +
      (f.obj ? '<p class="fv-obj">' + ICO.cible + '<span><b>Objectif.</b> ' + esc(f.obj) + '</span></p>' : '') +
      '<div class="fv-corps"><section class="fv-fil"><h4>Le fil de la leçon</h4><ol>' + etapes + '</ol></section>' +
      '<div class="fv-cote">' +
      (f.cles.length ? '<section class="fv-cles"><h4>À retenir</h4><ul>' + f.cles.slice(0, 6).map(function (x) { return '<li>' + ICO.ok + '<span>' + esc(x) + '</span></li>'; }).join('') + '</ul></section>' : '') +
      (f.piege ? '<section class="fv-piege"><h4>' + ICO.alerte + 'Le piège à éviter</h4><p>' + esc(f.piege) + '</p></section>' : '') +
      (f.cas ? '<section class="fv-cas"><h4>' + ICO.main + 'À vous</h4><p>' + esc(court(f.cas, 300)) + '</p></section>' : '') +
      '</div></div>' + table +
      '<footer class="fv-pied">' + (m.sous ? '<p><b>Repère de la formation :</b> ' + esc(court(m.sous, 260)) + '</p>' : '') +
      (f.sources.length ? '<p><b>Sources de la leçon :</b> ' + esc(f.sources.slice(0, 4).map(function (x) { return court(x, 90); }).join(' · ')) + '</p>' : '') +
      '<p>Fiche tirée de la leçon ' + esc(code) + (f.temps ? ' (travail conseillé ' + esc(f.temps) + ')' : '') + ' : elle la résume, elle ne la remplace pas. Swipe Learn School · ' + ECO_NOM + '.</p></footer></article>';
  }

  /* ------------------------------------------------------------------ fiches « Ça a raté » (js/fiches-depannage.js) */
  function depannages(id) { return (W.SW_DEPANNAGE || []).filter(function (d) { return d.m.indexOf(id) >= 0; }); }
  function pageDep(id, d, k, tot) {
    var m = cours(id) || {};
    return '<article class="fv-page fv-dep">' +
      '<header class="fv-top"><div><b>SWIPE LEARN SCHOOL</b><span>' + ECO + ' · ' + esc(court(m.titre || '', 70)) + '</span></div><div class="fv-code">Ça a raté<small>fiche ' + (k + 1) + ' / ' + tot + '</small></div></header>' +
      '<h3 class="fv-titre">' + esc(d.t) + '</h3><p class="fv-obj">' + ICO.cible + '<span>' + esc(d.sous) + '</span></p>' +
      '<div class="fv-duo"><section class="fv-piege"><h4>' + ICO.alerte + 'Ce que vous voyez</h4><p>' + esc(d.s) + '</p></section><section class="fv-cas"><h4>Pourquoi</h4><p>' + esc(d.p) + '</p></section></div>' +
      '<section class="fv-arbre"><h4>Le contrôle, question par question</h4><ol>' + d.n.map(function (x, i) {
        return '<li><div class="fv-q"><span class="fv-n">' + (i + 1) + '</span><b>' + esc(x[0]) + '</b></div><div class="fv-non"><i>Non</i><span>' + esc(x[1]) + '</span></div><div class="fv-oui"><i>Oui</i><span>' + (i < d.n.length - 1 ? 'question suivante' : 'tout est bon') + '</span></div></li>'; }).join('') +
      '</ol><p class="fv-fin">' + ICO.ok + '<span>' + esc(d.fin) + '</span></p></section>' +
      '<div class="fv-duo"><section class="fv-cles"><h4>Points à contrôler</h4><ul>' + d.c.map(function (x) { return '<li>' + ICO.ok + '<span>' + esc(x) + '</span></li>'; }).join('') + '</ul></section>' +
      '<section class="fv-rat"><h4>' + ICO.main + 'Rattraper</h4><p>' + esc(d.f) + '</p></section></div>' +
      '<footer class="fv-pied"><p>Repères de métier usuels, rédigés par l’école : ils complètent la leçon et ne remplacent ni votre formateur ni le plan de maîtrise sanitaire de l’établissement. Swipe Learn School · ' + ECO_NOM + '.</p></footer></article>';
  }
  function montrerDep(id, seul) {
    style(); var bg = fond(), l = depannages(id); if (!l.length) return;
    var vus = seul ? l.filter(function (d) { return d.id === seul; }) : l;
    bg.querySelector('#fv-feuilles').innerHTML = (seul ? '' : '<div class="fv-som"><b>' + l.length + ' fiches « Ça a raté » pour cette formation</b>' + l.map(function (d) { return '<a href="#fv-d-' + d.id + '">' + esc(d.t) + '</a>'; }).join('') + '</div>') +
      vus.map(function (d) { return pageDep(id, d, l.indexOf(d), l.length).replace('<article class="fv-page fv-dep">', '<article class="fv-page fv-dep" id="fv-d-' + d.id + '">'); }).join('');
    bg.querySelectorAll('.fv-som a').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); var c = D.getElementById(a.getAttribute('href').slice(1)); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
    bg.querySelector('#fv-lib').textContent = 'Ça a raté — ' + ((cours(id) || {}).titre || '');
    bg.querySelector('#fv-toutes').hidden = true; boutonCours(bg, id, 'Un geste ou une erreur des fiches « Ça a raté »');
    bg.classList.add('open'); D.body.classList.add('fv-on'); bg.scrollTop = 0;
  }
  /* « Demander un cours privé » : ouvre la demande de classe virtuelle (js/classe-virtuelle.js), sujet pré-rempli. */
  function boutonCours(bg, id, sujet) {
    var b = bg.querySelector('#fv-cours'); if (!b) return;
    var ok = W.SW_CV && typeof W.SW_CV.demander === 'function' && W.SW_PONT && W.SW_PONT.eleve && W.SW_PONT.eleve();
    var n = b.cloneNode(true); n.hidden = !ok; b.replaceWith(n);
    n.addEventListener('click', function () { fermer(); W.SW_CV.demander({ module: id, sujet: sujet }); });
  }
  function style() {
    if (D.getElementById('fv-css')) return;
    var s = D.createElement('style'); s.id = 'fv-css';
    s.textContent =
      '.fv-ouvrir{display:inline-flex;align-items:center;gap:8px;margin:0 0 14px;padding:10px 16px;min-height:44px;border-radius:999px;border:2px solid var(--bleu,#2E5BE3);background:#fff;color:var(--bleu-fonce,#1E3FA8);font:inherit;font-weight:800;font-size:.92rem;cursor:pointer}.fv-ouvrir:hover{background:var(--bleu-fond,color-mix(in srgb,var(--bleu,#2E5BE3) 9%,#fff))}' +
      '#fv-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,60,.72);overflow:auto;padding:0 0 24px;display:none}#fv-bg.open{display:block}' +
      '.fv-barre{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;background:#17265C;color:#fff}.fv-barre b{flex:1 1 160px;font-size:.95rem}.fv-barre button{font:inherit;font-weight:800;font-size:.85rem;min-height:40px;padding:8px 14px;border-radius:999px;border:0;cursor:pointer;background:#fff;color:#17265C}.fv-barre button.fv-p{background:var(--jaune,#F2B01E)}' +
      '#fv-feuilles{padding:14px 10px 0}' +
      '.fv-page{box-sizing:border-box;max-width:820px;margin:0 auto 18px;background:#fff;color:#17265C;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.42;box-shadow:0 10px 30px rgba(0,0,0,.25)}.fv-page *{box-sizing:border-box}.fv-page h3,.fv-page h4,.fv-page p,.fv-page li,.fv-page b{font-family:inherit;text-transform:none;letter-spacing:normal}' +
      '.fv-top{display:flex;justify-content:space-between;gap:12px;align-items:center;background:var(--bleu-fonce,#1E3FA8);color:#fff;padding:12px 18px}.fv-top b{display:block;letter-spacing:1.5px;font-size:12px}.fv-top span{display:block;font-size:12px;color:color-mix(in srgb,var(--bleu,#2E5BE3) 16%,#fff);margin-top:2px}.fv-code{flex:none;text-align:right;background:var(--jaune,#F2B01E);color:#17265C;font-weight:800;border-radius:12px;padding:6px 12px;font-size:15px}.fv-code small{display:block;font-weight:700;font-size:10px}' +
      '.fv-titre{margin:16px 18px 8px;font-size:25px;line-height:1.15;font-weight:800;color:#17265C;border-left:8px solid var(--jaune,#F2B01E);padding-left:12px}' +
      '.fv-obj{display:flex;gap:10px;align-items:flex-start;margin:0 18px 14px;padding:10px 12px;background:color-mix(in srgb,var(--bleu,#2E5BE3) 9%,#fff);border-radius:12px;color:var(--bleu-fonce,#1E3FA8)}.fv-obj svg{flex:none;margin-top:1px}.fv-obj span{color:#17265C}' +
      '.fv-corps{display:grid;grid-template-columns:1fr;gap:14px;padding:0 18px}@media(min-width:700px){.fv-corps{grid-template-columns:1.45fr 1fr}}' +
      '.fv-page h4{margin:0 0 8px;font-size:12px;letter-spacing:1.6px!important;text-transform:uppercase!important;color:var(--bleu-fonce,#1E3FA8);display:flex;align-items:center;gap:6px}' +
      '.fv-fil ol{list-style:none;margin:0;padding:0;position:relative}.fv-fil ol:before{content:"";position:absolute;left:14px;top:14px;bottom:14px;width:3px;background:color-mix(in srgb,var(--bleu,#2E5BE3) 26%,#fff);border-radius:2px}' +
      '.fv-fil ol>li{position:relative;display:flex;gap:12px;margin:0 0 10px;break-inside:avoid}.fv-n{flex:none;position:relative;z-index:1;width:31px;height:31px;border-radius:50%;background:var(--bleu,#2E5BE3);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 0 0 2px var(--bleu,#2E5BE3)}' +
      '.fv-fil ol>li>div{flex:1;min-width:0;background:color-mix(in srgb,var(--bleu,#2E5BE3) 4%,#fff);border:1px solid color-mix(in srgb,var(--bleu,#2E5BE3) 16%,#fff);border-radius:12px;padding:8px 11px}.fv-fil b{display:block;font-size:14.5px}.fv-fil p{margin:3px 0 0;color:#33406E}.fv-fil ul{margin:5px 0 0;padding-left:17px;color:#33406E}.fv-fil ul li{margin:1px 0}.fv-plus{list-style:none;margin-left:-17px!important;font-style:italic;color:#5C6B94}' +
      '.fv-cote{display:flex;flex-direction:column;gap:12px}.fv-cote section{border-radius:14px;padding:11px 13px;break-inside:avoid}.fv-cote p{margin:0}' +
      '.fv-cles{background:#EAF7EF;border:1px solid #BFE3CC}.fv-cles h4{color:#1F7A45}.fv-cles ul{list-style:none;margin:0;padding:0}.fv-cles li{display:flex;gap:8px;margin:0 0 6px}.fv-cles svg{flex:none;color:#2E9E5B;margin-top:2px}' +
      '.fv-piege{background:#FBEDE8;border:1px solid #EDC3B5}.fv-piege h4{color:#A23F20}.fv-cas{background:#FFF6DE;border:1px solid #F1DB9E}.fv-cas h4{color:#7A5600}' +
      '.fv-rep{margin:14px 18px 0}.fv-tw{overflow-x:auto}.fv-rep table{width:100%;border-collapse:collapse;font-size:13px}.fv-rep th{background:var(--bleu-fonce,#1E3FA8);color:#fff;text-align:left;padding:6px 8px;border:1px solid var(--bleu-fonce,#1E3FA8)}.fv-rep td{padding:5px 8px;border:1px solid color-mix(in srgb,var(--bleu,#2E5BE3) 24%,#fff)}.fv-rep tr:nth-child(even) td{background:color-mix(in srgb,var(--bleu,#2E5BE3) 4%,#fff)}' +
      '.fv-ouvrir-dep{border-color:#C5502B;color:#A23F20}.fv-ouvrir-dep:hover{background:#FBEDE8}' +
      '.fv-som{max-width:820px;margin:0 auto 14px;background:#fff;border-radius:16px;padding:14px 16px;font-family:Arial,Helvetica,sans-serif;color:#17265C}.fv-som b{display:block;margin-bottom:8px}.fv-som a{display:inline-block;margin:0 6px 6px 0;padding:7px 12px;border-radius:999px;background:color-mix(in srgb,var(--bleu,#2E5BE3) 9%,#fff);color:var(--bleu-fonce,#1E3FA8);font-weight:700;font-size:13px;text-decoration:none}' +
      '.fv-dep .fv-code{background:#C5502B;color:#fff}.fv-dep .fv-titre{border-left-color:#C5502B}' +
      '.fv-duo{display:grid;grid-template-columns:1fr;gap:12px;padding:0 18px;margin:0 0 14px}@media(min-width:700px){.fv-duo{grid-template-columns:1fr 1fr}}.fv-duo section{border-radius:14px;padding:11px 13px}.fv-duo p{margin:0}.fv-rat{background:color-mix(in srgb,var(--bleu,#2E5BE3) 9%,#fff);border:1px solid color-mix(in srgb,var(--bleu,#2E5BE3) 26%,#fff)}' +
      '.fv-arbre{margin:0 18px 14px}.fv-arbre ol{list-style:none;margin:0;padding:0}.fv-arbre ol>li{display:grid;grid-template-columns:1fr;gap:6px;margin:0 0 10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--bleu,#2E5BE3) 16%,#fff);border-radius:14px;background:color-mix(in srgb,var(--bleu,#2E5BE3) 4%,#fff);break-inside:avoid}@media(min-width:700px){.fv-arbre ol>li{grid-template-columns:1.1fr 1fr;align-items:center}.fv-arbre .fv-oui{grid-column:1 / -1}}' +
      '.fv-q{display:flex;gap:10px;align-items:center}.fv-q b{font-size:14.5px}.fv-non,.fv-oui{display:flex;gap:8px;align-items:baseline}.fv-non i,.fv-oui i{flex:none;font-style:normal;font-weight:800;font-size:11px;letter-spacing:.8px;text-transform:uppercase;border-radius:999px;padding:2px 9px;color:#fff}.fv-non i{background:#C5502B}.fv-oui i{background:#2E9E5B}.fv-non span{color:#7A2E15;font-weight:700}.fv-oui span{color:#5C6B94;font-size:12.5px}' +
      '.fv-fin{display:flex;gap:8px;align-items:center;margin:0;padding:10px 12px;border-radius:12px;background:#EAF7EF;border:1px solid #BFE3CC;font-weight:800;color:#1F7A45}.fv-fin svg{flex:none}' +
      '.fv-pied{margin:14px 0 0;padding:10px 18px 12px;border-top:3px solid var(--jaune,#F2B01E);background:color-mix(in srgb,var(--bleu,#2E5BE3) 4%,#fff);font-size:10.5px;color:#4B587F}.fv-pied p{margin:0 0 3px}' +
      '@media print{@page{size:A4 portrait;margin:9mm}body.fv-on>*{display:none!important}body.fv-on>#fv-bg{display:block!important;position:static;background:#fff;padding:0;overflow:visible}body.fv-on .fv-barre{display:none!important}body.fv-on #fv-feuilles{padding:0}' +
      'body.fv-on .fv-page{max-width:none;margin:0;border-radius:0;box-shadow:none;font-size:11.5px;break-after:page;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}body.fv-on .fv-page:last-child{break-after:auto;page-break-after:auto}body.fv-on .fv-som{display:none}body.fv-on .fv-duo{grid-template-columns:1fr 1fr}body.fv-on .fv-arbre ol>li{grid-template-columns:1.1fr 1fr}body.fv-on .fv-corps{grid-template-columns:1.45fr 1fr}body.fv-on .fv-titre{font-size:21px}}';
    D.head.appendChild(s);
  }
  function fond() {
    var bg = D.getElementById('fv-bg'); if (bg) return bg;
    bg = D.createElement('div'); bg.id = 'fv-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true'); bg.setAttribute('aria-label', 'Fiche visuelle de la leçon');
    bg.innerHTML = '<div class="fv-barre"><b id="fv-lib"></b><button type="button" class="fv-p" id="fv-imp">Imprimer</button><button type="button" id="fv-toutes"></button><button type="button" id="fv-cours" hidden>Demander un cours privé</button><button type="button" id="fv-fermer">Fermer</button></div><div id="fv-feuilles"></div>';
    D.body.appendChild(bg);
    bg.querySelector('#fv-fermer').addEventListener('click', fermer);
    bg.querySelector('#fv-imp').addEventListener('click', function () { W.print(); });
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.id === 'fv-feuilles') fermer(); });
    D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && bg.classList.contains('open')) fermer(); });
    return bg;
  }
  function fermer() { var bg = D.getElementById('fv-bg'); if (bg) bg.classList.remove('open'); D.body.classList.remove('fv-on'); }
  /* Leçons dont la fiche peut s'afficher : celles déjà ouvertes par l'élève (les suivantes restent à découvrir). */
  function ouvertes(id) { var m = cours(id), s = st(id), r = []; if (!m) return r; m.lecons.forEach(function (l, k) { if (l.h && (!s || !s.vues || s.vues.has(k))) r.push(k); }); return r; }
  function montrer(id, liste) {
    style(); var bg = fond(), m = cours(id), h = liste.map(function (k) { return page(id, k); }).filter(Boolean);
    if (!h.length) return;
    bg.querySelector('#fv-feuilles').innerHTML = h.join('');
    bg.querySelector('#fv-lib').textContent = h.length > 1 ? h.length + ' fiches — ' + (m.titre || '') : 'Fiche visuelle';
    var bt = bg.querySelector('#fv-toutes'), tout = ouvertes(id);
    if (liste.length === 1 && tout.length > 1) { bt.hidden = false; bt.textContent = 'Mes ' + tout.length + ' fiches de la formation'; bt.onclick = null; bt.replaceWith(bt = bt.cloneNode(true)); bt.addEventListener('click', function () { montrer(id, tout); }); }
    else bt.hidden = true;
    var l0 = (m.lecons[liste[0]] || {}).t || ''; boutonCours(bg, id, liste.length === 1 ? 'Leçon ' + l0 : (m.titre || ''));
    bg.classList.add('open'); D.body.classList.add('fv-on'); bg.scrollTop = 0;
  }
  function habiller() {
    var id = mod(), zone = D.getElementById('lc-contenu'), s = st(id), m = cours(id); if (!id || !zone || !s || !m) return;
    var i = s.lecon, l = m.lecons[i]; if (!l || !l.h || zone.querySelector('.fv-ouvrir') || !utile(lire(l))) return;
    style();
    var b = D.createElement('button'); b.type = 'button'; b.className = 'fv-ouvrir'; b.innerHTML = ICO.fiche + '<span>Fiche visuelle de la leçon</span>';
    b.addEventListener('click', function () { montrer(id, [i]); });
    var h3 = zone.querySelector('h3'); if (h3 && h3.nextSibling) zone.insertBefore(b, h3.nextSibling); else zone.insertBefore(b, zone.firstChild);
    var nd = depannages(id).length;
    if (nd) { var b2 = D.createElement('button'); b2.type = 'button'; b2.className = 'fv-ouvrir fv-ouvrir-dep'; b2.innerHTML = ICO.alerte + '<span>Ça a raté ? ' + nd + ' fiche' + (nd > 1 ? 's' : '') + ' de dépannage</span>'; b2.addEventListener('click', function () { montrerDep(id); }); b.parentNode.insertBefore(b2, b.nextSibling); b.style.marginRight = '8px'; }
  }
  function installer() {
    if (typeof W.afficherLecon !== 'function' || W.SW_FICHES) return;
    var lecon0 = W.afficherLecon;
    W.afficherLecon = function () { var r = lecon0.apply(this, arguments); try { habiller(); } catch (x) { if (W.console) console.error(x); } return r; };
    W.SW_FICHES = { lire: lire, page: page, montrer: montrer, ouvertes: ouvertes, depannages: depannages, montrerDep: montrerDep, pageDep: pageDep };
    try { habiller(); } catch (x) { /* aucune leçon affichée */ }
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', installer); else installer();
})();
