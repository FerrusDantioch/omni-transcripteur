// ==========================================================
// Point d'entrée de l'application.
// Ce fichier relie les différentes parties entre elles :
// l'interface (les « cartes »), le moteur de transcription,
// le micro et l'historique.
// ==========================================================

import { enregistrerServiceWorker } from "./pwa/register-service-worker.js";
import { preparerBoutonInstallation } from "./pwa/install-button.js";
import { recupererFichierPartage } from "./pwa/partage.js";
import { QUALITES, LANGUES, FREQUENCE_AUDIO, nombreDeCoeurs } from "./config.js";
import { lireReglages, enregistrerReglages } from "./stockage/reglages.js";
import { ajouterTranscription, mettreAJourTranscription } from "./stockage/historique.js";
import { MoteurTranscription } from "./transcription/client-moteur.js";
import { transcrireAudio } from "./transcription/transcrire-audio.js";
import { regrouperEnPhrases } from "./transcription/assemblage.js";
import { codeErreur } from "./transcription/erreurs.js";
import { effacerTousLesTelechargements } from "./transcription/telechargement-reprise.js";
import { decoderAudio } from "./audio/decoder-audio.js";
import { Enregistreur, extensionPourMime } from "./audio/enregistreur.js";
import { garderEcranAllume, laisserEcranSEteindre } from "./outils/anti-veille.js";
import { formaterDate, formaterDuree, formaterTaille, nomDeFichier } from "./outils/format.js";
import { creerCarteModele } from "./interface/carte-modele.js";
import { creerCarteTranscription } from "./interface/carte-transcription.js";
import { creerCarteResultat } from "./interface/carte-resultat.js";
import { creerCarteHistorique } from "./interface/carte-historique.js";
import { creerReglages } from "./interface/reglages.js";
import { creerZoneIntervenants } from "./interface/zone-intervenants.js";
import { creerCarteJdr } from "./interface/carte-jdr.js";
import { creerListeCaptures } from "./interface/liste-captures.js";
import { transcrireCapture } from "./capture/transcrire-capture.js";
import { mettreAJourCapture } from "./stockage/captures.js";
import { texteEchecVoix } from "./interface/messages.js";
import { demanderConfirmation } from "./interface/fenetres.js";
import { diariserAudio } from "./voix/diariser-audio.js";
import { attribuerIntervenants } from "./voix/attribution.js";

// ---------------------------------------------------------------
// État de l'application
// ---------------------------------------------------------------
let reglages = lireReglages();
// absent | disponible (téléchargé mais pas en mémoire) | verification | telechargement
// | pause | connexion-perdue | chargement | pret (en mémoire) | erreur
let etatModele = "inconnu";
let progression = { recu: 0, total: 0 };
let occupe = false;          // vrai pendant un enregistrement ou une transcription
let demandeArret = false;    // l'utilisateur a demandé d'arrêter la transcription
let minuteurChrono = null;
const enregistreur = new Enregistreur();
let dernierEnregistrement = null;     // { blob, titre } gardé en mémoire pour pouvoir le télécharger
let fichierPartageEnAttente = null;   // { fichier, titre } reçu via le menu « Partager » d'Android

// Le modèle chargé en mémoire est libéré après 5 minutes sans servir
const DELAI_LIBERATION = 5 * 60 * 1000; // millisecondes
let minuteurLiberation = null;

// Transcriptions qui attendent que le modèle soit prêt
let attentesModele = [];

// ---------------------------------------------------------------
// Mode hors ligne et installation
// ---------------------------------------------------------------
enregistrerServiceWorker({ estOccupe: () => occupe });
preparerBoutonInstallation();

