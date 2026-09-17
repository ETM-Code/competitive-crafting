type SoundKind = 'place' | 'collect' | 'click';
const samples: Record<SoundKind, { file: string; volume: number }> = {
  click: { file: 'button-click.wav', volume: 0.3 },
  place: { file: 'item-pickup.wav', volume: 0.2 },
  collect: { file: 'experience-orb.wav', volume: 0.25 },
};
let context: AudioContext | undefined;
const buffers = new Map<SoundKind, AudioBuffer>();
const loads = new Map<SoundKind, Promise<void>>();
let soundGeneration = 0;
let lastEffectAt = -Infinity;
const active = new Set<AudioScheduledSourceNode>();

export function soundEffectTime(): number {
  return lastEffectAt;
}
export function soundEnabled(): boolean {
  try {
    return localStorage.getItem('craft.sound') !== 'off';
  } catch {
    return true;
  }
}
export function saveSound(value: boolean) {
  soundGeneration++;
  if (!value) {
    for (const source of active) {
      try {
        source.stop();
      } catch {
        /* Already finished. */
      }
    }
    active.clear();
  }
  try {
    localStorage.setItem('craft.sound', value ? 'on' : 'off');
  } catch {
    /* Optional. */
  }
}
function audioContext() {
  if (!context) {
    // Effects should mix with the provider's music rather than claim exclusive playback.
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
    } catch {
      /* Audio Session is optional and may be restricted by the browser. */
    }
    context = new AudioContext();
  }
  return context;
}
function loadSample(kind: SoundKind, audio: AudioContext) {
  if (buffers.has(kind) || loads.has(kind)) return;
  const load = fetch(`/assets/sounds/${samples[kind].file}`)
    .then((response) => {
      if (!response.ok) throw new Error('Sound unavailable');
      return response.arrayBuffer();
    })
    .then((bytes) => audio.decodeAudioData(bytes))
    .then((buffer) => {
      buffers.set(kind, buffer);
    })
    .catch(() => {
      /* Missing optional sound never interrupts play. */
    })
    .finally(() => {
      loads.delete(kind);
    });
  loads.set(kind, load);
}
export function prepareSounds() {
  try {
    const audio = audioContext();
    for (const kind of Object.keys(samples) as SoundKind[]) loadSample(kind, audio);
  } catch {
    /* Audio is optional. */
  }
}
function connect(source: AudioBufferSourceNode, gain: GainNode, audio: AudioContext) {
  source.connect(gain);
  gain.connect(audio.destination);
  active.add(source);
  source.onended = () => {
    active.delete(source);
    source.disconnect();
    gain.disconnect();
  };
}
export function playSound(kind: SoundKind, enabled: boolean) {
  if (!enabled) return;
  try {
    const audio = audioContext();
    const requestedAt = performance.now();
    const generation = soundGeneration;
    lastEffectAt = requestedAt;
    // Resume only when needed, inside the trusted handler, not after a fetch/React effect.
    if (audio.state !== 'running') void audio.resume().catch(() => {});
    const play = () => {
      const buffer = buffers.get(kind);
      if (!buffer || generation !== soundGeneration || performance.now() - requestedAt > 250)
        return;
      const source = audio.createBufferSource();
      source.buffer = buffer;
      const gain = audio.createGain();
      gain.gain.value = samples[kind].volume;
      connect(source, gain, audio);
      lastEffectAt = performance.now();
      source.start();
    };
    if (buffers.has(kind)) play();
    else {
      loadSample(kind, audio);
      void loads.get(kind)?.then(play);
    }
  } catch {
    /* Browser audio restrictions never interrupt play. */
  }
}
