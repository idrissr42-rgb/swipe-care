# Care — l'école de l'aide à la personne et de la petite enfance de Swipe Learn School

Site : https://care.swipelearn.school (Netlify, publié depuis ce dépôt). Formations courtes non certifiantes,
100 % en ligne. Même moteur que Cook : espace élève, pont vers le pilote (`netlify/functions/pont.mjs`),
fiches formation, plan des lignes, « Trouver ma formation », application installable.

## Variables à poser dans Netlify (Configuration du projet → Variables d'environnement)

- `PONT_CLE` : la clé partagée avec le pilote (secrète, 32 caractères au moins). Le pilote la connaît sous
  `PONT_CLE_CARE`, avec `PONT_URL_CARE=https://care.swipelearn.school`.
- Facultatif, pour l'accusé de réception des demandes d'inscription : `BREVO_API_KEY`, `EMAIL_EXPEDITEUR`,
  `EMAIL_EXPEDITEUR_NOM`, `EMAIL_REPONSE`, `EMAIL_CENTRE`, `EMAIL_DELAI_REPONSE`.

Après toute modification d'une variable : relancer une mise en ligne (« Trigger deploy »).

## Mettre à jour le site

1. Les formations sont écrites à part (un module Python par formation, voir `outils/contenus/integrer.py`).
   `python3 outils/contenus/integrer.py` écrit `public/js/contenus-cours.js` et `public/js/livrets.js`.
2. `node outils/seo/extraire.mjs && node outils/seo/generer.mjs` refait les fiches lues par Google, les pages
   métier, le plan du site et le résumé léger des cours pour les visiteurs (Playwright nécessaire).
3. La page d'accueil vient du modèle Cook : `python3 outils/modele/depuis_cook.py <index de Cook> public/index.html`
   reprend les améliorations du moteur de Cook en remplaçant tout ce qui lui est propre (le script s'arrête si le
   modèle a changé à un endroit qu'il remplace). Le catalogue, les lignes, les couleurs et l'orientation sont
   dans `outils/modele/`.

Une mise en ligne coûte des crédits Netlify : regrouper les modifications, une mise en ligne par séance.

## Règles

Textes vrais ; formations non certifiantes (attestation de fin de formation) ; aucun financement public annoncé
(CPF, OPCO, France Travail) ; jamais « Swipe and … » ; pas de faux témoignage, de faux chiffre ni de faux
formateur ; pas de page par ville.