// ---------------------------------------------------------------
// Moteur de transcription (Web Worker)
// ---------------------------------------------------------------
const moteur = new MoteurTranscription({
  surEtat(message) {
    if (message.type === "verification") {
      if (message.present) {
        // Déjà téléchargé : on ne le charge en mémoire qu'au moment de transcrire
        changerEtat("disponible");
        carteModele.afficherDisponible({ qualite: reglages.qualite });
      } else {
        changerEtat("absent");
        carteModele.afficherAbsent({
          qualite: reglages.qualite,
          device: message.device,
          dejaTelecharge: message.dejaTelecharge,
        });
      }
      return;
    }
    if (message.etat === "verification") {
      changerEtat("verification");
      carteModele.afficherVerification();
    } else if (message.etat === "chargement") {
      changerEtat("chargement");
      carteModele.afficherChargement();
    } else if (message.etat === "pret") {
      changerEtat("pret");
      carteModele.afficherPret({ qualite: reglages.qualite, device: message.device, coeurs: message.coeurs });
      programmerLiberation();
    }
  },

  surProgression(recu, total, cible) {
    // Téléchargement des modèles de voix : affiché à part
    if (cible === "voix") {
      if (occupe) carteTranscription.afficherTelechargementVoix(recu, total);
      else zoneIntervenants.afficherTelechargement(recu, total);
      return;
    }
    progression = { recu, total };
    changerEtat("telechargement");
    carteModele.afficherTelechargement(recu, total);
  },

  surErreur(code) {
    // Les transcriptions qui attendaient le modèle reçoivent l'erreur
    finirAttentes(code);
    if (code === "pause") {
      changerEtat("pause");
      carteModele.afficherPause(progression.recu, progression.total);
    } else if (code === "connexion") {
      changerEtat("connexion-perdue");
      carteModele.afficherConnexionPerdue(progression.recu, progression.total);
    } else {
      changerEtat("erreur");
      carteModele.afficherErreur(code);
    }
  },

  surInfo(code) {
    if (code === "repli-processeur") {
      carteModele.afficherInfo(
        "La carte graphique n'a pas fonctionné sur ce téléphone : le processeur est utilisé à la place."
      );
    }
  },
});

function qualiteChoisie() {
  return QUALITES[reglages.qualite];
}

function verifierModele() {
  changerEtat("verification");
  carteModele.afficherVerification();
  moteur.verifier(qualiteChoisie(), reglages.moteur);
}

function preparerModele() {
  // Demande au navigateur de ne pas effacer le modèle pour libérer de la place
  navigator.storage?.persist?.().catch(() => {});
  moteur.preparer(qualiteChoisie(), reglages.moteur, nombreDeCoeurs(reglages.vitesse));
}

// Charge le modèle en mémoire (si besoin) et attend qu'il soit prêt.
// Renvoie une promesse : réussie quand le modèle est prêt, en échec s'il y a une erreur.
function attendreModelePret() {
  if (etatModele === "pret") return Promise.resolve();
  if (!["verification", "telechargement", "chargement"].includes(etatModele)) preparerModele();
  return new Promise((resoudre, rejeter) => attentesModele.push({ resoudre, rejeter }));
}

// Prévient toutes les transcriptions en attente (code = undefined si tout va bien)
function finirAttentes(code) {
  const attentes = attentesModele;
  attentesModele = [];
  for (const { resoudre, rejeter } of attentes) {
    if (code) rejeter(Object.assign(new Error("Modèle indisponible"), { code }));
    else resoudre();
  }
}

// Après 5 minutes sans transcription, on libère la mémoire du téléphone
function programmerLiberation() {
  clearTimeout(minuteurLiberation);
  minuteurLiberation = setTimeout(() => {
    if (occupe || etatModele !== "pret") return;
    moteur.arreter(); // arrête le worker : toute sa mémoire est rendue au téléphone
    changerEtat("disponible");
    carteModele.afficherDisponible({ qualite: reglages.qualite, libere: true });
  }, DELAI_LIBERATION);
}

