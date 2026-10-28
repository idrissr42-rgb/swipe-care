import { getStore } from "@netlify/blobs";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

// LE PONT — relie les sites des écoles (élèves) et le pilote (votre base).
// Une seule adresse : /api/pont  ·  toutes les demandes sont des POST en JSON { action, ... }.
// Trois niveaux d'accès :
//   public  : inscription, centre
//   élève   : avec son code d'accès personnel (champ "code")
//   pilote  : avec la clé d'administration (champ "cle" = variable d'environnement PONT_CLE)
//
// Version 2 (09/10/2026, docs/agents/dev-suivi-eleves.md) :
// - fiche élève relue puis réécrite avec contrôle d'ETag (onlyIfMatch), 5 essais ;
//   « progression » ne touche que progression, temps et révisions ;
// - temps mesuré par le serveur (le champ « minutes » du navigateur est ignoré),
//   journal des connexions (200 dernières sessions) : preuve FOAD ;
// - catalogue écrit par le pilote seulement (catalogue_maj) ;
// - l'action « eleve » ne marque plus les messages lus (messages_lus_centre) ;
// - travaux à rendre, émargements demandés avec un identifiant (idempotent),
//   résumé enrichi pour les rappels, préférences de l'élève ;
// - clé comparée à temps constant, origines limitées (ORIGINES_AUTORISEES),
//   10 échecs de code ou de clé par IP en 15 minutes au plus.
// Relecture de sécurité de l'étape 2 (docs/relecture-securite-etape2.md) :
// - PONT_CLE de 32 caractères au moins, sinon aucun accès pilote (503) ;
// - « emargement_valider {refuser} » n'efface la signature que d'un émargement
//   signé et pas encore validé : une preuve validée ne se défait que par
//   « supprimer », que le pilote réserve à la direction.

export const config = { path: "/api/pont" };

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/** Variable d'environnement : Netlify.env.get() en ligne, process.env en repli. */
function env(nom) {
  let v;
  try {
    v = globalThis.Netlify?.env?.get?.(nom);
  } catch {
    v = undefined;
  }
  if (v === undefined || v === null || v === "") v = process.env[nom];
  return v === undefined || v === null || v === "" ? undefined : String(v);
}

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O ni 1/I
const alea = (n) => Array.from(randomBytes(n), (b) => ALPHA[b % ALPHA.length]).join("");
const txt = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const maintenant = () => new Date().toISOString();
/** Empreinte SHA-256 (hexadécimal) du document tel qu'il est montré à l'élève : titre + contenu. */
const empreinteDoc = (titre, html) => createHash("sha256").update(String(titre) + "\n" + String(html)).digest("hex");
const MENTION_SIGNATURE = "Je reconnais avoir lu ce document en entier et je le signe électroniquement. Je sais que ma signature, la date et l'heure, mon adresse IP et l'empreinte du document sont conservées comme preuve.";
const estObjet = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const arrondi = (n) => Math.round(n * 100) / 100;

// Jour civil à Paris (AAAA-MM-JJ) : échéances, connexions du jour, jours sans connexion.
const FORMAT_JOUR = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
export const jourParis = (d = new Date()) => FORMAT_JOUR.format(d);
const RE_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const jourValide = (j) => typeof j === "string" && RE_JOUR.test(j) && !Number.isNaN(Date.parse(j + "T00:00:00Z")) && new Date(j + "T00:00:00Z").toISOString().slice(0, 10) === j;
/** Nombre de jours de a à b (chaînes AAAA-MM-JJ). */
const ecartJours = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

const empreinte = (s) => createHash("sha256").update(String(s)).digest();
/** Comparaison à temps constant (empreintes de même longueur), sans troncature. */
const egal = (a, b) => timingSafeEqual(empreinte(a), empreinte(b));

const DEMARCHES = [
  ["dossier", "Dossier administratif complet"],
  ["positionnement", "Positionnement réalisé"],
  ["convention", "Convention ou contrat signé"],
  ["financement", "Financement accordé"],
  ["reglement", "Règlement intérieur remis"],
  ["livret", "Livret d'accueil remis"],
  ["programme", "Programme de formation remis"],
  ["cgv", "Conditions générales de vente remises"],
];
const REMISES_CENTRE = ["livret", "programme", "cgv"];
const TYPES_TRAVAIL = ["quiz", "examen", "lecons", "situation"];
const DEMIS = ["matin", "apres-midi"];
const RE_ID_LIBRE = /^[A-Za-z0-9_-]{1,100}$/; // id d'émargement fourni (m-<session>-<AAAAMMJJ>-<demi>)
const RE_ID_TRAVAIL = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_ESSAIS = 5;
const CLE_MIN = 32; // longueur minimale de PONT_CLE
const TENTATIVES = { max: 10, fenetreMs: 15 * 60_000 };
const PRESENCE = { pauseMaxMs: 5 * 60_000, plafondMs: 2 * 60_000, sessionsGardees: 200 };

