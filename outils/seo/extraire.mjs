// Extrait, depuis la page d'accueil du site (public/index.html), le contenu public de chaque fiche formation
// tel que le site l'affiche (titre, accroche, programme, extrait, tarif, diplôme, public, accès), et la feuille
// de style des fiches. Sortie : outils/seo/fiches.json. Utilisé par generer.mjs.
// Lancement : node outils/seo/extraire.mjs   (Playwright et Chromium doivent être installés)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright"); // Playwright installé à part (outil, pas une dépendance du site)
const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, "../..");
const nav = await chromium.launch();
const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
await page.route(/^https?:\/\//, (r) => r.abort()); // hors ligne : rien n'est appelé au-dehors
await page.goto("file://" + path.join(racine, "public/index.html"), { waitUntil: "load" });
await page.waitForFunction(() => window.SW_FICHE && typeof COURS === "object");
const donnees = await page.evaluate(async () => {
  const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const fiches = {};
  for (const id of Object.keys(COURS)) {
    window.SW_FICHE.ouvrir(id, true);
    await attendre(30);
    const z = document.getElementById("sw-fiche");
    const li = typeof ligneDe === "function" ? ligneDe(id) : {};
    const dip = window.SW_DIP_TXT ? window.SW_DIP_TXT(id) : null;
    fiches[id] = {
      id, titre: COURS[id].titre, court: (typeof COURT === "object" && COURT[id]) || COURS[id].titre,
      accroche: (typeof ACC === "object" && ACC[id]) || "", lecons: COURS[id].lecons.length, examens: (COURS[id].examens || []).length,
      prix: (typeof TARIF === "object" && TARIF[id]) || null, ligne: { n: li.n, nom: li.nom, c: li.c },
      diplome: dip ? { badge: dip.badge, titre: dip.titre, ligne: dip.ligne, voie: dip.voie, certif: dip.certif, tp: !!dip.tp, code: ((window.SW_DIPLOMES || {})[id] || {}).code || "" } : null,
      objectifs: typeof objectifs === "function" ? objectifs(id) : [],
      programme: [...z.querySelectorAll(".fi-part")].map((d) => ({ partie: d.querySelector("summary").childNodes[0].textContent.trim(), lecons: [...d.querySelectorAll("li")].map((l) => l.textContent.trim()) })),
      couleur: z.style.getPropertyValue("--c") || "",
      html: z.innerHTML,
    };
    window.SW_FICHE.fermer(true);
  }
  // feuille de style utile aux fiches (règles des fiches, icônes, variables)
  const garde = (t) => /#sw-fiche|\.fi-|\.sw-ic|:root/.test(t);
  const css = [];
  for (const f of document.styleSheets) {
    let regles; try { regles = f.cssRules; } catch { continue; }
    for (const r of regles) {
      if (r.type === CSSRule.MEDIA_RULE) { const dedans = [...r.cssRules].filter((x) => garde(x.cssText)).map((x) => x.cssText); if (dedans.length) css.push(`@media ${r.conditionText}{${dedans.join("")}}`); }
      else if (garde(r.cssText)) css.push(r.cssText);
    }
  }
  return { fiches, css: css.join("\n"), parcours: typeof PARCOURS_CAP === "object" ? PARCOURS_CAP : null, publics: typeof PUBLIC === "object" ? PUBLIC : {} };
});
await nav.close();
fs.writeFileSync(path.join(ici, "fiches.json"), JSON.stringify(donnees, null, 1));
console.log(Object.keys(donnees.fiches).length, "fiches extraites,", donnees.css.length, "caractères de style");
