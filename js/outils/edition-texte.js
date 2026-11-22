// ==========================================================
// Petits outils purs pour l'édition des transcriptions :
//   - fusionner deux intervenants ;
//   - rechercher et remplacer du texte dans les phrases ;
//   - valider des transcriptions importées depuis une sauvegarde JSON.
//
// Ce fichier ne touche pas à l'écran : il est facile à tester.
// ==========================================================

/**
 * Fusionne l'intervenant « source » dans « cible » et retire « source » de la liste.
 * Toutes les phrases de « source » passent à « cible », et les numéros supérieurs
 * à « source » sont décalés de 1 pour ne laisser aucun trou.
 * @param {object} transcription
 * @param {number} source indice de l'intervenant supprimé
 * @param {number} cible indice de l'intervenant conservé
 * @returns {number} nouvel indice de l'intervenant conservé (ou -1 si impossible)
 */
export function fusionnerIntervenants(transcription, source, cible) {
  const liste = transcription?.intervenants;
  if (!Array.isArray(liste) || source === cible) return -1;
  if (source < 0 || source >= liste.length || cible < 0 || cible >= liste.length) return -1;

  for (const phrase of transcription.phrases || []) {
    const actuel = phrase.intervenant ?? 0;
    if (actuel === source) phrase.intervenant = cible;
  }

  liste.splice(source, 1);

  for (const phrase of transcription.phrases || []) {
    const actuel = phrase.intervenant ?? 0;
    if (actuel > source) phrase.intervenant = actuel - 1;
  }

  return cible > source ? cible - 1 : cible;
}

// Échappe les caractères spéciaux d'une expression régulière (., ?, +, *…)
function echapperMotif(texte) {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compte le nombre d'occurrences et le nombre de phrases contenant « recherche ».
 * @param {Array<{texte:string}>} phrases
 * @param {string} recherche
 * @param {{respecterCasse?: boolean}} [options]
 * @returns {{occurrences: number, phrasesTouchees: number}}
 */
export function compterOccurrences(phrases, recherche, { respecterCasse = false } = {}) {
  if (!recherche) return { occurrences: 0, phrasesTouchees: 0 };
  const motif = new RegExp(echapperMotif(recherche), respecterCasse ? "g" : "gi");
  let occurrences = 0;
  let phrasesTouchees = 0;
  for (const p of phrases || []) {
    const trouves = (p.texte || "").match(motif);
    if (trouves && trouves.length > 0) {
      occurrences += trouves.length;
      phrasesTouchees += 1;
    }
  }
  return { occurrences, phrasesTouchees };
}

/**
 * Remplace toutes les occurrences de « recherche » par « remplacement » dans les phrases.
 * Modifie les phrases sur place et renvoie le nombre de remplacements effectués.
 * @param {Array<{texte:string}>} phrases
 * @param {string} recherche
 * @param {string} remplacement
 * @param {{respecterCasse?: boolean}} [options]
 * @returns {number} nombre de remplacements effectués
 */
export function remplacerDansPhrases(phrases, recherche, remplacement, { respecterCasse = false } = {}) {
  if (!recherche) return 0;
  const motif = new RegExp(echapperMotif(recherche), respecterCasse ? "g" : "gi");
  let total = 0;
  for (const p of phrases || []) {
    const avant = p.texte || "";
    let nb = 0;
    // Fonction en 2e argument pour éviter que « $& » ou « $1 » dans le remplacement soit interprété
    const apres = avant.replace(motif, () => {
      nb += 1;
      return remplacement;
    });
    if (nb > 0) {
      p.texte = apres;
      total += nb;
    }
  }
  return total;
}

/**
 * Vérifie et nettoie une transcription venant d'un fichier JSON de sauvegarde.
 * Renvoie un objet propre prêt pour IndexedDB (sans ancien « id »), ou null si invalide.
 * @param {unknown} brut
 * @returns {object|null}
 */
export function normaliserTranscriptionImportee(brut) {
  if (!brut || typeof brut !== "object" || !Array.isArray(brut.phrases)) return null;
  const phrases = [];
  for (const p of brut.phrases) {
    if (!p || typeof p !== "object" || typeof p.texte !== "string") continue;
    const texte = p.texte.trim();
    if (!texte) continue;
    const phrase = {
      debut: Number.isFinite(p.debut) ? Math.max(0, p.debut) : 0,
      fin: Number.isFinite(p.fin) ? Math.max(0, p.fin) : 0,
      texte,
    };
    if (Number.isInteger(p.intervenant) && p.intervenant >= 0) {
      phrase.intervenant = p.intervenant;
    }
    phrases.push(phrase);
  }
  if (phrases.length === 0) return null;

  const propre = {
    titre: typeof brut.titre === "string" && brut.titre.trim() ? brut.titre.trim().slice(0, 120) : "Transcription importée",
    creeLe: Number.isFinite(brut.creeLe) ? brut.creeLe : Date.now(),
    duree: Number.isFinite(brut.duree) && brut.duree >= 0 ? brut.duree : 0,
    source: ["micro", "fichier", "capture"].includes(brut.source) ? brut.source : "fichier",
    langue: typeof brut.langue === "string" && brut.langue.trim() ? brut.langue.trim() : "fr",
    qualite: typeof brut.qualite === "string" ? brut.qualite : "equilibre",
    phrases,
    interrompue: brut.interrompue === true,
  };

  if (Array.isArray(brut.intervenants) && brut.intervenants.length > 0) {
    propre.intervenants = brut.intervenants
      .filter((i) => i && typeof i === "object")
      .map((i, idx) => ({
        nom: typeof i.nom === "string" && i.nom.trim() ? i.nom.trim().slice(0, 40) : `Intervenant ${idx + 1}`,
      }));
  }

  return propre;
}
