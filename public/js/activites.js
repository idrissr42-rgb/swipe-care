/* ==========================================================================
   js/activites.js — activités des leçons faites en ligne (espace élève).

   Chaque leçon contient déjà ses activités : une mise en pratique (.sw-cas),
   des exercices et des travaux guidés (.sw-act, durée prévue dans data-min),
   chacun avec son corrigé commenté. Ce fichier les rend réelles :
   - l'élève écrit sa réponse dans la page ; le serveur de l'école la garde,
     avec sa date et son empreinte dans le journal scellé (activite_rendre) ;
   - le corrigé ne s'ouvre qu'une fois la réponse rendue, puis l'élève se situe
     (juste, en partie, à reprendre) ;
   - une leçon n'est terminée que lorsque toutes ses activités sont rendues :
     la leçon suivante, le quiz et l'examen blanc s'ouvrent ensuite.
   Rien n'est inventé ici : énoncés, durées et corrigés sont ceux des leçons.
   Sans élève connecté (démonstration publique), les leçons restent en lecture.
   Aucun gestionnaire en ligne : tout passe par addEventListener.
   ========================================================================== */
(function () {
  'use strict';
  var W = window, D = document;
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function dire(t) { if (typeof W.toast === 'function') W.toast(t); }
  function duree(m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + ' h' : '') + (r ? (h ? ' ' : '') + (r < 10 && h ? '0' : '') + r + (h ? '' : ' min') : ''); }
  function eleve() { return W.SW_PONT && W.SW_PONT.eleve && W.SW_PONT.eleve(); }
  function mod() { return (typeof modCourant !== 'undefined' && modCourant) || ''; }

  /* --- Ce que contient chaque leçon (lu une fois dans le texte du cours) --- */
  var plans = {};
  function plan(id) {
    if (plans[id]) return plans[id];
    var m = (typeof COURS !== 'undefined' && COURS[id]) || null, p = [];
    ((m && m.lecons) || []).forEach(function (l) {
      var h = String(l.h || ''), cles = [], min = 0, re = /class="sw-act(?: [^"]*)?"(?: data-min="(\d+)")?/g, x, k = 0;
      if (/class="sw-cas"/.test(h)) cles.push('c');
      while ((x = re.exec(h))) { cles.push(String(k++)); min += Number(x[1]) || 0; }
      p.push({ cles: cles, min: min });
    });
    if (eleve() && p.length) plans[id] = p;   /* le contenu complet n'est chargé qu'une fois l'élève connecté */
    return p;
  }
  function rendues(id) { var el = eleve(); return (el && el.acts && el.acts[id]) || {}; }
  function reste(id, i) { var p = plan(id)[i], r = rendues(id); return p ? p.cles.filter(function (k) { return !r[i + '.' + k]; }) : []; }
  function premiereOuverte(id) { var p = plan(id); for (var i = 0; i < p.length; i++) if (reste(id, i).length) return i; return -1; }
  /* Leçons vues dont toutes les activités sont rendues (sert au pourcentage d'avancement). */
  function terminees(id, vues) { if (!eleve()) return vues.size; var n = 0; vues.forEach(function (i) { if (!reste(id, i).length) n++; }); return n; }
  function finies(id, vues) { var l = []; if (!eleve()) return l; vues.forEach(function (i) { var p = plan(id)[i]; if (p && p.cles.length && !reste(id, i).length) l.push(i); }); return l; }
  function bilanModule(id) { var p = plan(id), r = rendues(id), t = 0, f = 0, min = 0; p.forEach(function (x, i) { t += x.cles.length; min += x.min; x.cles.forEach(function (k) { if (r[i + '.' + k]) f++; }); }); return { total: t, faites: f, min: min }; }

  /* --- Brouillons et réponses, gardés aussi sur l'appareil pour les relire --- */
  function cleLocale(id, i, k) { var el = eleve(); return 'sw_act:' + ((el && el.id) || '') + ':' + id + ':' + i + '.' + k; }
  function lireLocal(c) { try { return localStorage.getItem(c) || ''; } catch (x) { return ''; } }
  function ecrireLocal(c, v) { try { localStorage.setItem(c, v); } catch (x) {} }

  function minimum(sorte, min) { return sorte === 'cas' ? 60 : Math.max(150, Math.min(500, (min || 20) * 8)); }

  function bloc(noeud, id, i, k, sorte, min, titre, corrige) {
    var r = rendues(id)[i + '.' + k], c = cleLocale(id, i, k), mini = minimum(sorte, min), z = D.createElement('div');
    z.className = 'act-zone'; z.setAttribute('data-act', k);
    var texte = lireLocal(c);
    if (r) {
      z.innerHTML = '<p class="act-ok">Réponse enregistrée le ' + new Date(r.le).toLocaleDateString('fr-FR') + ' à ' + new Date(r.le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' (' + r.n + ' caractères).</p>' +
        (texte ? '<details class="act-ma"><summary>Relire ma réponse</summary><p style="white-space:pre-wrap">' + e(texte) + '</p></details>' : '') +
        (corrige ? '<div class="act-bilan"><span>Après lecture du corrigé, ma réponse était :</span>' +
          [['juste', 'Juste'], ['partiel', 'Juste en partie'], ['revoir', 'À reprendre']].map(function (b) { return '<button type="button" data-bilan="' + b[0] + '" class="' + (r.bilan === b[0] ? 'on' : '') + '">' + b[1] + '</button>'; }).join('') + '</div>' : '') +
        '<p class="act-refaire"><button type="button" class="act-lien" data-refaire="1">Rendre une nouvelle version</button></p>';
      noeud.appendChild(z);
      if (corrige) { noeud.appendChild(corrige); }
      z.querySelectorAll('button[data-bilan]').forEach(function (b) { b.addEventListener('click', function () {
        W.SW_PONT.api('activite_rendre', { module: id, lecon: i, k: k, bilan: b.getAttribute('data-bilan') }).then(function (j) { if (j && j.eleve) W.SW_PONT.garder(j.eleve); z.querySelectorAll('button[data-bilan]').forEach(function (o) { o.classList.toggle('on', o === b); }); if (b.getAttribute('data-bilan') === 'revoir') dire('Noté. Reprenez la leçon, puis rendez une nouvelle version : votre formateur peut aussi vous aider dans la messagerie.'); })
          .catch(function (err) { dire((err && err.message) || 'Non enregistré : réessayez dans un instant.'); }); }); });
      z.querySelector('[data-refaire]').addEventListener('click', function () { z.remove(); if (corrige) corrige.remove(); formulaire(noeud, id, i, k, sorte, min, titre, corrige, texte, true); });
      return;
    }
    formulaire(noeud, id, i, k, sorte, min, titre, corrige, texte, false);
    function formulaire(noeud, id, i, k, sorte, min, titre, corrige, texte, deja) {
      var z = D.createElement('div'); z.className = 'act-zone'; z.setAttribute('data-act', k); if (!deja) z.setAttribute('data-afaire', '1');
      z.innerHTML = '<label for="act-' + i + '-' + k + '">' + (sorte === 'cas' ? 'Ma réponse' : 'Mon travail : résultats, calculs, raisonnement') + '</label>' +
        '<textarea id="act-' + i + '-' + k + '" rows="' + (sorte === 'cas' ? 4 : 8) + '" placeholder="' + (sorte === 'cas' ? 'Écrivez votre réponse, avec vos calculs s’il y en a.' : 'Répondez à chaque question numérotée, en montrant vos calculs et votre raisonnement.') + '"></textarea>' +
        '<div class="act-pied"><span class="act-compte"></span><button type="button" class="btn btn-j">' + (corrige ? 'Enregistrer ma réponse et ouvrir le corrigé' : 'Enregistrer ma réponse') + '</button></div>' +
        (corrige && !deja ? '<p class="act-note">Le corrigé commenté s’ouvre une fois votre réponse enregistrée : c’est en cherchant d’abord que l’on apprend.</p>' : '');
      noeud.appendChild(z);
      var ta = z.querySelector('textarea'), cp = z.querySelector('.act-compte'), bt = z.querySelector('button.btn');
      ta.value = texte || '';
      function compte() { var n = ta.value.trim().length; cp.textContent = n < mini ? n + ' / ' + mini + ' caractères au moins' : n + ' caractères'; }
      compte();
      ta.addEventListener('input', function () { compte(); ecrireLocal(c, ta.value); });
      bt.addEventListener('click', function () {
        var t = ta.value.trim();
        if (t.length < mini) { dire('Développez votre réponse (au moins ' + mini + ' caractères) : montrez vos calculs et votre raisonnement.'); ta.focus(); return; }
        bt.disabled = true; bt.textContent = 'Enregistrement…';
        W.SW_PONT.api('activite_rendre', { module: id, lecon: i, k: k, sorte: sorte, min: min, titre: titre, texte: t.slice(0, 6000) })
          .then(function (j) { ecrireLocal(c, t); if (j && j.eleve) W.SW_PONT.garder(j.eleve); dire('Réponse enregistrée.'); if (typeof W.afficherLecon === 'function') { var y = W.scrollY; W.afficherLecon(); W.scrollTo(0, y); } })
          .catch(function (err) { bt.disabled = false; bt.textContent = corrige ? 'Enregistrer ma réponse et ouvrir le corrigé' : 'Enregistrer ma réponse'; dire((err && err.message) || 'Réponse non enregistrée : réessayez dans un instant.'); });
      });
    }
  }

  /* --- Habille la leçon affichée --- */
  function habiller() {
    var id = mod(), zone = D.getElementById('lc-contenu'); if (!id || !zone || !eleve() || typeof etat === 'undefined' || !etat[id]) return;
    var i = etat[id].lecon, p = plan(id)[i]; if (!p || !p.cles.length) return;
    var cas = zone.querySelector('.sw-cas');
    if (cas) { /* le corrigé d'une mise en pratique suit parfois son énoncé : il attend lui aussi la réponse */
      var cc = cas.nextElementSibling; if (cc && cc.matches && cc.matches('details.sw-corrige')) cc.remove(); else cc = null;
      bloc(cas, id, i, 'c', 'cas', 0, 'Mise en pratique', cc); }
    zone.querySelectorAll('.sw-act').forEach(function (n, k) {
      var cor = n.querySelector('details.sw-corrige'); if (cor) cor.remove();
      var t = n.querySelector('.sw-act-t b'), min = Number(n.getAttribute('data-min')) || 0;
      bloc(n, id, i, String(k), n.classList.contains('sw-travail') ? 'travail' : 'exo', min, t ? t.textContent : 'Activité ' + (k + 1), cor);
    });
    var r = reste(id, i), fait = p.cles.length - r.length, b = D.createElement('div'); b.className = 'act-bandeau' + (r.length ? '' : ' fini');
    b.innerHTML = '<b>Activités de cette leçon : ' + fait + ' sur ' + p.cles.length + ' rendue' + (fait > 1 ? 's' : '') + '</b>' + (p.min ? ' · environ ' + duree(p.min) + ' de travail prévu' : '') +
      '<br><span>' + (r.length ? 'Chaque activité se fait par écrit, ici même. La leçon suivante s’ouvre quand elles sont toutes rendues.' : 'Leçon terminée : vous pouvez passer à la suite.') + '</span>';
    var h3 = zone.querySelector('h3'); if (h3) h3.parentNode.insertBefore(b, h3.nextSibling); else zone.insertBefore(b, zone.firstChild);
    var nx = D.getElementById('lc-next');
    if (nx) { var suite = nx.onclick; nx.onclick = function (ev) {
      var manque = reste(mod(), etat[mod()].lecon);
      if (manque.length) { dire('Il reste ' + manque.length + ' activité' + (manque.length > 1 ? 's' : '') + ' à rendre dans cette leçon.'); var cible = zone.querySelector('.act-zone[data-afaire]'); if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (suite) suite.call(nx, ev); }; }
  }

  function installer() {
    if (typeof W.afficherLecon !== 'function' || W.SW_ACT) return;
    var st = D.createElement('style');
    st.textContent = '.act-zone{margin:12px 0 4px;padding:12px 14px;border-radius:12px;background:#F4F6FB;border:1px solid #DDE3F0}.act-zone label{display:block;font-weight:800;margin:0 0 6px;font-size:.9rem}.act-zone textarea{width:100%;font:inherit;padding:10px;border:1px solid #CBD2E0;border-radius:10px;background:#fff;min-height:96px}' +
      '.act-pied{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:space-between;margin-top:8px}.act-compte{font-size:.82rem;font-weight:700;color:#5B6478}.act-note{font-size:.82rem!important;margin:8px 0 0!important;color:#5B6478}' +
      '.act-ok{font-weight:800;color:#15803D;margin:0 0 6px!important}.act-ma summary{cursor:pointer;font-weight:700}.act-bilan{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 0}.act-bilan span{font-weight:700;font-size:.88rem;flex:1 1 100%}' +
      '.act-bilan button{font:inherit;font-weight:700;font-size:.85rem;padding:8px 12px;border-radius:999px;border:2px solid #CBD2E0;background:#fff;cursor:pointer;min-height:40px}.act-bilan button.on{border-color:var(--bleu);background:var(--bleu);color:#fff}' +
      '.act-lien{font:inherit;font-size:.82rem;background:none;border:0;padding:0;color:var(--bleu);text-decoration:underline;cursor:pointer}.act-refaire{margin:8px 0 0!important}' +
      '.act-bandeau{margin:0 0 16px;padding:12px 14px;border-radius:12px;background:#FFF4DC;border-left:5px solid var(--jaune);font-size:.92rem}.act-bandeau.fini{background:#E3F5EA;border-left-color:#15803D}.act-bandeau span{font-size:.85rem}';
    D.head.appendChild(st);
    var lecon0 = W.afficherLecon, onglet0 = W.onglet;
    W.afficherLecon = function () {
      var id = mod();
      if (id && eleve() && typeof etat !== 'undefined' && etat[id]) { var p = premiereOuverte(id); if (p >= 0 && etat[id].lecon > p) { etat[id].lecon = p; dire('Terminez d’abord les activités de la leçon ' + (p + 1) + '.'); } }
      var r = lecon0.apply(this, arguments);
      try { habiller(); } catch (x) { if (W.console) console.error(x); }
      return r;
    };
    if (typeof onglet0 === 'function') W.onglet = function (t) {
      var id = mod();
      if ((t === 'quiz' || t === 'examen') && id && eleve()) { var p = premiereOuverte(id); if (p >= 0) { var b = bilanModule(id); dire((t === 'quiz' ? 'Le quiz' : 'L’examen blanc') + ' s’ouvre quand les activités des leçons sont rendues (' + b.faites + ' sur ' + b.total + ').'); etat[id].lecon = p; return onglet0.call(this, 'lecons'); } }
      return onglet0.apply(this, arguments);
    };
    W.SW_ACT = { plan: plan, reste: reste, terminees: terminees, finies: finies, bilan: bilanModule };
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', installer); else installer();
})();
