# Logos du groupe

`ecoles.json` est le registre des centres : clé, nom, couleur, chemins des logos. Les sites et les mails s'en servent.

Fichiers par centre : `logo-<clé>.svg|png` (couleur), `logo-<clé>-blanc.svg|png` (sur fond coloré), `icone-<clé>.svg` et `icone-<clé>-192|512.png` (favicon, application).

Ajouter un centre : ajouter une ligne dans `outils/generer-logos-web.py` (clé, nom, couleur), relancer
`python3 outils/generer-logos-web.py <dossier>`, copier le dossier dans `public/logos/` du pilote et du site du centre,
puis ajouter ses couleurs et jeux de mots dans `ECOLES_MAIL` (`lib/mails-modeles.mjs`).
