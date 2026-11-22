// ==========================================================
// Source unique du numéro de version d'Omni-Transcripteur.
//
// Script « classique » (pas un module ES) : il est lu à la fois par
// la page (index.html) pour afficher la version dans « À propos » et
// par le service worker (sw.js) pour nommer son cache hors ligne.
// Augmenter ce numéro à chaque publication suffit à déclencher la
// mise à jour sur tous les appareils.
// ==========================================================

self.VERSION_APP = "1.1.0";
