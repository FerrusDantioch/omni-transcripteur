/* Omni-Transcripteur — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Tests automatiques d'Omni-Transcripteur (vérifications rapides).
   Ils ouvrent l'application dans un vrai navigateur (Chromium, piloté
   par Playwright) et vérifient l'interface, les réglages prudents par
   défaut (choisis après les essais sur le Redmi), le calcul multi-cœurs
   et surtout qu'AUCUN modèle n'est téléchargé sans un appui sur
   « Télécharger ». Ils ne lancent pas de vraie transcription (il faudrait
   télécharger un modèle de plusieurs dizaines de Mo).

   Lancer (Playwright doit être installé) :  node tests/tester.js
   ============================================================ */
'use strict';
const { lancer, section, verifier, nouvellePage, controlesCommuns } = require('./outils.js');

const libelleCoche = (p, fieldset) => p.$eval(`#${fieldset} input:checked`, (i) => (i.closest('label') || i.parentElement).textContent.replace(/\s+/g, ' ').trim());

lancer('Omni-Transcripteur', async () => {
  await controlesCommuns({ serviceWorker: 'sw.js' });

  const demandes = [];
  const { ctx, p } = await nouvellePage({ avant: async (c) => c.on('request', (r) => demandes.push(r.url())) });
  // Première visite : la page se recharge une fois toute seule (en-têtes COOP/COEP).
  await p.waitForTimeout(4000);

  await section('Ouverture', async () => {
    verifier(await p.$eval('#choix-langue', (s) => s.value) === 'fr', 'langue de transcription : français par défaut');
    const langues = await p.$$eval('#choix-langue option', (o) => o.length);
    verifier(langues > 5, `${langues} langues proposées`);
    verifier(await p.isVisible('#bouton-telecharger'), 'le bouton « Télécharger » du modèle est proposé');
    verifier(await p.evaluate(() => crossOriginIsolated), 'calcul multi-cœurs possible (COOP/COEP ajoutés par sw.js)');
  });

  await section('Réglages prudents par défaut (téléphone qui ne fige pas)', async () => {
    const moteur = await libelleCoche(p, 'choix-moteur');
    verifier(/processeur/i.test(moteur), 'moteur : Processeur', moteur);
    const vitesse = await libelleCoche(p, 'choix-vitesse');
    verifier(/douce/i.test(vitesse), 'vitesse : Douce (2 cœurs)', vitesse);
  });

  await section('Aucun téléchargement sans appui', async () => {
    await p.waitForTimeout(3000);
    const modeles = demandes.filter((u) => /huggingface|\.onnx|\.bin$/i.test(u));
    verifier(modeles.length === 0, 'aucun modèle demandé à l’ouverture', modeles.slice(0, 3));
  });

  await section('Les réglages sont gardés', async () => {
    await p.selectOption('#choix-langue', 'en');
    await p.reload();
    await p.waitForTimeout(1500);
    verifier(await p.$eval('#choix-langue', (s) => s.value) === 'en', 'la langue choisie est retrouvée après fermeture');
    await p.selectOption('#choix-langue', 'fr');
  });

  await ctx.close();
});
