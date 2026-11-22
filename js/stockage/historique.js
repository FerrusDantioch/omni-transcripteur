// ==========================================================
// Historique des transcriptions, rangé dans IndexedDB.
// Une transcription ressemble à :
// {
//   id: 3,                       (numéro attribué automatiquement)
//   titre: "Réunion du lundi",
//   creeLe: 1760000000000,       (date, en millisecondes)
//   duree: 125.4,                (durée de l'audio, en secondes)
//   source: "micro" | "fichier",
//   langue: "fr",
//   qualite: "equilibre",
//   phrases: [{ debut: 0, fin: 4.2, texte: "Bonjour à tous.", intervenant: 0 }, …],
//   intervenants: [{ nom: "Marie" }, { nom: "Intervenant 2" }],  (si reconnus)
//   interrompue: false
// }
// ==========================================================

import {
  ouvrirBase,
  attendre,
  finDeTransaction,
  TIROIR_TRANSCRIPTIONS,
} from "./base-de-donnees.js";
import { normaliserTranscriptionImportee } from "../outils/edition-texte.js";

// Ajoute une transcription et renvoie son numéro
export async function ajouterTranscription(transcription) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readwrite");
  const id = await attendre(transaction.objectStore(TIROIR_TRANSCRIPTIONS).add(transcription));
  await finDeTransaction(transaction);
  return id;
}

// Renvoie toutes les transcriptions, de la plus récente à la plus ancienne
export async function listerTranscriptions() {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readonly");
  const toutes = await attendre(transaction.objectStore(TIROIR_TRANSCRIPTIONS).getAll());
  return toutes.sort((a, b) => b.creeLe - a.creeLe);
}

// Renvoie une transcription d'après son numéro
export async function lireTranscription(id) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readonly");
  return attendre(transaction.objectStore(TIROIR_TRANSCRIPTIONS).get(id));
}

// Enregistre une transcription modifiée (noms des intervenants, corrections…)
export async function mettreAJourTranscription(transcription) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readwrite");
  transaction.objectStore(TIROIR_TRANSCRIPTIONS).put(transcription);
  await finDeTransaction(transaction);
}

// Change le titre d'une transcription
export async function renommerTranscription(id, nouveauTitre) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readwrite");
  const tiroir = transaction.objectStore(TIROIR_TRANSCRIPTIONS);
  const transcription = await attendre(tiroir.get(id));
  if (transcription) {
    transcription.titre = nouveauTitre;
    tiroir.put(transcription);
  }
  await finDeTransaction(transaction);
}

// Supprime définitivement une transcription
export async function supprimerTranscription(id) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readwrite");
  transaction.objectStore(TIROIR_TRANSCRIPTIONS).delete(id);
  await finDeTransaction(transaction);
}

// Prépare un objet JSON prêt à être sauvegardé sur l'appareil
export async function exporterHistorique() {
  const transcriptions = await listerTranscriptions();
  return {
    application: "omni-transcripteur",
    version: 1,
    exporteLe: Date.now(),
    transcriptions: transcriptions.map(({ id, ...reste }) => reste),
  };
}

// Importe des transcriptions depuis une sauvegarde JSON sans écraser l'existant.
// Les transcriptions déjà présentes (même date, même titre, même nombre de phrases) sont ignorées.
export async function importerHistorique(donnees) {
  const liste = Array.isArray(donnees?.transcriptions)
    ? donnees.transcriptions
    : Array.isArray(donnees)
      ? donnees
      : null;
  if (!liste) throw new Error("Format de sauvegarde non reconnu.");

  const existantes = await listerTranscriptions();
  const empreinte = (t) => `${t.creeLe}|${t.titre}|${t.phrases.length}`;
  const dejaLa = new Set(existantes.map(empreinte));

  let ajoutees = 0;
  let ignorees = 0;
  let invalides = 0;

  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readwrite");
  const tiroir = transaction.objectStore(TIROIR_TRANSCRIPTIONS);

  for (const brut of liste) {
    const propre = normaliserTranscriptionImportee(brut);
    if (!propre) {
      invalides += 1;
      continue;
    }
    const cle = empreinte(propre);
    if (dejaLa.has(cle)) {
      ignorees += 1;
      continue;
    }
    dejaLa.add(cle);
    tiroir.add(propre);
    ajoutees += 1;
  }
  await finDeTransaction(transaction);
  return { ajoutees, ignorees, invalides };
}
