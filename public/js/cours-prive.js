/* ==========================================================================
   js/cours-prive.js — demande de cours privé en visio (espace élève).

   L'élève demande une séance pour qu'un formateur lui montre un point de la
   leçon ou corrige ses erreurs : il donne le sujet, ce qu'il veut voir, et
   jusqu'à trois créneaux. La demande part au centre par la messagerie de
   l'espace élève (même envoi, même trace scellée que tout message). Le centre
   répond dans « Messages » avec le créneau retenu et le lien de la visio.
   Le bouton figure dans « Classe virtuelle » et sur les fiches visuelles.
   ========================================================================== */
(function () {
  'use strict';
  var W = window, D = document, MARQUE = 'Demande de cours privé en classe virtuelle';
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function dire(m) { if (typeof W.toast === 'function') W.toast(m); }
  function eleve() { return W.SW_PONT && W.SW_PONT.eleve && W.SW_PONT.eleve(); }
  function demandes() { var el = eleve(); return ((el && el.messages) || []).filter(function (m) { return m.de === 'eleve' && String(m.texte || '').indexOf(MARQUE) === 0; }); }
  function creneau(v) { var d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function demander(opt) {
    opt = opt || {}; if (!eleve()) { dire('Connectez-vous à votre espace élève pour demander un cours privé.'); return; }
    var bg = D.getElementById('cvp-bg'); if (bg) bg.remove();
    bg = D.createElement('div'); bg.id = 'cvp-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true'); bg.setAttribute('aria-labelledby', 'cvp-t');
    bg.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:rgba(15,20,40,.6);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';
    var mini = new Date(Date.now() + 3600000); mini.setMinutes(0, 0, 0); var iso = new Date(mini.getTime() - mini.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    var champ = 'width:100%;font:inherit;padding:10px 12px;border:2px solid #CBD2E0;border-radius:12px;margin:4px 0 12px;box-sizing:border-box';
    bg.innerHTML = '<form style="background:#fff;border-radius:20px;max-width:520px;width:100%;padding:20px;margin:auto" novalidate>' +
      '<h3 id="cvp-t" style="margin:0 0 6px">Demander un cours privé en visio</h3>' +
      '<p style="margin:0 0 14px;font-size:.92rem;color:#5C6B94">Un formateur reprend le point avec vous en visio et corrige vos erreurs. Proposez jusqu’à trois créneaux : le centre vous répond dans « Messages » avec le créneau retenu et le lien de la séance.</p>' +
      '<label for="cvp-sujet" style="font-weight:800">Sujet</label><input id="cvp-sujet" maxlength="160" required style="' + champ + '" value="' + e(opt.sujet || '') + '">' +
      '<label for="cvp-quoi" style="font-weight:800">Ce que vous voulez voir ou corriger</label><textarea id="cvp-quoi" rows="4" maxlength="800" required style="' + champ + '" placeholder="Décrivez en une phrase ou deux ce qui vous bloque et ce que vous voulez voir."></textarea>' +
      [1, 2, 3].map(function (n) { return '<label for="cvp-c' + n + '" style="font-weight:800">Créneau ' + n + (n === 1 ? '' : ' (facultatif)') + '</label><input id="cvp-c' + n + '" type="datetime-local" min="' + iso + '"' + (n === 1 ? ' required' : '') + ' style="' + champ + '">'; }).join('') +
      '<p id="cvp-err" role="alert" style="color:#B42318;font-weight:700;min-height:1.2em;margin:0 0 8px"></p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end"><button type="button" class="btn" id="cvp-non">Annuler</button><button type="submit" class="btn btn-j" id="cvp-ok">Envoyer ma demande</button></div></form>';
    D.body.appendChild(bg);
    var f = bg.querySelector('form'), err = bg.querySelector('#cvp-err'), fermer = function () { bg.remove(); };
    bg.querySelector('#cvp-non').addEventListener('click', fermer); bg.addEventListener('click', function (x) { if (x.target === bg) fermer(); });
    (opt.sujet ? bg.querySelector('#cvp-quoi') : bg.querySelector('#cvp-sujet')).focus();
    f.addEventListener('submit', function (x) {
      x.preventDefault(); var sujet = bg.querySelector('#cvp-sujet').value.trim(), quoi = bg.querySelector('#cvp-quoi').value.trim();
      var cr = [1, 2, 3].map(function (n) { return bg.querySelector('#cvp-c' + n).value; }).filter(Boolean);
      if (!sujet) { err.textContent = 'Indiquez le sujet du cours.'; return; }
      if (quoi.length < 15) { err.textContent = 'Décrivez en une phrase ou deux ce que vous voulez voir.'; return; }
      if (!cr.length) { err.textContent = 'Proposez au moins un créneau.'; return; }
      if (cr.some(function (v) { return new Date(v).getTime() < Date.now(); })) { err.textContent = 'Un créneau est déjà passé : choisissez une date à venir.'; return; }
      var texte = MARQUE + '\nSujet : ' + sujet + (opt.module ? '\nFormation : ' + opt.module : '') + '\nDemande : ' + quoi + '\nCréneaux proposés :\n' + cr.map(function (v, k) { return (k + 1) + '. ' + creneau(v); }).join('\n');
      var ok = bg.querySelector('#cvp-ok'); ok.disabled = true; ok.textContent = 'Envoi…';
      W.SW_PONT.api('message', { texte: texte.slice(0, 2000) }).then(function (j) { if (j && j.eleve) W.SW_PONT.garder(j.eleve); fermer(); dire('Demande envoyée au centre : la réponse arrivera dans « Messages ».'); rendre(); })
        .catch(function (z) { ok.disabled = false; ok.textContent = 'Envoyer ma demande'; err.textContent = (z && z.message) || 'Demande non envoyée : réessayez dans un instant.'; });
    });
  }
  function rendre() {
    var v = D.getElementById('eleve-visio'); if (!v) return;
    var z = D.getElementById('cvp-carte'); if (!z) { z = D.createElement('div'); z.id = 'cvp-carte'; z.className = 'panelw'; z.style.marginBottom = '16px'; var ref = v.querySelector('.pagesub'); if (ref && ref.nextSibling) v.insertBefore(z, ref.nextSibling); else v.appendChild(z); }
    if (!eleve()) { z.hidden = true; return; } z.hidden = false;
    var l = demandes().slice(-5).reverse();
    z.innerHTML = '<h3 style="margin:0 0 4px">Cours privé : un formateur reprend le point avec vous</h3><p class="pagesub" style="margin:0 0 10px">Une notion qui résiste, une erreur qui revient ? Demandez une séance en visio et proposez vos créneaux.</p>' +
      '<button type="button" class="btn btn-j" id="cvp-ouvrir">Demander un cours privé</button>' +
      (l.length ? '<p style="margin:12px 0 4px;font-weight:700">Vos dernières demandes</p><ul style="margin:0;padding-left:18px">' + l.map(function (m) { var s = (String(m.texte).match(/Sujet : ([^\n]+)/) || [])[1] || 'Cours privé'; return '<li>' + e(s) + ' — envoyée le ' + new Date(m.date).toLocaleDateString('fr-FR') + ' ; le centre vous répond dans « Messages »</li>'; }).join('') + '</ul>' : '');
    z.querySelector('#cvp-ouvrir').addEventListener('click', function () { demander({}); });
  }
  W.SW_CV = { demander: demander };
  function installer() {
    var vue0 = W.vue; if (typeof vue0 === 'function' && !installer.fait) { installer.fait = true; W.vue = function (app, nom) { var r = vue0.apply(this, arguments); if (app === 'eleve' && nom === 'visio') { try { rendre(); } catch (x) { /* vue absente */ } } return r; }; }
    try { rendre(); } catch (x) { /* espace élève non affiché */ }
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', installer); else installer();
})();
