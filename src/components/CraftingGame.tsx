import { useEffect, useRef, useState } from 'react';
import { itemById } from '../shared/catalogue';
import { matchRecipe } from '../shared/recipes';
import type { ClientMessage, Grid, RoomSnapshot, Session } from '../shared/types';
import { ItemImage, ItemSlot } from './ItemSlot';
import { Inventory } from './Inventory';
import { Scoreboard } from './Scoreboard';
import { RoundSummary } from './RoundSummary';
import { useGridPaint } from '../lib/useGridPaint';
import { playSound } from '../lib/audio';
import '../styles/crafting.css';

const EMPTY_GRID: Grid = Array(9).fill(null);
interface CraftingGameProps {
  room: RoomSnapshot;
  session: Session;
  send: (message: ClientMessage) => boolean;
  connected: boolean;
  now: number;
  sound: boolean;
  syncVersion?: number;
  onOpenMenu?: () => void;
}

export function CraftingGame(props: CraftingGameProps) {
  const { room, session, now, onOpenMenu } = props;
  if (room.phase === 'reveal') return <RoundSummary {...{ room, session, now, onOpenMenu }} />;
  if (!room.round || room.phase === 'countdown') {
    const seconds = Math.max(0, Math.ceil(((room.deadline ?? now) - now) / 1000));
    return (
      <section className="window countdown" data-testid="countdown">
        {onOpenMenu && (
          <button
            className="button board-menu-button countdown-menu-button"
            data-testid="game-menu-toggle"
            aria-label="Game menu"
            aria-controls="game-menu"
            onClick={onOpenMenu}
          >
            ☰
          </button>
        )}
        <span className="eyebrow">Tools ready. Eyes on the table.</span>
        <h1>{room.phase === 'countdown' ? 'Get ready to craft' : 'Preparing the next craft'}</h1>
        <strong key={seconds} className="countdown-number">
          {seconds || '…'}
        </strong>
        <p>The recipe will appear when the round begins.</p>
      </section>
    );
  }
  return <CraftingRound key={room.round.id} {...props} />;
}

