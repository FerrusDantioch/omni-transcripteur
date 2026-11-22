# Omni-Transcripteur

**Omni-Transcripteur** transforme la voix en texte, directement dans ton navigateur.

- 🎙️ Transcription depuis le micro (avec niveau sonore, pause/reprise et sauvegarde audio) ou depuis un fichier audio.
- 🔒 **Respect de la vie privée** : l'audio est traité sur ton appareil, rien n'est envoyé sur internet.
- 📴 **Fonctionne hors ligne** : le modèle de reconnaissance vocale se télécharge une seule fois, puis l'application marche sans connexion.
- 📱 Pensée d'abord pour le téléphone (Android), installable comme une application (PWA), avec réception depuis le menu « Partager » d'Android.
- 🇫🇷 Interface en français ; transcription en français par défaut, avec d'autres langues au choix.
- 🎨 Thèmes de l'écosystème Omni : **Omni (violet nuit)** par défaut, Automatique, Sombre et Clair.

> **Application en ligne :** <https://ferrusdantioch.github.io/omni-transcripteur/>
>
> **État actuel :** étapes 1, 2 et 3 en place : transcription (micro, fichier audio
> ou vidéo), reconnaissance des intervenants (renommer, fusionner, corriger), édition
> du texte et rechercher/remplacer, sous-titres vidéo (`.srt` et `.vtt`), export
> Markdown (`.md`), sauvegarde de l'historique (`.json`), et **Mode JDR** avec
> capture d'une session Discord en direct sur ordinateur.

## Feuille de route

1. Transcrire une voix (micro ou fichier audio). ✅
2. Reconnaître jusqu'à 6 voix différentes (« Intervenant 1 », « Intervenant 2 »…). ✅
3. Générer des sous-titres pour des vidéos (`.srt` et `.vtt`). ✅
4. Publier l'application sur le Google Play Store.

## Petit lexique

- **PWA** (Progressive Web App) : un site web qu'on peut « installer » sur son téléphone comme une vraie application, et qui peut marcher hors ligne.
- **Whisper** : un modèle d'intelligence artificielle, gratuit, qui reconnaît la parole.
- **Transformers.js** : une bibliothèque JavaScript qui permet de faire tourner Whisper directement dans le navigateur.
- **Serveur local** : un petit programme qui « sert » les fichiers du projet à ton navigateur, comme le ferait un vrai site web, mais sur ton ordinateur.

## Lancer le projet en local (sur ton ordinateur)

On ne peut pas simplement double-cliquer sur `index.html` : les navigateurs bloquent certaines fonctions (modules JavaScript, micro, mode hors ligne) quand une page est ouverte directement depuis le disque. Il faut passer par un **serveur local**. Voici deux façons simples :

### Option A — avec Python (souvent déjà installé)

1. Ouvre un terminal dans le dossier du projet.
2. Tape :
   ```bash
   python3 -m http.server 8000
   ```
   (Sous Windows, essaie `python -m http.server 8000` ou `py -m http.server 8000`.)
3. Ouvre ton navigateur à l'adresse : <http://localhost:8000>
4. Pour arrêter le serveur : reviens dans le terminal et appuie sur `Ctrl + C`.

### Option B — avec Node.js

1. Installe Node.js depuis <https://nodejs.org> (version « LTS »).
2. Dans un terminal ouvert dans le dossier du projet, tape :
   ```bash
   npx serve .
   ```
3. Ouvre l'adresse affichée dans le terminal (par exemple <http://localhost:3000>).

### Tester sur le téléphone

Le micro ne fonctionne que sur une adresse sécurisée (`https://`) ou sur `localhost`. Le plus simple est d'ouvrir directement la version publiée sur GitHub Pages : <https://ferrusdantioch.github.io/omni-transcripteur/>.

## Fonctions disponibles

