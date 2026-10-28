// Résumé léger des cours pour les visiteurs du site : public/js/cours-resume.js.
// Il contient tout ce que les pages publiques affichent (titres, objectifs, référentiel et sources, extrait de la
// première leçon, nombre de leçons, de quiz, d'examens, de cartes et de livrets), sans le contenu réservé aux élèves
// (leçons, questions et réponses des quiz et des examens, cartes de révision, pages des livrets).
// Les tableaux gardent leur longueur : les compteurs affichés restent exacts.
// Le contenu complet (public/js/contenus-cours.js et public/js/livrets.js) n'est chargé que pour l'élève
// (voir le chargeur « Contenus des cours » dans public/index.html).
// Lancé par generer.mjs ; seul : node outils/seo/resume.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ici = path.dirname(fileURLToPath(import.meta.url));

function lireGlobal(fichier, nom) {
  const bac = { window: {} };
  vm.runInNewContext(fs.readFileSync(fichier, "utf8"), bac, { filename: fichier });
  if (!bac.window[nom] || typeof bac.window[nom] !== "object") throw new Error(`${nom} introuvable dans ${fichier}`);
  return bac.window[nom];
}
const vide = (q) => ({ q: "", o: (q.o || []).map(() => ""), b: 0, e: "" });

export function ecrireResume(PUB = path.resolve(ici, "../../public")) {
  const E = lireGlobal(path.join(PUB, "js/contenus-cours.js"), "SW_ENRICHI");
  const L = lireGlobal(path.join(PUB, "js/livrets-complets.js"), "SW_LIVRETS_DATA");
  const connus = new Set(["titre", "sous", "duree", "heures", "ref", "lecons", "vocab", "quiz", "examens"]);
  const R = {};
  for (const [id, m] of Object.entries(E)) {
    const autres = Object.keys(m).filter((k) => !connus.has(k));
    if (autres.length) throw new Error(`champ inconnu dans le cours ${id} : ${autres.join(", ")} (à classer dans resume.mjs)`);
    R[id] = {
      titre: m.titre, sous: m.sous, duree: m.duree, heures: m.heures, ref: m.ref,
      lecons: (m.lecons || []).map((l, i) => ({ t: l.t, h: i === 0 ? l.h : "", o: l.o })),
      vocab: (m.vocab || []).map(() => ["", ""]),
      quiz: (m.quiz || []).map(vide),
      examens: (m.examens || []).map((x) => ({ titre: x.titre, duree: x.duree, seuil: x.seuil, questions: (x.questions || []).map(vide) })),
    };
  }
  const RL = Object.fromEntries(Object.entries(L).map(([f, d]) => [f, { titre: d.titre, sousTitre: "", type: d.type, pages: [] }]));
  const js = "/* SW_RESUME : version légère des cours pour les visiteurs (générée par outils/seo/resume.mjs, ne pas modifier à la main).\n" +
    "   Le contenu complet (js/contenus-cours.js, js/livrets.js) n'est chargé que pour l'élève. */\n" +
    "window.SW_ENRICHI=" + JSON.stringify(R) + ";\n" +
    "window.SW_LIVRETS_DATA=" + JSON.stringify(RL) + ";\n";
  fs.writeFileSync(path.join(PUB, "js/cours-resume.js"), js);
  return { cours: Object.keys(R).length, livrets: Object.keys(RL).length, octets: Buffer.byteLength(js) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = ecrireResume();
  console.log(`js/cours-resume.js : ${r.cours} cours, ${r.livrets} livrets, ${Math.round(r.octets / 1024)} Ko`);
}