// Met à jour l'état et active / désactive ce qui doit l'être
function changerEtat(nouvelEtat) {
  etatModele = nouvelEtat;
  if (etatModele === "pret") finirAttentes();
  // On peut lancer une transcription dès que le modèle est sur l'appareil,
  // même s'il n'est pas encore en mémoire (il se chargera à ce moment-là)
  const pretATranscrire = ["pret", "disponible"].includes(etatModele) && !occupe;
  carteTranscription.activer(pretATranscrire);
  // On ne change pas de modèle en plein téléchargement ou chargement
  const reglagesModifiables = !occupe && !["verification", "telechargement", "chargement"].includes(etatModele);
  interfaceReglages.activer(reglagesModifiables);
  zoneIntervenants.activer(!occupe);
  carteJdr.activer(!occupe);
  listeCaptures.activer(!occupe);

  // Un fichier audio a été reçu via « Partager » d'Android : on le lance dès que possible
  if (pretATranscrire && fichierPartageEnAttente) {
    const { fichier, titre } = fichierPartageEnAttente;
    fichierPartageEnAttente = null;
    choisirEtTraiterFichier(fichier, titre);
  }
}

// La connexion revient : on relance le téléchargement interrompu
window.addEventListener("online", () => {
  if (etatModele === "connexion-perdue") preparerModele();
  else if (etatModele === "absent") verifierModele();
});

// ---------------------------------------------------------------
// Les cartes de l'interface
// ---------------------------------------------------------------
const carteModele = creerCarteModele({
  surTelecharger: () => preparerModele(),
  surPause: () => moteur.pause(),
});

const carteTranscription = creerCarteTranscription({
  langueInitiale: reglages.langue,
  surChangementLangue: (langue) => {
    reglages = enregistrerReglages({ langue });
  },
  surMicro: demarrerEnregistrement,
  surFichier: (fichier) => {
    const titre = fichier.name.replace(/\.[^.]+$/, "") || "Fichier audio";
    choisirEtTraiterFichier(fichier, titre);
  },
  surPauseEnregistrement: basculerPauseEnregistrement,
  surArreterEnregistrement: arreterEnregistrement,
  surAnnulerEnregistrement: annulerEnregistrement,
  surTelechargerAudio: telechargerDernierAudio,
  surArreterTranscription: () => {
    demandeArret = true;
  },
});

const zoneIntervenants = creerZoneIntervenants({
  intervenants: reglages.intervenants,
  nombreVoix: reglages.nombreVoix,
  surChangement: (modifications) => {
    reglages = enregistrerReglages(modifications);
    if (modifications.intervenants) verifierModelesVoix();
  },
  surTelecharger: telechargerModelesVoix,
});

// Les modèles de voix sont-ils déjà téléchargés ?
function verifierModelesVoix() {
  moteur
    .demander("verifierVoix")
    .then(({ present }) => zoneIntervenants.afficherEtat({ present }))
    .catch((erreur) => console.error(erreur));
}

// Bouton « Télécharger maintenant » : téléchargement seul (sans chargement en mémoire)
function telechargerModelesVoix() {
  navigator.storage?.persist?.().catch(() => {});
  zoneIntervenants.afficherTelechargement(0, 0);
  moteur
    .demander("preparerVoix", { charger: false })
    .then(() => zoneIntervenants.afficherEtat({ present: true }))
    .catch((erreur) => zoneIntervenants.afficherErreur(erreur.code ?? codeErreur(erreur)));
}

// ---------------------------------------------------------------
// Mode JDR : importer une partie, ou la capturer en direct (ordinateur)
// ---------------------------------------------------------------
const carteJdr = creerCarteJdr({
  reglages,
  surReglage: (modifications) => {
    reglages = enregistrerReglages(modifications);
  },
  surImporter: importerPartie,
  // Pendant une capture, l'application est « occupée » : écran gardé allumé,
  // pas de transcription en même temps (elle ralentirait Discord)
  surDebutCapture: () => commencerTravail(),
  surFinCapture: () => {
    finirTravail();
    listeCaptures.rafraichir();
  },
});

const listeCaptures = creerListeCaptures({ surTranscrire: traiterCapture });

