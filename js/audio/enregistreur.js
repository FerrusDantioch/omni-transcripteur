// ==========================================================
// Enregistrement avec le micro.
// On utilise « MediaRecorder », l'enregistreur intégré au navigateur.
// Un « AnalyserNode » mesure le niveau sonore en direct pour l'indicateur.
// L'enregistrement reste dans la mémoire du téléphone : rien n'est envoyé.
// ==========================================================

export class Enregistreur {
  constructor() {
    this.flux = null;       // le « flux » audio venant du micro
    this.recorder = null;
    this.morceaux = [];
    this.dureeAccumulee = 0; // millisecondes enregistrées avant la dernière reprise
    this.heureReprise = 0;   // timestamp de la dernière reprise (0 si en pause)
    this.contexteAudio = null;
    this.analyseur = null;
    this.tamponNiveau = null;
  }

  // Le navigateur sait-il enregistrer ?
  static estDisponible() {
    return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  }

  // Demande l'accès au micro puis démarre l'enregistrement
  async demarrer() {
    this.flux = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,  // limite l'écho
        noiseSuppression: true,  // réduit les bruits de fond
        autoGainControl: true,   // ajuste le volume automatiquement
      },
    });
    this.morceaux = [];
    this.recorder = new MediaRecorder(this.flux);
    this.recorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) this.morceaux.push(e.data);
    });
    // Un petit paquet de données chaque seconde (rien n'est perdu si ça coupe)
    this.recorder.start(1000);
    this.dureeAccumulee = 0;
    this.heureReprise = Date.now();
    this.demarrerMesureNiveau();
  }

  // Branche un petit analyseur (sans sortie haut-parleur) pour la barre de niveau sonore
  demarrerMesureNiveau() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx || !this.flux) return;
      this.contexteAudio = new AudioCtx();
      this.contexteAudio.resume?.().catch(() => {});
      const source = this.contexteAudio.createMediaStreamSource(this.flux);
      this.analyseur = this.contexteAudio.createAnalyser();
      this.analyseur.fftSize = 256;
      source.connect(this.analyseur);
      this.tamponNiveau = new Uint8Array(this.analyseur.fftSize);
    } catch {
      // L'indicateur de niveau est facultatif : l'enregistrement continue sans lui
      this.arreterMesureNiveau();
    }
  }

  arreterMesureNiveau() {
    this.contexteAudio?.close().catch(() => {});
    this.contexteAudio = null;
    this.analyseur = null;
    this.tamponNiveau = null;
  }

  // Niveau sonore instantané entre 0 (silence) et 1 (fort)
  niveau() {
    if (!this.analyseur || !this.tamponNiveau || this.enPause) return 0;
    this.analyseur.getByteTimeDomainData(this.tamponNiveau);
    let pic = 0;
    for (let i = 0; i < this.tamponNiveau.length; i++) {
      const v = Math.abs(this.tamponNiveau[i] - 128) / 128;
      if (v > pic) pic = v;
    }
    return pic;
  }

  get peutMettreEnPause() {
    return typeof this.recorder?.pause === "function" && typeof this.recorder?.resume === "function";
  }

  get enPause() {
    return this.recorder?.state === "paused";
  }

  // Met l'enregistrement en pause (le chronomètre s'arrête)
  mettreEnPause() {
    if (!this.recorder || this.recorder.state !== "recording") return false;
    this.recorder.pause();
    if (this.heureReprise) {
      this.dureeAccumulee += Date.now() - this.heureReprise;
      this.heureReprise = 0;
    }
    return true;
  }

  // Reprend un enregistrement mis en pause
  reprendre() {
    if (!this.recorder || this.recorder.state !== "paused") return false;
    this.recorder.resume();
    this.heureReprise = Date.now();
    return true;
  }

  // Durée enregistrée (hors temps de pause), en secondes
  get duree() {
    const enCours = this.heureReprise ? Date.now() - this.heureReprise : 0;
    return (this.dureeAccumulee + enCours) / 1000;
  }

  // Arrête et renvoie l'enregistrement complet
  arreter() {
    return new Promise((resoudre) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        resoudre(null);
        return;
      }
      this.recorder.addEventListener(
        "stop",
        () => {
          const type = this.recorder.mimeType || "audio/webm";
          const enregistrement = new Blob(this.morceaux, { type });
          this.liberer();
          resoudre(enregistrement);
        },
        { once: true }
      );
      this.recorder.stop();
    });
  }

  // Abandonne l'enregistrement en cours
  annuler() {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.liberer();
  }

  // Coupe le micro (le voyant d'enregistrement du téléphone s'éteint)
  liberer() {
    this.arreterMesureNiveau();
    this.flux?.getTracks().forEach((piste) => piste.stop());
    this.flux = null;
    this.recorder = null;
    this.morceaux = [];
    this.dureeAccumulee = 0;
    this.heureReprise = 0;
  }
}

// Extension de fichier adaptée au type MIME d'un enregistrement MediaRecorder
export function extensionPourMime(typeMime = "") {
  const t = typeMime.toLowerCase();
  if (t.includes("webm")) return "webm";
  if (t.includes("ogg") || t.includes("opus")) return "ogg";
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return "m4a";
  if (t.includes("wav")) return "wav";
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  return "webm";
}
