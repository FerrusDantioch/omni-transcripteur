// ==========================================================
// Carte « Résultat » : texte horodaté, boutons Copier,
// Télécharger (.txt) et Effacer. Si les intervenants ont été reconnus,
// le texte est présenté par blocs : un bloc par prise de parole, et
// on peut renommer les intervenants ou corriger qui parle.
// ==========================================================

import { formaterHorodatage, nomDeFichier } from "../outils/format.js";
import {
  fusionnerIntervenants,
  compterOccurrences,
  remplacerDansPhrases,
} from "../outils/edition-texte.js";
import {
  decrireTranscription,
  enTexteBrut,
  enMarkdown,
  enSrt,
  enVtt,
} from "../outils/export-texte.js";
import { afficherMessage, cacherMessage } from "./messages.js";
import { demanderConfirmation, demanderFusion } from "./fenetres.js";
import {
  nomIntervenant,
  couleurIntervenant,
  creerPastille,
  creerLegende,
  majCompteursLegende,
  creerLigneCorrigible,
  demanderNom,
  changerIntervenant,
} from "./edition-intervenants.js";

const $ = (id) => document.getElementById(id);

/**
 * @param {object} options
 * @param {(transcription:object) => Promise<void>} options.surModification
 *        appelée après un renommage, une fusion ou une correction (pour l'enregistrer)
 */
