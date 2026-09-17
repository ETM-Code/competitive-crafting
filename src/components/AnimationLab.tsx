import { useEffect, useMemo, useState } from 'react';
import { targets } from '../shared/catalogue';
import { makePalette, solutionFor } from '../shared/recipes';
import { DEFAULT_SETTINGS, pointsFor } from '../shared/rules';
import type { Phase, RoomSnapshot, Session } from '../shared/types';
import { CraftingGame } from './CraftingGame';
import { Lobby } from './Lobby';
import { Results } from './Results';
const session: Session = { code: 'DEVLAB', playerId: 'lab-one', token: '' };
export default function AnimationLab() {
  const [scene, setScene] = useState<Phase>('playing'),
    [replay, setReplay] = useState(0),
    [paused, setPaused] = useState(true),
    [slow, setSlow] = useState(false),
    [connected, setConnected] = useState(true),
    [timeout, setTimeoutResult] = useState(false),
    [now, setNow] = useState(0),
    [overclocked, setOverclocked] = useState(false),
    [expired, setExpired] = useState(false);
  const room = useMemo<RoomSnapshot>(() => {
    const target = targets.find((entry) => entry.item === 'crafter') ?? targets[0];
    const finishers =
      scene === 'reveal' && !timeout
        ? [{ playerId: session.playerId, points: 100, elapsed: 4200 }]
        : [];
    return {
      code: session.code,
      hostId: session.playerId,
      phase: scene,
      settings: { ...DEFAULT_SETTINGS },
      players: [
        {
          id: 'lab-one',
          name: 'Oak & Ember',
          avatar: 'creeper',
          ready: true,
          connected: true,
          score: 450,
          wins: 3,
          winningTime: 21000,
          spectator: false,
        },
        {
          id: 'lab-two',
          name: 'Copperfox',
          avatar: 'pig',
          ready: true,
          connected,
          score: 250,
          wins: 1,
          winningTime: 12000,
          spectator: false,
        },
      ],
      round:
        scene === 'countdown' || scene === 'lobby' || !target
          ? null
          : {
              id: `lab-${replay}`,
              index: 2,
              target: target.item,
              tier: target.tier,
              points: pointsFor(target.tier),
              palette: makePalette(target.item, 8, () => 0.42),
              startsAt: 0,
              endsAt: 30000,
              finishers,
              playerStates: {
                [session.playerId]: {
                  engaged: overclocked,
                  overclocked,
                  deadline: overclocked ? 15000 : 30000,
                  expired,
                  grid: Array(9).fill(null),
                },
                'lab-two': {
                  engaged: false,
                  overclocked: false,
                  deadline: 30000,
                  expired: false,
                  grid: Array(9).fill(null),
                },
              },
              ...(scene === 'reveal' ? { solution: solutionFor(target.item) } : {}),
            },
      deadline: scene === 'countdown' ? 3000 : scene === 'reveal' ? 5000 : 30000,
      serverNow: 0,
      revision: replay,
      practice: false,
      history: targets
        .slice(0, 5)
        .map((t) => ({ target: t.item, winnerId: 'lab-one', points: 100 })),
    };
  }, [scene, replay, connected, timeout, overclocked, expired]);
  useEffect(() => {
    setNow(0);
  }, [scene, replay]);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setNow((value) => value + (slow ? 25 : 100)), 100);
    return () => clearInterval(timer);
  }, [paused, slow]);
  return (
    <div className={`animation-lab ${paused ? 'lab-paused' : ''} ${slow ? 'lab-slow' : ''}`}>
      <details className="lab-toolbar">
        <summary>
          <strong>DEV · Animation lab</strong>
          <span className="lab-scene">
            {scene} · {paused ? 'paused' : 'playing'}
          </span>
          <span className="lab-toggle">Controls</span>
        </summary>
        <nav className="lab-controls" aria-label="Development animation controls">
          <select
            aria-label="Fixture"
            value={scene}
            onChange={(e) => setScene(e.target.value as Phase)}
          >
            {['lobby', 'countdown', 'playing', 'reveal', 'finished'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button className="button compact" onClick={() => setPaused(!paused)}>
            {paused ? 'Play timeline' : 'Freeze'}
          </button>
          <button className="button compact" onClick={() => setReplay((value) => value + 1)}>
            Replay
          </button>
          <label>
            <input type="checkbox" checked={slow} onChange={(e) => setSlow(e.target.checked)} />{' '}
            Slow
          </label>
          <label>
            <input
              type="checkbox"
              checked={!connected}
              onChange={(e) => setConnected(!e.target.checked)}
            />{' '}
            Offline
          </label>
          <label>
            <input
              type="checkbox"
              checked={timeout}
              onChange={(e) => setTimeoutResult(e.target.checked)}
            />{' '}
            Timeout
          </label>
          <label>
            <input
              type="checkbox"
              checked={overclocked}
              onChange={(e) => setOverclocked(e.target.checked)}
            />{' '}
            Overclock
          </label>
          <label>
            <input
              type="checkbox"
              checked={expired}
              onChange={(e) => setExpired(e.target.checked)}
            />{' '}
            Personal expiry
          </label>
          <span>Fixtures only · no room messages</span>
        </nav>
      </details>
      <div
        className={`app in-world ${['countdown', 'playing', 'reveal'].includes(scene) ? 'active-play' : ''}`}
        data-phase={scene}
      >
        <div className="world-backdrop" />
        <div className="world-shade" />
        <main key={replay}>
          {scene === 'lobby' ? (
            <Lobby room={room} session={session} send={() => false} connected={connected} />
          ) : scene === 'finished' ? (
            <Results room={room} session={session} send={() => false} connected={connected} />
          ) : (
            <CraftingGame
              room={room}
              session={session}
              send={() => false}
              connected={connected}
              now={now}
              sound={false}
            />
          )}
        </main>
      </div>
    </div>
  );
}