// « Importer l'enregistrement d'une partie » : on active la reconnaissance
// des intervenants et on renvoie vers le choix du fichier
function importerPartie() {
  zoneIntervenants.allumer();
  carteTranscription.afficherInfo(
    "Mode JDR : indiquez le nombre de personnes qui parlent (vous compris), puis choisissez " +
      "le fichier de la partie avec « 📁 Choisir un fichier audio »."
  );
  const reduire = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("carte-transcription").scrollIntoView({ behavior: reduire ? "auto" : "smooth" });
}

const carteResultat = creerCarteResultat({
  // Renommage ou correction : on met à jour l'historique (si le texte y est)
  surModification: async (transcription) => {
    if (transcription.id !== undefined) await mettreAJourTranscription(transcription);
  },
});

const carteHistorique = creerCarteHistorique({
  surOuvrir: (transcription) => {
    carteResultat.afficher(transcription);
    carteResultat.montrer();
  },
  surRenommage: (id, nouveauTitre) => {
    if (carteResultat.idAffiche === id) carteResultat.majTitre(nouveauTitre);
  },
  surSuppression: (id) => {
    if (carteResultat.idAffiche === id) carteResultat.effacer();
  },
});

const interfaceReglages = creerReglages({
  reglages,
  surChangement: (modifications) => {
    reglages = enregistrerReglages(modifications);
    // Changer de moteur ou de vitesse demande un worker neuf
    // (le nombre de cœurs ne peut être choisi qu'au démarrage du moteur)
    if ("moteur" in modifications || "vitesse" in modifications) moteur.arreter();
    verifierModele();
  },
  surSupprimerModeles: async () => {
    moteur.arreter(); // libère la mémoire
    for (const nom of await caches.keys()) {
      // « transformers-cache » : nom du cache utilisé par Transformers.js
      if (nom === "transformers-cache" || nom.startsWith("transcriptor-moteur-")) {
        await caches.delete(nom);
      }
    }
    await effacerTousLesTelechargements();
    progression = { recu: 0, total: 0 };
    verifierModele();
    if (reglages.intervenants) verifierModelesVoix();
  },
});

// ---------------------------------------------------------------
// Enregistrement au micro
// ---------------------------------------------------------------
async function demarrerEnregistrement() {
  carteTranscription.cacherMessage();
  if (!Enregistreur.estDisponible()) {
    carteTranscription.afficherErreur("micro-indisponible");
    return;
  }
  try {
    await enregistreur.demarrer();
  } catch (erreur) {
    console.error(erreur);
    carteTranscription.afficherErreur(codeErreur(erreur));
    return;
  }
  commencerTravail();
  carteTranscription.afficherEnregistrement(enregistreur.peutMettreEnPause);
  minuteurChrono = setInterval(() => {
    carteTranscription.majChrono(enregistreur.duree);
    carteTranscription.majNiveauMicro(enregistreur.niveau(), enregistreur.enPause);
  }, 100);
  // Pendant que vous parlez, le modèle se charge en mémoire en arrière-plan
  // (une éventuelle erreur s'affichera dans la carte du modèle)
  attendreModelePret().catch(() => {});
}

function basculerPauseEnregistrement() {
  if (enregistreur.enPause) {
    if (enregistreur.reprendre()) carteTranscription.afficherPauseEnregistrement(false);
  } else {
    if (enregistreur.mettreEnPause()) carteTranscription.afficherPauseEnregistrement(true);
  }
}

async function arreterEnregistrement() {
  clearInterval(minuteurChrono);
  const enregistrement = await enregistreur.arreter();
  finirTravail();
  if (!enregistrement || enregistrement.size === 0) {
    carteTranscription.afficherErreur("fichier-vide");
    return;
  }
  const titre = `Enregistrement du ${formaterDate(Date.now())}`;
  // On garde temporairement cet audio en mémoire : même si la transcription échoue,
  // l'utilisateur peut télécharger son enregistrement pour ne rien perdre.
  dernierEnregistrement = { blob: enregistrement, titre };
  carteTranscription.afficherDernierAudio(true);
  await traiterAudio(enregistrement, { titre, source: "micro" });
}