export function creerCarteResultat({ surModification }) {
  const carte = $("carte-resultat");
  const titre = $("resultat-titre");
  const infos = $("resultat-infos");
  const zoneIntervenants = $("resultat-intervenants");
  const barreOutils = $("resultat-outils");
  const boutonEditerTexte = $("bouton-editer-texte");
  const boutonRechercher = $("bouton-rechercher");
  const zoneRecherche = $("zone-recherche");
  const champRecherche = $("champ-recherche");
  const compteurRecherche = $("recherche-compteur");
  const caseFiltrer = $("recherche-filtrer");
  const caseCasse = $("recherche-casse");
  const champRemplacement = $("champ-remplacement");
  const boutonRemplacerTout = $("bouton-remplacer-tout");
  const zoneTexte = $("resultat-texte");
  const boutonCopier = $("bouton-copier");
  const boutonTelecharger = $("bouton-telecharger-txt");
  const boutonExports = $("bouton-exports");
  const zoneExports = $("zone-exports");
  const caseHorodatages = $("export-horodatages");
  const ligneExportIntervenants = $("export-intervenants-ligne");
  const caseExportIntervenants = $("export-intervenants");
  const boutonSrt = $("bouton-telecharger-srt");
  const boutonVtt = $("bouton-telecharger-vtt");
  const boutonMd = $("bouton-telecharger-md");
  const boutonEffacer = $("bouton-effacer");
  const message = $("resultat-message");

  let transcriptionAffichee = null;
  let enCorrection = false;   // mode « Corriger qui parle »
  let enEditionTexte = false; // mode « Modifier le texte »
  let enCoursActuel = false;

  function telechargerTexte(contenu, extension, typeMime, libelle) {
    const fichier = new Blob([contenu], { type: `${typeMime};charset=utf-8` });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(fichier);
    lien.download = nomDeFichier(transcriptionAffichee.titre, extension);
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
    afficherMessage(message, `✓ ${libelle} enregistré dans tes téléchargements.`, "succes");
  }

  boutonCopier.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(
        enTexteBrut(transcriptionAffichee, { avecEntete: false, avecHorodatages: caseHorodatages.checked })
      );
      afficherMessage(message, "✓ Texte copié. Tu peux le coller où tu veux.", "succes");
    } catch {
      afficherMessage(message, "La copie n'a pas fonctionné. Sélectionne le texte à la main.", "erreur");
    }
  });

  boutonTelecharger.addEventListener("click", () => {
    const contenu = enTexteBrut(transcriptionAffichee, {
      avecEntete: true,
      avecHorodatages: caseHorodatages.checked,
    });
    telechargerTexte(contenu, "txt", "text/plain", "Fichier texte (.txt)");
  });

  boutonExports.addEventListener("click", () => {
    const ouvrir = zoneExports.hidden;
    zoneExports.hidden = !ouvrir;
    boutonExports.setAttribute("aria-expanded", String(ouvrir));
  });

  boutonSrt.addEventListener("click", () => {
    const contenu = enSrt(transcriptionAffichee, { inclureIntervenants: caseExportIntervenants.checked });
    telechargerTexte(contenu, "srt", "application/x-subrip", "Sous-titres (.srt)");
  });

  boutonVtt.addEventListener("click", () => {
    const contenu = enVtt(transcriptionAffichee, { inclureIntervenants: caseExportIntervenants.checked });
    telechargerTexte(contenu, "vtt", "text/vtt", "Sous-titres (.vtt)");
  });

  boutonMd.addEventListener("click", () => {
    const contenu = enMarkdown(transcriptionAffichee, { avecHorodatages: caseHorodatages.checked });
    telechargerTexte(contenu, "md", "text/markdown", "Fichier Markdown (.md)");
  });

  boutonEffacer.addEventListener("click", () => {
    const etaitEnregistree = transcriptionAffichee?.id !== undefined;
    effacer();
    if (etaitEnregistree) {
      // Le message de la carte disparaît avec elle : on prévient via l'historique
      afficherMessage(
        $("historique-message"),
        "Le texte a été retiré de l'écran. Il reste disponible dans l'historique.",
        "info"
      );
    }
  });

  boutonEditerTexte.addEventListener("click", () => {
    if (!transcriptionAffichee || enCoursActuel) return;
    enEditionTexte = !enEditionTexte;
    if (enEditionTexte) enCorrection = false;
    afficher(transcriptionAffichee);
    if (!enEditionTexte) afficherMessage(message, "✓ Modification du texte terminée.", "succes");
  });

  boutonRechercher.addEventListener("click", () => {
    const ouvrir = zoneRecherche.hidden;
    zoneRecherche.hidden = !ouvrir;
    boutonRechercher.setAttribute("aria-expanded", String(ouvrir));
    if (ouvrir) {
      majRecherche();
      champRecherche.focus();
    } else if (caseFiltrer.checked) {
      caseFiltrer.checked = false;
      dessinerTexte();
    }
  });

  champRecherche.addEventListener("input", () => {
    majRecherche();
    if (caseFiltrer.checked) dessinerTexte();
  });
  caseCasse.addEventListener("change", () => {
    majRecherche();
    if (caseFiltrer.checked) dessinerTexte();
  });
  caseFiltrer.addEventListener("change", () => dessinerTexte());

  boutonRemplacerTout.addEventListener("click", async () => {
    const t = transcriptionAffichee;
    const recherche = champRecherche.value;
    const remplacement = champRemplacement.value;
    if (!t || !recherche) return;
    const options = { respecterCasse: caseCasse.checked };
    const { occurrences } = compterOccurrences(t.phrases, recherche, options);
    if (occurrences === 0) return;

    const ok = await demanderConfirmation({
      titre: "Remplacer tout",
      texte: `Remplacer « ${recherche} » par « ${remplacement} » (${occurrences} fois dans ce texte) ?`,
      libelleConfirmer: "Remplacer tout",
    });
    if (!ok) return;

    const nb = remplacerDansPhrases(t.phrases, recherche, remplacement, options);
    dessinerTexte();
    majRecherche();
    await enregistrer(`✓ ${nb} remplacement${nb > 1 ? "s" : ""} effectué${nb > 1 ? "s" : ""}.`);
  });

  function majRecherche() {
    const t = transcriptionAffichee;
    const terme = champRecherche.value;
    if (!t || !terme) {
      compteurRecherche.textContent = "";
      boutonRemplacerTout.disabled = true;
      return;
    }
    const { occurrences, phrasesTouchees } = compterOccurrences(t.phrases, terme, {
      respecterCasse: caseCasse.checked,
    });
    compteurRecherche.textContent =
      occurrences === 0
        ? "Aucune correspondance trouvée."
        : `${occurrences} occurrence${occurrences > 1 ? "s" : ""} dans ${phrasesTouchees} phrase${phrasesTouchees > 1 ? "s" : ""}.`;
    boutonRemplacerTout.disabled = occurrences === 0;
  }

  function fermerRecherche() {
    zoneRecherche.hidden = true;
    boutonRechercher.setAttribute("aria-expanded", "false");
    champRecherche.value = "";
    champRemplacement.value = "";
    caseFiltrer.checked = false;
    caseCasse.checked = false;
    compteurRecherche.textContent = "";
    boutonRemplacerTout.disabled = true;
  }

  function effacer() {
    transcriptionAffichee = null;
    enCorrection = false;
    enEditionTexte = false;
    enCoursActuel = false;
    fermerRecherche();
    zoneExports.hidden = true;
    boutonExports.setAttribute("aria-expanded", "false");
    zoneTexte.replaceChildren();
    zoneIntervenants.replaceChildren();
    barreOutils.hidden = true;
    carte.hidden = true;
  }

  function phrasesVisibles(t) {
    const terme = !zoneRecherche.hidden && caseFiltrer.checked ? champRecherche.value : "";
    const entrees = t.phrases.map((phrase, index) => ({ phrase, index }));
    if (!terme) return entrees;
    const aiguille = caseCasse.checked ? terme : terme.toLowerCase();
    return entrees.filter(({ phrase }) => {
      const foin = caseCasse.checked ? phrase.texte : phrase.texte.toLowerCase();
      return foin.includes(aiguille);
    });
  }

  function dessinerTexte() {
    const t = transcriptionAffichee;
    if (!t) return;
    const modifiable = !enCoursActuel && t.phrases.length > 0;
    const visibles = phrasesVisibles(t);
    let lignes;

    if (modifiable && enEditionTexte) {
      lignes = visibles.map(({ phrase, index }) => creerLigneEditable(t, phrase, index, (nouveau) => editerPhrase(phrase, nouveau)));
    } else if (modifiable && avecIntervenants(t) && enCorrection) {
      lignes = visibles.map(({ phrase, index }) =>
        creerLigneCorrigible(t, phrase, index, (choix, ligne, idx) => corriger(phrase, choix, ligne, idx))
      );
    } else if (avecIntervenants(t)) {
      lignes = creerBlocs(t, visibles.map((v) => v.phrase));
    } else {
      lignes = visibles.map(({ phrase }) => creerLigne(phrase));
    }

    if (lignes.length === 0) {
      const vide = document.createElement("p");
      vide.className = "note";
      vide.textContent =
        t.phrases.length > 0
          ? "Aucune phrase ne correspond à ta recherche."
          : enCoursActuel
            ? "Le texte apparaîtra ici au fur et à mesure…"
            : "Aucune parole détectée.";
      lignes.push(vide);
    }
    zoneTexte.replaceChildren(...lignes);
  }

  /**
   * Affiche une transcription (en cours ou terminée)
   * @param {object} transcription voir js/stockage/historique.js
   * @param {{enCours?: boolean}} options
   */
  function afficher(transcription, { enCours = false } = {}) {
    if (transcription !== transcriptionAffichee) {
      enCorrection = false;
      enEditionTexte = false;
      fermerRecherche();
      zoneExports.hidden = true;
      boutonExports.setAttribute("aria-expanded", "false");
    }
    transcriptionAffichee = transcription;
    enCoursActuel = enCours;
    carte.hidden = false;
    titre.textContent = transcription.titre;
    infos.textContent = decrireTranscription(transcription) + (enCours ? " · transcription en cours…" : "");

    // Liste des intervenants (renommer, fusionner, corriger) : seulement une fois le texte terminé
    const modifiableIntervenants = avecIntervenants(transcription) && !enCours;
    zoneIntervenants.hidden = !modifiableIntervenants;
    ligneExportIntervenants.hidden = !modifiableIntervenants;
    zoneIntervenants.replaceChildren(
      ...(modifiableIntervenants
        ? [
            creerLegende(transcription, {
              enCorrection,
              surRenommer: renommer,
              surFusionner: fusionner,
              surBasculerCorrection: basculerCorrection,
            }),
          ]
        : [])
    );

    const outilsVisibles = !enCours && transcription.phrases.length > 0;
    barreOutils.hidden = !outilsVisibles;
    boutonEditerTexte.setAttribute("aria-pressed", String(enEditionTexte));
    boutonEditerTexte.className = enEditionTexte ? "bouton bouton--principal bouton--petit" : "bouton bouton--petit";
    boutonEditerTexte.textContent = enEditionTexte ? "✓ Terminer la modification" : "✏️ Modifier le texte";
    if (!outilsVisibles) fermerRecherche();

    dessinerTexte();
    if (!zoneRecherche.hidden) majRecherche();

    const desactive = enCours || transcription.phrases.length === 0;
    boutonCopier.disabled = desactive;
    boutonTelecharger.disabled = desactive;
    boutonExports.disabled = desactive;
    if (desactive) {
      zoneExports.hidden = true;
      boutonExports.setAttribute("aria-expanded", "false");
    }
    boutonEffacer.disabled = enCours;
    cacherMessage(message);
  }

  // Renomme un intervenant : le nom change partout (il n'est rangé qu'à un endroit)
  async function renommer(numero) {
    const t = transcriptionAffichee;
    const nouveau = await demanderNom(nomIntervenant(t, numero));
    if (!nouveau) return;
    t.intervenants[numero] = { ...t.intervenants[numero], nom: nouveau };
    afficher(t);
    await enregistrer("✓ Nom changé partout dans ce texte.");
  }

  // Fusionne un intervenant dans un autre (pratique quand la détection a divisé une même voix)
  async function fusionner(source) {
    const t = transcriptionAffichee;
    if (!t || t.intervenants.length < 2) return;
    const nomSource = nomIntervenant(t, source);
    const cibles = t.intervenants
      .map((_, indice) => ({ indice, nom: nomIntervenant(t, indice) }))
      .filter((c) => c.indice !== source);
    const cible = await demanderFusion({ nomSource, cibles });
    if (cible === null) return;
    const nomCible = nomIntervenant(t, cible);
    const nouvelIndice = fusionnerIntervenants(t, source, cible);
    if (nouvelIndice < 0) return;
    afficher(t);
    await enregistrer(`✓ « ${nomSource} » fusionné dans « ${nomCible} ».`);
  }

  function basculerCorrection() {
    enCorrection = !enCorrection;
    if (enCorrection) enEditionTexte = false;
    afficher(transcriptionAffichee);
    if (!enCorrection) afficherMessage(message, "✓ Corrections terminées.", "succes");
  }

  // Attribue une phrase à un autre intervenant sans perdre la position ni le focus clavier
  async function corriger(phrase, choix, ligneEl, indexPhrase) {
    const t = transcriptionAffichee;
    const nouveauCree = changerIntervenant(t, phrase, choix);
    if (nouveauCree) {
      // Un nouvel intervenant a été ajouté : on redessine les listes, puis on rend le focus
      const defilement = zoneTexte.scrollTop;
      afficher(t);
      zoneTexte.scrollTop = defilement;
      zoneTexte.querySelector(`[data-index-phrase="${indexPhrase}"] select`)?.focus();
    } else {
      // Mise à jour directe : instantanée même sur des milliers de phrases, focus conservé
      ligneEl.style.setProperty("--couleur-voix", couleurIntervenant(phrase.intervenant));
      majCompteursLegende(zoneIntervenants, t);
      infos.textContent = decrireTranscription(t);
    }
    await enregistrer(`✓ Phrase attribuée à « ${nomIntervenant(t, phrase.intervenant)} ».`);
  }

  async function editerPhrase(phrase, nouveauTexte) {
    const propre = nouveauTexte.replace(/\s+/g, " ").trim();
    if (!propre || propre === phrase.texte) return false;
    phrase.texte = propre;
    if (!zoneRecherche.hidden) majRecherche();
    await enregistrer("✓ Texte modifié et enregistré.");
    return true;
  }

  // Enregistre la modification dans l'historique et prévient l'utilisateur
  async function enregistrer(texteSucces) {
    try {
      await surModification(transcriptionAffichee);
      afficherMessage(message, texteSucces, "succes");
    } catch (erreur) {
      console.error(erreur);
      afficherMessage(message, "Le changement est affiché mais n'a pas pu être enregistré dans l'historique.", "erreur");
    }
  }

  return {
    afficher,

    // Fait défiler l'écran jusqu'au résultat
    montrer() {
      // Défilement doux, sauf si le téléphone demande de réduire les animations
      const reduire = matchMedia("(prefers-reduced-motion: reduce)").matches;
      carte.scrollIntoView({ behavior: reduire ? "auto" : "smooth", block: "start" });
    },

    // Numéro dans l'historique de la transcription affichée
    get idAffiche() {
      return transcriptionAffichee?.id;
    },

    // Met à jour le titre si la transcription affichée est renommée dans l'historique
    majTitre(nouveauTitre) {
      if (!transcriptionAffichee) return;
      transcriptionAffichee.titre = nouveauTitre;
      titre.textContent = nouveauTitre;
    },

    effacer,
  };
}

