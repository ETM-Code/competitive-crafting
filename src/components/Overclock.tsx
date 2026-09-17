import type { Round, RoundPlayer } from '../shared/types';
import { ItemImage } from './ItemSlot';
export function Overclock({
  round,
  own,
  now,
  pending,
  available,
  connected,
  onActivate,
}: {
  round: Round;
  own: RoundPlayer;
  now: number;
  pending: boolean;
  available: boolean;
  connected: boolean;
  onActivate: () => void;
}) {
  const duration = round.endsAt - round.startsAt;
  const half = Math.floor(duration / 2);
  const cutoff = round.startsAt + half;
  const seconds = (milliseconds: number) => Number((milliseconds / 1000).toFixed(3));
  if (own.overclocked)
    return (
      <div className="overclock-active" data-testid="overclock-active" role="status">
        <span className="redstone-indicator" aria-hidden="true" />
        <strong>Overclock engaged</strong>
        <span>1.5× points · {seconds(half)}s original limit</span>
        <span className="small">Locked for this round</span>
      </div>
    );
  if (!available)
    return (
      <div className="overclock-standard">
        <span>Standard clock</span>
        <span>Build the recipe, then collect.</span>
      </div>
    );
  return (
    <section
      className={`overclock ${pending ? 'overclock-pending' : ''}`}
      aria-label="Redstone Overclock"
      data-testid="overclock-offer"
    >
      <button
        type="button"
        className="overclock-lever"
        data-testid="overclock-button"
        aria-label="Engage Overclock"
        aria-describedby="overclock-tradeoff overclock-help"
        disabled={!connected || pending || now >= cutoff}
        onClick={onActivate}
      >
        <span className="lever-mechanism" aria-hidden="true">
          <span className="lever-base" />
          <span className="lever-arm" />
        </span>
        <span>
          {pending ? 'Powering up…' : now >= cutoff ? 'Overclock closed' : 'Overclock · 1.5× XP'}
          <small id="overclock-tradeoff">
            {seconds(duration)}s → {seconds(half)}s · {round.points} →{' '}
            {Math.round(round.points * 1.5)} XP
          </small>
        </span>
        <span className="redstone-indicator" aria-hidden="true" />
      </button>
      <details className="overclock-info">
        <summary aria-label="How Overclock works">?</summary>
        <div className="overclock-explanation">
          <div className="overclock-heading">
            <ItemImage id="redstone" />
            <h2>One pull. No turning back.</h2>
          </div>
          <p id="overclock-help">Half the time. 1.5× the points. Locks when you start crafting.</p>
          <p>
            The shorter clock starts with the round, not when you pull the lever.{' '}
            {now < cutoff
              ? `${Math.max(0, Math.ceil((cutoff - now) / 1000))}s left on the Overclock clock.`
              : 'Keep crafting with your original time.'}{' '}
            Placement scoring still applies. If your clock runs out, you earn 0 XP.
          </p>
          <span className="small">Tap ? again to close.</span>
        </div>
      </details>
    </section>
  );
}
