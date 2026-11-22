// ==========================================================
// Correction des intervenants dans la carte « Résultat » :
//   - la liste des intervenants, avec un bouton « Renommer » pour chacun ;
//   - le mode « Corriger qui parle » : devant chaque phrase, une liste
//     permet de choisir la bonne personne.
// Les changements s'appliquent partout (texte, copie, export, historique),
// car le nom n'est rangé qu'à un seul endroit : transcription.intervenants.
// ==========================================================

import { formaterHorodatage } from "../outils/format.js";
import { demanderTexte } from "./fenetres.js";

// Nombre maximal d'intervenants (une couleur différente pour chacun)
export const INTERVENANTS_MAX = 8;

const NOUVEL_INTERVENANT = "nouveau";

// Nom affiché d'un intervenant (« Intervenant 1 » par défaut)
export function nomIntervenant(t, numero) {
  return t.intervenants?.[numero]?.nom || `Intervenant ${numero + 1}`;
}

// Couleur d'un intervenant (variables --voix-0 à --voix-7 de style.css)
export function couleurIntervenant(numero) {
  return `var(--voix-${(numero ?? 0) % INTERVENANTS_MAX})`;
}

// Pastille de couleur (décorative : le nom est toujours écrit à côté)
export function creerPastille() {
  const pastille = document.createElement("span");
  pastille.className = "pastille";
  pastille.setAttribute("aria-hidden", "true");
  return pastille;
}

function texteComptePhrases(nbPhrases) {
  return nbPhrases === 0 ? " (aucune phrase)" : ` (${nbPhrases} phrase${nbPhrases > 1 ? "s" : ""})`;
}

/**
 * Met à jour uniquement le nombre de phrases de chaque intervenant dans la légende,
 * sans reconstruire toute la page (conserve le focus clavier en mode correction).
 */
export function majCompteursLegende(conteneur, t) {
  const comptes = new Array(t.intervenants.length).fill(0);
  for (const p of t.phrases) {
    const idx = p.intervenant ?? 0;
    if (idx >= 0 && idx < comptes.length) comptes[idx] += 1;
  }
  conteneur.querySelectorAll("[data-intervenant-compte]").forEach((el) => {
    const numero = Number(el.dataset.intervenantCompte);
    el.textContent = texteComptePhrases(comptes[numero] ?? 0);
  });
}

/**
 * Liste des intervenants avec « Renommer » / « Fusionner », et bouton du mode correction.
 * @param {object} t transcription affichée
 * @param {object} options
 * @param {boolean} options.enCorrection le mode « Corriger qui parle » est-il actif ?
 * @param {(numero:number) => void} options.surRenommer
 * @param {(numero:number) => void} options.surFusionner
 * @param {() => void} options.surBasculerCorrection
 */
export function creerLegende(t, { enCorrection, surRenommer, surFusionner, surBasculerCorrection }) {
  const legende = document.createElement("div");
  legende.className = "legende-voix";

  const titre = document.createElement("p");
  titre.className = "legende-voix__titre";
  titre.textContent = "Intervenants";
  const liste = document.createElement("ul");

  t.intervenants.forEach((_, numero) => {
    const element = document.createElement("li");
    element.style.setProperty("--couleur-voix", couleurIntervenant(numero));

    const nom = document.createElement("span");
    nom.className = "legende-voix__nom";
    const nbPhrases = t.phrases.filter((p) => (p.intervenant ?? 0) === numero).length;
    const compte = document.createElement("span");
    compte.className = "petit";
    compte.dataset.intervenantCompte = String(numero);
    compte.textContent = texteComptePhrases(nbPhrases);
    nom.append(creerPastille(), nomIntervenant(t, numero), compte);

    const actions = document.createElement("div");
    actions.className = "legende-voix__actions";

    const boutonRenommer = document.createElement("button");
    boutonRenommer.type = "button";
    boutonRenommer.className = "bouton bouton--petit";
    boutonRenommer.textContent = "✏️ Renommer";
    boutonRenommer.setAttribute("aria-label", `Renommer « ${nomIntervenant(t, numero)} »`);
    boutonRenommer.addEventListener("click", () => surRenommer(numero));
    actions.append(boutonRenommer);

    if (t.intervenants.length > 1 && surFusionner) {
      const boutonFusionner = document.createElement("button");
      boutonFusionner.type = "button";
      boutonFusionner.className = "bouton bouton--petit bouton--discret";
      boutonFusionner.textContent = "🔗 Fusionner";
      boutonFusionner.setAttribute("aria-label", `Fusionner « ${nomIntervenant(t, numero)} » avec un autre intervenant`);
      boutonFusionner.addEventListener("click", () => surFusionner(numero));
      actions.append(boutonFusionner);
    }

    element.append(nom, actions);
    liste.append(element);
  });

  const basculer = document.createElement("button");
  basculer.type = "button";
  basculer.className = enCorrection ? "bouton bouton--principal bouton--petit" : "bouton bouton--petit";
  basculer.textContent = enCorrection ? "✓ Terminer la correction" : "🔀 Corriger qui parle";
  basculer.addEventListener("click", () => surBasculerCorrection());

  const aide = document.createElement("p");
  aide.className = "petit";
  aide.textContent = enCorrection
    ? "Pour chaque phrase mal attribuée, choisissez la bonne personne dans la liste. " +
      "Les changements sont enregistrés tout de suite."
    : "Une phrase est attribuée à la mauvaise personne ? Touchez « Corriger qui parle ».";

  legende.append(titre, liste, basculer, aide);
  return legende;
}