const CATALOGUE_DEFAUT = {"cook": [{"id": "organisation", "titre": "Organisation de la production de cuisine (CAP Cuisine, pôle 1)"}, {"id": "legumes", "titre": "Légumes, fruits, taillages et cuissons (CAP Cuisine, pôle 2)"}, {"id": "potages", "titre": "Fonds, liaisons, potages et sauces (CAP Cuisine, pôle 2)"}, {"id": "poissons", "titre": "Poissons, coquillages et crustacés (CAP Cuisine, pôle 2)"}, {"id": "pates", "titre": "Pâtes de base, céréales, crèmes et desserts de restaurant (CAP Cuisine, pôle 2)"}, {"id": "patisseries", "titre": "Pâtisserie de restaurant — les bases du dessert"}, {"id": "traiteur", "titre": "Traiteur & food-truck : créer son activité"}, {"id": "vegetale", "titre": "Cuisine végétale & végétarienne"}, {"id": "bienetre", "titre": "Cuisine bien-être, santé & diététique"}, {"id": "restaurant", "titre": "Créer & gérer son restaurant"}, {"id": "exploitation", "titre": "Permis d’exploitation (débit de boissons) — préparation"}, {"id": "patisserie_boutique", "titre": "Pâtisserie de boutique & entremets"}, {"id": "cap_cuisine", "titre": "CAP Cuisine — préparation candidat libre"}, {"id": "barista", "titre": "Barista & café de spécialité"}, {"id": "boulangerie", "titre": "Boulangerie : les fondamentaux"}, {"id": "patisserie_maison", "titre": "Pâtisserie maison"}, {"id": "haccp_hygiene", "titre": "Hygiène alimentaire & méthode HACCP"}, {"id": "cuisine_monde", "titre": "Cuisine du monde"}, {"id": "accueil_service", "titre": "Accueil et service en salle : les fondamentaux"}, {"id": "allergenes", "titre": "Allergènes : informer et protéger le client"}, {"id": "antigaspi", "titre": "Cuisine anti-gaspi et restauration durable"}, {"id": "bar_cocktails", "titre": "Bar et cocktails : techniques et responsabilité"}, {"id": "basse_temperature", "titre": "Cuisson basse température et sous vide en sécurité"}, {"id": "chocolaterie", "titre": "Chocolaterie : tempérage, bonbons et moulages"}, {"id": "creperie", "titre": "Crêpier : galettes de sarrasin et crêpes de froment"}, {"id": "cuisine_collective", "titre": "Cuisiner en restauration collective"}, {"id": "gestion_couts", "titre": "Maîtriser ses coûts et sa marge en restauration"}, {"id": "management", "titre": "Manager une équipe en cuisine et en salle"}, {"id": "numerique_resto", "titre": "Numérique et intelligence artificielle pour restaurateurs"}, {"id": "pieces_cocktail", "titre": "Pièces cocktail, buffets et plateaux-repas"}, {"id": "pizzaiolo", "titre": "Pizzaïolo : pâte, cuisson et gestion d’un poste pizza"}, {"id": "plan_maitrise_sanitaire", "titre": "Écrire et faire vivre son plan de maîtrise sanitaire"}, {"id": "snacking", "titre": "Snacking, sandwichs et street-food"}, {"id": "traiteur_mention", "titre": "Métier de traiteur : fabrication et prestations"}, {"id": "vente_emporter", "titre": "Vente à emporter, livraison et click & collect"}, {"id": "viandes", "titre": "Viandes, volailles et abats (CAP Cuisine, pôle 2)"}, {"id": "viennoiserie", "titre": "Viennoiserie : pâtes levées et levées feuilletées"}, {"id": "cap_cshcr", "titre": "CAP Commercialisation et services en HCR — préparation candidat libre"}, {"id": "cs_accueil", "titre": "CS Accueil-réception — préparation"}, {"id": "cs_sommellerie", "titre": "CS Sommellerie — préparation"}, {"id": "cap_patissier", "titre": "CAP Pâtissier — préparation candidat libre"}, {"id": "cap_psr", "titre": "CAP Production et service en restauration — préparation"}, {"id": "cs_bar", "titre": "CS Métiers du bar — préparation"}, {"id": "cap_boulanger", "titre": "CAP Boulanger — préparation"}, {"id": "cs_receptions", "titre": "CS Organisateur de réceptions — préparation"}, {"id": "bp_cuisine", "titre": "BP Arts de la cuisine — préparation"}, {"id": "bp_service", "titre": "BP Arts du service et commercialisation — préparation"}, {"id": "tp_receptionniste", "titre": "TP Réceptionniste en hôtellerie et plein air — préparation"}, {"id": "tp_gouvernant", "titre": "TP Gouvernant en hôtellerie — préparation"}, {"id": "tp_etage", "titre": "TP Employé d’étage hôtellerie et plein air — préparation"}], "sell": [{"id": "vente", "titre": "Vendre en magasin : accueil, conseil et conclusion"}, {"id": "merchandising", "titre": "Merchandising et mise en valeur de l’offre"}, {"id": "relation", "titre": "Relation client : satisfaction, réclamations et fidélisation"}, {"id": "prospection_b2b", "titre": "Prospection commerciale B2B"}, {"id": "closing", "titre": "Mener un entretien de vente et conclure"}, {"id": "negociation_com", "titre": "Négociation commerciale"}, {"id": "vente_telephone", "titre": "Vendre à distance : téléphone et visio"}, {"id": "gestion_commerciale", "titre": "Calculs commerciaux, devis et facturation"}, {"id": "ecommerce", "titre": "Créer et piloter une boutique en ligne"}, {"id": "amazon", "titre": "Vendre sur les marketplaces"}, {"id": "tiktok", "titre": "Social commerce et live shopping"}, {"id": "marketing_digital", "titre": "Marketing digital et tunnel de vente"}, {"id": "copywriting", "titre": "Écrire pour vendre : pages produit, e-mails et réseaux"}, {"id": "ia_vente", "titre": "L’IA générative pour vendre"}, {"id": "ia_ecommerce", "titre": "L’IA pour e-commerçants"}, {"id": "management_vente", "titre": "Manager une équipe de vente"}, {"id": "tableaux_bord", "titre": "Piloter ses ventes : indicateurs et tableaux de bord"}, {"id": "international", "titre": "Vendre à l’international : export et e-commerce transfrontalier"}, {"id": "creer_commerce", "titre": "Créer son commerce ou son activité de vente"}, {"id": "offre_irresistible", "titre": "Construire une offre irrésistible"}, {"id": "service_client_digital", "titre": "Service client digital : chat, messageries et réseaux sociaux"}, {"id": "photo_video", "titre": "Photo et vidéo produit au smartphone"}, {"id": "cap_epc", "titre": "CAP Équipier polyvalent du commerce — préparation candidat libre"}, {"id": "bac_mcv", "titre": "Bac pro Métiers du commerce et de la vente, préparation candidat libre"}, {"id": "bts_mco", "titre": "BTS Management commercial opérationnel — préparation candidat libre"}, {"id": "bts_ndrc", "titre": "BTS Négociation et digitalisation de la relation client — préparation"}], "care": [{"id": "accompagnement", "titre": "Accompagner la personne au quotidien"}, {"id": "soins", "titre": "Soins d'hygiène et gestes professionnels"}, {"id": "repas", "titre": "Repas, nutrition et entretien du domicile"}, {"id": "communication", "titre": "Communication et situations difficiles"}, {"id": "petite_enfance", "titre": "Accompagner le jeune enfant"}, {"id": "montessori_age", "titre": "Montessori pour personnes âgées & Alzheimer"}, {"id": "alzheimer", "titre": "Assistant de vie & maladie d'Alzheimer"}, {"id": "handicap_domicile", "titre": "Accompagner le handicap à domicile"}, {"id": "montessori_enfant", "titre": "Pédagogie Montessori 0-6 ans"}, {"id": "aidants", "titre": "Soutenir les proches aidants"}, {"id": "advf", "titre": "ADVF — Assistant De Vie aux Familles (Titre Pro)"}, {"id": "baby_sitting", "titre": "Garde d'enfants & baby-sitting qualifiant"}, {"id": "eveil_enfant", "titre": "Éveil & développement du jeune enfant (0-6 ans)"}, {"id": "psc1", "titre": "PSC1 — Prévention et Secours Civiques niveau 1 (théorie)"}, {"id": "bienetre_stress", "titre": "Bien-être & gestion du stress"}, {"id": "nutrition_equilibre", "titre": "Nutrition & équilibre alimentaire"}, {"id": "sophrologie_decouverte", "titre": "Sophrologie — découverte & pratique"}, {"id": "communication_bienveillante", "titre": "Communication bienveillante & CNV"}], "code": [{"id": "web", "titre": "Créer un site sans coder (no-code)"}, {"id": "prog", "titre": "Programmation : JavaScript & logique"}, {"id": "donnees", "titre": "Bases de données & échanges d'API"}, {"id": "securite", "titre": "Sécurité & bonnes pratiques"}, {"id": "ia", "titre": "Tout savoir sur l'IA"}, {"id": "dataexcel", "titre": "Data & Excel avancé"}, {"id": "wordpress", "titre": "WordPress & sites vitrines"}, {"id": "dev_web_fullstack", "titre": "Développeur web fullstack"}, {"id": "cybersecurite", "titre": "Cybersécurité : les fondamentaux"}, {"id": "ia_prompt", "titre": "IA générative & prompt engineering"}, {"id": "nocode_automatis", "titre": "No-code & automatisation"}, {"id": "python_debutant", "titre": "Python pour débutants"}, {"id": "uxui_design", "titre": "UX/UI design — découverte"}, {"id": "certif_tosa_centre", "titre": "Certification numérique TOSA (en centre)"}], "build": [{"id": "chantier", "titre": "Lire un plan & préparer le chantier"}, {"id": "gestes", "titre": "Gestes techniques : électricité & plomberie"}, {"id": "normes", "titre": "Normes & sécurité sur le chantier"}, {"id": "renov", "titre": "Rénovation énergétique"}, {"id": "peinture", "titre": "Peinture & revêtements : le geste du peintre"}, {"id": "ia_batiment", "titre": "IA & numérique du bâtiment"}, {"id": "dpe", "titre": "Diagnostic de Performance Énergétique (DPE)"}, {"id": "audit_energetique", "titre": "Audit énergétique réglementaire"}, {"id": "renov_conseil", "titre": "Conseiller rénovation (France Rénov')"}, {"id": "diagnostics", "titre": "Diagnostics immobiliers obligatoires"}, {"id": "rge_aides", "titre": "Attestation RGE & aides à la rénovation (CEE)"}, {"id": "cap_electricien", "titre": "CAP Électricien — préparation candidat libre"}, {"id": "home_staging", "titre": "Home staging & décoration d'intérieur"}, {"id": "negociateur_immo", "titre": "Négociateur immobilier"}, {"id": "plaquiste", "titre": "Plaquiste — cloisons & doublages (théorie)"}, {"id": "lecture_plans", "titre": "Dessin technique & lecture de plans"}, {"id": "re2020_durable", "titre": "RE2020 & construction durable"}, {"id": "bim_decouverte", "titre": "BIM — découverte de la maquette numérique"}, {"id": "securite_chantier", "titre": "Sécurité & prévention sur chantier"}], "drive": [{"id": "reglementation", "titre": "Code & réglementation transport"}, {"id": "conduite", "titre": "Conduite professionnelle & manœuvres"}, {"id": "logistique", "titre": "Logistique d'entrepôt & CACES"}, {"id": "client", "titre": "Livraison, relation client & sécurité"}, {"id": "capacite_march", "titre": "Capacité de transport léger — marchandises (RS 5854)"}, {"id": "capacite_voy", "titre": "Capacité de transport léger — voyageurs (RS 5855)"}, {"id": "vtc", "titre": "Chauffeur VTC (examen théorique)"}, {"id": "gestion_transport", "titre": "Gestionnaire des opérations de transport (RNCP 40990)"}, {"id": "supply", "titre": "Supply chain & gestion logistique"}, {"id": "caces_chariots", "titre": "CACES chariots élévateurs (R489) — préparation"}, {"id": "eco_conduite", "titre": "Éco-conduite : consommer moins, rouler mieux"}, {"id": "adr_theorie", "titre": "ADR — transport de matières dangereuses (théorie)"}, {"id": "prevention_transport", "titre": "Sécurité & prévention des risques routiers pro"}, {"id": "rse_transport", "titre": "Réglementation sociale du transport"}, {"id": "optimisation_tournees", "titre": "Optimisation de tournées & livraison"}, {"id": "gestion_flotte", "titre": "Gestion de flotte de véhicules"}, {"id": "relation_livraison", "titre": "Relation client & qualité de livraison"}], "manage": [{"id": "secretariat", "titre": "Secrétariat & communication professionnelle"}, {"id": "compta", "titre": "Comptabilité : les fondamentaux"}, {"id": "paie", "titre": "Paie & administration du personnel"}, {"id": "bureautique", "titre": "Bureautique & IA de bureau"}, {"id": "gestion_paie", "titre": "Gestionnaire de paie (RNCP 37948)"}, {"id": "secretaire_compta", "titre": "Secrétaire comptable (RNCP 37123)"}, {"id": "comptable_assistant", "titre": "Comptable assistant"}, {"id": "assistant_rh", "titre": "Assistant ressources humaines"}, {"id": "secretaire_medical", "titre": "Secrétaire médical(e)"}, {"id": "bureautique_pro", "titre": "Bureautique complète : Word, Excel, PowerPoint"}, {"id": "community_manager", "titre": "Community manager & réseaux sociaux"}, {"id": "anglais_pro", "titre": "Anglais professionnel"}, {"id": "assistant_juridique", "titre": "Assistant juridique"}, {"id": "gestion_temps", "titre": "Gestion du temps & productivité"}, {"id": "management_equipe", "titre": "Management d'équipe"}, {"id": "compta_non_comptables", "titre": "Comptabilité pour non-comptables"}, {"id": "prise_parole", "titre": "Prise de parole en public"}, {"id": "bilan_competences", "titre": "Bilan de compétences (certifiant RS6684)"}]};

// ---------------------------------------------------------------------------
// Stockage : lectures de masse et écritures sûres
// ---------------------------------------------------------------------------

async function tous(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const out = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return out.filter(Boolean);
}

class Conflit extends Error {}

/**
 * Relit le blob `cle`, applique `modif(objet)` puis réécrit avec onlyIfMatch.
 * Si quelqu'un a écrit entre-temps, on recommence sur la version fraîche
 * (5 essais au plus). `modif` peut renvoyer :
 *   { erreur: [message, statut] }  → on s'arrête sans écrire ;
 *   { sansEcriture: true, ... }    → rien à écrire (idempotence) ;
 *   tout autre objet               → fusionné dans le résultat.
 * Renvoie { objet, ...résultat } ou null si le blob n'existe pas.
 */
async function modifierBlob(store, cle, modif) {
  for (let essai = 0; essai < MAX_ESSAIS; essai++) {
    const lu = await store.getWithMetadata(cle, { type: "json" });
    if (!lu || !estObjet(lu.data)) return null;
    const objet = lu.data;
    const res = (await modif(objet)) || {};
    if (res.erreur || res.sansEcriture) return { objet, ...res };
    const ecrit = await store.setJSON(cle, objet, { onlyIfMatch: lu.etag });
    if (ecrit && ecrit.modified) return { objet, ...res };
    await pause(15 * (essai + 1) + Math.floor(Math.random() * 20));
  }
  throw new Conflit();
}

// ---------------------------------------------------------------------------
// Limite de tentatives (code élève et clé) : blob tentatives/<ip>
// ---------------------------------------------------------------------------

const cleIp = (ip) => "tentatives/" + (String(ip || "").replace(/[^0-9A-Za-z:.]/g, "").slice(0, 64) || "inconnue");

async function estBloque(store, ip) {
  const t = await store.get(cleIp(ip), { type: "json" });
  return !!t && Number(t.echecs) >= TENTATIVES.max && Date.now() - Date.parse(t.premiere) < TENTATIVES.fenetreMs;
}

async function noterEchec(store, ip) {
  const cle = cleIp(ip);
  for (let essai = 0; essai < MAX_ESSAIS; essai++) {
    const lu = await store.getWithMetadata(cle, { type: "json" });
    const neuf = { echecs: 1, premiere: maintenant() };
    if (!lu) {
      const ecrit = await store.setJSON(cle, neuf, { onlyIfNew: true });
      if (ecrit && ecrit.modified) return;
    } else {
      const t = lu.data || {};
      const expire = !(Date.now() - Date.parse(t.premiere) < TENTATIVES.fenetreMs);
      const suite = expire ? neuf : { echecs: (Number(t.echecs) || 0) + 1, premiere: t.premiere };
      const ecrit = await store.setJSON(cle, suite, { onlyIfMatch: lu.etag });
      if (ecrit && ecrit.modified) return;
    }
    await pause(10 * (essai + 1));
  }
  // compteur disputé : on n'insiste pas (la demande reste refusée)
}