function annulerEnregistrement() {
  clearInterval(minuteurChrono);
  enregistreur.annuler();
  finirTravail();
  carteTranscription.afficherDepart();
}

function telechargerDernierAudio() {
  if (!dernierEnregistrement) return;
  const { blob, titre } = dernierEnregistrement;
  const ext = extensionPourMime(blob.type);
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(blob);
  lien.download = nomDeFichier(titre, ext);
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 15000);
}

// Prévient avant de décoder un fichier très volumineux (le navigateur le charge en entier en RAM)
async function choisirEtTraiterFichier(fichier, titre) {
  const estMobile = navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const seuil = (estMobile ? 100 : 250) * 1_000_000;
  if (fichier.size > seuil) {
    const ok = await demanderConfirmation({
      titre: "Fichier volumineux",
      texte:
        `Ce fichier pèse ${formaterTaille(fichier.size)}. Pour le lire, le navigateur doit le décompresser ` +
        "entièrement en mémoire vive : sur un appareil avec peu de mémoire, cela peut échouer. Continuer quand même ?",
      libelleConfirmer: "Continuer",
    });
    if (!ok) return;
  }
  await traiterAudio(fichier, { titre, source: "fichier" });
}

// ---------------------------------------------------------------
// Transcription d'un audio (fichier ou enregistrement)
// ---------------------------------------------------------------
async function traiterAudio(fichierAudio, { titre, source }) {
  commencerTravail();
  demandeArret = false;
  carteTranscription.afficherLecture();
  let transcription = null;

  try {
    // Lecture du fichier et chargement du modèle en même temps
    const chargement = attendreModelePret();
    chargement.catch(() => {}); // l'erreur éventuelle est traitée plus bas
    const audio = await decoderAudio(fichierAudio);
    if (etatModele !== "pret") carteTranscription.afficherPreparation();
    await chargement;
    if (audio.duration < 0.3) {
      carteTranscription.afficherErreur("fichier-vide");
      return;
    }

    transcription = {
      titre,
      creeLe: Date.now(),
      duree: audio.duration,
      source,
      langue: reglages.langue,
      qualite: reglages.qualite,
      phrases: [],
      interrompue: false,
    };
    carteResultat.afficher(transcription, { enCours: true });

    const { segments, interrompue } = await transcrireAudio(audio, {
      moteur,
      langue: reglages.langue,
      doitArreter: () => demandeArret,
      surAvancement: (segmentsObtenus, numero, total, resteEstime) => {
        transcription.phrases = regrouperEnPhrases(segmentsObtenus);
        carteResultat.afficher(transcription, { enCours: true });
        carteTranscription.majAvancement(numero, total, resteEstime);
      },
    });
    // Reconnaissance des intervenants (si l'interrupteur est activé).
    // En cas d'échec, on garde simplement le texte sans distinction de voix.
    let segmentsFinaux = segments;
    let infoVoix = null;
    if (zoneIntervenants.actif && !interrompue && segments.length > 0) {
      try {
        const tours = await diariserAudio(audio, {
          moteur,
          nombreVoix: zoneIntervenants.nombreVoix,
          doitArreter: () => demandeArret,
          surAvancement: (numero, total) => carteTranscription.majDiarisation(numero, total),
        });
        if (tours === null) {
          infoVoix = "Reconnaissance des intervenants arrêtée : le texte est conservé, sans distinction de voix.";
        } else {
          const { segments: attribues, nombre } = attribuerIntervenants(segments, tours);
          if (nombre > 0) {
            segmentsFinaux = attribues;
            transcription.intervenants = Array.from({ length: nombre }, (_, i) => ({ nom: `Intervenant ${i + 1}` }));
          } else {
            infoVoix = "Aucune voix n'a pu être distinguée : le texte est conservé tel quel.";
          }
        }
      } catch (erreur) {
        console.warn("Reconnaissance des intervenants impossible :", erreur);
        infoVoix = texteEchecVoix(erreur.code ?? codeErreur(erreur));
      }
    }

    transcription.phrases = regrouperEnPhrases(segmentsFinaux);
    transcription.interrompue = interrompue;

    await sauvegarder(transcription);
    carteResultat.afficher(transcription);
    carteResultat.montrer();

    if (transcription.phrases.length === 0) {
      carteTranscription.afficherInfo(
        "Aucune parole n'a été détectée. Vérifiez la langue choisie et que le son est assez fort."
      );
    } else if (interrompue) {
      carteTranscription.afficherInfo("Transcription arrêtée. Le texte déjà obtenu est conservé dans l'historique.");
    } else if (infoVoix) {
      carteTranscription.afficherInfo(`✓ Transcription terminée et enregistrée dans l'historique. ${infoVoix}`);
    } else {
      carteTranscription.afficherInfo("✓ Transcription terminée et enregistrée dans l'historique.");
    }
  } catch (erreur) {
    console.error(erreur);
    carteTranscription.afficherErreur(erreur.code ?? codeErreur(erreur));
    // On garde quand même ce qui a déjà été transcrit
    if (transcription?.phrases.length > 0) {
      transcription.interrompue = true;
      await sauvegarder(transcription);
      carteResultat.afficher(transcription);
    } else {
      carteResultat.effacer();
    }
  } finally {
    finirTravail();
  }
}

