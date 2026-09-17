import { useEffect, useRef, useState } from 'react';
import { itemById } from '../shared/catalogue';
import { matchRecipe } from '../shared/recipes';
import type { ClientMessage, Grid, RoomSnapshot, Session } from '../shared/types';
import { ItemImage, ItemSlot } from './ItemSlot';
import { Inventory } from './Inventory';
import { Scoreboard } from './Scoreboard';
import { Overclock } from './Overclock';
import { playSound } from '../lib/audio';
const EMPTY_GRID: Grid = Array(9).fill(null);
export function CraftingGame({
  room,
  session,
  send,
  connected,
  now,
  sound,
  syncVersion = 0,
}: {
  room: RoomSnapshot;
  session: Session;
  send: (message: ClientMessage) => boolean;
  connected: boolean;
  now: number;
  sound: boolean;
  syncVersion?: number;
}) {
  const round = room.round;
  const own = round?.playerStates[session.playerId];
  // The connection layer projects pending local grids over intermediate snapshots.
  // Fresh connections always receive the server's persisted private grid.
  const grid = own?.grid ?? EMPTY_GRID;
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const [selected, setSelected] = useState<string | null>(null),
    [erase, setErase] = useState(false),
    [recent, setRecent] = useState<string[]>([]),
    [pending, setPending] = useState(false),
    [overclockPending, setOverclockPending] = useState(false),
    [engagedRound, setEngagedRound] = useState<string | null>(null);
  const engagement = useRef<string | null>(null);
  useEffect(() => {
    setSelected(null);
    setErase(false);
    setPending(false);
    setOverclockPending(false);
    setEngagedRound(null);
    engagement.current = null;
  }, [round?.id]);
  useEffect(() => {
    setPending(false);
    setOverclockPending(false);
    const restoredEngagement = own?.engaged ? (round?.id ?? null) : null;
    engagement.current = restoredEngagement;
    setEngagedRound(restoredEngagement);
  }, [syncVersion]);
  useEffect(() => {
    if (own?.overclocked) setOverclockPending(false);
  }, [own?.overclocked]);
  useEffect(() => {
    round?.palette.forEach((id) => {
      if (itemById[id]) {
        const image = new Image();
        image.src = itemById[id].icon;
      }
    });
  }, [round?.id, round?.palette]);
  const me = room.players.find((p) => p.id === session.playerId);
  const finished = round?.finishers.some((p) => p.playerId === session.playerId);
  const personalDeadline = own?.deadline ?? round?.endsAt ?? room.deadline ?? now;
  const expired = !!own?.expired || (room.phase === 'playing' && !!own && now >= personalDeadline);
  const locked =
    !connected ||
    room.phase !== 'playing' ||
    !own ||
    !!me?.spectator ||
    !!finished ||
    expired ||
    pending;
  const match = round && room.phase === 'playing' ? matchRecipe(grid, round.target) : null;
  const deadline = room.phase === 'playing' ? personalDeadline : (room.deadline ?? now);
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const engage = () => {
    if (locked || !round) return false;
    if (!own?.engaged && engagement.current !== round.id) {
      if (!send({ type: 'engage', roundId: round.id })) return false;
      engagement.current = round.id;
      setEngagedRound(round.id);
    }
    return true;
  };
  const updateGrid = (next: Grid) => {
    if (!round || !engage()) return;
    if (send({ type: 'grid', roundId: round.id, grid: next })) {
      gridRef.current = next;
      playSound('place', sound);
    }
  };
  const place = (index: number, id: string | null) => {
    if (
      locked ||
      (id &&
        (!itemById[id] ||
          (room.settings.inventory === 'constrained' && !round?.palette.includes(id))))
    )
      return;
    updateGrid(gridRef.current.map((item, i) => (i === index ? id : item)));
    if (id) setRecent((value) => [id, ...value.filter((item) => item !== id)].slice(0, 9));
  };
  const collect = () => {
    if (!round || !match || !engage()) return;
    // A placement's grid message is already ahead of this collect on the socket.
    if (send({ type: 'collect', roundId: round.id, grid: [...gridRef.current] })) {
      setPending(true);
      playSound('collect', sound);
    }
  };
  if (!round || room.phase === 'countdown')
    return (
      <section className="window countdown" data-testid="countdown">
        <span className="eyebrow">Tools ready. Eyes on the table.</span>
        <h1>{room.phase === 'countdown' ? 'Get ready to craft' : 'Preparing the next craft'}</h1>
        <strong key={seconds} className="countdown-number">
          {seconds || '…'}
        </strong>
        <p>The recipe will appear when the round begins.</p>
      </section>
    );
  const target = itemById[round.target];
  const winner = room.players.find((p) => p.id === round.finishers[0]?.playerId);
  const progress = Math.max(
    0,
    Math.min(
      1,
      (deadline - now) /
        Math.max(1, room.phase === 'playing' ? personalDeadline - round.startsAt : 5000),
    ),
  );
  return (
    <div className="game-layout" data-testid="game">
      <section
        className={`window crafting-window ${finished ? 'craft-completed' : ''} ${own?.overclocked ? 'is-overclocked' : ''}`}
      >
        <span className="sr-only" role="status">
          {finished
            ? 'Craft accepted by the server. Your points are recorded.'
            : expired
              ? 'Your time is up. Zero points this round. Other players can keep crafting.'
              : pending
                ? 'Checking your craft with the server.'
                : ''}
        </span>
        <header className="round-header">
          <span className="eyebrow">
            {room.practice ? 'Practice' : room.settings.preset.replace('-', ' ')}{' '}
            <span className="muted">/</span> Round {round.index + 1} of {room.settings.rounds}
          </span>
          <div className="personal-clock">
            {own?.overclocked && (
              <span className="overclock-badge" data-testid="overclock-badge">
                1.5× OC
              </span>
            )}
            <span
              className={`timer ${seconds <= 10 ? 'urgent' : ''}`}
              data-testid="round-timer"
              aria-label={`${seconds} seconds remaining on ${room.phase === 'playing' ? 'your' : 'the round'} clock`}
            >
              {String(Math.floor(seconds / 60)).padStart(2, '0')}:
              {String(seconds % 60).padStart(2, '0')}
            </span>
          </div>
        </header>
        <div
          className="xp-track"
          role="progressbar"
          aria-label="Your time remaining"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div style={{ transform: `scaleX(${progress})` }} />
        </div>
        <div className="target">
          <div className="target-art">
            <ItemImage key={round.target} id={round.target} />
            <span className="target-shadow" />
          </div>
          <div>
            <span className="eyebrow">
              {room.phase === 'reveal' ? 'The round is over' : 'Your next craft'}
            </span>
            <h1 data-testid="target-name">{target?.name || round.target}</h1>
            <div className="target-meta">
              <span className="points" data-testid="round-points">
                {Math.round(round.points * (own?.overclocked ? 1.5 : 1))} XP
              </span>
              <span>Tier {round.tier}</span>
            </div>
            <p
              className={
                room.phase === 'playing' && !finished && !expired && !me?.spectator
                  ? 'target-instruction'
                  : undefined
              }
            >
              {room.phase === 'reveal'
                ? winner
                  ? `${winner.name} crafted it first!`
                  : 'Time’s up. A recipe for next time.'
                : finished
                  ? 'Craft accepted. Nicely done!'
                  : expired
                    ? 'Your clock is out. The table is still racing.'
                    : me?.spectator
                      ? 'You’re spectating. Join the next match.'
                      : 'Build the recipe. Collect the glory.'}
            </p>
          </div>
        </div>
        {room.phase === 'playing' && own && !finished && !expired && !me?.spectator && (
          <Overclock
            round={round}
            own={own}
            now={now}
            pending={overclockPending}
            available={!own.engaged && engagedRound !== round.id}
            connected={connected}
            onActivate={() => {
              if (
                locked ||
                engagement.current === round.id ||
                own.engaged ||
                overclockPending ||
                now >= round.startsAt + Math.floor((round.endsAt - round.startsAt) / 2)
              )
                return;
              if (send({ type: 'overclock', roundId: round.id })) {
                setOverclockPending(true);
                playSound('click', sound);
              }
            }}
          />
        )}
        {expired && room.phase === 'playing' && !finished && (
          <div className="personal-expiry" data-testid="personal-expiry" role="status">
            <ItemImage id="redstone_torch" />
            <div>
              <h2>{own?.overclocked ? 'Overclock burned out' : 'Your time is up'}</h2>
              <p>
                0 XP this round.{' '}
                {room.practice
                  ? 'Waiting for the round result…'
                  : 'Other crafters still have time. Your next chance is the next round.'}
              </p>
            </div>
          </div>
        )}
        {room.phase === 'reveal' ? (
          <div className="recipe-reveal" data-testid="recipe-reveal">
            <div className="craft-grid">
              {(round.solution || EMPTY_GRID).map((id, index) => (
                <ItemSlot
                  key={index}
                  id={id}
                  disabled
                  label={`Recipe slot ${index + 1}${id ? `: ${itemById[id]?.name || id}` : ': empty'}`}
                />
              ))}
            </div>
            <div>
              <h2>{winner ? 'A well-crafted victory.' : 'Every craft is practice.'}</h2>
              <p>Next up in {seconds}s</p>
              {round.finishers.map((f) => (
                <p key={f.playerId}>
                  {room.players.find((p) => p.id === f.playerId)?.name}{' '}
                  <strong className="earned">+{f.points} XP</strong>{' '}
                  <span className="small">{(f.elapsed / 1000).toFixed(2)}s</span>
                  {round.playerStates[f.playerId]?.overclocked && (
                    <span className="overclock-badge">1.5× OC</span>
                  )}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="craft-workbench">
              <div className="craft-area">
                <div>
                  <div className="section-line">
                    <h2>Crafting</h2>
                    <button
                      className="text-button"
                      data-testid="clear-grid"
                      disabled={locked}
                      onClick={() => updateGrid([...EMPTY_GRID])}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="craft-grid" data-testid="crafting-grid">
                    {grid.map((id, index) => (
                      <ItemSlot
                        key={index}
                        id={id}
                        disabled={locked}
                        testId={`grid-slot-${index}`}
                        label={`Crafting slot ${index + 1}: ${id ? itemById[id]?.name || id : 'empty'}`}
                        onInteract={engage}
                        onClick={() => place(index, erase ? null : selected)}
                        onPlace={(value) => place(index, value || null)}
                      />
                    ))}
                  </div>
                </div>
                <span className="craft-arrow" aria-hidden="true">
                  →
                </span>
                <div className={`output-area ${match && !locked ? 'craft-valid' : ''}`}>
                  <h2>Output</h2>
                  <ItemSlot
                    id={match?.output}
                    disabled={locked || !match}
                    testId="craft-output"
                    label={
                      match
                        ? `Collect ${target?.name}, ${match.count}`
                        : 'Output: complete the recipe first'
                    }
                    onClick={collect}
                  >
                    {match && <span className="stack-count">{match.count}</span>}
                  </ItemSlot>
                  <button
                    className="button primary collect-button"
                    data-testid="collect-output"
                    disabled={locked || !match}
                    onClick={collect}
                  >
                    {finished
                      ? 'Collected ✓'
                      : expired
                        ? 'Time’s up'
                        : pending
                          ? 'Checking…'
                          : 'Collect'}
                  </button>
                </div>
              </div>
              <div className="selection-line">
                <span>
                  {erase
                    ? 'Erase tool selected'
                    : selected
                      ? `Selected: ${itemById[selected]?.name || selected}`
                      : 'Select an ingredient below to begin'}
                </span>
                <button
                  className={`button compact ${erase ? 'active' : ''}`}
                  disabled={locked}
                  aria-pressed={erase}
                  data-testid="erase-tool"
                  onClick={() => {
                    if (engage()) setErase((value) => !value);
                  }}
                >
                  Erase
                </button>
              </div>
              <div
                className="collect-zone"
                data-testid="collection-zone"
                onDragOver={(e) => {
                  if (match && !locked) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.getData('application/x-crafting-item') === match?.output)
                    collect();
                }}
              >
                Drag a finished output here to collect
              </div>
              {room.settings.hints && round.solution && (
                <details className="hint">
                  <summary>Recipe hint</summary>
                  <div className="craft-grid">
                    {round.solution.map((id, i) => (
                      <ItemSlot key={i} id={id} disabled />
                    ))}
                  </div>
                </details>
              )}
            </div>
            <Inventory
              key={round.id}
              palette={round.palette}
              creative={room.settings.inventory === 'creative'}
              selected={selected}
              recent={recent}
              disabled={locked}
              onInteract={engage}
              onSelect={(id) => {
                if (!engage()) return;
                setSelected(id);
                setErase(false);
                playSound('click', sound);
              }}
            />
          </>
        )}
      </section>
      <aside className="game-sidebar">
        <Scoreboard
          players={room.players}
          me={session.playerId}
          hostId={room.hostId}
          playerStates={round.playerStates}
        />
        <div className="field-note">
          <span className="eyebrow">Crafting field notes</span>
          <p>
            {room.settings.scoring === 'all-finish'
              ? 'Every finish counts. Earlier crafts earn more points.'
              : 'Only collecting a valid output wins points. The fastest accepted craft takes the round.'}
          </p>
          <span className="small">
            {room.settings.inventory === 'creative'
              ? 'Creative adds 2 seconds per occupied recipe slot before Overclock.'
              : 'Your base timer has no extra time added.'}
          </span>
        </div>
      </aside>
    </div>
  );
}
