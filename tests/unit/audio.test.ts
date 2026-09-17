import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = () => {
  const sources: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    buffer: unknown;
  }[] = [];
  const state = { value: 'suspended' };
  const resume = vi.fn().mockImplementation(async () => {
    state.value = 'running';
  });
  const audioSession = { type: 'auto' };
  vi.stubGlobal('navigator', { audioSession });
  const decodeAudioData = vi.fn().mockResolvedValue({ duration: 0.1 });
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal(
    'AudioContext',
    class {
      destination = {};
      get state() {
        return state.value;
      }
      resume = resume;
      decodeAudioData = decodeAudioData;
      createBufferSource() {
        const source = {
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          buffer: null,
          onended: null,
        };
        sources.push(source);
        return source;
      }
      createGain() {
        return { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
      }
    },
  );
  vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() });
  return { sources, resume, decodeAudioData, fetch, state, audioSession };
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('native Minecraft sounds', () => {
  it('fetches and decodes each sample once, reusing it for separate sources', async () => {
    const setup = mocks();
    const { prepareSounds, playSound } = await import('../../src/lib/audio');
    prepareSounds();
    prepareSounds();
    await vi.waitFor(() => expect(setup.decodeAudioData).toHaveBeenCalledTimes(3));
    playSound('click', true);
    playSound('click', true);
    expect(setup.fetch.mock.calls.map(([url]) => url)).toEqual([
      '/assets/sounds/button-click.wav',
      '/assets/sounds/item-pickup.wav',
      '/assets/sounds/experience-orb.wav',
    ]);
    expect(setup.sources).toHaveLength(2);
    expect(setup.sources.every((source) => source.start.mock.calls.length === 1)).toBe(true);
    expect(setup.resume).toHaveBeenCalledOnce();
    expect(setup.audioSession.type).toBe('ambient');
    setup.state.value = 'suspended';
    playSound('click', true);
    expect(setup.resume).toHaveBeenCalledTimes(2);
  });
  it('uses the distinct native buffer for placement and collection', async () => {
    const setup = mocks();
    const decoded = [{ duration: 0.1 }, { duration: 0.2 }, { duration: 0.3 }];
    for (const buffer of decoded) setup.decodeAudioData.mockResolvedValueOnce(buffer);
    const { prepareSounds, playSound, soundEffectTime } = await import('../../src/lib/audio');
    prepareSounds();
    await vi.waitFor(() => expect(setup.decodeAudioData).toHaveBeenCalledTimes(3));
    const before = performance.now();
    playSound('click', true);
    playSound('place', true);
    playSound('collect', true);
    expect(setup.sources.map((source) => source.buffer)).toEqual(decoded);
    expect(soundEffectTime()).toBeGreaterThanOrEqual(before);
    expect(setup.resume).toHaveBeenCalledOnce();
  });
  it('cancels pending effects on mute even if sound is re-enabled before decoding', async () => {
    const setup = mocks();
    let finish!: (buffer: { duration: number }) => void;
    setup.decodeAudioData.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { playSound, saveSound } = await import('../../src/lib/audio');
    playSound('place', true);
    await vi.waitFor(() => expect(setup.decodeAudioData).toHaveBeenCalledOnce());
    saveSound(false);
    saveSound(true);
    finish({ duration: 0.1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setup.sources).toHaveLength(0);
    playSound('place', true);
    expect(setup.sources).toHaveLength(1);
  });
  it('discards a delayed sample instead of playing a stale effect', async () => {
    const setup = mocks();
    let now = 100;
    vi.stubGlobal('performance', { now: () => now });
    let finish!: (buffer: { duration: number }) => void;
    setup.decodeAudioData.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { playSound } = await import('../../src/lib/audio');
    playSound('collect', true);
    await vi.waitFor(() => expect(setup.decodeAudioData).toHaveBeenCalledOnce());
    now += 251;
    finish({ duration: 0.1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setup.sources).toHaveLength(0);
    playSound('collect', true);
    expect(setup.sources).toHaveLength(1);
  });
  it('keeps effects optional when audio-session mixing is unavailable or restricted', async () => {
    const setup = mocks();
    Object.defineProperty(setup.audioSession, 'type', {
      set() {
        throw new Error('Unsupported audio session');
      },
    });
    const { prepareSounds, playSound } = await import('../../src/lib/audio');
    prepareSounds();
    await vi.waitFor(() => expect(setup.decodeAudioData).toHaveBeenCalledTimes(3));
    playSound('click', true);
    expect(setup.sources).toHaveLength(1);
  });
  it('does not play while muted and stops active sounds immediately on mute', async () => {
    const setup = mocks();
    const { prepareSounds, playSound, saveSound } = await import('../../src/lib/audio');
    prepareSounds();
    await vi.waitFor(() => expect(setup.decodeAudioData).toHaveBeenCalledTimes(3));
    playSound('click', false);
    expect(setup.sources).toHaveLength(0);
    playSound('click', true);
    playSound('place', true);
    playSound('collect', true);
    expect(setup.sources).toHaveLength(3);
    saveSound(false);
    expect(setup.sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith('craft.sound', 'off');
  });
  it('does not throw or emit synthetic substitute clicks when sample is unavailable', async () => {
    const setup = mocks();
    setup.fetch.mockResolvedValue({ ok: false });
    const { prepareSounds, playSound } = await import('../../src/lib/audio');
    prepareSounds();
    await Promise.resolve();
    expect(() => playSound('click', true)).not.toThrow();
    await Promise.resolve();
    expect(setup.sources).toHaveLength(0);
  });
});