// ---------------------------------------------------------------------------
// Fiche élève : vues, temps mesuré, travaux
// ---------------------------------------------------------------------------

function vueTravail(t) {
  const v = { id: t.id, type: t.type, module: t.module, titre: t.titre, echeance: t.echeance, creeLe: t.creeLe };
  if (t.ref) v.ref = t.ref;
  if (t.consigne) v.consigne = t.consigne;
  if (t.faitLe) v.faitLe = t.faitLe;
  return v;
}

// Ce que l'élève a le droit de voir de sa propre fiche
function vueEleve(e) {
  return {
    id: e.id, prenom: e.prenom, nom: e.nom, ecole: e.ecole, formations: e.formations || [], formationLibelle: e.formationLibelle || "",
    demarches: DEMARCHES.map(([k, l]) => ({ cle: k, libelle: l, valide: !!(e.demarches || {})[k] })),
    progression: e.progression || {}, tempsMin: e.tempsMin || 0,
    emargements: (e.emargements || []).filter((x) => x.statut !== "propose").map(({ signature, ...r }) => r),
    messages: e.messages || [],
    documents: (e.documents || []).map((d) => ({ id: d.id, titre: d.titre, date: d.date, ...(d.aSigner ? { aSigner: true } : {}), ...(d.signeLe ? { signeLe: d.signeLe, empreinte: d.empreinte } : {}) })),
    prochaine: e.prochaine || "",
    travaux: (e.travaux || []).filter(estObjet).map(vueTravail),
    preferences: { rappelsFacultatifs: (e.preferences || {}).rappelsFacultatifs !== false },
    defi: vueDefi(e.defi),
  };
}

const travailCourt = (t) => ({ id: t.id, type: t.type, module: t.module, titre: t.titre, echeance: t.echeance });

/** Date (ISO) de la dernière activité connue de l'élève. */
function derniereActivite(e) {
  const j = Array.isArray(e.journalConnexions) ? e.journalConnexions : [];
  const fin = j.length ? j[j.length - 1].fin : "";
  return [fin, e.vuLe].filter(Boolean).sort().pop() || "";
}

function resume(e) {
  const mods = Object.values(e.progression || {}).filter(estObjet);
  const pct = mods.length ? Math.round(mods.reduce((a, m) => a + (m.pct || 0), 0) / mods.length) : 0;
  const notes = mods.filter((m) => m.quiz != null && m.quizSur).map((m) => (m.quiz / m.quizSur) * 20);
  const em = e.emargements || [];
  const auj = jourParis();
  const travaux = (e.travaux || []).filter(estObjet);
  const aRendre = travaux.filter((t) => !t.faitLe && jourValide(t.echeance));
  const attentes = em.filter((x) => x.statut === "attente").map((x) => (jourValide(x.date) ? x.date : String(x.creeLe || "").slice(0, 10))).filter(Boolean).sort();
  const vu = derniereActivite(e);
  const reference = vu || e.creeLe || "";
  return {
    id: e.id, prenom: e.prenom, nom: e.nom, email: e.email, ecole: e.ecole, formationLibelle: e.formationLibelle || "", actif: e.actif !== false,
    pct, moyenne: notes.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10 : null,
    tempsMin: e.tempsMin || 0, vuLe: e.vuLe || "",
    emargAttente: em.filter((x) => x.statut === "attente").length, emargAValider: em.filter((x) => x.statut === "signe").length,
    lecProposees: em.filter((x) => x.statut === "propose").length,
    lecProposeesDepuis: em.filter((x) => x.statut === "propose").map((x) => x.date).filter(jourValide).sort()[0] || null,
    demarchesOk: DEMARCHES.filter(([k]) => (e.demarches || {})[k]).length, demarchesTotal: DEMARCHES.length,
    nonLus: (e.messages || []).filter((m) => m.de === "eleve" && !m.lu).length,
    // v2 : suivi et rappels
    travaux: travaux.map((t) => ({ ...travailCourt(t), ...(t.ref ? { ref: t.ref } : {}), ...(t.faitLe ? { faitLe: t.faitLe } : {}) })),
    travauxEnRetard: aRendre.filter((t) => t.echeance < auj).map(travailCourt),
    travauxBientot: aRendre.filter((t) => t.echeance >= auj && ecartJours(auj, t.echeance) <= 2).map(travailCourt),
    emargAttenteDepuis: attentes[0] || null,
    derniereConnexion: vu || null,
    joursSansConnexion: reference ? Math.max(0, ecartJours(jourParis(new Date(reference)), auj)) : null,
    // documents que le centre remet lui-même (livret, programme, CGV) : jamais réclamés à l'élève
    demarchesManquantes: DEMARCHES.filter(([k]) => !REMISES_CENTRE.includes(k) && !(e.demarches || {})[k]).map(([k]) => k),
    rappelsRefuses: (e.preferences || {}).rappelsFacultatifs === false,
    debutFormation: jourValide((e.dossier || {}).debut) ? e.dossier.debut : null,
    finFormation: jourValide((e.dossier || {}).fin) ? e.dossier.fin : null,
  };
}

/**
 * Signal de présence (connexion, sync, progression) : le serveur ajoute
 * min(écart depuis le dernier signal, 2 min) si l'écart est inférieur à
 * 5 min ; sinon une nouvelle session commence. Deux onglets ouverts ne
 * comptent donc pas double, et un navigateur ne peut rien déclarer.
 */
function signalPresence(e, t, ctx = null, actif = true, module = "", lignes = null) {
  // onglet ouvert sans geste de l'élève depuis 2 minutes : rien n'est compté (temps actif réel)
  if (actif === false) return;
  const journal = (Array.isArray(e.journalConnexions) ? e.journalConnexions : []).filter((s) => estObjet(s) && s.fin);
  const der = journal[journal.length - 1];
  const fin = der ? Date.parse(der.fin) : NaN;
  const ecart = t - fin;
  const iso = new Date(t).toISOString();
  if (der && Number.isFinite(fin) && ecart < PRESENCE.pauseMaxMs) {
    const ajout = Math.max(0, Math.min(ecart, PRESENCE.plafondMs)) / 60_000;
    if (ajout > 0) {
      e.tempsMin = arrondi((Number(e.tempsMin) || 0) + ajout);
      if (!estObjet(e.connexions)) e.connexions = {};
      const k = jourParis(new Date(t));
      e.connexions[k] = arrondi((Number(e.connexions[k]) || 0) + ajout);
      der.actifMin = arrondi((Number(der.actifMin) || 0) + ajout);
      const mod = txt(module, 60);
      if (mod) { if (!estObjet(e.tempsModules)) e.tempsModules = {}; e.tempsModules[mod] = arrondi((Number(e.tempsModules[mod]) || 0) + ajout); }
    }
    if (ecart > 0) der.fin = iso; // un essai rejoué en retard ne recule jamais la fin
    if (ctx && ctx.app) { der.apps = Array.isArray(der.apps) ? der.apps : (der.app ? [der.app] : []); if (!der.apps.includes(ctx.app)) der.apps = [...der.apps, ctx.app].slice(0, 6); }
  } else {
    const s = { debut: iso, fin: iso };
    if (ctx) Object.assign(s, { app: ctx.app, apps: ctx.app ? [ctx.app] : [], ip: ctx.ip, os: ctx.os, nav: ctx.nav, pays: ctx.pays });
    journal.push(s);
    if (lignes && ctx) lignes.push(sceller(e, "session", { os: ctx.os, nav: ctx.nav, ecran: ctx.ecran, pays: ctx.pays }, ctx, t));
  }
  e.journalConnexions = journal.slice(-TRACE.sessionsGardees);
}

/** Un travail est-il fait, d'après la progression ? (« situation » : marquée par l'équipe) */
function travailFait(t, progression) {
  const p = estObjet(progression) ? progression[t.module] : null;
  if (!estObjet(p)) return false;
  if (t.type === "quiz") return p.quiz != null && Number.isFinite(Number(p.quiz));
  if (t.type === "examen") {
    const ex = estObjet(p.examens) ? p.examens : {};
    return t.ref ? ex[t.ref] != null && ex[t.ref] !== "" : Object.keys(ex).length > 0;
  }
  if (t.type === "lecons") {
    if ((Number(p.pct) || 0) >= 100) return true;
    const n = Number(p.lecons) || 0;
    return n > 0 && new Set(Array.isArray(p.vues) ? p.vues : []).size >= n;
  }
  return false;
}

function majTravaux(e) {
  for (const t of e.travaux || []) if (estObjet(t) && !t.faitLe && travailFait(t, e.progression)) t.faitLe = maintenant();
}

/** Progression envoyée par le site, nettoyée. Les modules non objets sont ignorés. */
function lireProgression(brut) {
  const p = {};
  if (!estObjet(brut)) return p;
  for (const [mod, m] of Object.entries(brut).slice(0, 80)) {
    const cle = txt(mod, 60);
    if (!cle || !estObjet(m)) continue;
    p[cle] = {
      vues: (Array.isArray(m.vues) ? m.vues : []).slice(0, 200).map(Number).filter((n) => Number.isInteger(n) && n >= 0),
      lecons: Math.max(0, Number(m.lecons) || 0), pct: Math.max(0, Math.min(100, Number(m.pct) || 0)),
      quiz: m.quiz == null || !Number.isFinite(Number(m.quiz)) ? null : Number(m.quiz), quizSur: Math.max(0, Number(m.quizSur) || 0),
      examens: Object.fromEntries(Object.entries(estObjet(m.examens) ? m.examens : {}).slice(0, 20).map(([k, v]) => [txt(k, 20), txt(v, 20)])),
      majLe: maintenant(),
      ...(txt(m.titre, 120) ? { titre: txt(m.titre, 120) } : {}),
      ...(Number(m.heures) > 0 ? { heures: Math.min(2000, Number(m.heures)) } : {}),
    };
  }
  return p;
}

/* E-learning : un émargement par leçon terminée, demandé sur le coup (date du jour, heure de signature fixée par le serveur).
   Durée = heures de la formation / nombre de leçons. Identifiant l-<module>-<n> : jamais deux fois la même leçon. */
function emargementsLecons(e, avant, progression, mode = "auto") {
  // mode (réglage de la direction, pilote) : auto = demandé à l'élève tout de suite ; rappel = gardé pour l'équipe, qui l'envoie ; off = rien
  if (e.emargementLecon === false || mode === "off") return;
  const ids = new Set((e.emargements || []).map((x) => x.id));
  const nouveaux = [];
  for (const [mod, m] of Object.entries(progression)) {
    const deja = new Set(estObjet(avant[mod]) && Array.isArray(avant[mod].vues) ? avant[mod].vues : []);
    for (const n of m.vues) {
      const id = ("l-" + mod.replace(/[^A-Za-z0-9_-]/g, "") + "-" + n).slice(0, 100);
      if (deja.has(n) || ids.has(id)) continue;
      const min = m.heures && m.lecons ? Math.round((m.heures / m.lecons) * 60) : 0;
      nouveaux.push({ id, date: jourParis(), session: `${m.titre || mod} — leçon ${n + 1}${m.lecons ? " sur " + m.lecons : ""}`.slice(0, 160), duree: min ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : "", statut: mode === "rappel" ? "propose" : "attente", creeLe: maintenant(), type: "lecon", module: mod });
      ids.add(id);
    }
  }
  if (nouveaux.length) e.emargements = [...(e.emargements || []), ...nouveaux.slice(0, 20)];
}

