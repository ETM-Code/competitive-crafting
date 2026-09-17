let context: AudioContext | undefined;
export function soundEnabled(): boolean {
  try {
    return localStorage.getItem('craft.sound') !== 'off';
  } catch {
    return true;
  }
}
export function saveSound(value: boolean) {
  try {
    localStorage.setItem('craft.sound', value ? 'on' : 'off');
  } catch {
    /* optional */
  }
}
export function playSound(kind: 'place' | 'collect' | 'click', enabled: boolean) {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = 'triangle';
    const time = context.currentTime;
    oscillator.frequency.setValueAtTime(
      kind === 'collect' ? 660 : kind === 'place' ? 280 : 180,
      time,
    );
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'collect' ? 990 : 100, time + 0.09);
    gain.gain.setValueAtTime(0.045, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(time + 0.14);
  } catch {
    /* Browser audio restrictions never interrupt play. */
  }
}
