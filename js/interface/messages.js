// ==========================================================
// Textes affichés à l'utilisateur pour chaque type d'erreur,
// et fonctions pour afficher / cacher un message.
// ==========================================================

import { FORMATS_ACCEPTES } from "../config.js";

const TEXTES_ERREUR = {
  "micro-refuse":
    "L'accès au micro a été refusé. Pour l'autoriser : touche l'icône à gauche de l'adresse " +
    "(ou ⋮ → Paramètres → Paramètres des sites → Micro), autorise le micro, puis réessaie.",
  "micro-absent": "Aucun micro n'a été trouvé sur cet appareil.",
  "micro-occupe":
    "Le micro est déjà utilisé par une autre application (appel, dictaphone…). Ferme-la puis réessaie.",
  "micro-indisponible":
    "Ce navigateur ne permet pas d'enregistrer. Essaie avec Chrome, ou importe un fichier audio.",
  "fichier-illisible":
    `Ce fichier n'a pas pu être lu. Formats acceptés : ${FORMATS_ACCEPTES}. ` +
    "Essaie un autre fichier, ou convertis-le en MP3.",
  "fichier-vide": "Ce fichier ne contient pas de son.",
  memoire:
    "Le téléphone manque de mémoire pour ce traitement. Ferme les autres applications, " +
    "choisis la qualité « Rapide » dans les réglages, ou essaie un audio plus court.",
  plantage:
    "Le moteur de transcription s'est arrêté brutalement, souvent par manque de mémoire. " +
    "Ferme les autres applications puis réessaie. Si cela recommence, choisis la qualité « Rapide ».",
  connexion:
    "La connexion internet a été perdue. Pas d'inquiétude : ce qui est déjà téléchargé est conservé. " +
    "Le téléchargement reprendra là où il s'est arrêté.",
  "hors-ligne":
    "Tu es hors ligne. Le modèle doit être téléchargé une première fois avec internet " +
    "(de préférence en Wi-Fi). Ensuite, tout fonctionnera sans connexion.",
  espace:
    "Il n'y a plus assez d'espace de stockage sur le téléphone pour enregistrer le modèle. " +
    "Libère de la place (photos, vidéos, applications) puis réessaie.",
  introuvable:
    "Le modèle est introuvable sur le serveur pour le moment. Réessaie plus tard, " +
    "ou choisis une autre qualité dans les réglages.",
  "partage-annule":
    "Le partage a été annulé : la capture n'a pas démarré. Appuie de nouveau sur « Démarrer la capture », " +
    "puis choisis quoi partager et clique sur « Partager ».",
  "partage-sans-son":
    "Le partage ne contient pas de son : la case « Partager aussi l'audio » n'était pas cochée. " +
    "Recommence en cochant cette case, en bas de la fenêtre de partage de Chrome " +
    "(avec « Écran entier » pour l'application Discord).",
  "partage-impossible":
    "Le partage du son n'a pas pu démarrer. Utilise Chrome ou Edge à jour sur ordinateur, puis réessaie.",
  inconnue: "Un problème inattendu est survenu. Réessaie ; si cela recommence, recharge la page.",
};

// Message quand la reconnaissance des intervenants échoue : le texte est gardé
export function texteEchecVoix(code) {
  const raisons = {
    "hors-ligne": "les modèles des voix ne sont pas encore téléchargés et tu es hors ligne",
    connexion: "la connexion a été perdue pendant le téléchargement des modèles des voix",
    memoire: "le téléphone manque de mémoire",
    plantage: "le téléphone manque de mémoire",
    espace: "il n'y a plus assez d'espace de stockage",
    pause: "le téléchargement a été mis en pause",
  };
  const raison = raisons[code] ?? "un problème inattendu est survenu";
  return (
    `La reconnaissance des intervenants n'a pas pu se faire (${raison}). ` +
    "Pas d'inquiétude : le texte est conservé, sans distinction de voix."
  );
}

export function texteErreur(code) {
  return TEXTES_ERREUR[code] ?? TEXTES_ERREUR.inconnue;
}

// Affiche un message dans une zone ; type = "info" | "succes" | "erreur"
export function afficherMessage(zone, texte, type = "info") {
  zone.textContent = texte;
  zone.dataset.type = type;
  zone.hidden = false;
}

export function cacherMessage(zone) {
  zone.hidden = true;
  zone.textContent = "";
}