/** Travail reçu du pilote, validé ; renvoie { travail } ou { erreur }. */
function lireTravail(t) {
  if (!estObjet(t)) return { erreur: "Travail manquant." };
  const type = txt(t.type, 20);
  if (!TYPES_TRAVAIL.includes(type)) return { erreur: "Type de travail inconnu (quiz, examen, lecons ou situation)." };
  const module = txt(t.module, 60);
  const titre = txt(t.titre, 160);
  const echeance = txt(t.echeance, 10);
  if (!module) return { erreur: "Module manquant." };
  if (!titre) return { erreur: "Titre manquant." };
  if (!jourValide(echeance)) return { erreur: "Échéance invalide (AAAA-MM-JJ)." };
  let id = t.id == null || t.id === "" ? "" : String(t.id);
  if (id && !RE_ID_TRAVAIL.test(id)) return { erreur: "Identifiant de travail invalide." };
  if (!id) id = "t" + Date.now().toString(36) + alea(3);
  const travail = { id, type, module, titre, echeance, creeLe: maintenant(), creePar: txt(t.creePar, 80) };
  const ref = txt(t.ref, 20);
  const consigne = txt(t.consigne, 1500);
  if (ref) travail.ref = ref;
  if (consigne) travail.consigne = consigne;
  return { travail };
}

// ---------------------------------------------------------------------------
// Traçabilité (preuve de réalisation) : appareil, journal scellé, contrôles de présence
// ---------------------------------------------------------------------------
// Chaque action de l'élève laisse une ligne horodatée par le serveur dans preuves/<id>/<AAAA-MM> :
// { n, t, type, d, ip, app, p, h } où h = SHA-256(p | ligne) et p = h de la ligne précédente.
// Une ligne modifiée ou retirée casse la chaîne : la vérification (action « preuves ») le montre.
// L'appareil est un identifiant tiré au hasard par le navigateur à la première connexion (aucun
// identifiant matériel n'est lisible par un site) ; les « postes du centre » sont déclarés par l'équipe.
const TRACE = { sessionsGardees: 300, defiMs: 120_000, conservationMois: 36, intervalles: { leger: 20, renforce: 10 } };
const RE_APPAREIL = /^[a-f0-9]{16,40}$/;

function contexteAppareil(d, req, context, ip) {
  const a = estObjet(d.appareil) ? d.appareil : {};
  return {
    app: RE_APPAREIL.test(String(a.id || "")) ? String(a.id) : "",
    os: txt(a.os, 40), nav: txt(a.nav, 40), ecran: txt(a.ecran, 20),
    ua: txt(req.headers.get("user-agent"), 200),
    ip: String(ip || "").slice(0, 64),
    pays: txt(context?.geo?.country?.code, 4),
  };
}
const hacher = (p, base) => createHash("sha256").update(String(p || "") + "|" + JSON.stringify(base)).digest("hex");
/** Ajoute une ligne scellée (mutation de e.preuveTete) ; renvoie la ligne. */
function sceller(e, type, detail, ctx, t) {
  const tete = estObjet(e.preuveTete) ? e.preuveTete : { n: 0, h: "" };
  const base = { n: (Number(tete.n) || 0) + 1, t: new Date(t || Date.now()).toISOString(), type, d: estObjet(detail) ? detail : {}, ip: ctx ? ctx.ip : "", app: ctx ? ctx.app : "" };
  const h = hacher(tete.h, base);
  e.preuveTete = { n: base.n, h };
  return { ...base, p: tete.h || "", h };
}
const moisDe = (iso) => String(iso).slice(0, 7);
/** Range les lignes dans les blobs mensuels (création si besoin). */
async function archiverPreuves(store, id, lignes) {
  const parMois = {};
  for (const l of lignes) (parMois[moisDe(l.t)] ||= []).push(l);
  for (const [mois, ls] of Object.entries(parMois)) {
    const cle = "preuves/" + id + "/" + mois;
    for (let essai = 0; essai < MAX_ESSAIS; essai++) {
      const lu = await store.getWithMetadata(cle, { type: "json" });
      if (!lu) {
        const r = await store.setJSON(cle, { entrees: ls }, { onlyIfNew: true });
        if (r && r.modified) break;
      } else {
        const x = estObjet(lu.data) ? lu.data : { entrees: [] };
        const deja = new Set((x.entrees || []).map((y) => y.n));
        x.entrees = [...(x.entrees || []), ...ls.filter((y) => !deja.has(y.n))];
        const r = await store.setJSON(cle, x, { onlyIfMatch: lu.etag });
        if (r && r.modified) break;
      }
      await pause(15 * (essai + 1));
    }
  }
}
/** Toutes les lignes d'un élève, dans l'ordre, et le contrôle de la chaîne. */
async function lirePreuves(store, id) {
  const { blobs } = await store.list({ prefix: "preuves/" + id + "/" });
  const morceaux = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  const lignes = morceaux.filter(estObjet).flatMap((m) => (Array.isArray(m.entrees) ? m.entrees : [])).filter(estObjet).sort((a, b) => a.n - b.n);
  let ok = true, rupture = null;
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const { p, h, ...base } = l;
    const attendu = hacher(p, base);
    const suite = i === 0 || (lignes[i - 1].h === p && lignes[i - 1].n === l.n - 1);
    if (attendu !== h || !suite) { ok = false; rupture = l.n; break; }
  }
  return { lignes, verification: { ok, lignes: lignes.length, rupture, premiere: lignes[0] ? lignes[0].n : null } };
}
/** Contrôle de présence : expire celui qui attend, en lance un nouveau au bon moment. */
function controlePresence(e, t, niveau, enLecon, actif, ctx, lignes) {
  if (!estObjet(e.presence)) e.presence = { ok: 0, manques: 0 };
  if (estObjet(e.defi) && t - Date.parse(e.defi.emisLe) > TRACE.defiMs) {
    lignes.push(sceller(e, "presence_manquee", { defi: e.defi.id }, ctx, t));
    e.presence.manques = (Number(e.presence.manques) || 0) + 1;
    delete e.defi;
  }
  const iv = TRACE.intervalles[niveau];
  if (!iv || !enLecon || !actif || estObjet(e.defi)) return;
  const temps = Number(e.tempsMin) || 0;
  if (!(Number(e.presence.prochainMin) > 0)) { e.presence.prochainMin = arrondi(temps + iv * (0.6 + Math.random() * 0.8)); return; }
  if (temps < e.presence.prochainMin) return;
  const cible = 1 + Math.floor(Math.random() * 9);
  const options = [cible];
  while (options.length < 4) { const x = 1 + Math.floor(Math.random() * 9); if (!options.includes(x)) options.push(x); }
  options.sort(() => Math.random() - 0.5);
  e.defi = { id: "p" + Date.now().toString(36) + alea(2), cible, options, emisLe: new Date(t).toISOString() };
  lignes.push(sceller(e, "presence_demandee", { defi: e.defi.id }, ctx, t));
}
const vueDefi = (x) => (estObjet(x) ? { id: x.id, consigne: `Touchez le chiffre ${x.cible} pour confirmer que vous suivez la leçon.`, options: x.options, emisLe: x.emisLe, delaiS: TRACE.defiMs / 1000 } : null);
/** Lignes de preuve pour une progression reçue : leçons vues, quiz et examens. */
function preuvesProgression(e, avant, progression, ctx, t, lignes) {
  for (const [mod, m] of Object.entries(progression)) {
    const a = estObjet(avant[mod]) ? avant[mod] : {};
    const deja = new Set(Array.isArray(a.vues) ? a.vues : []);
    for (const n of m.vues) if (!deja.has(n)) lignes.push(sceller(e, "lecon", { module: mod, lecon: n + 1, sur: m.lecons || null }, ctx, t));
    if (m.quiz != null && m.quiz !== a.quiz) lignes.push(sceller(e, "quiz", { module: mod, note: m.quiz, sur: m.quizSur || null }, ctx, t));
    for (const [k, v] of Object.entries(m.examens || {})) if (String((a.examens || {})[k] ?? "") !== String(v)) lignes.push(sceller(e, "examen", { module: mod, examen: k, note: v }, ctx, t));
  }
}
/** Purge (une fois par jour) : preuves et pièces d'identité au-delà de la durée de conservation. */
async function purgerPreuves(store) {
  const jour = jourParis();
  const marque = await store.get("purge/jour", { type: "json" });
  if (marque && marque.jour === jour) return;
  await store.setJSON("purge/jour", { jour });
  const limite = new Date(); limite.setMonth(limite.getMonth() - TRACE.conservationMois);
  const moisLimite = limite.toISOString().slice(0, 7);
  const { blobs } = await store.list({ prefix: "preuves/" });
  for (const b of blobs) { const m = b.key.split("/").pop(); if (/^\d{4}-\d{2}$/.test(m) && m < moisLimite) await store.delete(b.key); }
  const ids = await store.list({ prefix: "identite/" });
  for (const b of ids.blobs) {
    const e = await store.get("eleve/" + b.key.slice(9), { type: "json" });
    const der = e ? derniereActivite(e) || e.creeLe : "";
    if (!e || (der && der < limite.toISOString())) await store.delete(b.key);
  }
}

// ---------------------------------------------------------------------------
// Réponses et origines
// ---------------------------------------------------------------------------

function origineDe(adresse) {
  try {
    return new URL(String(adresse).trim()).origin;
  } catch {
    return null;
  }
}

/** Origines admises : ORIGINES_AUTORISEES (séparées par des virgules) et le site lui-même. */
function originesAutorisees(req) {
  const liste = new Set();
  for (const morceau of (env("ORIGINES_AUTORISEES") || "").split(",")) {
    const o = origineDe(morceau);
    if (o && o !== "null") liste.add(o);
  }
  const propre = origineDe(req.url);
  if (propre && propre !== "null") liste.add(propre);
  return liste;
}

// ---------------------------------------------------------------------------
// Traitement
// ---------------------------------------------------------------------------

const ACTIONS_ELEVE = ["connexion", "sync", "progression", "signer", "message", "document_lire", "document_signer", "messages_lus", "preferences", "presence_repondre"];
// actions pilote qui portent sur un seul élève (champ « id »)
const ACTIONS_UN_ELEVE = [
  "eleve", "eleve_maj", "eleve_supprimer", "emargement_demander", "emargement_valider", "emargement_envoyer", "message_centre",
  "document_remettre", "document_retirer", "document_preuve", "messages_lus_centre", "travail_retirer", "travail_marquer",
  "preuves", "identite_deposer", "identite_voir", "identite_verifier", "identite_supprimer",
];

