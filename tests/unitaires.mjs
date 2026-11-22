/* Omni-Transcripteur — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Tests unitaires rapides d'Omni-Transcripteur (sans navigateur
   et sans internet).

   Ils vérifient la logique interne : découpage de l'audio dans
   les silences, assemblage du texte, suppression des boucles,
   reconnaissance/regroupement des voix, pistes JDR, formatage,
   gestion des erreurs et cohérence du service worker.

   Lancer :  node --test tests/unitaires.mjs
   (ou simplement : node tests/unitaires.mjs)
   ============================================================ */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formaterHorodatage, formaterDuree, formaterTaille, nomDeFichier } from "../js/outils/format.js";
import { codeErreur } from "../js/transcription/erreurs.js";
import {
  placerSegments,
  decouperEnPhrases,
  regrouperEnPhrases,
  retirerBoucles,
} from "../js/transcription/assemblage.js";
import { decouperEnMorceaux, volumeMoyen, estSilencieux } from "../js/audio/decoupage.js";
import { regrouperEmpreintes } from "../js/voix/regroupement.js";
import { attribuerIntervenants } from "../js/voix/attribution.js";
import { PisteAudio } from "../js/capture/piste-audio.js";
import {
  fusionnerIntervenants,
  compterOccurrences,
  remplacerDansPhrases,
  normaliserTranscriptionImportee,
} from "../js/outils/edition-texte.js";
import { extensionPourMime } from "../js/audio/enregistreur.js";
import {
  formaterTempsSousTitre,
  preparerSousTitres,
  enSrt,
  enVtt,
  enMarkdown,
  enTexteBrut,
} from "../js/outils/export-texte.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ------------------------------------------------------------
// 1. Outils de mise en forme
// ------------------------------------------------------------
describe("Mise en forme (js/outils/format.js)", () => {
  it("formate les horodatages en mm:ss puis h:mm:ss", () => {
    assert.equal(formaterHorodatage(0), "00:00");
    assert.equal(formaterHorodatage(75.9), "01:15");
    assert.equal(formaterHorodatage(3725), "1:02:05");
    assert.equal(formaterHorodatage(-5), "00:00");
  });

  it("formate les durées de façon lisible", () => {
    assert.equal(formaterDuree(20), "20 s");
    assert.equal(formaterDuree(95), "1 min 35 s");
    assert.equal(formaterDuree(3660), "1 h 01 min");
  });

  it("formate les tailles en Mo", () => {
    assert.match(formaterTaille(5_200_000), /5[,.]2\s*Mo/);
    assert.match(formaterTaille(41_234_567), /41\s*Mo/);
  });

  it("nettoie les noms de fichiers", () => {
    assert.equal(nomDeFichier("Partie: 12/10 <JDR>?", "txt"), "Partie- 12-10 -JDR-.txt");
    assert.equal(nomDeFichier("   ", "txt"), "transcription.txt");
  });
});

// ------------------------------------------------------------
// 2. Classement des erreurs
// ------------------------------------------------------------
describe("Classement des erreurs (js/transcription/erreurs.js)", () => {
  it("classe les erreurs réseau, micro, fichier et mémoire", () => {
    assert.equal(codeErreur(new DOMException("Pause", "AbortError")), "pause");
    assert.equal(codeErreur({ name: "ErreurHorsLigne" }), "hors-ligne");
    assert.equal(codeErreur({ name: "ErreurConnexion" }), "connexion");
    assert.equal(codeErreur({ name: "QuotaExceededError" }), "espace");
    assert.equal(codeErreur({ name: "NotAllowedError" }), "micro-refuse");
    assert.equal(codeErreur({ name: "NotFoundError" }), "micro-absent");
    assert.equal(codeErreur({ name: "NotReadableError" }), "micro-occupe");
    assert.equal(codeErreur({ name: "EncodingError" }), "fichier-illisible");
    assert.equal(codeErreur(new RangeError("allocation failed")), "memoire");
    assert.equal(codeErreur(new TypeError("Failed to fetch")), "connexion");
    assert.equal(codeErreur(new Error("Autre erreur")), "inconnue");
  });
});

