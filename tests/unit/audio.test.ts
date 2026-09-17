import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = () => {
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const resume = vi.fn().mockResolvedValue(undefined);
  const decodeAudioData = vi.fn().mockResolvedValue({ duration: 0.1 });
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal(
    'AudioContext',
    class {
      destination = {};
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
  return { sources, resume, decodeAudioData, fetch };
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('native button sound', () => {
  it('fetches and decodes one sample, reusing it for separate click sources', async () => {
    const setup = mocks();
    const { prepareSounds, playSound } = await import('../../src/lib/audio');
    prepareSounds();
    prepareSounds();
    await vi.waitFor(() => expect(setup.decodeAudioData).toHaveBeenCalledTimes(1));
    playSound('click', true);
    playSound('click', true);
    expect(setup.fetch).toHaveBeenCalledExactlyOnceWith('/assets/sounds/button-click.wav');
    expect(setup.sources).toHaveLength(2);
    expect(setup.sources.every((source) => source.start.mock.calls.length === 1)).toBe(true);
    expect(setup.resume).toHaveBeenCalledTimes(2);
  });
  it('does not play while muted and stops active sounds immediately on mute', async () => {
    const setup = mocks();
    const { prepareSounds, playSound, saveSound } = await import('../../src/lib/audio');
    prepareSounds();
    await vi.waitFor(() => expect(setup.decodeAudioData).toHaveBeenCalledTimes(1));
    playSound('click', false);
    expect(setup.sources).toHaveLength(0);
    playSound('click', true);
    saveSound(false);
    expect(setup.sources[0].stop).toHaveBeenCalledOnce();
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
