import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import playlist from '../data/playlist.json';
import { ItemImage } from './ItemSlot';
import { createShuffleBag, type JukeboxTrack } from '../lib/jukebox';

export interface JukeboxHandle {
  requestPlayback(): void;
}
interface JukeboxProps {
  sound: boolean;
  onSound: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
export const Jukebox = forwardRef<JukeboxHandle, JukeboxProps>(function Jukebox(
  { sound, onSound, open: controlledOpen, onOpenChange },
  ref,
) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState('Choose a soundtrack for your next craft.');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [{ bag, initialTrack }] = useState(() => {
    const bag = createShuffleBag(playlist.tracks);
    return { bag, initialTrack: bag.next() };
  });
  const [track, setTrack] = useState<JukeboxTrack>(initialTrack);
  const currentTrack = useRef(track);
  currentTrack.current = track;
  const frame = useRef<HTMLIFrameElement>(null);
  const enabled = useRef(sound);
  const wanted = useRef(false);
  const playing = useRef(false);
  const intentionallyPaused = useRef(false);
  const playbackTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  enabled.current = sound;

  function command(type: string, extra: Record<string, unknown> = {}) {
    frame.current?.contentWindow?.postMessage(
      { channel: 'crafting-spotify', type, ...extra },
      location.origin,
    );
  }

  function attemptPlayback() {
    if (!enabled.current || playing.current || playbackTimeout.current) return;
    setStatus('Starting music…');
    command('play');
    playbackTimeout.current = setTimeout(() => {
      playbackTimeout.current = undefined;
      if (!playing.current && enabled.current)
        setStatus('Browser blocked music? Tap the Spotify player to start it.');
    }, 4000);
  }
  function requestPlayback(explicit = false) {
    if (!enabled.current || (intentionallyPaused.current && !explicit)) return;
    intentionallyPaused.current = false;
    wanted.current = true;
    setMounted(true);
    if (ready) attemptPlayback();
  }
  useImperativeHandle(ref, () => ({ requestPlayback: () => requestPlayback() }));
  useEffect(() => {
    if (sound || open) setMounted(true);
  }, [sound, open]);

  useEffect(() => {
    command('sound', { enabled: sound });
    if (!sound) {
      wanted.current = false;
      playing.current = false;
      clearTimeout(playbackTimeout.current);
      playbackTimeout.current = undefined;
      setStatus('Sound is off.');
    }
  }, [sound]);
  useEffect(() => () => clearTimeout(playbackTimeout.current), []);

  useEffect(() => {
    if (!mounted) return;
    setReady(false);
    setFailed(false);
    playing.current = false;
    clearTimeout(playbackTimeout.current);
    playbackTimeout.current = undefined;
    setStatus('Loading Spotify…');
    const timeout = setTimeout(() => {
      setFailed(true);
      setStatus(
        'Spotify is taking a while. It may be blocked by your browser. You can still play the game.',
      );
    }, 12000);
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== 'crafting-spotify'
      )
        return;
      if (event.data.type === 'loaded') {
        command('init', { uri: currentTrack.current.uri, enabled: enabled.current });
      } else if (event.data.type === 'ready') {
        clearTimeout(timeout);
        setReady(true);
        setFailed(false);
        command('sound', { enabled: enabled.current });
        setStatus(enabled.current ? 'Music starts with your next game action.' : 'Sound is off.');
        if (wanted.current && enabled.current) attemptPlayback();
      } else if (event.data.type === 'playback') {
        if (typeof event.data.isPaused !== 'boolean') return;
        if (event.data.playingURI && event.data.playingURI !== currentTrack.current.uri) return;
        const wasPlaying = playing.current;
        playing.current = !event.data.isPaused && event.data.isBuffering !== true;
        if (playing.current) {
          clearTimeout(playbackTimeout.current);
          playbackTimeout.current = undefined;
          setStatus('Playing · Spotify may offer previews.');
        } else if (event.data.isBuffering === true) {
          setStatus('Spotify is buffering…');
        } else if (intentionallyPaused.current) {
          setStatus('Music paused. Open the jukebox or choose Next to resume.');
        } else if (wasPlaying) {
          // Spotify gives no distinct completion event; do not interpret pause as track end.
          intentionallyPaused.current = true;
          wanted.current = false;
          clearTimeout(playbackTimeout.current);
          playbackTimeout.current = undefined;
          setStatus('Music paused or finished. Choose Next for another favourite.');
        }
      } else if (event.data.type === 'error') {
        clearTimeout(timeout);
        setReady(false);
        setFailed(true);
        setStatus(
          'Spotify is unavailable. Open the playlist on Spotify or keep crafting without music.',
        );
      }
    }
    window.addEventListener('message', receive);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('message', receive);
    };
  }, [mounted, attempt]);

  function choose(next: JukeboxTrack) {
    bag.select(next.uri);
    currentTrack.current = next;
    setTrack(next);
    playing.current = false;
    intentionallyPaused.current = false;
    wanted.current = enabled.current;
    clearTimeout(playbackTimeout.current);
    playbackTimeout.current = undefined;
    command('load', { uri: next.uri });
    if (enabled.current) attemptPlayback();
  }
  const playlistURL = `https://open.spotify.com/playlist/${playlist.playlistUri.split(':').pop()}`;
  return (
    <div className="jukebox">
      <div className="jukebox-controls">
        <button
          className="sound-button"
          data-testid="sound-toggle"
          aria-label={sound ? 'Turn sound off' : 'Turn sound on'}
          aria-pressed={sound}
          onClick={() => {
            if (!sound) {
              enabled.current = true;
              intentionallyPaused.current = false;
              command('sound', { enabled: true });
              requestPlayback(true);
            }
            onSound();
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M3 9h4l5-4v14l-5-4H3z" />
            {sound ? <path d="M16 8q5 4 0 8m3-11q8 7 0 14" /> : <path d="m16 9 6 6m0-6-6 6" />}
          </svg>
        </button>
        <button
          className="jukebox-toggle"
          data-testid="jukebox-toggle"
          aria-expanded={open}
          aria-controls="jukebox-panel"
          onClick={() => {
            if (!open) requestPlayback(true);
            setLocalOpen(!open);
            onOpenChange?.(!open);
          }}
        >
          <ItemImage id="jukebox" />
          <span>
            Jukebox<small>Powered by Spotify</small>
          </span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      </div>
      {mounted && (
        <section
          id="jukebox-panel"
          className="jukebox-panel"
          hidden={!open}
          aria-label="Spotify jukebox"
        >
          <p className="jukebox-current small" data-testid="jukebox-current">
            <strong>{track.title}</strong> · {track.artist}
          </p>
          <p className="small">Shuffled favourites · Next chooses another track.</p>
          <iframe
            key={attempt}
            ref={frame}
            className="spotify-host"
            src="/spotify-player.html"
            title="Spotify music player"
            onLoad={() =>
              command('init', { uri: currentTrack.current.uri, enabled: enabled.current })
            }
            width="100%"
            height="152"
            style={{ border: 0 }}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          />
          <p className="small" role="status">
            {status}
          </p>
          {failed && (
            <button className="button compact" onClick={() => setAttempt((value) => value + 1)}>
              Retry Spotify
            </button>
          )}
          <div className="jukebox-actions">
            <button
              className="button compact"
              disabled={!ready}
              onClick={() => {
                intentionallyPaused.current = true;
                wanted.current = false;
                playing.current = false;
                clearTimeout(playbackTimeout.current);
                playbackTimeout.current = undefined;
                command('pause');
                setStatus('Music paused. Open the jukebox or choose Next to resume.');
              }}
            >
              Pause
            </button>
            <button className="button compact" disabled={!ready} onClick={() => choose(bag.next())}>
              Next
            </button>
            <a href={playlistURL} target="_blank" rel="noreferrer">
              Open Spotify ↗
            </a>
          </div>
          {!sound && <p className="small">Sound is off. Turn it on to play music.</p>}
          <label>
            Pick a track
            <select
              key={attempt}
              aria-label="Spotify track"
              value={track.uri}
              disabled={!ready}
              onChange={(e) => {
                const selection = playlist.tracks.find(
                  (candidate) => candidate.uri === e.target.value,
                );
                if (selection) choose(selection);
              }}
            >
              {playlist.tracks.map((track) => (
                <option key={track.uri} value={track.uri}>
                  {track.title} — {track.artist}
                </option>
              ))}
            </select>
          </label>
          <p className="small">Spotify may offer previews; use Next when a track ends.</p>
        </section>
      )}
    </div>
  );
});
