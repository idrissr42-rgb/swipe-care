// Référencement du site de Care : génère et met à jour tout ce que Google lit.
//   - une page HTML par formation (public/formations/<formation>.html), à partir des fiches du site ;
//   - la page de toutes les formations (public/formations/index.html), rangées par ligne ;
//   - les pages métier (public/metiers/<métier>.html et l'index), à partir de metiers.json ;
//   - la page d'accueil : titre, description, données structurées, plan des formations dans le pied de page ;
//   - le résumé léger des cours pour les visiteurs (resume.mjs) ;
//   - le plan du site (sitemap.xml), robots.txt, la page 404.
// Lancement, après une modification du catalogue ou des contenus :
//   python3 outils/contenus/integrer.py && node outils/seo/extraire.mjs && node outils/seo/generer.mjs
// Règles : texte vrai et utile ; formations courtes non certifiantes (attestation de fin de formation) ; aucune promesse
// de financement public ; jamais « Swipe and … » ; pas de page par ville.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ecrireResume } from "./resume.mjs";

const ici = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(ici, "../../public");
const SITE = "https://care.swipelearn.school";
const ORG = SITE + "/#ecole";
const IMAGE = SITE + "/partage/care.png";
const AUJ = new Date().toISOString().slice(0, 10);
const lire = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const ecrire = (f, s) => { fs.mkdirSync(path.dirname(path.join(PUB, f)), { recursive: true }); fs.writeFileSync(path.join(PUB, f), s); };
const E = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const texte = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const slug = (id) => id.replace(/_/g, "-");
const urlF = (id) => `${SITE}/formations/${slug(id)}.html`;
const prix = (n) => Number(n).toLocaleString("fr-FR").replace(/\u202f/g, " ") + " €";
function couper(s, max) { if (s.length <= max) return s; const c = s.slice(0, max - 1); return c.slice(0, c.lastIndexOf(" ")).replace(/[,;:\s]+$/, "") + "…"; }
const assert = (ok, m) => { if (!ok) throw new Error(m); };

/* ------------------------------------------------------------------ données */
const D = JSON.parse(fs.readFileSync(path.join(ici, "fiches.json"), "utf8"));
const METIERS = JSON.parse(fs.readFileSync(path.join(ici, "metiers.json"), "utf8"));
const CAT = JSON.parse(fs.readFileSync(path.join(ici, "../modele/catalogue.json"), "utf8"));
const ICS = JSON.parse(fs.readFileSync(path.join(ici, "../modele/icones_care.json"), "utf8"));
const fDips = path.join(ici, "../modele/diplomes.json");
const DIPS = fs.existsSync(fDips) ? JSON.parse(fs.readFileSync(fDips, "utf8")) : {};
const accueil = lire("index.html");
const TARIF = JSON.parse(accueil.match(/var TARIF=(\{[^}]*\})/)[1]);
const srcEnrichi = fs.readFileSync(path.join(PUB, "js/contenus-cours.js"), "utf8");
const i0 = srcEnrichi.indexOf("window.SW_ENRICHI=") + 18;
const ENRICHI = JSON.parse(srcEnrichi.slice(i0, srcEnrichi.indexOf("};", i0) + 1));
const COURT = Object.fromEntries(CAT.formations.map((f) => [f.id, f.court]));
const IDS = CAT.formations.map((f) => f.id).filter((id) => D.fiches[id]);
assert(IDS.length === Object.keys(D.fiches).length, "fiches.json et le catalogue ne correspondent pas : relancez extraire.mjs");
const ic = (n) => (ICS[n] ? `<svg class="sw-ic" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${ICS[n]}</svg>` : "");
const LIGNE_DE = {}; for (const l of CAT.lignes) for (const id of l.ids) LIGNE_DE[id] = l;
const METIER_DE = {}; for (const m of METIERS) for (const id of m.ids) METIER_DE[id] ??= m;