// ---------------------------------------------------------------
// Transcription d'une capture en direct (Mode JDR), après la session
// ---------------------------------------------------------------
async function traiterCapture(fiche) {
  const reduire = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!["pret", "disponible", "chargement"].includes(etatModele)) {
    carteTranscription.afficherInfo(
      "Le modèle de reconnaissance vocale doit d'abord être téléchargé (carte tout en haut), " +
        "puis appuyez de nouveau sur « 📝 Transcrire » dans le Mode JDR."
    );
    document.getElementById("carte-modele").scrollIntoView({ behavior: reduire ? "auto" : "smooth" });
    return;
  }
  if (fiche.avancement) {
    const memeReglages = fiche.avancement.langue === reglages.langue && fiche.avancement.qualite === reglages.qualite;
    if (!memeReglages) {
      const nomLangue = LANGUES.find((l) => l.code === fiche.avancement.langue)?.nom ?? fiche.avancement.langue;
      const nomQualite = QUALITES[fiche.avancement.qualite]?.nom ?? fiche.avancement.qualite;
      const ok = await demanderConfirmation({
        titre: "Repartir du début ?",
        texte:
          `Une transcription est déjà commencée (${nomLangue}, qualité « ${nomQualite} »). ` +
          "Vos réglages actuels sont différents : continuer effacera cet avancement et repartira du début. " +
          "Pour reprendre là où vous vous êtes arrêté, remettez cette langue et cette qualité.",
        libelleConfirmer: "Repartir du début",
      });
      if (!ok) return;
    }
  } else if (fiche.transcription?.id) {
    const ok = await demanderConfirmation({
      titre: "Transcrire à nouveau ?",
      texte: "Cette capture a déjà été transcrite. La transcrire à nouveau (par exemple avec une autre qualité) ?",
      libelleConfirmer: "Transcrire à nouveau",
    });
    if (!ok) return;
  }
  commencerTravail();
  demandeArret = false;
  carteTranscription.afficherLecture();
  document.getElementById("carte-transcription").scrollIntoView({ behavior: reduire ? "auto" : "smooth" });

  const transcription = {
    titre: fiche.titre,
    creeLe: Date.now(),
    duree: fiche.echantillons / FREQUENCE_AUDIO,
    source: "capture",
    langue: reglages.langue,
    qualite: reglages.qualite,
    phrases: [],
    intervenants: [{ nom: fiche.nomJoueur }],
    interrompue: false,
  };
  const etapes = { micro: "Transcription de votre piste (1/2)…", autres: "Transcription de la piste des autres joueurs (2/2)…" };

  try {
    const chargement = attendreModelePret();
    chargement.catch(() => {});
    if (etatModele !== "pret") carteTranscription.afficherPreparation();
    await chargement;
    carteResultat.afficher(transcription, { enCours: true });

    const resultat = await transcrireCapture(fiche, {
      moteur,
      langue: reglages.langue,
      qualite: reglages.qualite,
      doitArreter: () => demandeArret,
      surTexte: (phrases, intervenants) => {
        transcription.phrases = phrases;
        transcription.intervenants = intervenants;
        carteResultat.afficher(transcription, { enCours: true });
      },
      surAvancement: (piste, numero, total, resteEstime) =>
        carteTranscription.majAvancement(numero, total, resteEstime, etapes[piste]),
      surDiarisation: (numero, total) => carteTranscription.majDiarisation(numero, total),
    });

    if (resultat.interrompue) {
      carteResultat.afficher(transcription);
      carteTranscription.afficherInfo(
        "Transcription mise en pause. Appuyez de nouveau sur « 📝 Transcrire » dans le Mode JDR : " +
          "elle reprendra là où elle s'est arrêtée (avec la même langue et la même qualité)."
      );
      return;
    }

    transcription.phrases = resultat.phrases;
    transcription.intervenants = resultat.intervenants;
    await sauvegarder(transcription);
    // La capture garde le lien vers son texte ; l'avancement n'est plus utile
    fiche.transcription = { id: transcription.id, le: Date.now() };
    fiche.avancement = null;
    await mettreAJourCapture(fiche).catch((e) => console.error(e));

    carteResultat.afficher(transcription);
    carteResultat.montrer();
    const fin = `✓ Transcription terminée (${formaterDuree(transcription.duree)} de partie) et enregistrée dans l'historique.`;
    carteTranscription.afficherInfo(resultat.infoVoix ? `${fin} ${resultat.infoVoix}` : `${fin} Renommez les intervenants dans le résultat.`);
  } catch (erreur) {
    console.error(erreur);
    carteTranscription.afficherErreur(erreur.code ?? codeErreur(erreur));
    if (transcription.phrases.length > 0) carteResultat.afficher(transcription);
  } finally {
    finirTravail();
    listeCaptures.rafraichir();
  }
}

