import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { itemById } from '../shared/catalogue';
import { REVEAL_MS } from '../shared/rules';
import type { RoomSnapshot, RoundStanding, Session } from '../shared/types';
import { ItemImage } from './ItemSlot';
import { Avatar } from './Scoreboard';
import '../styles/celebration.css';

const scoreStarts = 1200;
const scoreDuration = 1100;
const moveStarts = 2200;
const moveDuration = 750;

function standingStatus(entry: RoundStanding, room: RoomSnapshot) {
  if (entry.status === 'crafted') return 'Crafted';
  if (entry.status === 'forfeited') return 'Gave up';
  if (entry.status === 'spectator') return 'Spectating';
  return room.round?.endReason === 'timeout' ? 'Time expired' : 'No craft';
}

export function RoundSummary({
  room,
  session,
  now,
  onOpenMenu,
}: {
  room: RoomSnapshot;
  session: Session;
  now: number;
  onOpenMenu?: () => void;
}) {
  const round = room.round;
  const list = useRef<HTMLOListElement>(null);
  const elapsed = Math.max(0, now - ((room.deadline ?? now) - REVEAL_MS));
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const standings = [...(round?.standings ?? [])].sort(
    (a, b) => a.rankAfter - b.rankAfter || a.name.localeCompare(b.name),
  );
  const before = [...standings].sort(
    (a, b) => a.rankBefore - b.rankBefore || a.name.localeCompare(b.name),
  );
  const order = before.map((entry) => entry.playerId).join(',');
  const afterOrder = standings.map((entry) => entry.playerId).join(',');
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const rowAnimations = useRef<Animation[]>([]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element || !round) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let animations: Animation[] = [];
    const settle = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
      rowAnimations.current = [];
    };
    const animate = () => {
      settle();
      if (media.matches || elapsedRef.current >= moveStarts + moveDuration) return;
      const previousOrder = order.split(',');
      const rows = [...element.querySelectorAll<HTMLElement>('.round-standing')];
      rows.forEach((row, index) => {
        const previousIndex = previousOrder.indexOf(row.dataset.playerId ?? '');
        const distance = (previousIndex - index) * row.offsetHeight;
        if (!distance) return;
        const animation = row.animate(
          [{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0)' }],
          {
            duration: moveDuration,
            delay: moveStarts,
            easing: 'cubic-bezier(.2,.8,.2,1)',
            fill: 'both',
          },
        );
        animation.pause();
        animation.currentTime = elapsedRef.current;
        // The lab controls its own time; real rounds run smoothly between server-clock ticks.
        if (!element.closest('.animation-lab, [data-fixture-clock]')) animation.play();
        animations.push(animation);
        rowAnimations.current.push(animation);
      });
    };
    const observer = new ResizeObserver(animate);
    observer.observe(element);
    media.addEventListener('change', animate);
    animate();
    return () => {
      settle();
      observer.disconnect();
      media.removeEventListener('change', animate);
    };
  }, [round?.id, order, afterOrder]);

  useLayoutEffect(() => {
    rowAnimations.current.forEach((animation) => {
      if (
        list.current?.closest('.animation-lab, [data-fixture-clock]') ||
        Math.abs(Number(animation.currentTime) - elapsed) > 250
      ) {
        animation.currentTime = elapsed;
      }
    });
  }, [elapsed]);

  if (!round) return null;
  const firstCraft = round.finishers[0];
  const winnerName =
    standings.find((entry) => entry.playerId === firstCraft?.playerId)?.name ??
    room.players.find((player) => player.id === firstCraft?.playerId)?.name;
  const remaining = Math.max(0, Math.ceil(((room.deadline ?? now) - now) / 1000));
  const finalRound = round.index + 1 >= room.settings.rounds;
  const progress = reduced ? 1 : Math.max(0, Math.min(1, (elapsed - scoreStarts) / scoreDuration));
  const eased = 1 - (1 - progress) ** 3;
  const headline = firstCraft
    ? `${winnerName ?? 'A crafter'} crafted it first!`
    : round.endReason === 'forfeit'
      ? 'Tools down. Next craft!'
      : 'Time’s up. Here’s the recipe.';

  return (
    <section
      className="window round-summary"
      data-testid="round-summary"
      aria-label="Round results"
    >
      <header className="round-summary-header">
        <div>
          <span className="eyebrow">
            Round {round.index + 1} / {room.settings.rounds} complete
          </span>
          <h1>{headline}</h1>
        </div>
        {onOpenMenu && (
          <button
            className="button compact"
            data-testid="game-menu-toggle"
            aria-controls="game-menu"
            onClick={onOpenMenu}
          >
            Menu
          </button>
        )}
      </header>
      <div className="round-summary-body">
        <section className="round-recipe" data-testid="recipe-reveal" aria-label="Revealed recipe">
          <div
            className="round-recipe-grid"
            role="img"
            aria-label={`Recipe for ${itemById[round.target]?.name ?? round.target}`}
          >
            {(round.solution ?? Array<string | null>(9).fill(null)).map((id, index) => (
              <span className="round-recipe-cell" key={index}>
                {id && <ItemImage id={id} />}
              </span>
            ))}
          </div>
          <span className="round-recipe-arrow" aria-hidden="true">
            →
          </span>
          <div className="round-recipe-output">
            <ItemImage id={round.target} />
            <h2>{itemById[round.target]?.name ?? round.target}</h2>
            <p>
              {firstCraft
                ? `+${firstCraft.points} XP · ${(firstCraft.elapsed / 1000).toFixed(2)}s`
                : 'No points awarded'}
            </p>
          </div>
        </section>
        <section className="round-ranking" aria-label="Updated standings">
          <div className="round-ranking-heading">
            <h2>Standings</h2>
            <span>This round · total XP</span>
          </div>
          <div className="round-ranking-scroll" tabIndex={0} aria-label="Round standings">
            <ol ref={list} className="round-standing-list">
              {standings.map((entry) => {
                const change = entry.rankBefore - entry.rankAfter;
                const score = Math.round(
                  entry.scoreBefore + (entry.scoreAfter - entry.scoreBefore) * eased,
                );
                const rank = reduced || elapsed >= moveStarts ? entry.rankAfter : entry.rankBefore;
                return (
                  <li
                    className={`round-standing ${entry.playerId === session.playerId ? 'is-you' : ''} ${entry.points ? 'earned-points' : ''}`}
                    key={entry.playerId}
                    data-player-id={entry.playerId}
                    data-testid={`round-standing-${entry.playerId}`}
                  >
                    <span className="standing-rank" aria-label={`Rank ${rank}`}>
                      {rank}
                    </span>
                    <Avatar value={entry.avatar} />
                    <span className="standing-name">
                      <strong>
                        {entry.name}
                        {entry.playerId === session.playerId && <small> you</small>}
                      </strong>
                      <span>{standingStatus(entry, room)}</span>
                    </span>
                    <span
                      className={`standing-movement ${change > 0 ? 'climbed' : change < 0 ? 'fell' : ''}`}
                      aria-label={
                        change > 0
                          ? `Up ${change} places`
                          : change < 0
                            ? `Down ${-change} places`
                            : 'Rank unchanged'
                      }
                    >
                      {change > 0 ? `↑${change}` : change < 0 ? `↓${-change}` : '—'}
                    </span>
                    <span className="standing-points">
                      <small>{entry.points ? `+${entry.points}` : '+0'}</small>
                      <strong
                        data-testid={`round-total-${entry.playerId}`}
                        aria-label={`${entry.scoreAfter} total XP`}
                      >
                        {score}
                      </strong>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>
      <footer className="round-summary-footer">
        <span>
          {finalRound ? 'Final podium' : 'Next craft'} in <strong>{remaining}s</strong>
        </span>
        <span className="round-countdown-track" aria-hidden="true">
          <i
            style={{
              transform: `scaleX(${Math.min(1, Math.max(0, (room.deadline ?? now) - now) / REVEAL_MS)})`,
            }}
          />
        </span>
      </footer>
    </section>
  );
}