/**
 * Une phrase en mode correction : liste « qui parle » + heure + texte.
 * @param {object} t transcription
 * @param {object} phrase
 * @param {number} indexPhrase position de la phrase dans t.phrases
 * @param {(numero:number|"nouveau", ligne:HTMLElement, indexPhrase:number) => void} surChanger
 */
export function creerLigneCorrigible(t, phrase, indexPhrase, surChanger) {
  const ligne = document.createElement("div");
  ligne.className = "ligne-corrigible";
  ligne.dataset.indexPhrase = String(indexPhrase);
  const numero = phrase.intervenant ?? 0;
  ligne.style.setProperty("--couleur-voix", couleurIntervenant(numero));

  const choix = document.createElement("select");
  choix.className = "liste-deroulante liste-deroulante--petite";
  choix.setAttribute("aria-label", `Qui dit : « ${phrase.texte.slice(0, 60)} » ?`);
  t.intervenants.forEach((_, n) => choix.add(new Option(nomIntervenant(t, n), String(n))));
  if (t.intervenants.length < INTERVENANTS_MAX) {
    choix.add(new Option("➕ Nouvel intervenant", NOUVEL_INTERVENANT));
  }
  choix.value = String(numero);
  choix.addEventListener("change", () => {
    surChanger(choix.value === NOUVEL_INTERVENANT ? NOUVEL_INTERVENANT : Number(choix.value), ligne, indexPhrase);
  });

  const texte = document.createElement("p");
  const heure = document.createElement("time");
  heure.textContent = formaterHorodatage(phrase.debut);
  texte.append(heure, " ", phrase.texte);

  ligne.append(choix, texte);
  return ligne;
}

/**
 * Demande un nouveau nom dans une fenêtre de dialogue accessible.
 * @returns {Promise<string|null>} le nom choisi, ou null si annulé
 */
export function demanderNom(nomActuel) {
  return demanderTexte({
    titre: "Renommer l'intervenant",
    etiquette: "Nouveau nom (il sera changé partout dans ce texte)",
    valeurInitiale: nomActuel,
    maxLength: 40,
    libelleValider: "Renommer",
  });
}

// Change l'intervenant d'une phrase ; « nouveau » ajoute un intervenant.
// Renvoie vrai si un nouvel intervenant a été créé.
export function changerIntervenant(t, phrase, choix) {
  if (choix === NOUVEL_INTERVENANT) {
    // Numéro suivant : « Intervenant 3 » après « Intervenant 2 » (même si le 1 a été renommé)
    const noms = t.intervenants.map((i) => i.nom);
    const numeros = noms.map((nom) => Number(/^Intervenant (\d+)$/.exec(nom)?.[1] ?? 0));
    const plusGrand = Math.max(...numeros);
    let k = plusGrand > 0 ? plusGrand + 1 : t.intervenants.length + 1;
    while (noms.includes(`Intervenant ${k}`)) k++;
    t.intervenants.push({ nom: `Intervenant ${k}` });
    phrase.intervenant = t.intervenants.length - 1;
    return true;
  }
  phrase.intervenant = choix;
  return false;
}
