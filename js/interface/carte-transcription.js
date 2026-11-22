// ==========================================================
// Carte « Nouvelle transcription » : choix de la langue,
// boutons micro / fichier, chronomètre et avancement.
// ==========================================================

import { LANGUES } from "../config.js";
import { formaterHorodatage, formaterDuree } from "../outils/format.js";
import { texteErreur, afficherMessage, cacherMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);

export function creerCarteTranscription({
  langueInitiale,
  surChangementLangue,
  surMicro,
  surFichier,
  surPauseEnregistrement,
  surArreterEnregistrement,
  surAnnulerEnregistrement,
  surTelechargerAudio,
  surArreterTranscription,
}) {
  const carte = $("carte-transcription");
  const zoneDepart = $("zone-depart");
  const zoneEnregistrement = $("zone-enregistrement");
  const zoneTraitement = $("zone-traitement");
  const choixLangue = $("choix-langue");
  const boutonMicro = $("bouton-micro");
  const boutonFichier = $("bouton-fichier");
  const champFichier = $("champ-fichier");
  const aide = $("aide-transcription");
  const aideDepot = $("aide-depot");
  const zoneDernierAudio = $("zone-dernier-audio");
  const boutonTelechargerAudio = $("bouton-telecharger-audio");
  const pointRouge = $("enregistrement-point");
  const libelleEnregistrement = $("enregistrement-libelle");
  const chrono = $("chrono");
  const microNiveau = $("micro-niveau");
  const microNiveauEtat = $("micro-niveau-etat");
  const boutonPauseEnregistrement = $("bouton-pause-enregistrement");
  const traitementTexte = $("traitement-texte");
  const traitementBarre = $("traitement-barre");
  const traitementDetail = $("traitement-detail");
  const boutonArreterTranscription = $("bouton-arreter-transcription");
  const message = $("transcription-message");

  // Remplit la liste des langues
  for (const langue of LANGUES) {
    choixLangue.add(new Option(langue.nom, langue.code));
  }
  choixLangue.value = langueInitiale;
  choixLangue.addEventListener("change", () => surChangementLangue(choixLangue.value));

  boutonMicro.addEventListener("click", () => surMicro());
  boutonFichier.addEventListener("click", () => champFichier.click());
  champFichier.addEventListener("change", () => {
    const fichier = champFichier.files[0];
    champFichier.value = ""; // permet de rechoisir le même fichier ensuite
    if (fichier) surFichier(fichier);
  });
  boutonTelechargerAudio.addEventListener("click", () => surTelechargerAudio?.());
  boutonPauseEnregistrement.addEventListener("click", () => surPauseEnregistrement?.());
  $("bouton-arreter-enregistrement").addEventListener("click", () => surArreterEnregistrement());
  $("bouton-annuler-enregistrement").addEventListener("click", () => surAnnulerEnregistrement());
  boutonArreterTranscription.addEventListener("click", () => {
    boutonArreterTranscription.disabled = true;
    traitementDetail.textContent = "Arrêt après le morceau en cours…";
    surArreterTranscription();
  });

  // Glisser-déposer d'un fichier audio sur la carte (pratique sur ordinateur)
  let survolFichier = 0;
  const depotPossible = () => !boutonFichier.disabled && !zoneDepart.hidden;

  carte.addEventListener("dragenter", (e) => {
    if (!depotPossible() || !e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    survolFichier += 1;
    carte.classList.add("carte--depot");
  });
  carte.addEventListener("dragover", (e) => {
    if (!depotPossible() || !e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  carte.addEventListener("dragleave", () => {
    survolFichier = Math.max(0, survolFichier - 1);
    if (survolFichier === 0) carte.classList.remove("carte--depot");
  });
  carte.addEventListener("drop", (e) => {
    e.preventDefault();
    survolFichier = 0;
    carte.classList.remove("carte--depot");
    if (!depotPossible()) return;
    const fichier = e.dataTransfer?.files?.[0];
    if (fichier) surFichier(fichier);
  });

  function montrer(zone) {
    zoneDepart.hidden = zone !== "depart";
    zoneEnregistrement.hidden = zone !== "enregistrement";
    zoneTraitement.hidden = zone !== "traitement";
  }

  return {
    get langue() {
      return choixLangue.value;
    },

    // Active ou désactive les boutons selon que le modèle est prêt
    activer(pret) {
      boutonMicro.disabled = !pret;
      boutonFichier.disabled = !pret;
      aide.hidden = pret;
      aideDepot.hidden = !pret;
    },

    afficherDepart() {
      montrer("depart");
    },

    afficherEnregistrement(peutMettreEnPause = false) {
      cacherMessage(message);
      chrono.textContent = "00:00";
      microNiveau.value = 0;
      microNiveauEtat.textContent = "En écoute…";
      boutonPauseEnregistrement.hidden = !peutMettreEnPause;
      boutonPauseEnregistrement.textContent = "⏸️ Mettre en pause";
      pointRouge.classList.remove("point-rouge--pause");
      libelleEnregistrement.textContent = "Enregistrement en cours :";
      montrer("enregistrement");
    },

    afficherPauseEnregistrement(enPause) {
      pointRouge.classList.toggle("point-rouge--pause", enPause);
      libelleEnregistrement.textContent = enPause ? "Enregistrement en pause :" : "Enregistrement en cours :";
      boutonPauseEnregistrement.textContent = enPause ? "▶️ Reprendre" : "⏸️ Mettre en pause";
      if (enPause) {
        microNiveau.value = 0;
        microNiveauEtat.textContent = "En pause";
      } else {
        microNiveauEtat.textContent = "En écoute…";
      }
    },

    majNiveauMicro(pic, enPause) {
      if (enPause) {
        microNiveau.value = 0;
        return;
      }
      const pourcentage = pic <= 0 ? 0 : Math.max(0, Math.min(100, ((20 * Math.log10(pic) + 50) / 50) * 100));
      microNiveau.value = pourcentage;
      microNiveauEtat.textContent = pic >= 0.02 ? "✓ Son capté" : "Silence";
    },

    afficherDernierAudio(visible) {
      zoneDernierAudio.hidden = !visible;
    },

    majChrono(secondes) {
      chrono.textContent = formaterHorodatage(secondes);
    },

    afficherLecture() {
      cacherMessage(message);
      montrer("traitement");
      traitementTexte.textContent = "Lecture de l'audio…";
      traitementBarre.removeAttribute("value");
      traitementDetail.textContent = "";
      boutonArreterTranscription.hidden = true;
      boutonArreterTranscription.disabled = false;
    },

    // Le modèle se charge encore en mémoire
    afficherPreparation() {
      traitementTexte.textContent = "Préparation du modèle… (quelques secondes, parfois plus)";
      traitementBarre.removeAttribute("value");
      traitementDetail.textContent = "";
    },

    // Téléchargement des modèles de voix pendant un traitement
    afficherTelechargementVoix(recu, total) {
      traitementTexte.textContent = "Téléchargement des modèles des voix (une seule fois)…";
      traitementBarre.value = total > 0 ? Math.min(100, Math.floor((recu / total) * 100)) : 0;
      traitementDetail.textContent = "";
    },

    // Reconnaissance des intervenants : fenêtre « numero » sur « total »
    majDiarisation(numero, total) {
      traitementTexte.textContent = "Reconnaissance des intervenants…";
      traitementBarre.value = total > 0 ? Math.round((numero / total) * 100) : 0;
      if (!boutonArreterTranscription.disabled) {
        traitementDetail.textContent = total > 0 ? `Analyse des voix : ${Math.round((numero / total) * 100)} %` : "";
      }
    },

    // titre : texte affiché au-dessus de la barre (par défaut « Transcription en cours… »)
    majAvancement(numero, total, resteEstime, titre) {
      boutonArreterTranscription.hidden = false;
      if (numero === 0) boutonArreterTranscription.disabled = false;
      traitementTexte.textContent = titre ?? "Transcription en cours…";
      traitementBarre.value = total > 0 ? Math.round((numero / total) * 100) : 0;
      let texte = `Morceau ${numero} sur ${total}`;
      if (numero === 0) texte = `${total} morceau${total > 1 ? "x" : ""} à traiter`;
      if (resteEstime !== null && numero < total) texte += ` · encore environ ${formaterDuree(resteEstime)}`;
      if (!boutonArreterTranscription.disabled) traitementDetail.textContent = texte;
    },

    afficherErreur(code) {
      montrer("depart");
      afficherMessage(message, texteErreur(code), "erreur");
    },

    afficherInfo(texte) {
      montrer("depart");
      afficherMessage(message, texte, "info");
    },

    cacherMessage() {
      cacherMessage(message);
    },
  };
}
