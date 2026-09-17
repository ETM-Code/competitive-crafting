import { useState } from 'react';
import { rankPlayers } from '../shared/rules';
import { itemById } from '../shared/catalogue';
import type { ClientMessage, RoomSnapshot, Session } from '../shared/types';
import { ItemImage } from './ItemSlot';
import { Scoreboard } from './Scoreboard';
export function Results({
  room,
  session,
  send,
  connected,
}: {
  room: RoomSnapshot;
  session: Session;
  send: (message: ClientMessage) => boolean;
  connected: boolean;
}) {
  const [panel, setPanel] = useState<'standings' | 'history'>('standings');
  const ranked = rankPlayers(room.players.filter((p) => !p.spectator)),
    first = ranked[0];
  const winners = ranked.filter(
    (p) =>
      first &&
      p.score === first.score &&
      p.wins === first.wins &&
      p.winningTime === first.winningTime,
  );
  return (
    <section className="window results" data-testid="results">
      <header className="results-hero">
        <ItemImage id="golden_pickaxe" />
        <span className="eyebrow">Every block tells a story</span>
        <h1>
          {room.practice
            ? 'Practice makes a crafter.'
            : winners.length > 1
              ? 'A shared victory!'
              : `${first?.name || 'Your party'} takes the crown!`}
        </h1>
        <p>
          {room.practice
            ? `${first?.score || 0} XP earned. Ready for another adventure?`
            : winners.length > 1
              ? `${winners.map((p) => p.name).join(' & ')} finish perfectly tied.`
              : `${first?.score || 0} XP. A match well crafted.`}
        </p>
      </header>
      <nav className="results-panel-tabs" aria-label="Match results">
        <button
          className={`button ${panel === 'standings' ? 'active' : ''}`}
          data-testid="results-standings-tab"
          aria-pressed={panel === 'standings'}
          onClick={() => setPanel('standings')}
        >
          Standings
        </button>
        <button
          className={`button ${panel === 'history' ? 'active' : ''}`}
          data-testid="results-history-tab"
          aria-pressed={panel === 'history'}
          onClick={() => setPanel('history')}
        >
          Round history
        </button>
      </nav>
      <div className="results-panels" data-panel={panel}>
        <Scoreboard players={room.players} me={session.playerId} hostId={room.hostId} />
        <div className="match-history">
          <h2>Your crafting journey</h2>
          <div>
            {room.history.map((entry, index) => (
              <div className="history-item" key={`${entry.target}-${index}`}>
                <ItemImage id={entry.target} />
                <span>
                  <strong>{itemById[entry.target]?.name || entry.target}</strong>
                  <small>
                    {entry.winnerId
                      ? room.players.find((p) => p.id === entry.winnerId)?.name || 'Crafter'
                      : 'Time expired'}{' '}
                    · {entry.points} XP
                  </small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="small results-tiebreak">
        Ties are settled by round wins, then total winning craft time. Exact ties share victory.
      </p>
      {room.hostId === session.playerId ? (
        <button
          className="button primary"
          data-testid="rematch-button"
          disabled={!connected}
          onClick={() => send({ type: 'rematch' })}
        >
          Craft again <span aria-hidden="true">→</span>
        </button>
      ) : (
        <p className="waiting">Waiting for the host to start a rematch…</p>
      )}
    </section>
  );
}