function CraftingRound({
  room,
  session,
  send,
  connected,
  now,
  sound,
  syncVersion = 0,
  onOpenMenu,
}: CraftingGameProps) {
  const round = room.round!;
  const own = round.playerStates[session.playerId];
  // The connection layer projects pending local grids over intermediate snapshots.
  const grid = own?.grid ?? EMPTY_GRID;
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const [selected, setSelected] = useState<string | null>(null);
  const [erase, setErase] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [searching, setSearching] = useState(false);
  useEffect(() => setPending(false), [syncVersion]);
  useEffect(() => {
    round.palette.forEach((id) => {
      if (itemById[id]) {
        const image = new Image();
        image.src = itemById[id].icon;
      }
    });
  }, [round.palette]);
  const me = room.players.find((player) => player.id === session.playerId);
  const finished = round.finishers.some((player) => player.playerId === session.playerId);
  const expired = !!own?.expired || now >= round.endsAt;
  const forfeited = !!own?.forfeited;
  const locked =
    !connected || !own || !!me?.spectator || finished || expired || forfeited || pending;
  const match = matchRecipe(grid, round.target);
  const remaining = Math.max(0, round.endsAt - now);
  const seconds = Math.ceil(remaining / 1000);
  const urgency = locked ? 0 : Math.max(0, 1 - remaining / 10_000);
  const progress = Math.max(
    0,
    Math.min(1, (round.endsAt - now) / Math.max(1, round.endsAt - round.startsAt)),
  );
  const target = itemById[round.target];
  const updateGrid = (next: Grid) => {
    if (locked || next.every((id, index) => id === gridRef.current[index])) return;
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
          (room.settings.inventory === 'constrained' && !round.palette.includes(id))))
    )
      return;
    updateGrid(gridRef.current.map((item, position) => (position === index ? id : item)));
    if (id) setRecent((value) => [id, ...value.filter((item) => item !== id)].slice(0, 9));
  };
  const paint = useGridPaint({
    roundId: round.id,
    disabled: locked,
    selected,
    erase,
    onPlace: place,
  });
  const collect = () => {
    if (locked || !match) return;
    // Every accepted placement is already ahead of collection on the same socket.
    if (send({ type: 'collect', roundId: round.id, grid: [...gridRef.current] })) {
      setPending(true);
      playSound('collect', sound);
    }
  };
  const status = forfeited
    ? 'Round forfeited. Waiting for the other crafters.'
    : finished
      ? 'Craft accepted. Your points are recorded.'
      : expired
        ? 'Time’s up. Waiting for the result.'
        : pending
          ? 'Checking your craft…'
          : me?.spectator
            ? 'Spectating this round.'
            : '';
  return (
    <div className={`crafting-stage ${searching ? 'is-searching' : ''}`} data-testid="game">
      <div
        className="time-vignette"
        style={{
          opacity: urgency,
          boxShadow: `inset 0 0 ${30 + urgency * 75}px ${urgency * 12}px #a3222277`,
        }}
        aria-hidden="true"
      />
      <section className="window crafting-panel" aria-label="Crafting table">
        <header className="craft-target-strip">
          <ItemImage id={round.target} />
          <div className="craft-target-name">
            <span className="eyebrow">
              Round {round.index + 1} / {room.settings.rounds}
            </span>
            <h1 data-testid="target-name">{target?.name || round.target}</h1>
            <span className="craft-target-points" data-testid="round-points">
              {round.points} XP · Tier {round.tier}
            </span>
          </div>
          <span
            className={`timer ${seconds <= 10 ? 'urgent' : ''}`}
            data-testid="round-timer"
            aria-label={`${seconds} seconds remaining`}
          >
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')}
          </span>
          {onOpenMenu && (
            <button
              className="button board-menu-button"
              data-testid="game-menu-toggle"
              aria-label="Game menu"
              aria-controls="game-menu"
              onClick={onOpenMenu}
            >
              ☰
            </button>
          )}
        </header>
        <div
          className="craft-time-track"
          role="progressbar"
          aria-label="Time remaining"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div style={{ transform: `scaleX(${progress})` }} />
        </div>
        <div className="craft-board">
          <div className="craft-grid-side">
            <div className="craft-board-label">
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
            <div className="craft-grid" data-testid="crafting-grid" {...paint}>
              {grid.map((id, index) => (
                <ItemSlot
                  key={index}
                  id={id}
                  gridIndex={index}
                  draggable={false}
                  disabled={locked}
                  testId={`grid-slot-${index}`}
                  label={`Crafting slot ${index + 1}: ${id ? itemById[id]?.name || id : 'empty'}`}
                  onClick={() => {
                    if (erase || selected) place(index, erase ? null : selected);
                  }}
                  onPlace={(value) => place(index, value || null)}
                />
              ))}
            </div>
          </div>
          <span className="craft-board-arrow" aria-hidden="true">
            →
          </span>
          <div className={`craft-output-side ${match && !locked ? 'craft-valid' : ''}`}>
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
              className="button primary"
              data-testid="collect-output"
              disabled={locked || !match}
              onClick={collect}
            >
              {finished ? 'Collected ✓' : pending ? 'Checking…' : 'Collect'}
            </button>
            <button
              className={`button compact craft-erase ${erase ? 'active' : ''}`}
              disabled={locked}
              aria-pressed={erase}
              data-testid="erase-tool"
              onClick={() => setErase((value) => !value)}
            >
              Erase
            </button>
          </div>
          <div className="craft-selection-status" role="status">
            {status ||
              (erase
                ? 'Erase tool selected'
                : selected
                  ? itemById[selected]?.name || selected
                  : 'Select an ingredient to begin')}
          </div>
          <div
            className="craft-collect-zone"
            data-testid="collection-zone"
            onDragOver={(event) => {
              if (match && !locked) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.getData('application/x-crafting-item') === match?.output)
                collect();
            }}
          >
            Drag a finished output here to collect
          </div>
        </div>
        <Inventory
          palette={round.palette}
          creative={room.settings.inventory === 'creative'}
          selected={selected}
          recent={recent}
          disabled={locked}
          onSearchModeChange={setSearching}
          onSelect={(id) => {
            if (locked) return;
            setSelected(id);
            setErase(false);
          }}
        />
        {status && (
          <div className="craft-status-banner" role="status">
            {status}
          </div>
        )}
      </section>
      <aside className="crafting-standings">
        <Scoreboard
          players={room.players}
          me={session.playerId}
          hostId={room.hostId}
          playerStates={round.playerStates}
        />
      </aside>
    </div>
  );
}
