// ==========================================================
// Export des transcriptions en plusieurs formats :
//   - Texte brut (.txt), avec ou sans horodatages ;
//   - Markdown (.md), prêt pour Omni-Notes ou un compte-rendu JDR ;
//   - Sous-titres vidéo (.srt et .vtt), découpés en lignes lisibles
//     (2 lignes de 42 caractères au maximum par sous-titre).
//
// Ce fichier ne touche pas à l'écran : il est facile à tester.
// ==========================================================

import { LANGUES, QUALITES } from "../config.js";
import { formaterHorodatage, formaterDuree, formaterDate } from "./format.js";

const CARACTERES_PAR_LIGNE = 42;
const LIGNES_MAX = 2;
const DUREE_MIN_SOUS_TITRE = 0.5; // secondes

function avecIntervenants(t) {
  return Array.isArray(t?.intervenants) && t.intervenants.length > 0;
}

function nomIntervenant(t, numero) {
  return t?.intervenants?.[numero]?.nom || `Intervenant ${numero + 1}`;
}

// Ligne d'informations : date · durée · langue · qualité · intervenants
export function decrireTranscription(t) {
  const langue = LANGUES.find((l) => l.code === t.langue)?.nom ?? t.langue;
  const parties = [formaterDate(t.creeLe), formaterDuree(t.duree), langue];
  if (QUALITES[t.qualite]) parties.push(`qualité ${QUALITES[t.qualite].nom}`);
  if (avecIntervenants(t)) {
    const n = new Set(t.phrases.map((p) => p.intervenant ?? 0)).size;
    parties.push(`${n} intervenant${n > 1 ? "s" : ""}`);
  }
  if (t.interrompue) parties.push("interrompue");
  return parties.join(" · ");
}

/**
 * Version texte simple (.txt ou presse-papiers).
 * @param {object} transcription
 * @param {{avecEntete?: boolean, avecHorodatages?: boolean}} [options]
 */
export function enTexteBrut(transcription, { avecEntete = false, avecHorodatages = true } = {}) {
  const voix = avecIntervenants(transcription);
  const lignes = (transcription.phrases || []).map((p) => {
    const heure = avecHorodatages ? `[${formaterHorodatage(p.debut)}] ` : "";
    const qui = voix ? `${nomIntervenant(transcription, p.intervenant ?? 0)} : ` : "";
    return `${heure}${qui}${p.texte}`;
  });
  if (!avecEntete) return lignes.join("\n");
  return [transcription.titre, decrireTranscription(transcription), "", ...lignes, ""].join("\n");
}

/**
 * Version Markdown (.md), regroupée par intervenant si la diarisation a été faite.
 * @param {object} transcription
 * @param {{avecHorodatages?: boolean}} [options]
 */
export function enMarkdown(transcription, { avecHorodatages = true } = {}) {
  const sorties = [`# ${transcription.titre}`, "", `*${decrireTranscription(transcription)}*`, ""];
  const phrases = transcription.phrases || [];

  if (avecIntervenants(transcription)) {
    let courant = null;
    for (const p of phrases) {
      const idx = p.intervenant ?? 0;
      if (!courant || courant.intervenant !== idx) {
        if (courant) sorties.push("");
        const heure = avecHorodatages ? ` *(${formaterHorodatage(p.debut)})*` : "";
        sorties.push(`**${nomIntervenant(transcription, idx)}**${heure}`);
        courant = { intervenant: idx };
      }
      sorties.push(p.texte);
    }
    sorties.push("");
    return sorties.join("\n");
  }

  for (const p of phrases) {
    const heure = avecHorodatages ? `**[${formaterHorodatage(p.debut)}]** ` : "";
    sorties.push(`${heure}${p.texte}`, "");
  }
  return sorties.join("\n");
}

/**
 * Formate un instant en « HH:MM:SS,mmm » (SRT) ou « HH:MM:SS.mmm » (VTT).
 * Arrondit aux millisecondes en une fois pour éviter les dépassements (ex. 1000 ms).
 */
