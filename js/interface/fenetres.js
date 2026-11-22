// ==========================================================
// Fenêtres de dialogue accessibles (<dialog>) de l'application.
//
// Elles remplacent les fenêtres « prompt() » et « confirm() »
// du navigateur : elles sont plus lisibles sur téléphone,
// respectent le thème de l'application, gèrent la touche Échap
// et ne gèlent pas la page pendant une capture en direct.
// ==========================================================

const $ = (id) => document.getElementById(id);

/**
 * Demande une confirmation (Oui / Annuler).
 * @param {object} options
 * @param {string} options.titre
 * @param {string} options.texte
 * @param {string} [options.libelleConfirmer="Confirmer"]
 * @param {string} [options.libelleAnnuler="Annuler"]
 * @returns {Promise<boolean>}
 */
export function demanderConfirmation({
  titre,
  texte,
  libelleConfirmer = "Confirmer",
  libelleAnnuler = "Annuler",
}) {
  return ouvrirDialogue({
    titre,
    texte,
    libelleValider: libelleConfirmer,
    libelleAnnuler,
    mode: "confirmation",
  });
}

/**
 * Demande un court texte (ex. renommer une transcription ou un intervenant).
 * @param {object} options
 * @param {string} options.titre
 * @param {string} options.etiquette
 * @param {string} [options.valeurInitiale=""]
 * @param {number} [options.maxLength=80]
 * @param {string} [options.libelleValider="Enregistrer"]
 * @returns {Promise<string|null>} le texte saisi (nettoyé), ou null si annulé
 */
export function demanderTexte({
  titre,
  etiquette,
  valeurInitiale = "",
  maxLength = 80,
  libelleValider = "Enregistrer",
}) {
  return ouvrirDialogue({
    titre,
    etiquette,
    valeurInitiale,
    maxLength,
    libelleValider,
    libelleAnnuler: "Annuler",
    mode: "texte",
  });
}

/**
 * Propose de choisir vers quel intervenant fusionner « nomSource ».
 * @param {object} options
 * @param {string} options.nomSource nom de l'intervenant à fusionner
 * @param {Array<{indice: number, nom: string}>} options.cibles autres intervenants possibles
 * @returns {Promise<number|null>} indice de l'intervenant cible, ou null si annulé
 */
export function demanderFusion({ nomSource, cibles }) {
  return ouvrirDialogue({
    titre: `Fusionner « ${nomSource} »`,
    texte:
      `Toutes les phrases attribuées à « ${nomSource} » seront regroupées sous la personne choisie ci-dessous, ` +
      `et « ${nomSource} » sera retiré de la liste.`,
    etiquette: "Fusionner dans :",
    cibles,
    libelleValider: "Fusionner",
    libelleAnnuler: "Annuler",
    mode: "fusion",
  });
}

function ouvrirDialogue({
  titre,
  texte = "",
  etiquette = "",
  valeurInitiale = "",
  maxLength = 80,
  cibles = [],
  libelleValider = "Valider",
  libelleAnnuler = "Annuler",
  mode,
}) {
  const fenetre = $("fenetre-dialogue");
  const elTitre = $("dialogue-titre");
  const elTexte = $("dialogue-texte");
  const formulaire = $("dialogue-formulaire");
  const zoneChamp = $("dialogue-zone-champ");
  const elEtiquette = $("dialogue-etiquette");
  const champ = $("dialogue-champ");
  const zoneChoix = $("dialogue-zone-choix");
  const elEtiquetteChoix = $("dialogue-etiquette-choix");
  const choix = $("dialogue-choix");
  const boutonValider = $("dialogue-valider");
  const boutonAnnuler = $("dialogue-annuler");

  elTitre.textContent = titre;
  elTexte.textContent = texte;
  elTexte.hidden = !texte;

  zoneChamp.hidden = mode !== "texte";
  zoneChoix.hidden = mode !== "fusion";

  if (mode === "texte") {
    elEtiquette.textContent = etiquette;
    champ.maxLength = maxLength;
    champ.value = valeurInitiale;
  } else if (mode === "fusion") {
    elEtiquetteChoix.textContent = etiquette;
    choix.replaceChildren();
    for (const c of cibles) {
      choix.add(new Option(c.nom, String(c.indice)));
    }
  }

  boutonValider.textContent = libelleValider;
  boutonAnnuler.textContent = libelleAnnuler;

  return new Promise((resoudre) => {
    const finir = (reponse) => {
      formulaire.removeEventListener("submit", surValidation);
      boutonAnnuler.removeEventListener("click", surAnnuler);
      fenetre.removeEventListener("cancel", surAnnuler);
      if (fenetre.open) fenetre.close();
      resoudre(reponse);
    };

    const surValidation = (e) => {
      e.preventDefault();
      if (mode === "confirmation") {
        finir(true);
      } else if (mode === "texte") {
        const propre = champ.value.replace(/\s+/g, " ").trim().slice(0, maxLength);
        finir(propre || null);
      } else if (mode === "fusion") {
        const val = Number(choix.value);
        finir(Number.isInteger(val) ? val : null);
      }
    };

    const surAnnuler = (e) => {
      e?.preventDefault?.();
      finir(mode === "confirmation" ? false : null);
    };

    formulaire.addEventListener("submit", surValidation);
    boutonAnnuler.addEventListener("click", surAnnuler);
    fenetre.addEventListener("cancel", surAnnuler); // touche Échap

    fenetre.showModal();
    if (mode === "texte") {
      champ.focus();
      champ.select();
    } else if (mode === "fusion") {
      choix.focus();
    } else {
      boutonValider.focus();
    }
  });
}
