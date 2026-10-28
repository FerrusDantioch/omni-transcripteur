// ==========================================================
// Enregistrement du « service worker ».
// Le service worker est un petit script qui tourne en arrière-plan
// et garde une copie des fichiers de l'application sur l'appareil.
// Grâce à lui, l'application s'ouvre même sans internet.
//
// Il ajoute aussi deux réglages de sécurité (COOP/COEP) qui
// permettent au modèle de calculer sur plusieurs cœurs du
// processeur (beaucoup plus rapide). Ces réglages ne s'appliquent
// qu'aux pages chargées APRÈS l'installation du service worker :
// la toute première fois, la page se recharge donc une fois toute seule.
//
// Une NOUVELLE version, elle, ne s'installe jamais par surprise : le
// service worker la télécharge puis attend, et une carte propose
// « Mettre à jour » (jamais pendant un enregistrement ou une transcription).
// ==========================================================

const CLE_RECHARGEMENT = "transcriptor-recharge-coi";

/**
 * @param {object} options
 * @param {() => boolean} options.estOccupe vrai si un enregistrement ou une transcription est en cours
 */
export function enregistrerServiceWorker({ estOccupe }) {
  const etat = document.getElementById("etat-hors-ligne");

  // Certains vieux navigateurs ne connaissent pas les service workers
  if (!("serviceWorker" in navigator)) {
    etat.textContent = "Ce navigateur ne permet pas le mode hors ligne.";
    return;
  }

  // Le service worker vient de prendre le contrôle de la page.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // 1) L'utilisateur a demandé la nouvelle version : on recharge.
    if (miseAJourDemandee) {
      window.location.reload();
      return;
    }
    // 2) Toute première installation : on recharge une fois pour activer
    //    le calcul multi-cœurs.
    let dejaRecharge = false;
    try {
      dejaRecharge = sessionStorage.getItem(CLE_RECHARGEMENT) === "oui";
      sessionStorage.setItem(CLE_RECHARGEMENT, "oui");
    } catch {
      dejaRecharge = true; // sans sessionStorage, on évite tout risque de boucle
    }
    if (!window.crossOriginIsolated && !dejaRecharge && !estOccupe()) {
      window.location.reload();
    }
  });

  // On attend que la page soit entièrement chargée pour ne pas la ralentir
  window.addEventListener("load", async () => {
    try {
      // "./sw.js" : chemin relatif, valable aussi dans un sous-dossier
      const inscription = await navigator.serviceWorker.register("./sw.js");
      surveillerMisesAJour(inscription, estOccupe);
      // "ready" se déclenche quand le service worker est actif
      await navigator.serviceWorker.ready;
      etat.textContent = "✓ Prête à fonctionner hors ligne.";
    } catch (erreur) {
      console.error("Échec de l'enregistrement du service worker :", erreur);
      etat.textContent = "Le mode hors ligne n'a pas pu être activé.";
    }
  });
}

// ----------------------------------------------------------
// Nouvelle version de l'application
// ----------------------------------------------------------

let miseAJourDemandee = false; // vrai après un appui sur « Mettre à jour »

function surveillerMisesAJour(inscription, estOccupe) {
  const carte = document.getElementById("carte-mise-a-jour");
  const bouton = document.getElementById("bouton-mise-a-jour");
  const message = document.getElementById("message-mise-a-jour");

  // Sans « controller », c'est la toute première installation : rien à proposer.
  const montrer = () => {
    carte.hidden = !(inscription.waiting && navigator.serviceWorker.controller);
  };

  // Une version attendait déjà (téléchargée lors d'une visite précédente)
  montrer();
  inscription.addEventListener("updatefound", () => {
    const nouveau = inscription.installing;
    if (!nouveau) return;
    nouveau.addEventListener("statechange", () => {
      if (nouveau.state === "installed") montrer();
    });
  });

  // À chaque retour dans l'application, on regarde s'il y a du nouveau
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") inscription.update().catch(() => {});
  });

  bouton.addEventListener("click", () => {
    if (!inscription.waiting) return;
    // Recharger maintenant ferait perdre l'enregistrement ou la transcription
    if (estOccupe()) {
      message.textContent = "Attendez la fin de l'enregistrement ou de la transcription, puis touchez à nouveau « Mettre à jour ».";
      return;
    }
    miseAJourDemandee = true;
    bouton.disabled = true;
    message.textContent = "Mise à jour…";
    inscription.waiting.postMessage({ type: "activer" });
  });
}