// Enregistre dans l'historique (si le texte n'est pas vide)
async function sauvegarder(transcription) {
  if (transcription.phrases.length === 0) return;
  try {
    transcription.id = await ajouterTranscription(transcription);
    await carteHistorique.rafraichir();
  } catch (erreur) {
    console.error("Sauvegarde impossible :", erreur);
  }
}

function commencerTravail() {
  occupe = true;
  clearTimeout(minuteurLiberation);
  garderEcranAllume();
  changerEtat(etatModele);
}

function finirTravail() {
  occupe = false;
  laisserEcranSEteindre();
  changerEtat(etatModele);
  if (etatModele === "pret") programmerLiberation();
}

// Évite de perdre un enregistrement en fermant la page par erreur
window.addEventListener("beforeunload", (e) => {
  if (occupe) e.preventDefault();
});

// ---------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------
async function verifierPartage() {
  const partage = await recupererFichierPartage();
  if (!partage) return;
  if (["pret", "disponible"].includes(etatModele) && !occupe) {
    choisirEtTraiterFichier(partage.fichier, partage.titre);
  } else {
    fichierPartageEnAttente = partage;
    carteTranscription.afficherInfo(
      `Fichier audio reçu (« ${partage.titre} »). Téléchargez le modèle ci-dessus si besoin : la transcription démarrera dès qu'il sera prêt.`
    );
  }
}

carteHistorique.rafraichir();
listeCaptures.rafraichir();
verifierModele();
if (reglages.intervenants) verifierModelesVoix();
verifierPartage();
