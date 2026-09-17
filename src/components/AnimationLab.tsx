import { useEffect, useMemo, useState } from 'react';
import { targets } from '../shared/catalogue';
import { makePalette, solutionFor } from '../shared/recipes';
import { DEFAULT_SETTINGS, pointsFor, REVEAL_MS } from '../shared/rules';
import type { Phase, RoomSnapshot, Session, RoundStanding } from '../shared/types';
import { CraftingGame } from './CraftingGame';
import { Lobby } from './Lobby';
import { Results } from './Results';
import { AVATARS } from './Scoreboard';
const session: Session = { code: 'DEVLAB', playerId: 'lab-one', token: '' };
const names = [
  'Oak & Ember',
  'Copperfox',
  'Redstone Rosie',
  'Block Party',
  'Ender Pearl',
  'Moss Boss',
  'Stone Cold',
  'Iron Giant',
  'Golden Goose',
  'Diamond Dave',
  'Night Miner',
  'Birch Please',
];
export default function AnimationLab() {
  const [scene, setScene] = useState<Phase>('playing');
  const [replay, setReplay] = useState(0);
  const [paused, setPaused] = useState(true);
  const [slow, setSlow] = useState(false);
  const [connected, setConnected] = useState(true);
  const [timeout, setTimeoutResult] = useState(false);
  const [forfeited, setForfeited] = useState(false);
  const [alone, setAlone] = useState(false);
  const [creative, setCreative] = useState(false);
  const [now, setNow] = useState(0);
  const room = useMemo<RoomSnapshot>(() => {
    const target = targets.find((entry) => entry.item === 'crafter') ?? targets[0];
    const players = names.map((name, index) => ({
      id: index === 0 ? session.playerId : `lab-${index + 1}`,
      name,
      avatar: AVATARS[index % AVATARS.length],
      ready: true,
      connected: index === 0 || (!alone && connected),
      score: index === 0 ? 850 : 800 - index * 50,
      wins: index === 0 ? 3 : 1,
      winningTime: index === 0 ? 21000 : 12000 + index * 1000,
      spectator: false,
    }));
    const standings: RoundStanding[] = players.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      avatar: player.avatar,
      scoreBefore: player.score - (index === 0 && !timeout && !forfeited ? 300 : 0),
      scoreAfter: player.score,
      points: index === 0 && !timeout && !forfeited ? 300 : 0,
      rankBefore:
        timeout || forfeited ? index + 1 : index === 0 ? 5 : index < 5 ? index : index + 1,
      rankAfter: index + 1,
      status: forfeited ? 'forfeited' : index === 0 && !timeout ? 'crafted' : 'timeout',
    }));
    const reason = forfeited ? 'forfeit' : timeout ? 'timeout' : 'crafted';
    return {
      code: session.code,
      hostId: session.playerId,
      phase: scene,
      settings: { ...DEFAULT_SETTINGS, inventory: creative ? 'creative' : 'constrained' },
      players,
      round:
        scene === 'countdown' || scene === 'lobby'
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
              finishers:
                scene === 'reveal' && !timeout && !forfeited
                  ? [{ playerId: session.playerId, points: 300, elapsed: 4200 }]
                  : [],
              playerStates: Object.fromEntries(
                players.map((player) => [
                  player.id,
                  {
                    forfeited,
                    expired: timeout,
                    grid: Array(9).fill(null),
                  },
                ]),
              ),
              endReason: scene === 'reveal' ? reason : null,
              standings,
              ...(scene === 'reveal' ? { solution: solutionFor(target.item) } : {}),
            },
      deadline: scene === 'countdown' ? 3000 : scene === 'reveal' ? REVEAL_MS : 30000,
      serverNow: 0,
      revision: replay,
      practice: false,
      endReason: alone ? 'alone' : null,
      history: targets.slice(0, 5).map((t) => ({
        target: t.item,
        winnerId: timeout || forfeited ? null : session.playerId,
        points: timeout || forfeited ? 0 : 300,
        endReason: reason,
        standings,
      })),
    };
  }, [scene, replay, connected, timeout, forfeited, alone, creative]);
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
            onChange={(event) => setScene(event.target.value as Phase)}
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
            <input
              type="checkbox"
              checked={slow}
              onChange={(event) => setSlow(event.target.checked)}
            />{' '}
            Slow
          </label>
          <label>
            <input
              type="checkbox"
              checked={!connected}
              onChange={(event) => setConnected(!event.target.checked)}
            />{' '}
            Offline
          </label>
          <label>
            <input
              type="checkbox"
              checked={timeout}
              onChange={(event) => setTimeoutResult(event.target.checked)}
            />{' '}
            Timeout
          </label>
          <label>
            <input
              type="checkbox"
              checked={forfeited}
              onChange={(event) => setForfeited(event.target.checked)}
            />{' '}
            Forfeit
          </label>
          <label>
            <input
              type="checkbox"
              checked={alone}
              onChange={(event) => setAlone(event.target.checked)}
            />{' '}
            Alone
          </label>
          <label>
            <input
              type="checkbox"
              checked={creative}
              onChange={(event) => setCreative(event.target.checked)}
            />{' '}
            Creative
          </label>
          <span>Fixtures only · no room messages</span>
        </nav>
      </details>
      <div
        className={`app in-world immersive-mobile ${['countdown', 'playing', 'reveal'].includes(scene) ? 'active-play' : ''}`}
        data-phase={scene}
      >
        <div className="world-backdrop" />
        <div className="world-shade" />
        <main id="main-content" key={replay}>
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