/** Échappement HTML pour les e-mails. */
const escHtml = (x) => String(x ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
async function brevo(corps) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": env("BREVO_API_KEY"), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(corps), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error("Brevo " + r.status);
}
/** Modèle d'e-mail d'accusé de réception : cadre de l'image validée par la direction ; le texte personnalisé est dans le bandeau jaune, le bas (écoles, chiffres, adresse) est l'image public/mail/bas.jpg. */
function modeleAccuseHtml({ prenom, formation, delai, reponse, nom }) {
  const f = formation ? " pour la formation « " + escHtml(formation) + " »" : "";
  const img = (env("URL") || "https://cook.swipelearn.school").replace(/\/$/, "") + "/mail/bas.jpg";
  const base = (env("URL") || "https://cook.swipelearn.school").replace(/\/$/, "");
  const logo = `<table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="56" style="width:56px"><img src="${base}/logos/logo-groupe-blanc.png" width="56" height="56" alt="" style="display:block;border:0"></td><td style="padding-left:12px"><div style="font-size:26px;font-weight:bold;color:#ffffff;line-height:1.1">Swipe Learn School</div><div style="font-size:12px;letter-spacing:2px;color:#f6e7bd;font-weight:bold">GROUPE DE FORMATION</div></td></tr></table>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Message bien reçu</title></head><body style="margin:0;padding:0;background:#faf5ec"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf5ec"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;font-family:Arial,Helvetica,sans-serif">
<tr><td align="center" style="padding:22px 16px 16px"><div style="font-size:21px;font-weight:bold;color:#2a241c">Votre avenir professionnel <span style="color:#b8892a">commence ici.</span></div><div style="font-size:13px;color:#7a7266;padding-top:6px">Se former à un métier qui recrute, à son rythme et jusqu'à l'emploi.</div></td></tr>
<tr><td bgcolor="#c89b2d" style="background:#c89b2d;padding:30px 28px 32px;color:#ffffff">${logo}<div style="padding:22px 0 14px"><span style="display:inline-block;background:#b85c3c;color:#ffffff;font-weight:bold;font-size:15px;padding:9px 18px;border-radius:20px">Message bien reçu !</span></div>
<div style="font-size:34px;line-height:1.12;font-weight:bold;color:#ffffff">Sept écoles.<br>Un seul geste : <span style="color:#ffd04d">apprendre.</span></div>
<div style="padding-top:16px;font-size:16px;line-height:1.55;color:#ffffff">Bonjour ${escHtml(prenom)}, merci de nous avoir contactés. Nous avons bien reçu votre demande d'inscription${f}. Un conseiller revient vers vous ${escHtml(delai)}.</div></td></tr>
<tr><td><img src="${img}" width="600" alt="Nos sept écoles : Care, Build, Cook, Drive, Sell, Code, Manage. 7 écoles, 30 formations, 571 leçons, 68 examens blancs." style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
<tr><td style="padding:18px 20px 28px;font-size:12px;line-height:1.5;color:#7a7266">${reponse ? "Une question ? Répondez simplement à ce message ou écrivez à " + escHtml(reponse) + ".<br>" : ""}Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : aucune suite ne lui sera donnée. Vos données sont utilisées uniquement pour traiter votre demande ; vous pouvez demander leur accès, leur correction ou leur effacement en répondant à ce message.<br><br>${escHtml(nom)}</td></tr>
</table></td></tr></table></body></html>`;
}
/**
 * Accusé de réception envoyé à la personne qui vient de s'inscrire (modèle fixe, adresse saisie par elle-même),
 * et prévenance de l'équipe (sans donnée personnelle). Variables Netlify de CE site :
 * BREVO_API_KEY (secrète), EMAIL_EXPEDITEUR (adresse d'un domaine authentifié chez Brevo), EMAIL_EXPEDITEUR_NOM,
 * EMAIL_REPONSE (adresse du centre, où arrivent les réponses), EMAIL_CENTRE (alerte de l'équipe), EMAIL_DELAI_REPONSE.
 * Sans BREVO_API_KEY ou EMAIL_EXPEDITEUR : rien n'est envoyé. Un échec n'empêche jamais l'inscription.
 * Une seule fois par adresse et par 24 h : impossible d'utiliser le formulaire pour inonder une boîte.
 */
async function accuseInscription(store, c) {
  if (!env("BREVO_API_KEY") || !env("EMAIL_EXPEDITEUR")) return "non configuré";
  const expediteur = { email: env("EMAIL_EXPEDITEUR"), name: env("EMAIL_EXPEDITEUR_NOM") || "Swipe Learn School · Cook" };
  const reponse = env("EMAIL_REPONSE");
  const cle = "accuse/" + createHash("sha256").update(c.email.toLowerCase()).digest("hex").slice(0, 32);
  const equipe = env("EMAIL_CENTRE");
  const prevenirEquipe = async () => {
    if (!equipe) return;
    try {
      await brevo({ sender: expediteur, to: [{ email: equipe }], subject: "Nouvelle candidature à traiter", textContent: "Une nouvelle demande d'inscription vient d'arriver. Ouvrez le pilote, rubrique Candidatures.", htmlContent: "<p>Une nouvelle demande d'inscription vient d'arriver. Ouvrez le pilote, rubrique Candidatures.</p>", tags: ["alerte-candidature"] });
    } catch { /* l'alerte de l'équipe est facultative */ }
  };
  const prec = await store.get(cle, { type: "json" });
  if (prec && Date.now() - Date.parse(prec.le) < 86_400_000) {
    await prevenirEquipe(); // l'équipe est toujours prévenue, même si le mail au candidat n'est pas renvoyé
    return "déjà envoyé";
  }
  await prevenirEquipe();
  const delai = env("EMAIL_DELAI_REPONSE") || "dans les meilleurs délais";
  const formation = c.formation ? " pour la formation « " + c.formation + " »" : "";
  const texte = `Bonjour ${c.prenom},\n\nNous avons bien reçu votre demande d'inscription${formation}. Merci de votre confiance.\n\nNotre équipe l'étudie et vous répond ${delai}. Vous n'avez rien d'autre à faire pour le moment.${reponse ? "\n\nUne question ? Répondez simplement à ce message ou écrivez à " + reponse + "." : ""}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : aucune suite ne lui sera donnée.\n\nVos données sont utilisées uniquement pour traiter votre demande. Vous pouvez demander leur accès, leur correction ou leur effacement en répondant à ce message.\n\n${expediteur.name}`;
  const html = modeleAccuseHtml({ prenom: c.prenom, formation: c.formation, delai, reponse, nom: expediteur.name });
  await brevo({ sender: expediteur, to: [{ email: c.email, name: (c.prenom + " " + c.nom).slice(0, 70) }], ...(reponse ? { replyTo: { email: reponse } } : {}), subject: "Nous avons bien reçu votre demande", textContent: texte, htmlContent: html, tags: ["accuse-inscription"] });
  await store.setJSON(cle, { le: maintenant() }); // marqué seulement après un envoi réussi : un échec ne bloque pas un nouvel essai
  return "envoyé";
}

