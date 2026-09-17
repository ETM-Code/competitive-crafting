import { useEffect, useRef, useState } from 'react';
import { VERSION } from './shared/catalogue';
import type { Session } from './shared/types';
import { enterRoom, persistSession, storedSession, useConnection } from './lib/connection';
import { playSound, saveSound, soundEnabled } from './lib/audio';
import { ItemImage } from './components/ItemSlot';
import { AVATARS, Avatar, Scoreboard } from './components/Scoreboard';
import { Lobby } from './components/Lobby';
import { CraftingGame } from './components/CraftingGame';
import { Results } from './components/Results';
import { Jukebox } from './components/Jukebox';
import { InstallApp } from './components/InstallApp';
import { Panorama } from './components/Panorama';
function invitation() {
  return location.pathname.match(/^\/join\/([a-z0-9]+)\/?$/i)?.[1]?.toUpperCase() || '';
}
function savedName() {
  try {
    return localStorage.getItem('craft.name') || '';
  } catch {
    return '';
  }
}
export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const stored = storedSession();
    return invitation() && stored?.code !== invitation() ? null : stored;
  });
  const [name, setName] = useState(savedName),
    [avatar, setAvatar] = useState('creeper'),
    [code, setCode] = useState(invitation),
    [joining, setJoining] = useState(!!invitation()),
    [busy, setBusy] = useState(''),
    [entryError, setEntryError] = useState(''),
    [sound, setSound] = useState(soundEnabled),
    [leaveOpen, setLeaveOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [jukeboxOpen, setJukeboxOpen] = useState(false);
  const connection = useConnection(session),
    { state: room, status, send } = connection;
  const [now, setNow] = useState(Date.now());
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!leaveOpen) return;
    return () => previousFocus.current?.focus();
  }, [leaveOpen]);
  function openLeaveDialog() {
    previousFocus.current = document.activeElement as HTMLElement | null;
    setLeaveOpen(true);
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + connection.offset.current), 100);
    return () => clearInterval(timer);
  }, [connection.offset]);
  useEffect(() => {
    if (room)
      document.title = `${room.phase === 'lobby' ? 'Lobby' : room.phase === 'finished' ? 'Results' : `Round ${(room.round?.index || 0) + 1}`} · Competitive Crafting`;
    else document.title = 'Competitive Crafting';
  }, [room]);
  async function enter(mode: 'create' | 'join' | 'practice') {
    if (!name.trim()) {
      setEntryError('Choose a name before you enter the world.');
      document.getElementById('player-name')?.focus();
      return;
    }
    if (mode === 'join' && !/^[A-Z0-9]{6}$/.test(code)) {
      setEntryError('Enter a six-character room code.');
      return;
    }
    setBusy(mode);
    setEntryError('');
    playSound('click', sound);
    try {
      const next = await enterRoom(mode === 'join' ? `/api/rooms/${code}/join` : '/api/rooms', {
        name: name.trim(),
        avatar,
        ...(mode === 'practice' ? { practice: true } : {}),
      });
      persistSession(next);
      setSession(next);
      try {
        localStorage.setItem('craft.name', name.trim());
      } catch {
        /* optional */
      }
      history.replaceState(null, '', `/join/${next.code}`);
    } catch (error) {
      setEntryError(
        error instanceof Error ? error.message : 'Unable to connect. Please try again.',
      );
    } finally {
      setBusy('');
    }
  }
  function leave() {
    send({ type: 'leave' });
    persistSession(null);
    setSession(null);
    setLeaveOpen(false);
    setMenuOpen(false);
    history.replaceState(null, '', '/');
  }
  const activePlay = !!room && ['countdown', 'playing', 'reveal'].includes(room.phase);
  const menuButton = useRef<HTMLButtonElement | null>(null);
  const menuClose = useRef<HTMLButtonElement | null>(null);
  const [compactViewport, setCompactViewport] = useState(
    () => matchMedia('(max-width: 1100px)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(max-width: 1100px)');
    const update = () => setCompactViewport(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const menuVisible = activePlay && compactViewport && menuOpen;
  const restoreMenuFocus = useRef(false);
  useEffect(() => {
    if (menuVisible) menuClose.current?.focus();
    else if (restoreMenuFocus.current) {
      // Wait until React removes inert from the header before restoring focus.
      menuButton.current?.focus();
      restoreMenuFocus.current = false;
    }
  }, [menuVisible]);
  function closeMenu() {
    restoreMenuFocus.current = true;
    setMenuOpen(false);
  }
  useEffect(() => {
    const opened = (event: Event) => {
      const details = event.target;
      if (
        !(details instanceof HTMLDetailsElement) ||
        !details.open ||
        !details.matches('.how-to, .install-app')
      )
        return;
      document.querySelectorAll<HTMLDetailsElement>('.how-to, .install-app').forEach((other) => {
        if (other !== details) other.open = false;
      });
      setJukeboxOpen(false);
    };
    document.addEventListener('toggle', opened, true);
    return () => document.removeEventListener('toggle', opened, true);
  }, []);
  const error = entryError || connection.error;
  return (
    <div
      className={`app ${session ? 'in-world' : 'on-menu'}${activePlay ? ' active-play' : ''}`}
      data-phase={room?.phase || 'home'}
    >
      <Panorama active={!session} />
      <div className="world-shade" aria-hidden="true" />
      <div className="world-particles" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <header className="site-header" inert={leaveOpen || menuVisible}>
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            if (session) {
              e.preventDefault();
              openLeaveDialog();
            }
          }}
        >
          <ItemImage id="crafting_table" />
          <span>
            Competitive
            <br />
            Crafting
          </span>
        </a>
        <div className="header-right">
          {session && (
            <>
              <span className={`connection-status ${status}`} role="status">
                <i />
                {status === 'connected'
                  ? `${room?.practice ? 'Practice' : session.code}${connection.latency !== null ? ` · ${connection.latency}ms` : ''}`
                  : status === 'connecting'
                    ? 'Connecting…'
                    : status === 'disconnected'
                      ? 'Disconnected'
                      : 'Reconnecting…'}
              </span>
              <button
                className="text-button light"
                data-testid="leave-room"
                onClick={openLeaveDialog}
              >
                Leave
              </button>
            </>
          )}
          {activePlay && (
            <button
              ref={menuButton}
              className="text-button light game-menu-toggle"
              data-testid="game-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="game-menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              Menu
            </button>
          )}
          <span className="edition">JAVA RECIPES · {VERSION}</span>
        </div>
      </header>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {room &&
          (room.phase === 'reveal'
            ? room.round?.finishers.length
              ? `${room.players.find((p) => p.id === room.round?.finishers[0]?.playerId)?.name || 'A player'} finished first. Round complete.`
              : 'Time expired. The recipe is revealed.'
            : room.phase === 'playing'
              ? `Round ${(room.round?.index || 0) + 1} started. Craft the target and collect the output.`
              : room.phase === 'finished'
                ? 'Match complete. Final standings are ready.'
                : '')}
      </div>
      <main id="main-content" inert={leaveOpen || menuVisible}>
        {!session ? (
          <section className="title-menu" data-testid="home">
            <div className="title-art">
              <ItemImage id="crafting_table" />
              <span className="art-orbit orbit-one">
                <ItemImage id="diamond" />
              </span>
              <span className="art-orbit orbit-two">
                <ItemImage id="iron_pickaxe" />
              </span>
            </div>
            <span className="eyebrow menu-kicker">A friendly race from recipe to reality</span>
            <h1 className="game-title">
              COMPETITIVE<span>CRAFTING</span>
            </h1>
            <p className="tagline">Nine slots. A ticking clock. Your moment to craft.</p>
            <form
              className="menu-form"
              onSubmit={(e) => {
                e.preventDefault();
                void enter(joining ? 'join' : 'create');
              }}
            >
              <div className="identity">
                <label htmlFor="player-name">What should we call you?</label>
                <input
                  id="player-name"
                  data-testid="player-name"
                  autoComplete="nickname"
                  placeholder="Your player name"
                  maxLength={20}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="avatar-picker" role="group" aria-label="Choose your avatar">
                  {AVATARS.map((value) => (
                    <button
                      type="button"
                      aria-label={`${value.replaceAll('_', ' ')} avatar`}
                      title={value.replaceAll('_', ' ')}
                      aria-pressed={avatar === value}
                      className={avatar === value ? 'chosen' : ''}
                      key={value}
                      onClick={() => setAvatar(value)}
                    >
                      <Avatar value={value} />
                    </button>
                  ))}
                </div>
              </div>
              {joining && (
                <label className="join-code-label">
                  Room code
                  <input
                    data-testid="room-code-input"
                    className="code-input"
                    autoComplete="off"
                    placeholder="ABC123"
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                  />
                </label>
              )}
              <button
                className="button primary menu-primary"
                data-testid={joining ? 'join-room-submit' : 'create-room'}
                disabled={!!busy}
                type="submit"
              >
                {busy ? 'Opening your world…' : joining ? 'Join the party' : 'Create a room'}
                <span aria-hidden="true">→</span>
              </button>
              <div className="menu-secondary">
                <button
                  className="button"
                  type="button"
                  data-testid="join-room"
                  disabled={!!busy}
                  onClick={() => setJoining(!joining)}
                >
                  {joining ? 'Create instead' : 'Join a room'}
                </button>
                <button
                  className="button"
                  type="button"
                  data-testid="practice-button"
                  disabled={!!busy}
                  onClick={() => void enter('practice')}
                >
                  Solo practice
                </button>
              </div>
            </form>
            <p className="menu-footnote">
              2–12 friends · No account needed · A fresh craft every round
            </p>
            <details className="how-to" name="home-menu">
              <summary>How to play</summary>
              <p>
                Choose ingredients, arrange a valid recipe in the 3×3 grid, then collect the output.
                The first accepted craft wins. Harder rounds earn more points. Practise solo or
                change the rules in your room.
              </p>
            </details>
            <InstallApp />
          </section>
        ) : !room ? (
          <section className="window loading-screen" data-testid="connecting">
            <div className="loading-block">
              <ItemImage id="crafting_table" />
            </div>
            <h1>
              {status === 'disconnected'
                ? 'Connection closed'
                : status === 'reconnecting'
                  ? 'Finding your way back…'
                  : 'Opening your world…'}
            </h1>
            <p>Your room and progress are kept by the server.</p>
            <button className="button" onClick={connection.reconnect}>
              Reconnect now
            </button>
            <button className="text-button" onClick={leave}>
              Return to menu
            </button>
          </section>
        ) : (
          <>
            {status !== 'connected' && (
              <div className="connection-banner" role="status">
                {status === 'disconnected'
                  ? connection.error || 'Connection closed. Retry when you are ready to rejoin.'
                  : 'Connection interrupted. Reconnecting to your room…'}{' '}
                <button className="text-button" onClick={connection.reconnect}>
                  Retry now
                </button>
              </div>
            )}
            {room.phase === 'lobby' ? (
              <Lobby room={room} session={session} send={send} connected={status === 'connected'} />
            ) : room.phase === 'finished' ? (
              <Results
                room={room}
                session={session}
                send={send}
                connected={status === 'connected'}
              />
            ) : (
              <CraftingGame
                syncVersion={connection.syncVersion}
                room={room}
                session={session}
                send={send}
                connected={status === 'connected'}
                now={now}
                sound={sound}
              />
            )}
          </>
        )}
      </main>
      {error && (
        <div className="error-toast" role="alert" data-testid="error-message">
          <span>{error}</span>
          <button
            aria-label="Dismiss error"
            onClick={() => {
              setEntryError('');
              connection.setError('');
            }}
          >
            ×
          </button>
        </div>
      )}
      <footer
        id="game-menu"
        className={`site-footer${menuOpen ? ' menu-open' : ''}`}
        inert={leaveOpen}
        role={menuVisible ? 'dialog' : undefined}
        aria-modal={menuVisible || undefined}
        aria-label={menuVisible ? 'Game menu' : undefined}
        onKeyDown={(event) => {
          if (!menuVisible) return;
          if (event.key === 'Escape') closeMenu();
          if (event.key === 'Tab') {
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], select:not(:disabled), iframe, summary',
              ),
            ].filter((element) => element.getClientRects().length > 0);
            const first = controls[0];
            const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        {activePlay && (
          <div className="game-menu-actions">
            <button ref={menuClose} className="button game-menu-close" onClick={closeMenu}>
              Back to crafting
            </button>
            <button className="text-button light" onClick={openLeaveDialog}>
              Leave room
            </button>
          </div>
        )}
        {menuVisible && room && session && (
          <div className="game-menu-standings">
            <Scoreboard
              players={room.players}
              me={session.playerId}
              hostId={room.hostId}
              playerStates={room.round?.playerStates}
            />
          </div>
        )}
        <span>
          An unofficial Minecraft fan game.
          <br />
          Not affiliated with Mojang or Microsoft.
        </span>
        <Jukebox
          open={jukeboxOpen}
          onOpenChange={(open) => {
            if (open)
              document
                .querySelectorAll<HTMLDetailsElement>('.how-to, .install-app')
                .forEach((details) => {
                  details.open = false;
                });
            setJukeboxOpen(open);
          }}
          sound={sound}
          onSound={() => {
            saveSound(!sound);
            setSound(!sound);
          }}
        />
      </footer>
      {leaveOpen && (
        <div className="modal-backdrop">
          <div
            className="window leave-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setLeaveOpen(false);
              if (e.key === 'Tab') {
                const buttons = e.currentTarget.querySelectorAll('button');
                if (e.shiftKey && document.activeElement === buttons[0]) {
                  e.preventDefault();
                  buttons[1].focus();
                } else if (!e.shiftKey && document.activeElement === buttons[1]) {
                  e.preventDefault();
                  buttons[0].focus();
                }
              }
            }}
          >
            <h2 id="leave-title">Leave the crafting table?</h2>
            <p>You’ll leave this room. Your friends can keep playing.</p>
            <div>
              <button className="button primary" autoFocus onClick={() => setLeaveOpen(false)}>
                Keep crafting
              </button>
              <button className="button" data-testid="confirm-leave" onClick={leave}>
                Leave room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
