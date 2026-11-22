// ==========================================================
// Carte « Historique » : liste des transcriptions enregistrées,
// avec Ouvrir / Renommer / Supprimer.
// ==========================================================

import {
  listerTranscriptions,
  lireTranscription,
  renommerTranscription,
  supprimerTranscription,
  exporterHistorique,
  importerHistorique,
} from "../stockage/historique.js";
import { formaterDate, formaterDuree, nomDeFichier } from "../outils/format.js";
import { afficherMessage, cacherMessage } from "./messages.js";
import { demanderConfirmation, demanderTexte } from "./fenetres.js";

const $ = (id) => document.getElementById(id);

export function creerCarteHistorique({ surOuvrir, surRenommage, surSuppression }) {
  const liste = $("historique-liste");
  const vide = $("historique-vide");
  const message = $("historique-message");
  const boutonExporter = $("bouton-exporter-historique");
  const boutonImporter = $("bouton-importer-historique");
  const champImport = $("champ-import-historique");

  boutonExporter.addEventListener("click", async () => {
    try {
      const donnees = await exporterHistorique();
      if (donnees.transcriptions.length === 0) return;
      const fichier = new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json;charset=utf-8" });
      const lien = document.createElement("a");
      lien.href = URL.createObjectURL(fichier);
      const date = new Date().toISOString().slice(0, 10);
      lien.download = nomDeFichier(`omni-transcripteur-historique-${date}`, "json");
      lien.click();
      setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
      afficherMessage(
        message,
        `✓ Sauvegarde téléchargée (${donnees.transcriptions.length} transcription${donnees.transcriptions.length > 1 ? "s" : ""}).`,
        "succes"
      );
    } catch (erreur) {
      console.error(erreur);
      afficherMessage(message, "La sauvegarde n'a pas pu être créée. Réessaie.", "erreur");
    }
  });

  boutonImporter.addEventListener("click", () => champImport.click());
  champImport.addEventListener("change", async () => {
    const fichier = champImport.files[0];
    champImport.value = "";
    if (!fichier) return;
    try {
      const donnees = JSON.parse(await fichier.text());
      const { ajoutees, ignorees, invalides } = await importerHistorique(donnees);
      await rafraichir();
      if (ajoutees === 0 && ignorees > 0) {
        afficherMessage(message, "Toutes ces transcriptions sont déjà dans l'historique.", "info");
      } else if (ajoutees === 0) {
        afficherMessage(message, "Aucune transcription valide trouvée dans ce fichier.", "erreur");
      } else {
        const parties = [`✓ ${ajoutees} transcription${ajoutees > 1 ? "s" : ""} importée${ajoutees > 1 ? "s" : ""}`];
        if (ignorees > 0) parties.push(`${ignorees} déjà présente${ignorees > 1 ? "s" : ""}`);
        if (invalides > 0) parties.push(`${invalides} ignorée${invalides > 1 ? "s" : ""}`);
        afficherMessage(message, `${parties.join(" · ")}.`, "succes");
      }
    } catch (erreur) {
      console.error(erreur);
      afficherMessage(
        message,
        "Ce fichier n'est pas une sauvegarde valide d'Omni-Transcripteur (.json).",
        "erreur"
      );
    }
  });

  async function rafraichir() {
    let transcriptions = [];
    try {
      transcriptions = await listerTranscriptions();
    } catch (erreur) {
      console.error(erreur);
      afficherMessage(message, "L'historique n'a pas pu être lu sur cet appareil.", "erreur");
    }
    vide.hidden = transcriptions.length > 0;
    boutonExporter.disabled = transcriptions.length === 0;
    liste.replaceChildren(...transcriptions.map(creerElement));
  }

  function creerElement(t) {
    const element = document.createElement("li");
    element.className = "element-historique";

    const titre = document.createElement("p");
    titre.className = "element-historique__titre";
    titre.textContent = t.titre;

    const details = document.createElement("p");
    details.className = "petit";
    const nbPhrases = t.phrases.length;
    details.textContent =
      `${formaterDate(t.creeLe)} · ${formaterDuree(t.duree)} · ` +
      `${nbPhrases} phrase${nbPhrases > 1 ? "s" : ""}`;

    const boutons = document.createElement("div");
    boutons.className = "boutons boutons--ligne";
    boutons.append(
      creerBouton("Ouvrir", `Ouvrir « ${t.titre} »`, async () => {
        cacherMessage(message);
        const complete = await lireTranscription(t.id);
        if (complete) surOuvrir(complete);
      }),
      creerBouton("Renommer", `Renommer « ${t.titre} »`, async () => {
        const nouveau = await demanderTexte({
          titre: "Renommer la transcription",
          etiquette: "Nouveau nom",
          valeurInitiale: t.titre,
          maxLength: 120,
          libelleValider: "Renommer",
        });
        if (!nouveau) return; // annulé
        await renommerTranscription(t.id, nouveau);
        surRenommage?.(t.id, nouveau);
        await rafraichir();
        afficherMessage(message, "✓ Transcription renommée.", "succes");
      }),
      creerBouton("Supprimer", `Supprimer « ${t.titre} »`, async () => {
        const ok = await demanderConfirmation({
          titre: "Supprimer la transcription",
          texte: `Supprimer définitivement « ${t.titre} » ?`,
          libelleConfirmer: "Supprimer",
        });
        if (!ok) return;
        await supprimerTranscription(t.id);
        surSuppression(t.id);
        await rafraichir();
        afficherMessage(message, "Transcription supprimée.", "info");
      })
    );

    element.append(titre, details, boutons);
    return element;
  }

  function creerBouton(texte, description, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "bouton bouton--petit";
    bouton.textContent = texte;
    bouton.setAttribute("aria-label", description);
    bouton.addEventListener("click", () => {
      action().catch((erreur) => {
        console.error(erreur);
        afficherMessage(message, "L'opération n'a pas pu être faite. Réessaie.", "erreur");
      });
    });
    return bouton;
  }

  return { rafraichir };
}
