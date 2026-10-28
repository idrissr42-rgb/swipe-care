# Référencement du site de Care

À relancer après toute modification du catalogue ou des contenus :

    python3 outils/contenus/integrer.py   # contenus des formations → public/js/
    node outils/seo/extraire.mjs          # lit les fiches telles que le site les affiche (Playwright) → fiches.json
    node outils/seo/generer.mjs           # écrit les pages et tout ce que Google lit

Ce que produit `generer.mjs` (relançable sans risque) :

- `public/formations/<formation>.html` : une page par formation (programme, extrait, questions fréquentes,
  données structurées Course, fil d'Ariane) ; `public/formations/index.html` : toutes les formations, par ligne ;
- `public/metiers/<métier>.html` et `public/metiers/index.html`, à partir de `metiers.json` ;
- page d'accueil : titre, description, catalogue dans les données structurées, plan des formations dans le pied
  de page ;
- `public/js/cours-resume.js` (par `resume.mjs`) : le résumé léger des cours chargé par les visiteurs ;
- `sitemap.xml`, `robots.txt`, `404.html`.

Règles tenues : textes vrais, formations non certifiantes, aucune promesse de financement public, jamais
« Swipe and … », pas de page par ville. Le générateur s'arrête si un titre dépasse 60 caractères ou une
description 160.

L'image de partage (`public/partage/care.png`, 1200 × 630) est faite par `outils/seo/partage.cjs`.