// Les intervenants ont-ils été reconnus pour cette transcription ?
function avecIntervenants(t) {
  return Array.isArray(t.intervenants) && t.intervenants.length > 0;
}

// Une phrase : [00:12] Texte
function creerLigne(phrase) {
  const ligne = document.createElement("p");
  const heure = document.createElement("time");
  heure.textContent = formaterHorodatage(phrase.debut);
  ligne.append(heure, " ", phrase.texte);
  return ligne;
}

// Une phrase modifiable en mode « Modifier le texte »
function creerLigneEditable(t, phrase, index, surModifier) {
  const ligne = document.createElement("div");
  ligne.className = "ligne-editable";
  const avecVoix = avecIntervenants(t);
  if (avecVoix) ligne.style.setProperty("--couleur-voix", couleurIntervenant(phrase.intervenant));

  const entete = document.createElement("label");
  entete.className = "ligne-editable__entete";
  const idChamp = `phrase-edit-${index}`;
  entete.htmlFor = idChamp;

  const heure = document.createElement("time");
  heure.textContent = formaterHorodatage(phrase.debut);
  if (avecVoix) {
    entete.append(creerPastille(), nomIntervenant(t, phrase.intervenant ?? 0), " · ", heure);
  } else {
    entete.append(heure);
  }

  const champ = document.createElement("textarea");
  champ.id = idChamp;
  champ.className = "champ-phrase";
  champ.rows = Math.max(2, Math.min(5, Math.ceil(phrase.texte.length / 45)));
  champ.value = phrase.texte;
  champ.addEventListener("change", async () => {
    const modifie = await surModifier(champ.value);
    if (!modifie) champ.value = phrase.texte; // évite une phrase vide par erreur
  });

  ligne.append(entete, champ);
  return ligne;
}

// Regroupe les phrases consécutives d'un même intervenant dans un bloc.
// Chaque bloc a une couleur ET le nom écrit (pour ne pas dépendre de la couleur seule).
function creerBlocs(t, phrases = t.phrases) {
  const blocs = [];
  let courant = null;
  for (const phrase of phrases) {
    if (!courant || courant.intervenant !== phrase.intervenant) {
      const bloc = document.createElement("div");
      bloc.className = "bloc-voix";
      bloc.style.setProperty("--couleur-voix", couleurIntervenant(phrase.intervenant));
      const nom = document.createElement("p");
      nom.className = "bloc-voix__nom";
      nom.append(creerPastille(), nomIntervenant(t, phrase.intervenant ?? 0));
      bloc.append(nom);
      blocs.push(bloc);
      courant = { intervenant: phrase.intervenant, bloc };
    }
    courant.bloc.append(creerLigne(phrase));
  }
  return blocs;
}