// ------------------------------------------------------------
// 3. Découpage audio dans les silences
// ------------------------------------------------------------
describe("Découpage audio (js/audio/decoupage.js)", () => {
  function creerFauxAudio(dureeSec, silenceDe, silenceA) {
    const sampleRate = 16000;
    const length = Math.round(dureeSec * sampleRate);
    const donnees = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const dansSilence = silenceDe !== undefined && t >= silenceDe && t <= silenceA;
      donnees[i] = dansSilence ? 0.0001 : 0.4 * Math.sin(i * 0.1);
    }
    return {
      sampleRate,
      length,
      duration: dureeSec,
      numberOfChannels: 1,
      getChannelData: () => donnees,
    };
  }

  it("détecte le silence et le son normal", () => {
    assert.equal(estSilencieux(new Float32Array(1600)), true);
    const bruit = new Float32Array(1600).fill(0.3);
    assert.equal(estSilencieux(bruit), false);
    assert.ok(volumeMoyen(bruit) > 0.25);
  });

  it("garde un audio court en un seul morceau", () => {
    const morceaux = decouperEnMorceaux(creerFauxAudio(15));
    assert.equal(morceaux.length, 1);
    assert.deepEqual(morceaux[0], { debut: 0, fin: 15, debutLecture: 0 });
  });

  it("coupe un audio long dans la zone de silence entre 20 s et 28 s avec 1 s de chevauchement", () => {
    const morceaux = decouperEnMorceaux(creerFauxAudio(45, 23, 24));
    assert.equal(morceaux.length, 2);
    assert.ok(morceaux[0].fin >= 23 && morceaux[0].fin <= 24, `coupure attendue entre 23 et 24 s, obtenu ${morceaux[0].fin}`);
    assert.equal(morceaux[1].debut, morceaux[0].fin);
    assert.equal(morceaux[1].debutLecture, morceaux[0].fin - 1);
    assert.equal(morceaux[1].fin, 45);
  });
});

// ------------------------------------------------------------
// 4. Assemblage du texte, anti-boucles et découpage en phrases
// ------------------------------------------------------------
describe("Assemblage du texte (js/transcription/assemblage.js)", () => {
  it("supprime les boucles répétitives de Whisper", () => {
    assert.equal(retirerBoucles("bon, bon, bon, bon, bon"), "bon");
    assert.equal(retirerBoucles("et puis et puis et puis et puis voilà"), "et puis voilà");
    assert.equal(retirerBoucles("oui oui ça marche"), "oui oui ça marche");
  });

  it("retire les phrases inventées, le chevauchement et les mots répétés à la jonction", () => {
    const morceau = { debut: 24, fin: 45, debutLecture: 23 };
    const precedent = { debut: 20, fin: 24, texte: "Bonjour tout le monde" };
    const bruts = [
      { debut: 0, fin: 0.9, texte: "le monde" }, // entièrement dans le chevauchement
      { debut: 0.5, fin: 3.0, texte: "le monde nous allons commencer." },
      { debut: 3.0, fin: 4.0, texte: "Sous-titrage Amara.org" }, // inventée
      { debut: 4.0, fin: 5.0, texte: "[Musique]" }, // inventée
      { debut: 5.0, fin: 7.0, texte: "C'est parti !" },
      { debut: 7.0, fin: 8.0, texte: "C'est parti !" }, // bégaiement identique
    ];
    const places = placerSegments(bruts, morceau, precedent);
    assert.equal(places.length, 2);
    assert.equal(places[0].texte, "nous allons commencer.");
    assert.equal(places[1].texte, "C'est parti !");
  });

  it("découpe un segment multi-phrases sans couper sur les abréviations ni les guillemets", () => {
    const phrases = decouperEnPhrases([
      {
        debut: 0,
        fin: 10,
        texte: "M. Dupont est arrivé. Il a dit « Bonjour ! » Ensuite le Dr. Martin a répondu.",
      },
    ]);
    assert.deepEqual(
      phrases.map((p) => p.texte),
      ["M. Dupont est arrivé.", "Il a dit « Bonjour ! »", "Ensuite le Dr. Martin a répondu."]
    );
    assert.equal(phrases[0].debut, 0);
    assert.ok(Math.abs(phrases.at(-1).fin - 10) < 1e-6);
  });

  it("recolle les bouts incomplets du même intervenant mais sépare deux intervenants différents", () => {
    const phrases = regrouperEnPhrases([
      { debut: 0, fin: 2, texte: "Je pense que", intervenant: 0 },
      { debut: 2, fin: 4, texte: "nous devons partir.", intervenant: 0 },
      { debut: 4, fin: 5, texte: "D'accord", intervenant: 1 },
      { debut: 5, fin: 6, texte: "Allons-y !", intervenant: 0 },
    ]);
    assert.equal(phrases.length, 3);
    assert.equal(phrases[0].texte, "Je pense que nous devons partir.");
    assert.equal(phrases[0].intervenant, 0);
    assert.equal(phrases[1].texte, "D'accord");
    assert.equal(phrases[1].intervenant, 1);
    assert.equal(phrases[2].texte, "Allons-y !");
    assert.equal(phrases[2].intervenant, 0);
  });
});

