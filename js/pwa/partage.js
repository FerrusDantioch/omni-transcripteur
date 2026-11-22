// ==========================================================
// Réception d'un fichier audio partagé depuis une autre application
// (Android : menu « Partager » → Omni-Transcripteur, via Web Share Target).
//
// Le service worker (sw.js) range temporairement le fichier reçu dans
// un cache local dédié, puis redirige ici avec « ?partage=recu ».
// Ce module lit ce fichier, le supprime aussitôt du cache et nettoie l'adresse.
// ==========================================================

export const CACHE_PARTAGE = "omni-transcripteur-partage";
export const CLE_PARTAGE = "./partage-audio";

/**
 * Vérifie si un fichier audio vient d'être partagé vers l'application.
 * @returns {Promise<{fichier: File, titre: string}|null>}
 */
export async function recupererFichierPartage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("partage") !== "recu") return null;

  // Nettoie l'adresse pour ne pas relancer l'import si on recharge la page
  const propre = new URL(window.location.href);
  propre.searchParams.delete("partage");
  window.history.replaceState({}, "", propre.pathname + propre.search + propre.hash);

  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(CACHE_PARTAGE);
    const reponse = await cache.match(CLE_PARTAGE);
    if (!reponse) return null;
    await cache.delete(CLE_PARTAGE);

    const blob = await reponse.blob();
    if (!blob || blob.size === 0) return null;

    const nomBrut = reponse.headers.get("x-nom-fichier");
    const nom = nomBrut ? decodeURIComponent(nomBrut) : "Audio partagé";
    const titre = nom.replace(/\.[^.]+$/, "") || "Audio partagé";
    const fichier = new File([blob], nom, { type: blob.type || "audio/mpeg" });
    return { fichier, titre };
  } catch (erreur) {
    console.warn("Impossible de lire le fichier partagé :", erreur);
    return null;
  }
}