export function formaterTempsSousTitre(secondes, separateur = ",") {
  const totalMs = Math.max(0, Math.round((secondes || 0) * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor((totalSec % 3600) / 60);
  const h = Math.floor(totalSec / 3600);
  const deux = (n) => String(n).padStart(2, "0");
  const trois = (n) => String(n).padStart(3, "0");
  return `${deux(h)}:${deux(m)}:${deux(s)}${separateur}${trois(ms)}`;
}

/**
 * Prépare la liste des sous-titres (horodatés, découpés en 2 lignes lisibles max,
 * sans chevauchement entre deux sous-titres consécutifs).
 * @param {object} transcription
 * @param {{inclureIntervenants?: boolean, caracteresParLigne?: number, lignesMax?: number}} [options]
 * @returns {Array<{debut: number, fin: number, texte: string}>}
 */
export function preparerSousTitres(
  transcription,
  { inclureIntervenants = true, caracteresParLigne = CARACTERES_PAR_LIGNE, lignesMax = LIGNES_MAX } = {}
) {
  const voix = inclureIntervenants && avecIntervenants(transcription);
  const cues = [];

  for (const phrase of transcription.phrases || []) {
    const textePropre = (phrase.texte || "").replace(/\s+/g, " ").trim();
    if (!textePropre) continue;

    const prefixe = voix ? `${nomIntervenant(transcription, phrase.intervenant ?? 0)} : ` : "";
    const complet = `${prefixe}${textePropre}`;
    const debut = Math.max(0, Number.isFinite(phrase.debut) ? phrase.debut : 0);
    const fin = Math.max(
      debut + DUREE_MIN_SOUS_TITRE,
      Number.isFinite(phrase.fin) && phrase.fin > debut ? phrase.fin : debut + Math.max(2, complet.length / 15)
    );

    const blocs = decouperEnSousTitres(complet, caracteresParLigne, lignesMax);
    const longueurTotale = blocs.reduce((s, b) => s + b.length, 0) || 1;
    let instant = debut;

    for (const bloc of blocs) {
      const duree = ((fin - debut) * bloc.length) / longueurTotale;
      const finBloc = instant + Math.max(DUREE_MIN_SOUS_TITRE, duree);
      const debutAjuste = cues.length > 0 ? Math.max(instant, cues.at(-1).fin) : instant;
      const finAjustee = Math.max(debutAjuste + DUREE_MIN_SOUS_TITRE, finBloc);
      cues.push({
        debut: debutAjuste,
        fin: finAjustee,
        texte: bloc,
      });
      instant += duree;
    }
  }
  return cues;
}

/**
 * Exporte la transcription au format SubRip (.srt), compatible avec tous les lecteurs
 * vidéo (VLC, YouTube, logiciels de montage…).
 */
export function enSrt(transcription, options = {}) {
  const cues = preparerSousTitres(transcription, options);
  return cues
    .map(
      (c, index) =>
        `${index + 1}\n${formaterTempsSousTitre(c.debut, ",")} --> ${formaterTempsSousTitre(c.fin, ",")}\n${c.texte}`
    )
    .join("\n\n") + (cues.length > 0 ? "\n" : "");
}

/**
 * Exporte la transcription au format WebVTT (.vtt), le standard du web.
 */
export function enVtt(transcription, options = {}) {
  const cues = preparerSousTitres(transcription, options);
  const corps = cues
    .map((c) => `${formaterTempsSousTitre(c.debut, ".")} --> ${formaterTempsSousTitre(c.fin, ".")}\n${c.texte}`)
    .join("\n\n");
  return corps ? `WEBVTT\n\n${corps}\n` : "WEBVTT\n";
}

// Découpe un texte en sous-titres d'au plus « lignesMax » lignes de « maxParLigne » caractères
function decouperEnSousTitres(texte, maxParLigne, lignesMax) {
  const lignes = envelopperEnLignes(texte, maxParLigne);
  const blocs = [];
  for (let i = 0; i < lignes.length; i += lignesMax) {
    const groupe = lignes.slice(i, i + lignesMax);
    if (groupe.length === 2) {
      blocs.push(equilibrerDeuxLignes(groupe.join(" "), maxParLigne));
    } else {
      blocs.push(groupe.join("\n"));
    }
  }
  return blocs;
}

// Coupe un texte en lignes d'au plus « maxParLigne » caractères sans couper les mots
function envelopperEnLignes(texte, maxParLigne) {
  const mots = texte.split(" ");
  const lignes = [];
  let courante = "";
  for (const mot of mots) {
    if (!courante) {
      courante = mot;
    } else if (courante.length + 1 + mot.length <= maxParLigne) {
      courante += " " + mot;
    } else {
      lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

// Rééquilibre deux lignes autour du milieu tout en respectant « maxParLigne » sur chaque ligne
function equilibrerDeuxLignes(bloc, maxParLigne) {
  if (bloc.length <= maxParLigne) return bloc;
  const milieu = Math.floor(bloc.length / 2);
  let coupure = -1;
  let meilleureDistance = Infinity;
  for (let i = 1; i < bloc.length - 1; i++) {
    if (bloc[i] !== " ") continue;
    const gauche = i;
    const droite = bloc.length - i - 1;
    if (gauche <= maxParLigne && droite <= maxParLigne) {
      const dist = Math.abs(i - milieu);
      if (dist < meilleureDistance) {
        meilleureDistance = dist;
        coupure = i;
      }
    }
  }
  if (coupure !== -1) {
    return `${bloc.slice(0, coupure)}\n${bloc.slice(coupure + 1)}`;
  }
  return envelopperEnLignes(bloc, maxParLigne).join("\n");
}
