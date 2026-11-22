// ==========================================================
// Application immédiate du thème choisi AVANT le premier affichage,
// pour éviter tout « éclair » de mauvais thème au démarrage.
//
// Script classique synchrone dans <head> (compatible CSP stricte
// sans script inline).
// ==========================================================

(function () {
  var CLE = "transcriptor-reglages";
  var COULEURS_BARRE = { omni: "#1d1929", sombre: "#2a2a2d", clair: "#f1eff5" };

  function resoudreTheme(choix) {
    if (choix === "omni" || choix === "sombre" || choix === "clair") return choix;
    if (choix === "auto") {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "sombre" : "clair";
    }
    return "omni";
  }

  function appliquerTheme(choix) {
    var effectif = resoudreTheme(choix);
    var racine = document.documentElement;
    racine.setAttribute("data-theme", effectif);
    racine.setAttribute("data-theme-choix", choix || "omni");

    var metaCouleur = document.querySelector('meta[name="theme-color"]');
    if (metaCouleur) metaCouleur.setAttribute("content", COULEURS_BARRE[effectif] || COULEURS_BARRE.omni);

    var metaScheme = document.querySelector('meta[name="color-scheme"]');
    if (metaScheme) metaScheme.setAttribute("content", effectif === "clair" ? "light" : "dark");
  }

  var choixInitial = "omni";
  try {
    var enregistres = JSON.parse(localStorage.getItem(CLE)) || {};
    if (enregistres.theme) choixInitial = enregistres.theme;
  } catch (e) {
    // Stockage indisponible : on reste sur le thème Omni
  }
  appliquerTheme(choixInitial);

  // Permet au panneau Réglages d'appliquer un nouveau thème sans recharger la page
  window.appliquerThemeApp = appliquerTheme;

  // En mode « Automatique », suit les changements clair/sombre du téléphone en direct
  if (window.matchMedia) {
    var media = window.matchMedia("(prefers-color-scheme: dark)");
    var majAuto = function () {
      if (document.documentElement.getAttribute("data-theme-choix") === "auto") {
        appliquerTheme("auto");
      }
    };
    if (typeof media.addEventListener === "function") media.addEventListener("change", majAuto);
  }
})();