// ------------------------------------------------------------
// 5. Regroupement et attribution des intervenants
// ------------------------------------------------------------
describe("Reconnaissance des intervenants (js/voix/)", () => {
  function empreinte(axe, bruit = 0) {
    const v = new Float32Array(8);
    v[axe] = 1;
    v[(axe + 1) % 8] = bruit;
    return v;
  }

  it("regroupe correctement deux voix bien distinctes dans l'ordre d'apparition", () => {
    const elements = [
      { empreinte: empreinte(0, 0.02), duree: 3 },
      { empreinte: empreinte(4, 0.01), duree: 3 },
      { empreinte: empreinte(0, -0.02), duree: 2.5 },
      { empreinte: empreinte(4, -0.01), duree: 2.5 },
      { empreinte: empreinte(0, 0.01), duree: 0.6 }, // passage court rattaché ensuite
    ];
    const etiquettes = regrouperEmpreintes(elements, 2);
    assert.deepEqual(etiquettes, [0, 1, 0, 1, 0]);
  });

  it("attribue chaque phrase d'un segment mixte à la bonne voix", () => {
    const segments = [
      { debut: 0, fin: 6, texte: "Bonjour à tous. Salut tout le monde !" },
    ];
    const tours = [
      { debut: 0, fin: 2.8, intervenant: 5 },
      { debut: 2.9, fin: 6.0, intervenant: 2 },
    ];
    const { segments: attribues, nombre } = attribuerIntervenants(segments, tours);
    assert.equal(nombre, 2);
    assert.equal(attribues.length, 2);
    assert.equal(attribues[0].intervenant, 0);
    assert.equal(attribues[1].intervenant, 1);
  });
});

// ------------------------------------------------------------
// 6. Piste audio de capture JDR
// ------------------------------------------------------------
describe("PisteAudio (js/capture/piste-audio.js)", () => {
  it("extrait correctement des échantillons à cheval sur plusieurs blocs de 5 s", () => {
    const b0 = new Int16Array(100).fill(16384); // 0.5
    const b1 = new Int16Array(100).fill(-16384); // -0.5
    const piste = new PisteAudio([b0, b1]);
    assert.equal(piste.length, 200);
    const extrait = piste.extraire(98, 102);
    assert.equal(extrait.length, 4);
    assert.equal(extrait[0], 0.5);
    assert.equal(extrait[1], 0.5);
    assert.equal(extrait[2], -0.5);
    assert.equal(extrait[3], -0.5);
  });
});

