let context: AudioContext | undefined;
let clickBuffer: AudioBuffer | undefined;
let clickLoad: Promise<void> | undefined;
let soundGeneration = 0;
const active = new Set<AudioScheduledSourceNode>();

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
  context ??= new AudioContext();
  return context;
}
export function prepareSounds() {
  if (clickBuffer || clickLoad) return;
  try {
    const audio = audioContext();
    clickLoad = fetch('/assets/sounds/button-click.wav')
      .then((response) => {
        if (!response.ok) throw new Error('Sound unavailable');
        return response.arrayBuffer();
      })
      .then((bytes) => audio.decodeAudioData(bytes))
      .then((buffer) => {
        clickBuffer = buffer;
      })
      .catch(() => {
        /* Missing optional sound never interrupts play. */
      })
      .finally(() => {
        clickLoad = undefined;
      });
  } catch {
    /* Audio is optional. */
  }
}
function connect(
  source: AudioScheduledSourceNode & AudioNode,
  gain: GainNode,
  audio: AudioContext,
) {
  source.connect(gain);
  gain.connect(audio.destination);
  active.add(source);
  source.onended = () => {
    active.delete(source);
    source.disconnect();
    gain.disconnect();
  };
}
export function playSound(kind: 'place' | 'collect' | 'click', enabled: boolean) {
  if (!enabled) return;
  try {
    const audio = audioContext();
    // Resume inside the original trusted input handler, never after a fetch/React effect.
    void audio.resume().catch(() => {});
    if (kind === 'click') {
      const generation = soundGeneration;
      const requestedAt = performance.now();
      const play = () => {
        if (!clickBuffer || generation !== soundGeneration || performance.now() - requestedAt > 250)
          return;
        const source = audio.createBufferSource();
        source.buffer = clickBuffer;
        const gain = audio.createGain();
        gain.gain.value = 0.3;
        connect(source, gain, audio);
        source.start();
      };
      if (clickBuffer) play();
      else {
        prepareSounds();
        void clickLoad?.then(play);
      }
      return;
    }
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'triangle';
    const time = audio.currentTime;
    oscillator.frequency.setValueAtTime(kind === 'collect' ? 660 : 280, time);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'collect' ? 990 : 100, time + 0.09);
    gain.gain.setValueAtTime(0.045, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    connect(oscillator, gain, audio);
    oscillator.start();
    oscillator.stop(time + 0.14);
  } catch {
    /* Browser audio restrictions never interrupt play. */
  }
}