async function traiter(req, context, rep, erreur) {
  if (req.method !== "POST") return erreur("Méthode non acceptée.", 405);
  let d;
  try {
    const brut = await req.text();
    if (brut.length > 900000) return erreur("Envoi trop volumineux.", 413);
    d = JSON.parse(brut);
  } catch {
    return erreur("Demande illisible.");
  }
  if (!estObjet(d)) return erreur("Demande illisible.");
  const action = txt(d.action, 40);
  const store = getStore({ name: "pont", consistency: "strong" });
  const lire = (k) => store.get(k, { type: "json" });
  const ecrire = (k, v) => store.setJSON(k, v);
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "";

  // ---------- PUBLIC ----------
  if (action === "centre") {   // public : uniquement les mentions légales du pied de page
    const c = (await lire("centre")) || null;
    const PUBLIC = ["nom", "nomCommercial", "forme", "siren", "rcs", "siret", "ape", "adresse", "adresse1", "adresse2", "cp", "ville", "region", "nda", "ndaStatut", "tel", "tel2", "email", "repNom"];
    return rep({ ok: true, centre: c ? Object.fromEntries(PUBLIC.filter((k) => c[k]).map((k) => [k, c[k]])) : null });
  }

  if (action === "inscription") {
    const c = {
      id: "c" + Date.now().toString(36) + alea(3), recuLe: maintenant(), statut: "Nouvelle",
      ecole: txt(d.ecole, 20) || "cook", prenom: txt(d.prenom, 60), nom: txt(d.nom, 60), email: txt(d.email, 120), tel: txt(d.tel, 30),
      formationId: txt(d.formationId, 60), formation: txt(d.formation, 160), financement: txt(d.financement, 80), situation: txt(d.situation, 60), message: txt(d.message, 1500),
      origine: txt(d.origine, 60), origineDetail: txt(d.origineDetail, 80), via: txt(d.via, 30).toLowerCase().replace(/[^a-z0-9-]/g, ""),
    };
    // Test de positionnement « Trouver ma formation » (site public) : réponses courtes et conseil, preuve pour Qualiopi.
    if (estObjet(d.positionnement)) {
      const pr = d.positionnement, rep0 = estObjet(pr.reponses) ? pr.reponses : {};
      c.positionnement = {
        le: txt(pr.le, 30) || c.recuLe,
        reponses: Object.fromEntries(["situation", "metier", "diplome", "domaine", "exp", "objectif", "temps", "fin"].filter((k) => rep0[k] != null).map((k) => [k, txt(rep0[k], 20)])),
        conseil: (Array.isArray(pr.conseil) ? pr.conseil : []).slice(0, 3).map((x) => txt(x, 60)).filter(Boolean),
        resume: txt(pr.resume, 600),
      };
    }
    if (!c.prenom || !c.nom || !/^\S+@\S+\.\S+$/.test(c.email) || !c.tel) return erreur("Prénom, nom, e-mail valide et téléphone sont obligatoires.");
    // RGPD : consentement explicite, horodaté par le serveur (preuve).
    if (d.consentement !== true) return erreur("Le consentement à l'utilisation de vos données est obligatoire.");
    c.consentementLe = c.recuLe;
    await ecrire("cand/" + c.id, c);
    try {
      c.accuse = await accuseInscription(store, c);
    } catch (e) {
      c.accuse = "échec";
    }
    if (c.accuse !== "non configuré") await ecrire("cand/" + c.id, c);
    return rep({ ok: true, id: c.id });
  }

  // ---------- ÉLÈVE (code d'accès) ----------
  if (ACTIONS_ELEVE.includes(action)) {
    const code = txt(d.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const [bloque, ref] = await Promise.all([estBloque(store, ip), code ? lire("code/" + code) : null]);
    if (bloque) return erreur("Trop de tentatives. Réessayez dans 15 minutes.", 429);
    const id = estObjet(ref) ? txt(ref.id, 40) : "";
    const refuser = async () => {
      await noterEchec(store, ip);
      return erreur("Code d'accès inconnu ou désactivé.", 401);
    };
    if (!id) return refuser();

    if (action === "document_lire") {
      const e = await lire("eleve/" + id);
      if (!e) return refuser();
      if (e.actif === false) return erreur("Code d'accès inconnu ou désactivé.", 401);
      const doc = await lire("doc/" + e.id + "/" + txt(d.docId, 40));
      if (!doc) return erreur("Document introuvable.", 404);
      const { preuve, ...visible } = doc;
      return rep({ ok: true, document: { ...visible, mention: doc.aSigner ? MENTION_SIGNATURE : undefined, ...(preuve ? { signeLe: preuve.signeLe, empreinte: preuve.empreinte } : {}) } });
    }
    if (action === "document_signer") {
      const e = await lire("eleve/" + id);
      if (!e) return refuser();
      if (e.actif === false) return erreur("Code d'accès inconnu ou désactivé.", 401);
      const docId = txt(d.docId, 40), cleDoc = "doc/" + e.id + "/" + docId;
      const doc = await lire(cleDoc);
      if (!doc) return erreur("Document introuvable.", 404);
      if (!doc.aSigner) return erreur("Ce document n'est pas à signer.", 400);
      if (doc.preuve) return erreur("Ce document est déjà signé.", 400);
      if (d.consentement !== true) return erreur("Cochez la case de consentement pour signer.", 400);
      const sig = String(d.signature || "");
      if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(sig) || sig.length > 250000) return erreur("Signature illisible.", 400);
      const preuve = {
        signeLe: maintenant(), // horodatage fixé par le serveur, jamais par le navigateur
        empreinte: empreinteDoc(doc.titre, doc.html), algorithme: "SHA-256",
        signataire: { id: e.id, prenom: e.prenom, nom: e.nom, email: e.email || "", ecole: e.ecole },
        ip: String(ip || "").slice(0, 64), navigateur: txt(req.headers.get("user-agent"), 300),
        methode: "Signature électronique simple (eIDAS) : authentification par code d'accès personnel, signature manuscrite à l'écran, consentement explicite",
        mention: MENTION_SIGNATURE, signature: sig,
      };
      const ctxDoc = contexteAppareil(d, req, context, ip);
      preuve.appareil = { id: ctxDoc.app, os: ctxDoc.os, nav: ctxDoc.nav };
      await ecrire(cleDoc, { ...doc, preuve });
      let ligneDoc = null;
      const r2 = await modifierBlob(store, "eleve/" + id, (x) => {
        x.documents = (x.documents || []).map((m) => (m.id === docId ? { ...m, signeLe: preuve.signeLe, empreinte: preuve.empreinte } : m));
        x.vuLe = maintenant();
        ligneDoc = sceller(x, "document_signe", { docId, titre: txt(doc.titre, 120), empreinte: preuve.empreinte }, ctxDoc, Date.now());
        return {};
      });
      if (!r2) return refuser();
      if (ligneDoc) await archiverPreuves(store, id, [ligneDoc]);
      return rep({ ok: true, signeLe: preuve.signeLe, empreinte: preuve.empreinte, eleve: vueEleve(r2.objet) });
    }
    let texte = "";
    if (action === "message") {
      texte = txt(d.texte, 2000);
      if (!texte) return erreur("Message vide.");
    }
    if (action === "preferences" && !(estObjet(d.preferences) ? typeof d.preferences.rappelsFacultatifs === "boolean" : typeof d.rappelsFacultatifs === "boolean")) {
      return erreur("Préférence attendue : rappelsFacultatifs (oui ou non).");
    }
    const progression = action === "progression" ? lireProgression(d.progression) : null;
    const regl = (await store.get("reglages", { type: "json" })) || {};
    const modeLecon = action === "progression" ? String(regl.emargementLecon || "auto") : "auto";
    const niveauPresence = ["off", "leger", "renforce"].includes(regl.controlePresence) ? regl.controlePresence : "leger";
    const t = Date.now();
    const ctx = contexteAppareil(d, req, context, ip);
    const actif = d.actif !== false;
    let lignes = [];

    const r = await modifierBlob(store, "eleve/" + id, (e) => {
      lignes = []; // nouvel essai : lignes recalculées sur la fiche fraîche
      // un élève désactivé n'est pas un code « deviné » : pas compté comme échec
      if (e.actif === false) return { erreur: ["Code d'accès inconnu ou désactivé.", 401] };
      if (action === "connexion") lignes.push(sceller(e, "connexion", { os: ctx.os, nav: ctx.nav, ecran: ctx.ecran, pays: ctx.pays }, ctx, t));
      if (action === "connexion" || action === "sync" || action === "progression") {
        signalPresence(e, t, ctx, actif, d.module, lignes);
        controlePresence(e, t, niveauPresence, d.enLecon === true, actif, ctx, lignes);
      }
      if (action === "presence_repondre") {
        const x = e.defi;
        if (!estObjet(x) || x.id !== txt(d.defiId, 40)) return { sansEcriture: true };
        const delaiS = Math.round((t - Date.parse(x.emisLe)) / 1000);
        const bon = Number(d.choix) === x.cible && delaiS * 1000 <= TRACE.defiMs;
        if (!estObjet(e.presence)) e.presence = { ok: 0, manques: 0 };
        if (bon) e.presence.ok = (Number(e.presence.ok) || 0) + 1; else e.presence.manques = (Number(e.presence.manques) || 0) + 1;
        e.presence.dernierLe = new Date(t).toISOString();
        const iv = TRACE.intervalles[niveauPresence] || 20;
        e.presence.prochainMin = arrondi((Number(e.tempsMin) || 0) + iv * (0.6 + Math.random() * 0.8));
        lignes.push(sceller(e, bon ? "presence_ok" : "presence_ratee", { defi: x.id, delaiS, ...(bon ? {} : { raison: delaiS * 1000 > TRACE.defiMs ? "trop tard" : "mauvais chiffre" }) }, ctx, t));
        delete e.defi;
      }
      if (action === "progression") {
        // seuls la progression, le temps et les révisions changent (le champ « minutes » est ignoré)
        const avant = estObjet(e.progression) ? e.progression : {};
        preuvesProgression(e, avant, progression, ctx, t, lignes);
        emargementsLecons(e, avant, progression, modeLecon);
        e.progression = { ...avant, ...progression };
        if (estObjet(d.revisions)) e.revisions = { serie: Number(d.revisions.serie) || 0, cartes: Number(d.revisions.cartes) || 0 };
        majTravaux(e);
      }
      if (action === "signer") {
        const em = (e.emargements || []).find((x) => x.id === txt(d.emargementId, 100));
        if (!em) return { erreur: ["Émargement introuvable.", 404] };
        if (em.statut !== "attente") return { erreur: ["Cet émargement est déjà signé.", 400] };
        const sig = String(d.signature || "");
        if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(sig) || sig.length > 250000) return { erreur: ["Signature illisible.", 400] };
        em.signature = sig; em.statut = "signe"; em.signeLe = maintenant(); // horodatage côté serveur
        em.preuve = { ip: ctx.ip, app: ctx.app, os: ctx.os, nav: ctx.nav };
        lignes.push(sceller(e, "emargement", { id: em.id, session: em.session, date: em.date, empreinteSignature: createHash("sha256").update(sig).digest("hex").slice(0, 32) }, ctx, t));
      }
      if (action === "message") {
        e.messages = [...(e.messages || []), { de: "eleve", texte, date: maintenant(), lu: false }].slice(-300);
        lignes.push(sceller(e, "message", { longueur: texte.length }, ctx, t));
      }
      if (action === "messages_lus") (e.messages || []).forEach((m) => { if (m.de === "centre") m.lu = true; });
      if (action === "preferences") {
        const p = estObjet(d.preferences) ? d.preferences : d;
        e.preferences = { ...(estObjet(e.preferences) ? e.preferences : {}), rappelsFacultatifs: p.rappelsFacultatifs, majLe: maintenant() };
      }
      e.vuLe = maintenant();
      return {};
    });
    if (!r) return refuser();
    if (r.erreur) return erreur(r.erreur[0], r.erreur[1]);
    if (lignes.length && !r.sansEcriture) await archiverPreuves(store, id, lignes);
    return rep({ ok: true, eleve: vueEleve(r.objet) });
  }

  // ---------- PILOTE (clé d'administration) ----------
  const cle = env("PONT_CLE") || "";
  if (!cle) return erreur("Le pont n'a pas encore de clé d'administration (variable PONT_CLE à créer dans Netlify).", 503);
  if (cle.length < CLE_MIN) return erreur(`La clé d'administration du pont est trop courte (${CLE_MIN} caractères au moins) : changez PONT_CLE dans Netlify.`, 503);
  if (await estBloque(store, ip)) return erreur("Trop de tentatives. Réessayez dans 15 minutes.", 429);
  if (!egal(typeof d.cle === "string" ? d.cle : "", cle)) {
    await noterEchec(store, ip);
    return erreur("Clé d'administration incorrecte.", 401);
  }

  if (action === "test") return rep({ ok: true, message: "Pont joignable." });
  if (action === "centre_admin") return rep({ ok: true, centre: (await lire("centre")) || null });
  if (action === "emargements") {
    const l = [];
    for (const e of await tous(store, "eleve/")) for (const { signature, ...m } of e.emargements || []) l.push({ ...m, eleveId: e.id, nom: e.prenom + " " + e.nom, ecole: e.ecole });
    return rep({ ok: true, emargements: l });
  }
  if (action === "reglages_maj") {
    const g = estObjet(d.reglages) ? d.reglages : {};
    const avant = (await lire("reglages")) || {};
    const neuf = { ...avant };
    if (g.emargementLecon != null) {
      if (!["auto", "rappel", "off"].includes(String(g.emargementLecon))) return erreur("Réglage attendu : emargementLecon = auto, rappel ou off.");
      neuf.emargementLecon = String(g.emargementLecon);
    }
    if (g.controlePresence != null) {
      if (!["off", "leger", "renforce"].includes(String(g.controlePresence))) return erreur("Réglage attendu : controlePresence = off, leger ou renforce.");
      neuf.controlePresence = String(g.controlePresence);
    }
    if (g.postes != null) {
      if (!Array.isArray(g.postes)) return erreur("Postes du centre : liste attendue.");
      neuf.postes = g.postes.filter(estObjet).map((x) => ({ app: String(x.app || ""), nom: txt(x.nom, 60) })).filter((x) => RE_APPAREIL.test(x.app)).slice(0, 60);
    }
    if (g.emargementLecon == null && g.controlePresence == null && g.postes == null) return erreur("Aucun réglage reçu.");
    neuf.majLe = maintenant();
    await ecrire("reglages", neuf);
    const { majLe, ...vue } = neuf;
    return rep({ ok: true, reglages: vue });
  }
  if (action === "reglages") { const { majLe, ...vue } = (await lire("reglages")) || {}; return rep({ ok: true, reglages: vue }); }
  if (action === "preuves_alertes") {
    const regl = (await lire("reglages")) || {};
    const postes = new Map((regl.postes || []).map((x) => [x.app, x.nom]));
    const eleves = await tous(store, "eleve/");
    const depuis = Date.now() - 60 * 864e5;
    const appareils = new Map(); const alertes = [];
    const nomE = (e) => ((e.prenom || "") + " " + (e.nom || "")).trim();
    for (const e of eleves) {
      const sessions = (e.journalConnexions || []).filter((x) => estObjet(x) && Date.parse(x.fin) >= depuis);
      const pays = new Set();
      for (const x of sessions) {
        for (const app of x.apps || (x.app ? [x.app] : [])) {
          const a = appareils.get(app) || { app, os: x.os || "", nav: x.nav || "", eleves: new Map(), derniere: "", ips: new Set() };
          a.eleves.set(e.id, nomE(e)); if (x.fin > a.derniere) a.derniere = x.fin; if (x.ip) a.ips.add(x.ip);
          appareils.set(app, a);
        }
        if ((x.apps || []).filter((a) => !postes.has(a)).length > 1) alertes.push({ type: "deux_appareils", niveau: "moyen", eleveId: e.id, nom: nomE(e), le: x.debut, texte: "Même session suivie sur plusieurs appareils en même temps (compte prêté ?)" });
        if (x.pays) pays.add(x.pays);
      }
      if (pays.size > 1) alertes.push({ type: "pays", niveau: "moyen", eleveId: e.id, nom: nomE(e), texte: "Connexions depuis plusieurs pays : " + [...pays].join(", ") });
      const pr = estObjet(e.presence) ? e.presence : {};
      const tot = (Number(pr.ok) || 0) + (Number(pr.manques) || 0);
      if (tot >= 3 && (Number(pr.manques) || 0) / tot > 0.3) alertes.push({ type: "presence", niveau: "fort", eleveId: e.id, nom: nomE(e), texte: `Contrôles de présence manqués : ${pr.manques} sur ${tot}` });
      // leçons terminées trop vite : temps actif très inférieur à la durée prévue
      for (const [mod, m] of Object.entries(e.progression || {})) {
        if (!estObjet(m) || !(m.heures > 0) || !(m.lecons > 0)) continue;
        const vues = (m.vues || []).length;
        if (vues < 5) continue;
        const prevu = (m.heures * 60 * vues) / m.lecons;
        const passe = Number((e.tempsModules || {})[mod]) || 0;
        if (e.tempsModules && passe < prevu * 0.05) alertes.push({ type: "trop_vite", niveau: "fort", eleveId: e.id, nom: nomE(e), texte: `« ${m.titre || mod} » : ${vues} leçon(s) en ${Math.round(passe)} min de temps actif pour ${Math.round(prevu)} min prévues` });
      }
      // signatures d'émargement en rafale depuis un appareil qui n'est pas un poste du centre
      const sig = (e.emargements || []).filter((x) => x.signeLe && Date.parse(x.signeLe) >= depuis).sort((a, b) => String(a.signeLe).localeCompare(String(b.signeLe)));
      for (let i = 4; i < sig.length; i++) if (Date.parse(sig[i].signeLe) - Date.parse(sig[i - 4].signeLe) < 120_000) { alertes.push({ type: "rafale", niveau: "info", eleveId: e.id, nom: nomE(e), le: sig[i].signeLe, texte: "5 émargements signés en moins de 2 minutes (normal pour un rattrapage de jours passés, à vérifier sinon)" }); break; }
    }
    for (const a of appareils.values()) if (a.eleves.size > 1 && !postes.has(a.app)) alertes.push({ type: "appareil_partage", niveau: "fort", texte: `Même appareil (${[a.os, a.nav].filter(Boolean).join(", ") || a.app.slice(0, 8)}) pour ${a.eleves.size} élèves : ${[...a.eleves.values()].join(", ")}`, app: a.app });
    const ordre = { fort: 0, moyen: 1, info: 2 };
    alertes.sort((x, y) => ordre[x.niveau] - ordre[y.niveau]);
    return rep({ ok: true, alertes, appareils: [...appareils.values()].map((a) => ({ app: a.app, os: a.os, nav: a.nav, eleves: [...a.eleves.values()], derniere: a.derniere, ips: a.ips.size, poste: postes.get(a.app) || "" })).sort((a, b) => String(b.derniere).localeCompare(String(a.derniere))), postes: regl.postes || [], controlePresence: regl.controlePresence || "leger" });
  }
  if (action === "centre_maj") { await ecrire("centre", { ...(estObjet(d.centre) ? d.centre : {}), majLe: maintenant() }); return rep({ ok: true }); }
  if (action === "catalogue") { const ec = txt(d.ecole, 20) || "cook"; return rep({ ok: true, catalogue: (await lire("catalogue/" + ec)) || CATALOGUE_DEFAUT[ec] || [] }); }
  if (action === "catalogue_maj") {
    const ec = txt(d.ecole, 20) || "cook";
    if (!Array.isArray(d.catalogue)) return erreur("Catalogue attendu : liste de modules {id, titre}.");
    const catalogue = d.catalogue.slice(0, 200).filter(estObjet).map((m) => ({ id: txt(m.id, 60), titre: txt(m.titre, 160) })).filter((m) => m.id);
    if (!catalogue.length) return erreur("Catalogue vide.");
    await ecrire("catalogue/" + ec, catalogue);
    return rep({ ok: true, catalogue });
  }

  if (action === "candidatures") return rep({ ok: true, candidatures: (await tous(store, "cand/")).sort((a, b) => String(b.recuLe).localeCompare(String(a.recuLe))) });
  if (action === "cand_statut") {
    const id = txt(d.id, 40);
    if (d.supprimer) {
      if (!(await lire("cand/" + id))) return erreur("Candidature introuvable.", 404);
      await store.delete("cand/" + id);
      return rep({ ok: true });
    }
    const r = await modifierBlob(store, "cand/" + id, (c) => { c.statut = txt(d.statut, 30); });
    return r ? rep({ ok: true }) : erreur("Candidature introuvable.", 404);
  }
  if (action === "eleves") { try { await purgerPreuves(store); } catch (x) { console.error("Purge des preuves :", x); } }
  if (action === "eleves") return rep({ ok: true, eleves: (await tous(store, "eleve/")).map(resume).sort((a, b) => String(a.nom).localeCompare(String(b.nom))), demarches: DEMARCHES });

  if (action === "eleve_creer") {
    const e = {
      id: "e" + Date.now().toString(36) + alea(3), code: "", creeLe: maintenant(), actif: true,
      ecole: txt(d.ecole, 20) || "cook", prenom: txt(d.prenom, 60), nom: txt(d.nom, 60), email: txt(d.email, 120), tel: txt(d.tel, 30),
      formations: (Array.isArray(d.formations) ? d.formations : []).map((x) => txt(x, 60)).filter(Boolean), formationLibelle: txt(d.formationLibelle, 160),
      demarches: {}, progression: {}, emargements: [], messages: [], documents: [], tempsMin: 0,
    };
    if (!e.prenom || !e.nom) return erreur("Prénom et nom sont obligatoires.");
    // code unique : réservé avant la fiche (onlyIfNew), nouveau tirage en cas de collision
    for (let essai = 0; essai < MAX_ESSAIS && !e.code; essai++) {
      const code = alea(8);
      const r = await store.setJSON("code/" + code, { id: e.id }, { onlyIfNew: true });
      if (r && r.modified) e.code = code;
    }
    if (!e.code) return erreur("Impossible d'attribuer un code d'accès, réessayez.", 409);
    await store.setJSON("eleve/" + e.id, e, { onlyIfNew: true });
    if (d.candId) await modifierBlob(store, "cand/" + txt(d.candId, 40), (c) => { c.statut = "Acceptée"; c.eleveId = e.id; });
    return rep({ ok: true, eleve: e });
  }

  if (action === "travail_donner") {
    const ids = [...new Set((Array.isArray(d.ids) ? d.ids : []).map((x) => txt(x, 40)).filter(Boolean))].slice(0, 300);
    if (!ids.length) return erreur("Choisissez au moins un élève (« ids »).");
    const { travail, erreur: probleme } = lireTravail(d.travail);
    if (probleme) return erreur(probleme);
    const donnes = [];
    const deja = [];
    const introuvables = [];
    for (const id of ids) {
      const r = await modifierBlob(store, "eleve/" + id, (e) => {
        if (!Array.isArray(e.travaux)) e.travaux = [];
        if (e.travaux.some((x) => estObjet(x) && x.id === travail.id)) return { sansEcriture: true, deja: true };
        const t = { ...travail };
        if (travailFait(t, e.progression)) t.faitLe = maintenant();
        e.travaux = [...e.travaux, t].slice(-500);
        return {};
      });
      if (!r) introuvables.push(id);
      else if (r.deja) deja.push(id);
      else donnes.push(id);
    }
    return rep({ ok: true, travail: vueTravail(travail), eleves: donnes, deja, introuvables });
  }

  // toutes les actions suivantes portent sur un élève précis
  const id = txt(d.id, 40);
  if (!ACTIONS_UN_ELEVE.includes(action)) {
    const existe = id ? await lire("eleve/" + id) : null;
    if (!existe) return erreur(action ? "Élève introuvable ou action inconnue." : "Action manquante.", 404);
    return erreur("Action inconnue.");
  }
  if (action === "eleve") {
    // lecture seule : ouvrir une fiche ne marque plus les messages comme lus
    const e = id ? await lire("eleve/" + id) : null;
    if (!e) return erreur("Élève introuvable ou action inconnue.", 404);
    const { defi, ...sansDefi } = e;
    return rep({ ok: true, eleve: sansDefi, demarches: DEMARCHES });
  }
  if (action === "eleve_supprimer") {
    const e = id ? await lire("eleve/" + id) : null;
    if (!e) return erreur("Élève introuvable ou action inconnue.", 404);
    for (const doc of e.documents || []) await store.delete("doc/" + e.id + "/" + doc.id);
    const { blobs: pr } = await store.list({ prefix: "preuves/" + e.id + "/" });
    for (const b of pr) await store.delete(b.key);
    await store.delete("identite/" + e.id);
    await store.delete("code/" + e.code); await store.delete("eleve/" + e.id);
    return rep({ ok: true });
  }

  let prep = {};
  if (action === "preuves") {
    const e = id ? await lire("eleve/" + id) : null;
    if (!e) return erreur("Élève introuvable.", 404);
    const { lignes, verification } = await lirePreuves(store, id);
    const regl = (await lire("reglages")) || {};
    return rep({ ok: true, eleve: { id: e.id, prenom: e.prenom, nom: e.nom, email: e.email, ecole: e.ecole, formationLibelle: e.formationLibelle || "", creeLe: e.creeLe, tempsMin: e.tempsMin || 0, dossier: e.dossier || {} },
      sessions: (e.journalConnexions || []).filter(estObjet), tempsModules: e.tempsModules || {}, connexions: e.connexions || {}, presence: e.presence || { ok: 0, manques: 0 },
      progression: e.progression || {}, emargements: (e.emargements || []).map(({ signature, ...m }) => m), messages: (e.messages || []).map((m) => ({ de: m.de, date: m.date, longueur: String(m.texte || "").length })),
      documents: (e.documents || []).map((x) => ({ id: x.id, titre: x.titre, date: x.date, signeLe: x.signeLe || null, empreinte: x.empreinte || null })),
      identite: e.identite || null, tete: e.preuveTete || null, journal: lignes.slice(-3000), verification, postes: regl.postes || [] });
  }
  if (action === "identite_voir") {
    if (!id || !(await lire("eleve/" + id))) return erreur("Élève introuvable.", 404);
    const f = await lire("identite/" + id);
    if (!f) return erreur("Aucune pièce d'identité déposée.", 404);
    return rep({ ok: true, fichier: f.contenu, type: f.type, nom: f.nom || "", deposeLe: f.deposeLe });
  }
  if (action === "identite_deposer") {
    const f = String(d.fichier || "");
    const m = /^data:(image\/jpeg|image\/png|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(f);
    if (!m) return erreur("Pièce d'identité : image JPEG, PNG ou PDF attendue.");
    if (f.length > 850000) return erreur("Fichier trop lourd (600 Ko au plus) : photographiez-la de plus loin ou réduisez le PDF.", 413);
    if (m[1] === "application/pdf" && !Buffer.from(m[2].slice(0, 12), "base64").toString("latin1").startsWith("%PDF")) return erreur("Ce fichier n'est pas un PDF valide.");
    if (!id || !(await lire("eleve/" + id))) return erreur("Élève introuvable.", 404);
    const deposeLe = maintenant();
    await ecrire("identite/" + id, { contenu: f, type: m[1], nom: txt(d.nomFichier, 120), deposeLe, empreinte: createHash("sha256").update(f).digest("hex") });
    prep.identite = { deposeLe, type: m[1], taille: Math.round((m[2].length * 3) / 4), par: txt(d.par, 80) };
  }

  // préparation hors de la boucle d'essais (validations, blob du document)
  if (action === "emargement_demander") {
    const emId = d.emargementId == null || d.emargementId === "" ? "" : String(d.emargementId);
    if (emId && !RE_ID_LIBRE.test(emId)) return erreur("Identifiant d'émargement invalide.");
    const demi = d.demi == null || d.demi === "" ? "" : String(d.demi);
    if (demi && !DEMIS.includes(demi)) return erreur("Demi-journée invalide (matin ou apres-midi).");
    prep = { emId, demi };
  } else if (action === "message_centre") {
    prep.texte = txt(d.texte, 2000);
    if (!prep.texte) return erreur("Message vide.");
  } else if (action === "document_remettre") {
    const doc = { id: "d" + Date.now().toString(36) + alea(2), titre: txt(d.titre, 160), date: maintenant(), html: String(d.html || "").slice(0, 700000), ...(d.aSigner === true ? { aSigner: true } : {}) };
    if (!doc.titre || !doc.html) return erreur("Document vide.");
    if (!id || !(await lire("eleve/" + id))) return erreur("Élève introuvable ou action inconnue.", 404);
    await ecrire("doc/" + id + "/" + doc.id, doc);
    prep.doc = doc;
  } else if (action === "document_preuve") {
    if (!id || !(await lire("eleve/" + id))) return erreur("Élève introuvable.", 404);
    const doc = await lire("doc/" + id + "/" + txt(d.docId, 40));
    if (!doc) return erreur("Document introuvable.", 404);
    // lecture seule : le document, tel que signé, et le dossier de preuve
    return rep({ ok: true, document: { id: doc.id, titre: doc.titre, date: doc.date, html: doc.html, aSigner: !!doc.aSigner }, preuve: doc.preuve || null, empreinteActuelle: empreinteDoc(doc.titre, doc.html) });
  } else if (action === "document_retirer") {
    prep.docId = txt(d.docId, 40);
    if (id && (await lire("eleve/" + id))) await store.delete("doc/" + id + "/" + prep.docId);
  } else if (action === "travail_marquer" && typeof d.fait !== "boolean") {
    return erreur("Indiquez « fait » : oui ou non.");
  }

  const r = id ? await modifierBlob(store, "eleve/" + id, (e) => {
    if (action === "eleve_maj") {
      if (estObjet(d.demarches)) e.demarches = Object.fromEntries(DEMARCHES.map(([k]) => [k, !!d.demarches[k]]));
      if (Array.isArray(d.formations)) e.formations = d.formations.map((x) => txt(x, 60)).filter(Boolean);
      if (d.formationLibelle != null) e.formationLibelle = txt(d.formationLibelle, 160);
      if (d.prochaine != null) e.prochaine = txt(d.prochaine, 200);
      if (d.actif != null) e.actif = !!d.actif;
      if (estObjet(d.dossier)) e.dossier = { ...(estObjet(e.dossier) ? e.dossier : {}), ...Object.fromEntries(Object.entries(d.dossier).slice(0, 60).map(([k, v]) => [txt(k, 40), txt(v, 1500)])) };
    } else if (action === "emargement_demander") {
      if (prep.emId && (e.emargements || []).some((x) => x.id === prep.emId)) return { sansEcriture: true, existant: true };
      const em = { id: prep.emId || "m" + Date.now().toString(36) + alea(2), date: txt(d.date, 10), session: txt(d.session, 160), duree: txt(d.duree, 20), statut: "attente", creeLe: maintenant() };
      if (prep.demi) em.demi = prep.demi;
      if (d.heures != null && txt(d.heures, 40)) em.heures = txt(d.heures, 40);
      e.emargements = [...(e.emargements || []), em];
      return { emargementId: em.id };
    } else if (action === "emargement_envoyer") {
      // leçons terminées gardées pour l'équipe : la demande part maintenant à l'élève (toutes, ou celles indiquées)
      const ids = Array.isArray(d.emargementIds) ? d.emargementIds.map((x) => txt(x, 100)) : null;
      let n = 0;
      for (const x of e.emargements || []) if (x.statut === "propose" && (!ids || ids.includes(x.id))) { x.statut = "attente"; x.demandeLe = maintenant(); n++; }
      if (!n) return { sansEcriture: true, envoyes: 0 };
      return { envoyes: n };
    } else if (action === "emargement_valider") {
      const em = (e.emargements || []).find((x) => x.id === txt(d.emargementId, 100));
      if (!em) return { erreur: ["Émargement introuvable.", 404] };
      if (d.supprimer) e.emargements = e.emargements.filter((x) => x !== em);
      else if (d.refuser) {
        if (em.statut !== "signe") return { erreur: ["Seul un émargement signé et pas encore validé peut être refusé.", 409] };
        em.statut = "attente"; delete em.signature; delete em.signeLe;
      }
      else { em.statut = "valide"; em.valideLe = maintenant(); }
    } else if (action === "message_centre") {
      const m = { de: "centre", texte: prep.texte, date: maintenant(), lu: false };
      if (d.auto === true) m.auto = true;
      e.messages = [...(e.messages || []), m].slice(-300);
    } else if (action === "messages_lus_centre") {
      (e.messages || []).forEach((m) => { if (m.de === "eleve") m.lu = true; });
    } else if (action === "document_remettre") {
      e.documents = [...(e.documents || []), { id: prep.doc.id, titre: prep.doc.titre, date: prep.doc.date, ...(prep.doc.aSigner ? { aSigner: true } : {}) }];
    } else if (action === "document_retirer") {
      e.documents = (e.documents || []).filter((x) => x.id !== prep.docId);
    } else if (action === "identite_deposer") {
      e.identite = { ...(estObjet(e.identite) ? e.identite : {}), ...prep.identite, verifieLe: null, verifiePar: "", conforme: null, supprimeLe: null };
      prep.ligne = sceller(e, "identite_deposee", { type: prep.identite.type, par: prep.identite.par }, null, Date.now());
    } else if (action === "identite_verifier") {
      if (!estObjet(e.identite) || !e.identite.deposeLe) return { erreur: ["Déposez d'abord la pièce d'identité.", 400] };
      const piece = txt(d.piece, 40);
      if (!piece) return { erreur: ["Indiquez le type de pièce (carte d'identité, passeport, titre de séjour…).", 400] };
      e.identite = { ...e.identite, verifieLe: maintenant(), verifiePar: txt(d.par, 80), piece, conforme: d.conforme !== false, expireLe: jourValide(txt(d.expireLe, 10)) ? txt(d.expireLe, 10) : null };
      prep.ligne = sceller(e, "identite_verifiee", { piece, conforme: e.identite.conforme, par: e.identite.verifiePar }, null, Date.now());
    } else if (action === "identite_supprimer") {
      if (!estObjet(e.identite)) return { sansEcriture: true };
      e.identite = { ...e.identite, supprimeLe: maintenant() };
      prep.ligne = sceller(e, "identite_copie_supprimee", { par: txt(d.par, 80) }, null, Date.now());
    } else if (action === "travail_retirer" || action === "travail_marquer") {
      const tid = txt(d.travailId, 40);
      const t = (e.travaux || []).find((x) => estObjet(x) && x.id === tid);
      if (!t) return { erreur: ["Travail introuvable.", 404] };
      if (action === "travail_retirer") e.travaux = e.travaux.filter((x) => x !== t);
      else if (d.fait) { t.faitLe = t.faitLe || maintenant(); t.faitManuel = true; }
      else { delete t.faitLe; delete t.faitManuel; }
    }
    return {};
  }) : null;
  if (!r) return erreur("Élève introuvable ou action inconnue.", 404);
  if (r.erreur) return erreur(r.erreur[0], r.erreur[1]);
  if (prep.ligne && !r.sansEcriture) await archiverPreuves(store, id, [prep.ligne]);
  if (action === "identite_supprimer" && !r.sansEcriture) await store.delete("identite/" + id);
  // réponse courte sur demande (tournée des rappels : pas de fiche complète, signatures comprises)
  if (d.court === true) return rep({ ok: true, ...(r.existant ? { existant: true } : {}), ...(r.emargementId ? { emargementId: r.emargementId } : {}) });
  return rep({ ok: true, eleve: r.objet, ...(r.existant ? { existant: true } : {}) });
}

const handler = async (req, context) => {
  const origine = req.headers.get("origin");
  const autorisee = origine === null || originesAutorisees(req).has(origine);
  const entetes = {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin",
    ...(origine !== null && autorisee ? {
      "Access-Control-Allow-Origin": origine, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
    } : {}),
  };
  const rep = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: entetes });
  const erreur = (message, status = 400) => rep({ ok: false, erreur: message }, status);
  // Origine étrangère : refusée AVANT tout traitement (un POST text/plain part sans pré-vérification CORS).
  if (!autorisee) return erreur("Origine non autorisée.", 403);
  if (req.method === "OPTIONS") {
    const { "Content-Type": _t, ...sansType } = entetes;
    return new Response(null, { status: 204, headers: sansType });
  }
  try {
    return await traiter(req, context, rep, erreur);
  } catch (e) {
    if (e instanceof Conflit) return erreur("La fiche est en cours de modification. Réessayez dans un instant.", 409);
    console.error("Pont : erreur interne :", e);
    return erreur("Erreur interne du pont. Réessayez dans un instant.", 500);
  }
};

export default handler;