// ------------------------------------------------------------
// 7. Cohérence du service worker (mode hors ligne)
// ------------------------------------------------------------
describe("Service Worker (sw.js)", () => {
  it("liste tous les fichiers de l'application sans oubli ni lien cassé", () => {
    const contenu = fs.readFileSync(path.join(RACINE, "sw.js"), "utf8");
    const bloc = /FICHIERS_APPLICATION\s*=\s*\[([\s\S]*?)\]/.exec(contenu);
    assert.ok(bloc, "Tableau FICHIERS_APPLICATION introuvable dans sw.js");
    const listes = new Set([...bloc[1].matchAll(/"(\.\/[^"]+)"/g)].map((m) => m[1]));
    for (const fichier of listes) {
      if (fichier === "./") continue;
      assert.ok(fs.existsSync(path.join(RACINE, fichier)), `Fichier manquant cité dans sw.js : ${fichier}`);
    }

    const parcourir = (dossier) =>
      fs.readdirSync(path.join(RACINE, dossier), { withFileTypes: true }).flatMap((e) => {
        const rel = `${dossier}/${e.name}`;
        return e.isDirectory() ? parcourir(rel) : [`./${rel}`];
      });

    for (const dossier of ["css", "js", "icons", "assets"]) {
      for (const fichier of parcourir(dossier)) {
        assert.ok(listes.has(fichier), `Fichier oublié dans FICHIERS_APPLICATION de sw.js : ${fichier}`);
      }
    }

    const versionContenu = fs.readFileSync(path.join(RACINE, "js/version.js"), "utf8");
    assert.match(versionContenu, /self\.VERSION_APP\s*=\s*"\d+\.\d+\.\d+"/, "Numéro de version invalide dans js/version.js");
  });
});

// ------------------------------------------------------------
// 8. Édition de texte, fusion d'intervenants et import JSON
// ------------------------------------------------------------
describe("Édition et sauvegarde (js/outils/edition-texte.js)", () => {
  it("fusionne deux intervenants et décale correctement les numéros suivants", () => {
    const t = {
      intervenants: [{ nom: "Marie" }, { nom: "Bob" }, { nom: "Intervenant 3" }],
      phrases: [
        { debut: 0, fin: 2, texte: "Salut.", intervenant: 0 },
        { debut: 2, fin: 4, texte: "Bonjour !", intervenant: 1 },
        { debut: 4, fin: 6, texte: "C'est encore Marie.", intervenant: 2 },
      ],
    };
    const nouvelIndice = fusionnerIntervenants(t, 2, 0);
    assert.equal(nouvelIndice, 0);
    assert.deepEqual(t.intervenants, [{ nom: "Marie" }, { nom: "Bob" }]);
    assert.deepEqual(t.phrases.map((p) => p.intervenant), [0, 1, 0]);

    // Cas où la source est avant la cible : la cible recule de 1
    const t2 = {
      intervenants: [{ nom: "Doublon" }, { nom: "Alice" }, { nom: "Paul" }],
      phrases: [
        { debut: 0, fin: 1, texte: "A", intervenant: 0 },
        { debut: 1, fin: 2, texte: "B", intervenant: 1 },
        { debut: 2, fin: 3, texte: "C", intervenant: 2 },
      ],
    };
    assert.equal(fusionnerIntervenants(t2, 0, 2), 1);
    assert.deepEqual(t2.intervenants, [{ nom: "Alice" }, { nom: "Paul" }]);
    assert.deepEqual(t2.phrases.map((p) => p.intervenant), [1, 0, 1]);
  });

  it("compte et remplace toutes les occurrences en gérant casse et caractères spéciaux", () => {
    const phrases = [
      { texte: "Le goblain attaque le Goblain (niv. 2)." },
      { texte: "Rien ici." },
      { texte: "Un autre goblain ?" },
    ];
    assert.deepEqual(compterOccurrences(phrases, "goblain"), { occurrences: 3, phrasesTouchees: 2 });
    assert.deepEqual(compterOccurrences(phrases, "Goblain", { respecterCasse: true }), {
      occurrences: 1,
      phrasesTouchees: 1,
    });
    assert.deepEqual(compterOccurrences(phrases, "(niv. 2)"), { occurrences: 1, phrasesTouchees: 1 });

    const nb = remplacerDansPhrases(phrases, "goblain", "gobelin");
    assert.equal(nb, 3);
    assert.equal(phrases[0].texte, "Le gobelin attaque le gobelin (niv. 2).");
    assert.equal(phrases[2].texte, "Un autre gobelin ?");
  });

  it("valide et nettoie une transcription importée depuis JSON et rejette les données invalides", () => {
    assert.equal(normaliserTranscriptionImportee(null), null);
    assert.equal(normaliserTranscriptionImportee({ titre: "Vide", phrases: [] }), null);

    const propre = normaliserTranscriptionImportee({
      id: 99,
      titre: "  Partie JDR  ",
      creeLe: 1760000000000,
      duree: 120,
      source: "capture",
      langue: "fr",
      qualite: "precis",
      phrases: [{ debut: 1, fin: 4, texte: "  Bonjour ! ", intervenant: 0 }, { texte: "   " }],
      intervenants: [{ nom: "  Maître du jeu " }],
    });
    assert.equal(propre.id, undefined);
    assert.equal(propre.titre, "Partie JDR");
    assert.equal(propre.phrases.length, 1);
    assert.equal(propre.phrases[0].texte, "Bonjour !");
    assert.deepEqual(propre.intervenants, [{ nom: "Maître du jeu" }]);
  });

  it("choisit la bonne extension de fichier pour un enregistrement micro", () => {
    assert.equal(extensionPourMime("audio/webm;codecs=opus"), "webm");
    assert.equal(extensionPourMime("audio/ogg;codecs=opus"), "ogg");
    assert.equal(extensionPourMime("audio/mp4"), "m4a");
    assert.equal(extensionPourMime("audio/wav"), "wav");
    assert.equal(extensionPourMime(""), "webm");
  });
});

// ------------------------------------------------------------
// 9. Exports sous-titres (.srt, .vtt), Markdown (.md) et texte (.txt)
// ------------------------------------------------------------
describe("Exports sous-titres et formats (js/outils/export-texte.js)", () => {
  const exemple = {
    titre: "Épisode 1",
    creeLe: 1760000000000,
    duree: 12.5,
    langue: "fr",
    qualite: "precis",
    intervenants: [{ nom: "Marie" }, { nom: "Paul" }],
    phrases: [
      { debut: 0, fin: 3.456, texte: "Bonjour à tous !", intervenant: 0 },
      {
        debut: 3.2, // léger chevauchement volontaire pour tester le recalage
        fin: 10.5,
        texte:
          "Voici une phrase volontairement très longue afin de vérifier que le découpage en sous-titres reste toujours lisible sur deux lignes de quarante-deux caractères au maximum.",
        intervenant: 1,
      },
    ],
  };

  it("formate les temps de sous-titres sans dépassement de millisecondes", () => {
    assert.equal(formaterTempsSousTitre(0, ","), "00:00:00,000");
    assert.equal(formaterTempsSousTitre(83.456, ","), "00:01:23,456");
    assert.equal(formaterTempsSousTitre(59.9999, "."), "00:01:00.000");
    assert.equal(formaterTempsSousTitre(3661.5, ","), "01:01:01,500");
  });

  it("découpe les longues phrases en sous-titres équilibrés sans chevauchement", () => {
    const cues = preparerSousTitres(exemple, { inclureIntervenants: true });
    assert.ok(cues.length >= 3, `Attendu au moins 3 sous-titres, obtenu ${cues.length}`);
    for (let i = 0; i < cues.length; i++) {
      const lignes = cues[i].texte.split("\n");
      assert.ok(lignes.length <= 2, `Trop de lignes : ${lignes.length}`);
      for (const l of lignes) assert.ok(l.length <= 42, `Ligne trop longue (${l.length}) : ${l}`);
      assert.ok(cues[i].fin > cues[i].debut);
      if (i > 0) assert.ok(cues[i].debut >= cues[i - 1].fin, "Deux sous-titres se chevauchent");
    }
  });

  it("génère des fichiers .srt et .vtt conformes avec option intervenants", () => {
    const srt = enSrt(exemple, { inclureIntervenants: true });
    assert.ok(srt.startsWith("1\n00:00:00,000 --> 00:00:03,456\nMarie : Bonjour à tous !"));

    const vttSansVoix = enVtt(exemple, { inclureIntervenants: false });
    assert.ok(vttSansVoix.startsWith("WEBVTT\n\n00:00:00.000 --> 00:00:03.456\nBonjour à tous !"));
    assert.ok(!vttSansVoix.includes("Marie :"));
  });

  it("génère du Markdown (.md) et du texte brut (.txt) avec ou sans horodatages", () => {
    const md = enMarkdown(exemple, { avecHorodatages: true });
    assert.ok(md.startsWith("# Épisode 1\n"));
    assert.ok(md.includes("**Marie** *(00:00)*"));
    assert.ok(md.includes("**Paul** *(00:03)*"));

    const txtSansHeure = enTexteBrut(exemple, { avecEntete: false, avecHorodatages: false });
    assert.ok(!txtSansHeure.includes("[00:00]"));
    assert.ok(txtSansHeure.startsWith("Marie : Bonjour à tous !"));
  });
});
