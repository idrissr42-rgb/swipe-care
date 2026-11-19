/* ==========================================================================
   js/classe-virtuelle.js — classe virtuelle de l'espace élève (visio réelle).

   Le centre programme une séance dans le pilote (titre, date, durée, lien de
   visio). L'élève la voit ici et sur son tableau de bord ; « Rejoindre » ouvre
   la visio dans un nouvel onglet et enregistre l'heure d'entrée (ligne scellée
   au journal de preuves). La présence se signe ensuite par l'émargement.
   La visio elle-même se tient chez le service de visio choisi par le centre
   (Jitsi Meet par défaut) : cette page n'affiche ni caméra ni flux.
   Aucun gestionnaire en ligne : tout passe par addEventListener.
   ========================================================================== */
(function () {
  'use strict';
  var W = window, D = document, AVANT = 15 * 60000;
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function classes() { var el = W.SW_PONT && W.SW_PONT.eleve && W.SW_PONT.eleve(); return ((el && el.classes) || []).slice().sort(function (a, b) { return a.debut < b.debut ? -1 : 1; }); }
  function quand(c) { var d = new Date(c.debut); return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function duree(m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + ' h' : '') + (r ? (h ? ' ' : '') + r + (h ? '' : ' min') : ''); }
  function etat(c) { var t = Date.now(), d = new Date(c.debut).getTime(), f = d + c.dureeMin * 60000; return t > f ? 'finie' : t >= d - AVANT ? 'ouverte' : 'avenir'; }
  /* Cook parle de gestes de cuisine ; les autres écoles gardent une formulation générale. */
  var COOK = String((W.SW_PONT && W.SW_PONT.ECOLE) || W.__ECOLE__ || 'cook').toLowerCase() === 'cook';
  function dire(t) { if (typeof W.toast === 'function') W.toast(t); }

  function carte(c) { var s = etat(c);
    return '<div class="visio-card"><div class="inf"><h4>' + e(c.titre) + (s === 'finie' ? '<span class="visio-tag fini">Terminée</span>' : s === 'ouverte' ? '<span class="visio-tag avenir">Ouverte</span>' : '<span class="visio-tag avenir">À venir</span>') + '</h4>' +
      '<div class="meta">' + e(quand(c)) + ' · ' + duree(c.dureeMin) + (c.formateur ? ' · avec ' + e(c.formateur) : '') + '</div>' +
      (c.rejointLe ? '<div class="meta" style="color:var(--ok)">Vous êtes entré le ' + new Date(c.rejointLe).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + '</div>' : '') + '</div>' +
      (s === 'ouverte' ? '<button type="button" class="btn btn-j" data-cv="' + e(c.id) + '">Rejoindre la classe</button>' : s === 'avenir' ? '<span class="meta" style="font-weight:700">Le bouton s’ouvre 15 minutes avant.</span>' : '') + '</div>'; }
  function rendre() {
    var z = D.getElementById('cv-zone'); if (!z) return; var l = classes(), av = l.filter(function (c) { return etat(c) !== 'finie'; }), pa = l.filter(function (c) { return etat(c) === 'finie'; }).reverse();
    z.innerHTML = blocDemandes() + (av.length ? av.map(carte).join('') : '<div class="notice">Aucune classe virtuelle n’est programmée pour le moment. Votre formateur vous prévient ici et par e-mail dès qu’une séance est fixée.</div>') +
      (pa.length ? '<h3 style="margin:22px 0 10px;font-size:1rem">Séances passées</h3>' + pa.slice(0, 20).map(carte).join('') : '') +
      '<div class="notice" style="margin-top:16px"><b>Comment ça se passe.</b> La classe se tient en visio, dans votre navigateur ou dans l’application Jitsi Meet : autorisez le micro et la caméra quand ils sont demandés. Votre heure d’entrée est enregistrée ; vous signez ensuite votre présence dans « Émargement ». Un souci de connexion ? Écrivez dans la messagerie.</div>';
    var bo = z.querySelector('#cvp-ouvrir'); if (bo) bo.addEventListener('click', function () { demander({}); });
    z.querySelectorAll('button[data-cv]').forEach(function (b) { b.addEventListener('click', function () { rejoindre(b.getAttribute('data-cv')); }); });
    bandeau();
  }
  /* Le lien s'ouvre dans le geste de l'élève ; l'entrée est notée par le serveur en parallèle. */
  function rejoindre(id) {
    var c = classes().filter(function (x) { return x.id === id; })[0]; if (!c) return;
    W.open(c.lien, '_blank', 'noopener');
    W.SW_PONT.api('classe_rejoindre', { classeId: id }).then(function (j) { if (j && j.eleve) W.SW_PONT.garder(j.eleve); rendre(); }).catch(function (x) { dire((x && x.message) || 'Entrée non enregistrée : prévenez votre formateur.'); });
  }
  /* ------------------------------------------------------------------ cours privé en classe virtuelle
     L'élève demande une séance pour qu'un formateur lui montre un geste ou les erreurs à éviter : il donne le
     sujet et jusqu'à trois créneaux. La demande part au centre par la messagerie de l'espace élève (même envoi,
     même trace scellée que tout message). Le centre confirme en programmant la classe : elle apparaît alors ici. */
  var MARQUE = 'Demande de cours privé en classe virtuelle';
  function demandes() { var el = W.SW_PONT && W.SW_PONT.eleve && W.SW_PONT.eleve(); return ((el && el.messages) || []).filter(function (m) { return m.de === 'eleve' && String(m.texte || '').indexOf(MARQUE) === 0; }); }
  function creneau(v) { var d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function demander(opt) {
    opt = opt || {}; if (!(W.SW_PONT && W.SW_PONT.eleve && W.SW_PONT.eleve())) { dire('Connectez-vous à votre espace élève pour demander un cours privé.'); return; }
    var bg = D.getElementById('cvp-bg'); if (bg) bg.remove();
    bg = D.createElement('div'); bg.id = 'cvp-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true'); bg.setAttribute('aria-labelledby', 'cvp-t');
    bg.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:rgba(23,38,92,.6);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';
    var mini = new Date(Date.now() + 3600000); mini.setMinutes(0, 0, 0); var iso = new Date(mini.getTime() - mini.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    var champ = 'width:100%;font:inherit;padding:10px 12px;border:2px solid #CBD2E0;border-radius:12px;margin:4px 0 12px;box-sizing:border-box';
    bg.innerHTML = '<form style="background:#fff;border-radius:20px;max-width:520px;width:100%;padding:20px;margin:auto" novalidate>' +
      '<h3 id="cvp-t" style="margin:0 0 6px">Demander un cours privé en classe virtuelle</h3>' +
      '<p style="margin:0 0 14px;font-size:.92rem;color:#5C6B94">' + (COOK ? 'Un formateur vous montre le geste en visio et corrige vos erreurs.' : 'Un formateur reprend le point avec vous en visio et corrige vos erreurs.') + ' Proposez jusqu’à trois créneaux : le centre vous confirme celui qui est retenu, et la séance apparaît dans « Classe virtuelle ».</p>' +
      '<label for="cvp-sujet" style="font-weight:800">Sujet</label><input id="cvp-sujet" maxlength="160" required style="' + champ + '" value="' + e(opt.sujet || '') + '">' +
      '<label for="cvp-quoi" style="font-weight:800">Ce que vous voulez voir ou corriger</label><textarea id="cvp-quoi" rows="4" maxlength="800" required style="' + champ + '" placeholder="' + (COOK ? 'Exemple : ma crème anglaise graine à chaque fois, je voudrais voir le geste et le bon moment pour l’arrêter.' : 'Décrivez en une phrase ou deux ce qui vous bloque et ce que vous voulez voir.') + '"></textarea>' +
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
      W.SW_PONT.api('message', { texte: texte.slice(0, 2000) }).then(function (j) { if (j && j.eleve) W.SW_PONT.garder(j.eleve); fermer(); dire('Demande envoyée au centre : vous serez prévenu du créneau retenu.'); rendre(); })
        .catch(function (z) { ok.disabled = false; ok.textContent = 'Envoyer ma demande'; err.textContent = (z && z.message) || 'Demande non envoyée : réessayez dans un instant.'; });
    });
  }
  function blocDemandes() {
    var l = demandes().slice(-5).reverse();
    return '<div class="visio-card" style="display:block"><div class="inf"><h4>' + (COOK ? 'Cours privé : un formateur vous montre le geste' : 'Cours privé : un formateur reprend le point avec vous') + '</h4><div class="meta">' + (COOK ? 'Une technique qui résiste' : 'Une notion qui résiste') + ', une erreur qui revient ? Demandez une séance en visio et proposez vos créneaux.</div></div>' +
      '<p style="margin:10px 0 0"><button type="button" class="btn btn-j" id="cvp-ouvrir">Demander un cours privé</button></p>' +
      (l.length ? '<div class="meta" style="margin-top:12px;font-weight:700">Vos dernières demandes</div><ul style="margin:6px 0 0;padding-left:18px">' + l.map(function (m) { var s = (String(m.texte).match(/Sujet : ([^\n]+)/) || [])[1] || 'Cours privé'; return '<li class="meta">' + e(s) + ' — envoyée le ' + new Date(m.date).toLocaleDateString('fr-FR') + ' ; le centre vous répond dans « Messages »</li>'; }).join('') + '</ul>' : '') + '</div>';
  }
  /* Sur le tableau de bord : la prochaine classe, tant qu'elle n'est pas finie. */
  function bandeau() {
    var dash = D.getElementById('eleve-dash'); if (!dash) return; var b = D.getElementById('cv-bandeau'), c = classes().filter(function (x) { return etat(x) !== 'finie'; })[0];
    if (!c) { if (b) b.remove(); return; }
    if (!b) { b = D.createElement('div'); b.id = 'cv-bandeau'; b.className = 'visio-card'; b.style.border = '2px solid var(--jaune)'; var t = dash.querySelector('.pagesub') || dash.firstElementChild; t.parentNode.insertBefore(b, t.nextSibling); }
    b.innerHTML = '<div class="inf"><h4>Prochaine classe virtuelle : ' + e(c.titre) + '</h4><div class="meta">' + e(quand(c)) + ' · ' + duree(c.dureeMin) + '</div></div><button type="button" class="btn ' + (etat(c) === 'ouverte' ? 'btn-j' : 'btn-b') + '" id="cv-voir"' + (etat(c) === 'ouverte' ? '' : ' style="box-shadow:0 0 0 2px var(--bleu) inset"') + '>' + (etat(c) === 'ouverte' ? 'Rejoindre la classe' : 'Voir la séance') + '</button>';
    b.querySelector('#cv-voir').addEventListener('click', function () { if (etat(c) === 'ouverte') rejoindre(c.id); else if (typeof W.vue === 'function') W.vue('eleve', 'visio'); });
  }
  W.SW_CV = { demander: demander };
  function installer() {
    var v = D.getElementById('eleve-visio'); if (!v || D.getElementById('cv-zone')) return;
    v.innerHTML = '<h2 class="pagetitle">Classe virtuelle</h2><p class="pagesub">Retrouvez votre formateur en direct, en visio : explications, démonstrations et réponses à vos questions.</p><div id="cv-zone"></div>';
    var vue0 = W.vue; if (typeof vue0 === 'function') W.vue = function (app, nom) { var r = vue0.apply(this, arguments); if (app === 'eleve' && (nom === 'visio' || nom === 'dash')) rendre(); return r; };
    rendre(); setInterval(function () { var a = D.getElementById('app-eleve'); if (a && a.offsetParent !== null) rendre(); }, 30000);
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', installer); else installer();
})();