/* ------------------------------------------------------------------ gabarit des pages statiques */
const CSS_PAGE_BASE = `<style>.fi-pile{list-style:none;margin:0 0 14px;padding:0;border:1px solid rgba(0,0,0,.1);border-radius:16px;overflow:hidden}.fi-pile li{display:grid;grid-template-columns:30px 1fr;gap:0 10px;padding:12px 14px;border-top:1px solid rgba(0,0,0,.08)}.fi-pile li:first-child{border-top:0}.fi-pile li::before{content:"";grid-row:span 2;width:20px;height:20px;border-radius:50%;background:var(--jaune);margin-top:2px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 12.5l4 4 8-9' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-size:14px;background-position:center;background-repeat:no-repeat}.fi-pile b{display:block;font-size:15px}.fi-pile span{display:block;font-size:14px;opacity:.8}.fi-risque{border-left:3px solid var(--jaune);padding:8px 12px;margin:0 0 14px;font-size:15px}.fi-risque b{display:block}.fi-appel{margin:0}.fi-appel .btn{display:inline-block;min-height:46px;line-height:1.2;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:800}:root{--bleu:#17413A;--bleu-fonce:#0F2F29;--fond:#EEF4F0;--jaune:#6CC3A2;--rouille:#B5573F;--encre:#132E29;--gris:#56685F;--blanc:#fff}
*{box-sizing:border-box}body{margin:0;font-family:Nunito,system-ui,sans-serif;color:var(--encre);background:#F5F9F6;line-height:1.55}
a{color:var(--bleu)}header{background:#2B7A63}header .lt small{color:#D6F0E6!important}header .btn-j{background:var(--encre);color:#fff}header nav.m a{color:#fff}.w{max-width:1040px;margin:0 auto;padding:0 16px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0}.lg{display:flex;align-items:center;gap:10px;text-decoration:none;color:#fff;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:20px}.lg img{width:38px;height:38px;border-radius:9px}.lt{display:flex;flex-direction:column;line-height:1.05;letter-spacing:.02em}.lt small{font-family:Nunito,sans-serif;font-size:11px;font-weight:800;color:var(--jaune);letter-spacing:.08em;text-transform:uppercase;margin-top:3px}
nav.m{display:flex;gap:6px;flex-wrap:wrap;padding:0 16px 12px}nav.m a{font-size:13px;text-decoration:none;padding:6px 11px;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;font-weight:700}nav.m a.on{background:var(--jaune);color:var(--encre)}
@media(max-width:600px){.top .btn{padding:9px 13px;font-size:13px;min-height:0}.lg{font-size:16px}.lg img{width:34px;height:34px}.lt small{font-size:10px}nav.m{flex-wrap:nowrap;overflow-x:auto}nav.m a{flex:0 0 auto}}
.hero{background:var(--bleu);color:#fff;padding:36px 0 34px}.hero small{display:inline-block;background:rgba(255,255,255,.12);padding:4px 10px;border-radius:999px;font-weight:700}
.hero h1{font-family:'Baloo 2',sans-serif;font-size:clamp(28px,5vw,44px);line-height:1.1;margin:12px 0 10px}.hero p{max-width:720px;font-size:17px;margin:0 0 18px;opacity:.95}
.btn{display:inline-block;padding:12px 18px;border-radius:999px;font-weight:800;text-decoration:none;margin:0 8px 8px 0;min-height:46px}.btn-j{background:var(--jaune);color:var(--encre)}.btn-b{background:#fff;color:var(--bleu)}
main{padding:28px 0 10px}h2{font-family:'Baloo 2',sans-serif;font-size:26px;line-height:1.2;margin:6px 0 14px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}.c{background:#fff;border-radius:16px;padding:16px;display:flex;flex-direction:column}
.c h3{font-family:'Baloo 2',sans-serif;font-size:19px;line-height:1.2;margin:0 0 6px}.c p{margin:0 0 10px;color:var(--gris);font-size:14.5px}.c .t{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.tag{font-size:12px;font-weight:800;padding:3px 8px;border-radius:999px;background:var(--fond);color:var(--bleu)}.tag.p{background:#E3F5EC;color:#1C6B45}.tag.d{background:#F6E1DA;color:#8E3F2C}
.c a.v{margin-top:auto;font-weight:800;text-decoration:none}.mi{background:#fff;border-radius:16px;padding:16px 18px;margin:0 0 18px}.mi ul{margin:0;padding-left:20px}.mi li{margin:4px 0}
.dip{background:#F6E1DA;border-radius:16px;padding:14px 18px;margin:18px 0;font-size:15px}
.cta{background:var(--rouille);color:#fff;border-radius:18px;padding:22px;margin:26px 0}.cta h2{margin:0 0 6px}
footer{color:var(--gris);font-size:13.5px;padding:24px 16px 40px;max-width:1040px;margin:0 auto}footer a{color:var(--bleu)}
.sw-ic{width:1.15em;height:1.15em;display:inline-block;vertical-align:-.2em;flex:none}</style>`;
const HEADER = (actif) => `<header><div class="w top"><a class="lg" href="/"><img src="/logos/icone-care-192.png" alt=""><span class="lt">Swipe Learn School<small>Care · aide à la personne</small></span></a><a class="btn btn-j" style="margin:0" href="/#trouver-ma-formation">Trouver ma formation</a></div><nav class="m w">${METIERS.map((m) => `<a href="/metiers/${m.s}.html"${m.s === actif ? ' class="on"' : ""}>${ic(m.icone)} ${E(m.nom)}</a>`).join("")}<a href="/formations/"${actif === "formations" ? ' class="on"' : ""}>Toutes les formations</a></nav></header>`;
const FOOTER = `<footer>Swipe Learn School · Care, l’école de l’aide à la personne et de la petite enfance — SWIPE LEARN SCHOOL, organisme de formation · 40 rue de la Badouillère, 42000 Saint-Étienne · <a href="mailto:contact@swipeandlearn.school">contact@swipeandlearn.school</a><br>Formations courtes non certifiantes, 100 % en ligne, partout en France. <a href="/">Accueil de Care</a> · <a href="https://swipelearn.school/">Les écoles Swipe Learn School</a></footer></body></html>`;
// la fiche du site, ses boutons changés en liens : mêmes styles (règles simples et règles des @media)
const versLiens = (regles) => regles.replace(/([^{}]+)\{([^{}]*)\}/g, (r, sel, corps) => (/button/.test(sel) ? r + sel.replace(/button/g, "a") + "{text-decoration:none;display:inline-block;text-align:center;" + corps + "}" : r));
const CSS_FICHE = D.css.split("\n").filter((l) => !/^\.tf-|^\.bm-ico|^\.tf-ov/.test(l)).map((l) => {
  if (l.startsWith("@media")) { const i = l.indexOf("{"); return l.slice(0, i + 1) + versLiens(l.slice(i + 1, -1)) + "}"; }
  return versLiens(l);
}).join("\n");
const CSS_FIL = `<style>.fa{max-width:1040px;margin:0 auto;padding:10px 16px 0;font-size:13.5px;color:#56685F}.fa a{color:#17413A}</style>`;
const CSS_FORMATION = `<style>${CSS_FICHE}
#sw-fiche{display:block;position:static;inset:auto;z-index:auto;overflow:visible}
.fi-corr a{display:flex}.fi-mob a{text-align:center}
.fi-faq details{border-top:1px solid #E0EBE5;padding:10px 0}.fi-faq summary{font-weight:800;cursor:pointer}.fi-faq p{margin:8px 0 0}
</style>`;