- **Modèle Whisper téléchargé une seule fois**, avec barre de progression, pause, et **reprise après une coupure de connexion** (le téléchargement se fait par morceaux de 4 Mo gardés sur l'appareil).
- **Quatre qualités** (Réglages) : Rapide (≈ 45 Mo), Équilibré (≈ 80 Mo), Équilibré + (≈ 140 Mo : même modèle, moins compressé, plus juste), Précis (≈ 250 Mo), plus ≈ 27 Mo de moteur de calcul la première fois.
- **Moteur de calcul** : processeur par défaut (le plus fiable). La carte graphique (WebGPU) reste disponible dans les réglages, mais elle peut figer l'écran du téléphone.
- **Vitesse de calcul** : « Douce » par défaut (2 cœurs, le téléphone reste utilisable) ou « Maximale » (jusqu'à 4 cœurs, plus rapide mais le téléphone peut ralentir fortement).
- **Thèmes d'affichage** : Omni (violet nuit), Automatique, Sombre ou Clair, sans éclair au chargement.
- **Mémoire économisée** : le modèle ne se charge en mémoire qu'au moment de transcrire (pendant l'enregistrement au micro, il se charge en arrière-plan), et il est libéré après 5 minutes sans servir.
- **Micro amélioré** : barre de niveau sonore en direct, pause / reprise, chronomètre et téléchargement du dernier enregistrement pour ne jamais perdre une prise.
- **Fichier audio ou vidéo** (MP3, WAV, M4A, OGG, MP4, WebM, MOV…) : sélecteur de fichier, glisser-déposer sur ordinateur et partage depuis une autre appli sur Android (*Web Share Target*).
- Audios longs **découpés en morceaux d'environ 28 s**, coupés dans les silences, avec 1 s de chevauchement.
- Résultat **horodaté par phrase**, boutons **Copier**, **Télécharger (.txt)** (avec ou sans horodatages), **Sous-titres vidéo (.srt et .vtt)**, **Markdown (.md)**, **Modifier le texte**, **Rechercher / Remplacer**, **Effacer**.
- **Historique** sur l'appareil : ouvrir, renommer, supprimer, **sauvegarder et importer en `.json`**.
- **Reconnaissance des intervenants** (interrupteur) : le texte est présenté par blocs « Intervenant 1 », « Intervenant 2 »… (couleur + nom), jusqu'à 6 voix. Nombre de personnes : automatique ou de 2 à 6 (plus fiable). Modèles de voix ≈ 32 Mo, téléchargés une fois. En cas d'échec, le texte est gardé sans distinction de voix.
- **Édition des intervenants** : **Renommer** partout d'un coup, **Fusionner** deux intervenants en un clic, et **Corriger qui parle** phrase par phrase sans perte de position.
- **Mode JDR** :
  - « Importer l'enregistrement d'une partie » : import de fichier avec la reconnaissance des intervenants ;
  - « Capturer une session en direct (ordinateur) », Chrome ou Edge : mon micro sur une piste, le son de Discord (les autres joueurs) sur une autre, grâce au partage d'écran avec le son. Rappel de consentement obligatoire, indicateurs de niveau, sauvegarde toutes les 5 s (≈ 230 Mo par heure), reprise après plantage, export des pistes en `.wav`. Transcription **après** la session : ma piste à mon nom, la piste des autres séparée en intervenants, fusion dans l'ordre du temps ; elle peut être arrêtée et reprise.
  - Sur téléphone, la capture est impossible (Android interdit d'écouter le son d'une autre application) : un message renvoie vers l'import de fichier.

### Temps de traitement attendus (estimations)

Mesuré sur un ordinateur à 4 cœurs, qualité Rapide : 40 s d'audio en environ 5 s en vitesse « Douce » (4 s en « Maximale »). Sur un téléphone de milieu de gamme, compter **2 à 4 fois plus lent** :

| Qualité | 1 minute d'audio | Mise en mémoire au démarrage |
|---|---|---|
| Rapide | environ 20 à 45 s | quelques secondes |
| Équilibré | environ 45 s à 1 min 30 | 5 à 10 s |
| Équilibré + | environ 1 à 2 min | 5 à 15 s |
| Précis | environ 4 à 6 min (**mesuré** : 2 à 3 min pour 30 s sur le Redmi Note 15) | 20 à 40 s |

## Organisation des fichiers

```
index.html            page unique de l'application (avec politique de sécurité CSP)
manifest.json         fiche d'identité de la PWA (nom, icônes, couleurs, partage Android)
sw.js                 service worker : copie de l'application pour le hors ligne
licences-tierces.txt  récapitulatif des licences des bibliothèques et modèles tiers
.nojekyll             dit à GitHub Pages de publier les fichiers tels quels
assets/               logo de l'Omni-système
css/style.css         apparence et thèmes (Omni violet nuit, sombre, clair)
js/version.js         source unique du numéro de version (partagée avec sw.js)
js/theme-initial.js   applique le thème avant le premier rendu (pas de flash)
js/app.js             point de départ du JavaScript
js/config.js          qualités, langues, moteurs, thèmes
js/pwa/               installation, mode hors ligne, réception partage Android
js/stockage/          historique, captures et réglages (sur l'appareil)
js/audio/             micro, lecture des fichiers, découpage
js/transcription/     modèle Whisper (Web Worker) et téléchargement avec reprise
js/interface/         les différentes zones de l'écran et fenêtres de dialogue
js/outils/            mise en forme, édition de texte, écran allumé
js/voix/              reconnaissance des intervenants
js/capture/           Mode JDR : capture en direct (micro + son partagé), pistes, transcription
modeles/voix/         modèles de voix (pyannote, WeSpeaker) et leurs licences
vendor/transformers/  bibliothèques externes copiées telles quelles
icons/                icônes de l'application
```

## Tests automatiques

Deux suites de tests sont disponibles (pour le développement uniquement) :

1. **Tests unitaires rapides** (Node.js 22+, aucune dépendance à installer, aucun accès internet) :
   ```bash
   node --test tests/unitaires.mjs
   ```
2. **Tests dans un vrai navigateur** (Playwright + Chromium, vérifie l'interface mobile, le hors ligne et l'absence de téléchargement automatique) :
   ```bash
   npm install playwright
   npx playwright install chromium
   node tests/tester.js
   ```

## Technologies

- HTML, CSS et JavaScript « simple » (modules ES), sans framework ni outil de compilation.
- [Transformers.js](https://huggingface.co/docs/transformers.js) 4.3.0 pour faire tourner Whisper dans le navigateur (copié dans `vendor/`, aucun site externe n'est contacté à part Hugging Face lors du premier téléchargement du modèle).
- Hébergement gratuit sur GitHub Pages.

## Licence

**© 2026 Ferrus Dantioch — Creative Commons BY-NC-ND 4.0**
([résumé de la licence en français](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.fr))

En clair : le partage est autorisé, à l'identique et en citant l'auteur ; l'usage commercial est interdit ; la modification et les œuvres dérivées sont interdites. Le logiciel est fourni « en l'état », sans aucune garantie.

Texte complet dans le fichier [LICENSE](LICENSE) : le texte officiel en anglais, suivi de la traduction française officielle publiée par Creative Commons.

Les bibliothèques et modèles tiers (dossiers `vendor/` et `modeles/`) restent soumis à leurs propres licences — voir [licences-tierces.txt](licences-tierces.txt).