function tete({ titre, description, url, ld, extra = "" }) {
  assert(titre.length <= 60, `Titre trop long (${titre.length}) : ${titre}`);
  assert(description.length <= 160, `Description trop longue (${description.length}) : ${description}`);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${E(titre)}</title><meta name="description" content="${E(description)}"><link rel="canonical" href="${url}"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:site_name" content="Swipe Learn School · Care"><meta property="og:locale" content="fr_FR"><meta property="og:title" content="${E(titre)}"><meta property="og:description" content="${E(description)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website"><meta property="og:image" content="${IMAGE}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico"><link rel="icon" type="image/svg+xml" href="/logos/icone-care.svg"><link rel="apple-touch-icon" href="/icones/apple-touch-icon.png"><meta name="theme-color" content="#2B7A63">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet">${CSS_PAGE_BASE}${CSS_FIL}${extra}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script></head><body>`;
}
const GROUPE = { "@type": "EducationalOrganization", "@id": "https://swipelearn.school/#organisation", name: "Swipe Learn School", url: "https://swipelearn.school/" };
const organisation = { "@type": "EducationalOrganization", "@id": ORG, name: "Swipe Learn School", alternateName: "Swipe Learn School · Care", url: SITE + "/", email: "contact@swipeandlearn.school", logo: SITE + "/icones/icone-512.png",
  address: { "@type": "PostalAddress", streetAddress: "40 rue de la Badouillère", postalCode: "42000", addressLocality: "Saint-Étienne", addressRegion: "Auvergne-Rhône-Alpes", addressCountry: "FR" },
  areaServed: { "@type": "Country", name: "France" }, parentOrganization: GROUPE };
const fil = (items) => ({ "@type": "BreadcrumbList", itemListElement: items.map(([n, u], k) => ({ "@type": "ListItem", position: k + 1, name: n, item: u })) });
const filVisible = (items) => `<nav class="fa" aria-label="Fil d’Ariane">${items.map(([n, u], k) => (k < items.length - 1 ? `<a href="${u.replace(SITE, "") || "/"}">${E(n)}</a>` : `<span aria-current="page">${E(n)}</span>`)).join(" › ")}</nav>`;
const heuresDe = (id) => Number((ENRICHI[id] || {}).heures) || 0;
const accroche = (id) => texte((D.fiches[id].html.match(/<p class="ac">([\s\S]*?)<\/p>/) || [, ""])[1]);

/* ------------------------------------------------------------------ pages formation */
function titreFormation(id) {
  const c = COURT[id] || D.fiches[id].titre, mot = D.fiches[id].diplome ? "préparation" : "formation";
  for (const t of [`${c} : ${mot} en ligne · Care`, `${c} en ligne · Care`, `${c} · Care`]) if (t.length <= 60) return t;
  return couper(c, 53) + " · Care";
}

/* bloc « offre » de chaque page de formation : ce que l'élève obtient, le risque renversé, l'appel ; rien d'inventé, tout vient des données */
function blocOffre(id) {
  const f = D.fiches[id], nl = Number(f.lecons) || 0, nx = Number(f.examens) || 0, dip = f.diplome;
  const lignes = [
    [`${nl || "Des"} leçons approfondies, avec leurs sources`, "La méthode pas à pas, des exemples, des tableaux et des check-lists, le piège à éviter, et une mise en pratique."],
    ...(dip ? [] : [["Un exercice corrigé dans chaque leçon", "Un cas à analyser ou un document à produire, puis le corrigé commenté, avec les erreurs fréquentes."],
      ["Un projet final noté sur 20", "Un projet réaliste sur votre situation de travail, avec sa grille d’évaluation ; vous pouvez l’envoyer à l’école pour un retour."]]),
    [`Un quiz et ${nx === 2 ? "deux examens blancs" : nx ? nx + " examens blancs" : "des examens blancs"}`, "Avec la correction expliquée, pour savoir où vous en êtes avant de passer à la suite."],
    ["Deux livrets à garder", "Le cours complet et une fiche mémo, à relire avant une intervention."],
    ["Des repères officiels, datés", "Recommandations de la HAS, de Santé publique France et de l’INRS, textes de loi : chaque repère renvoie à sa source, avec sa date."],
    ["Une école joignable", "Une messagerie avec l’école dans votre espace élève, et une attestation de fin de formation."],
    ...(dip ? [["La préparation à l’examen", DIPS[id] && DIPS[id].nature ? `${E(dip.titre)} : les compétences, le dossier professionnel, la mise en situation. Le titre est délivré par le ministère du Travail après une session de validation dans un centre agréé ; nous y préparons, nous ne le délivrons pas.` : `${E(dip.titre)} : les épreuves, le dossier, l’inscription en candidat libre. Le diplôme est délivré par l’État ; nous y préparons, nous ne le délivrons pas.`]] : []),
  ];
  return `<div class="fi-c fi-offre"><h2>Ce que vous obtenez</h2><ul class="fi-pile">${lignes.map(([b, t]) => `<li><b>${E(b)}</b><span>${E(t)}</span></li>`).join("")}</ul>`
    + `<p class="fi-risque"><b>Et si ça ne vous convient pas&nbsp;?</b> Vous ne vous inscrivez qu’après un échange avec l’école, avec le programme et la durée par écrit, au prix affiché. Pas de vente forcée.</p>`
    + `<p class="fi-appel"><a class="btn btn-j" href="/#inscrire-${id}">${TARIF[id] ? `M’inscrire · ${prix(TARIF[id])}` : "Demander le programme et le tarif"}</a></p></div>`;
}

function pageFormation(id) {
  const f = D.fiches[id], url = urlF(id), h = heuresDe(id) || null, p = TARIF[id], m = METIER_DE[id], dip = f.diplome;
  const acc = accroche(id), suffixe = p ? ` ${prix(p)} par stagiaire, en ligne.` : " 100 % en ligne, à votre rythme.";
  const description = couper(acc, 160 - suffixe.length) + suffixe;
  const chemin = [["Accueil", SITE + "/"], ...(m ? [[m.nom, `${SITE}/metiers/${m.s}.html`]] : [["Toutes les formations", SITE + "/formations/"]]), [f.titre, url]];
  let corps = f.html
    .replace(/<div class="fi-bar">[\s\S]*?<\/div>(?=<div class="fi-hero">)/, "")
    .replace(/<div class="fi-c fi-prix">[\s\S]*?<\/button><\/div>/, "")
    .replace(/<button([^>]*?)data-act="inscrire"([^>]*)>([\s\S]*?)<\/button>/g, `<a$1href="/#inscrire-${id}"$2>$3</a>`)
    .replace(/<button([^>]*?)data-act="prog"([^>]*)>([\s\S]*?)<\/button>/g, `<a$1href="#fi-prog"$2>$3</a>`)
    .replace(/<button data-act="voir" data-id="(\w+)">([\s\S]*?)<\/button>/g, (_, x, t) => `<a href="/formations/${slug(x)}.html">${t}</a>`)
    .replace(/<details class="fi-part"(?! open)/g, '<details class="fi-part" open');
  assert(!/<button/.test(corps), "bouton restant dans " + id);
  const faq = [
    [`Combien coûte la formation ${COURT[id] || f.titre} ?`, p ? `${prix(p)} par stagiaire : accès à la plateforme, leçons, quiz, examens blancs et suivi par l’école. Entreprises : devis sur demande.` : "Le tarif vous est donné sur demande, avec le programme et les conditions générales de vente. Entreprises : devis sur demande."],
    ...(h ? [["Combien de temps dure-t-elle ?", `Environ ${h} heures, à votre rythme : les leçons se suivent en ligne, sur ordinateur, tablette ou téléphone.`]] : []),
    ["Peut-on la suivre depuis n’importe où ?", "Oui. La formation est 100 % en ligne : vous la suivez partout en France, à votre rythme, avec une messagerie pour poser vos questions à l’école."],
    ...(dip ? [DIPS[id] && DIPS[id].nature ? [`Le titre est-il délivré par Care ?`, `Non. ${dip.titre.replace(/^Prépare (le |la |l’|au )?/, "Le ")} est délivré par le ${dip.certif} après une session de validation, passée dans un centre agréé par les services de l’État (ou par la validation des acquis de l’expérience) ; Swipe Learn School · Care vous y prépare, mais n’organise pas la session.`] : [`Le diplôme est-il délivré par Care ?`, `Non. ${dip.titre.replace(/^Prépare (le |la |l’|au )?/, "Le ")} est délivré par le ${dip.certif} après réussite à l’examen, que vous passez en candidat libre ; Swipe Learn School · Care vous y prépare. L’inscription à l’examen se fait auprès des services d’examen de votre académie.`],
      ["Peut-elle être financée par le CPF, l’alternance ou France Travail ?", "Pas pour l’instant : l’école n’est pas encore certifiée Qualiopi, condition de ces financements, et elle n’est pas un centre de formation d’apprentis. Elle peut être payée par vous-même ou par votre employeur."]]
      : [["Cette formation donne-t-elle un diplôme ?", "Non. C’est une formation courte non certifiante : elle donne lieu à une attestation de fin de formation, pas à un diplôme ni à un titre."],
      ["Peut-elle être financée par le CPF ou France Travail ?", "Non. Le CPF finance principalement des formations certifiantes, et l’école n’est pas encore certifiée Qualiopi, condition des financements publics. Elle peut être payée par vous-même ou par votre employeur."]]),
    ["Comment s’inscrire ?", "Remplissez la demande d’inscription en ligne : l’école vous répond sous 15 jours et vous ouvre l’accès à la plateforme dès la validation de votre inscription."],
  ];
  const questions = `<div class="fi-c fi-faq"><h2>Questions fréquentes</h2>${faq.map(([q, r]) => `<details><summary>${E(q.replace(/ \?$/, "\u00a0?"))}</summary><p>${E(r)}</p></details>`).join("")}</div>`;
  corps = corps.replace(/(<div class="fi-c"><h2>Comment ça se passe<\/h2>[\s\S]*?<\/div><\/div><\/div>)/, `$1${questions}`);
  assert(corps.includes("Questions fréquentes"), "FAQ non placée dans " + id);
  corps = corps.replace(/(<div class="fi-c"><h2>Un extrait de la première leçon)/, blocOffre(id) + "$1");
  assert(corps.includes("fi-offre"), "bloc offre non placé dans " + id);
  const course = { "@type": "Course", "@id": url + "#formation", name: f.titre, description: acc, url, inLanguage: "fr-FR", provider: { "@id": ORG },
    educationalCredentialAwarded: "Attestation de fin de formation",
    ...(dip ? { teaches: dip.titre.replace(/^Prépare (le |la |l’|au )?/, "Préparation : ") } : {}),
    ...(p ? { offers: { "@type": "Offer", price: p, priceCurrency: "EUR", category: "Paid", url, availability: "https://schema.org/InStock" } } : {}),
    hasCourseInstance: [{ "@type": "CourseInstance", courseMode: "online", inLanguage: "fr-FR", ...(h ? { courseWorkload: `PT${h}H` } : {}) }],
    ...(h ? { timeRequired: `PT${h}H` } : {}) };
  const ld = { "@context": "https://schema.org", "@graph": [course, organisation, fil(chemin)] };
  return tete({ titre: titreFormation(id), description, url, ld, extra: CSS_FORMATION }) + HEADER("") + filVisible(chemin) + `<div id="sw-fiche" class="on" style="--c:${f.couleur || "#17413A"}">${corps}</div>` + FOOTER;
}
fs.rmSync(path.join(PUB, "formations"), { recursive: true, force: true });
for (const id of IDS) ecrire(`formations/${slug(id)}.html`, pageFormation(id));

/* ------------------------------------------------------------------ cartes de formation (pages statiques) */
const carte = (id) => { const f = D.fiches[id], h = heuresDe(id), d = f.diplome; return `<div class="c"><div class="t">${d && DIPS[id] ? `<span class="tag d">Prépare au ${E(DIPS[id].court.replace(/^Titre/, "titre"))} · niveau ${E(DIPS[id].niveau)}</span>` : ""}<span class="tag">${f.lecons} leçons</span>${h ? `<span class="tag">${h} h</span>` : ""}${TARIF[id] ? `<span class="tag p">${prix(TARIF[id])}</span>` : ""}</div><h3>${E(f.titre)}</h3><p>${E(accroche(id))}</p><a class="v" href="/formations/${slug(id)}.html">Voir la formation →</a></div>`; };

/* ------------------------------------------------------------------ toutes les formations */
{
  const url = SITE + "/formations/";
  const ld = { "@context": "https://schema.org", "@graph": [organisation, fil([["Accueil", SITE + "/"], ["Toutes les formations", url]]), { "@type": "ItemList", name: "Formations de Care", numberOfItems: IDS.length, itemListElement: IDS.map((id, k) => ({ "@type": "ListItem", position: k + 1, url: urlF(id), name: D.fiches[id].titre })) }] };
  const page = tete({ titre: "Formations aide à la personne et petite enfance · Care", description: `Les ${IDS.length} formations de Care : petite enfance, aide à domicile, grand âge, handicap, CAP AEPE, titres ADVF et ASMS. 100 % en ligne.`, url, ld })
    + HEADER("formations") + filVisible([["Accueil", SITE + "/"], ["Toutes les formations", url]])
    + `<section class="hero"><div class="w"><small>Swipe Learn School · Care</small><h1>Toutes les formations de Care</h1><p>${IDS.length} formations pour accompagner mieux, du jeune enfant à la personne âgée, à domicile et en établissement. Elles se suivent 100 % en ligne, à votre rythme ; les formations courtes donnent lieu à une attestation de fin de formation.</p><a class="btn btn-j" href="/#trouver-ma-formation">Trouver ma formation</a></div></section><main class="w">`
    + CAT.lignes.map((l) => `<h2>Ligne ${l.n} — ${E(l.nom)}</h2><div class="g">${l.ids.filter((id) => D.fiches[id]).map(carte).join("")}</div>`).join("")
    + `<div class="cta"><h2>Quelle formation pour vous ?</h2><p style="margin:0 0 12px">Quatre questions, une minute : nous vous indiquons la formation qui correspond à votre métier et à votre objectif.</p><a class="btn btn-j" href="/#trouver-ma-formation">Commencer</a></div></main>` + FOOTER;
  ecrire("formations/index.html", page);
}

/* ------------------------------------------------------------------ pages métier */
fs.rmSync(path.join(PUB, "metiers"), { recursive: true, force: true });
for (const m of METIERS) {
  const url = `${SITE}/metiers/${m.s}.html`, ids = m.ids.filter((id) => D.fiches[id]);
  const ld = { "@context": "https://schema.org", "@graph": [organisation, fil([["Accueil", SITE + "/"], [m.nom, url]]), { "@type": "ItemList", name: "Formations " + m.nom, itemListElement: ids.map((id, k) => ({ "@type": "ListItem", position: k + 1, url: urlF(id), name: D.fiches[id].titre })) }] };
  const page = tete({ titre: m.titre, description: m.description, url, ld }) + HEADER(m.s) + filVisible([["Accueil", SITE + "/"], [m.nom, url]])
    + `<section class="hero"><div class="w"><small>Métier</small><h1>${ic(m.icone)} ${E(m.nom)}</h1><p>${E(m.intro)}</p><a class="btn btn-j" href="/#trouver-ma-formation">Trouver ma formation</a><a class="btn btn-b" href="/#inscription">Demander à être rappelé</a></div></section><main class="w">`
    + `<div class="mi"><h2>Le métier au quotidien</h2><ul>${m.missions.map((x) => `<li>${E(x)}</li>`).join("")}</ul></div>`
    + `<h2>Les formations pour ce métier</h2><div class="g">${ids.map(carte).join("")}</div>`
    + (m.diplomes ? `<div class="dip"><b>Vers un diplôme ?</b> ${E(m.diplomes)}</div>` : "")
    + `<div class="cta"><h2>Une question sur votre projet ?</h2><p style="margin:0 0 12px">Demandez à être rappelé : nous vous aidons à choisir la formation utile pour votre métier.</p><a class="btn btn-j" href="/#inscription">Être rappelé</a></div></main>` + FOOTER;
  ecrire(`metiers/${m.s}.html`, page);
}
{
  const url = SITE + "/metiers/";
  const ld = { "@context": "https://schema.org", "@graph": [organisation, fil([["Accueil", SITE + "/"], ["Formations par métier", url]]), { "@type": "ItemList", itemListElement: METIERS.map((m, k) => ({ "@type": "ListItem", position: k + 1, url: `${SITE}/metiers/${m.s}.html`, name: m.nom })) }] };
  const page = tete({ titre: "Formations aide à la personne par métier · Care", description: "Assistante maternelle, auxiliaire de vie, aide à domicile, agent en EHPAD, proche aidant : les formations de Care par métier, 100 % en ligne.", url, ld })
    + HEADER("") + filVisible([["Accueil", SITE + "/"], ["Formations par métier", url]])
    + `<section class="hero"><div class="w"><small>Swipe Learn School · Care</small><h1>Les formations par métier</h1><p>Choisissez votre métier : nous vous montrons les formations utiles pour progresser.</p></div></section><main class="w"><div class="g">`
    + METIERS.map((m) => `<div class="c"><h3>${ic(m.icone)} ${E(m.nom)}</h3><p>${E(m.intro)}</p><a class="v" href="/metiers/${m.s}.html">Voir les formations →</a></div>`).join("")
    + `</div></main>` + FOOTER;
  ecrire("metiers/index.html", page);
}

/* ------------------------------------------------------------------ page d'accueil */
{
  let h = accueil;
  const titre = CAT.accueil.titre, d = CAT.accueil.description;
  assert(d.length <= 160 && titre.length <= 60, "accueil : titre ou description trop longs");
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${E(titre)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${E(d)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${E(titre)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${E(d)}">`);
  h = h.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (_, j) => {
    const ld = JSON.parse(j);
    for (const x of ld["@graph"]) if (x["@id"] === ORG) {
      x.areaServed = organisation.areaServed;
      x.parentOrganization = GROUPE;
      x.hasOfferCatalog = { "@type": "OfferCatalog", name: "Formations de Care", itemListElement: IDS.map((id) => ({ "@type": "Offer", ...(TARIF[id] ? { price: TARIF[id], priceCurrency: "EUR" } : {}), itemOffered: { "@type": "Course", name: D.fiches[id].titre, url: urlF(id) } })) };
    }
    return `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  });
  const plan = `<!--seo-plan--><div class="wrap sw-plan" style="display:block;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.15);font-size:.86rem;line-height:1.7;color:#D3E6DD"><h4 style="margin:0 0 6px">Toutes nos formations, 100 % en ligne</h4>${METIERS.map((m) => `<p style="margin:0 0 6px"><a href="/metiers/${m.s}.html" style="color:#fff;font-weight:700">${E(m.nom)}</a> : ${m.ids.filter((id) => D.fiches[id]).map((id) => `<a href="/formations/${slug(id)}.html" style="color:#D3E6DD">${E(COURT[id] || D.fiches[id].titre)}</a>`).join(" · ")}</p>`).join("")}<p style="margin:0"><a href="/formations/" style="color:#fff;font-weight:700">Toutes les formations</a> · <a href="/metiers/" style="color:#fff;font-weight:700">Les formations par métier</a></p></div><!--/seo-plan-->`;
  assert(h.includes("<!--seo-plan-->"), "repère du plan des formations absent de la page d’accueil");
  h = h.replace(/<!--seo-plan-->[\s\S]*?<!--\/seo-plan-->/, plan);
  assert(h.includes("js/cours-resume.js") && !h.includes('<script src="js/contenus-cours.js"></script>'), "chargeur des contenus des cours absent de la page d'accueil");
  ecrire("index.html", h);
  const r = ecrireResume(PUB);
  console.log(`résumé des cours pour les visiteurs : ${r.cours} cours, ${r.livrets} livrets, ${Math.round(r.octets / 1024)} Ko`);
}

/* ------------------------------------------------------------------ plan du site, robots.txt, 404 */
{
  const urls = [[SITE + "/", "1.0"], [SITE + "/formations/", "0.9"], [SITE + "/metiers/", "0.8"], ...METIERS.map((m) => [`${SITE}/metiers/${m.s}.html`, "0.8"]), ...IDS.map((id) => [urlF(id), "0.7"])];
  ecrire("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, p]) => `<url><loc>${u}</loc><lastmod>${AUJ}</lastmod><priority>${p}</priority></url>`).join("\n")}\n</urlset>\n`);
  ecrire("robots.txt", `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
  ecrire("404.html", `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page introuvable · Care</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.ico">${CSS_PAGE_BASE}</head><body>${HEADER("")}<section class="hero"><div class="w"><small>Erreur 404</small><h1>Cette page n’existe pas ou plus</h1><p>Elle a peut-être été déplacée. Retrouvez toutes les formations de Care, ou trouvez la vôtre en une minute.</p><a class="btn btn-j" href="/formations/">Toutes les formations</a><a class="btn btn-b" href="/">Accueil de Sell</a></div></section>${FOOTER}`);
  console.log(`${IDS.length} pages formation, ${METIERS.length} pages métier, ${urls.length} adresses dans le plan du site`);
}
