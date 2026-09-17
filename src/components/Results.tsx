import { useState } from 'react';
import { rankPlayers } from '../shared/rules';
import { itemById } from '../shared/catalogue';
import type { ClientMessage, RoomSnapshot, Session } from '../shared/types';
import { ItemImage } from './ItemSlot';
import { Avatar, playerRanks } from './Scoreboard';
import '../styles/celebration.css';

export function Results({
  room,
  session,
  send,
  connected,
  onLeave,
}: {
  room: RoomSnapshot;
  session: Session;
  send: (message: ClientMessage) => boolean;
  connected: boolean;
  onLeave?: () => void;
}) {
  const [panel, setPanel] = useState<'standings' | 'history'>('standings');
  const ranked = rankPlayers(room.players.filter((player) => !player.spectator));
  const ranks = playerRanks(ranked);
  const winners = ranked.filter((player) => ranks.get(player.id) === 1);
  const first = ranked[0];
  const alone = room.endReason === 'alone';
  const abandoned = room.endReason === 'abandoned';
  const endedEarly = alone || abandoned;
  const podium = ranked.slice(0, 3);
  const displayOrder = podium.length > 1 ? [podium[1], podium[0], ...podium.slice(2)] : podium;
  const headline = alone
    ? 'All alone? Try getting some friends, loser.'
    : abandoned
      ? 'The party wandered off.'
      : room.practice
        ? 'Practice well crafted.'
        : !first
          ? 'Match complete.'
          : winners.length > 1
            ? 'A shared victory!'
            : `${first.name} wins!`;

  return (
    <section
      className={`window match-results ${endedEarly ? 'match-alone' : ''}`}
      data-testid="results"
    >
      <header className="match-heading">
        <span className="eyebrow">
          {endedEarly ? 'The party left' : room.practice ? 'Practice complete' : 'Match complete'}
        </span>
        <h1>{headline}</h1>
        <p>
          {endedEarly
            ? 'The match ended without a winner. Your scores are kept below.'
            : winners.length > 1 && !room.practice
              ? winners.length <= 3
                ? `${winners.map((player) => player.name).join(' & ')} finish exactly tied.`
                : `${winners.length} crafters finish exactly tied for first.`
              : `${first?.score ?? 0} XP earned. Every craft counts.`}
        </p>
      </header>
      {!endedEarly && (
        <ol
          className={`craft-podium ${podium.length === 1 ? 'solo-podium' : ''}`}
          aria-label="Final podium"
        >
          {displayOrder.map((player) => {
            const rank = ranks.get(player.id) ?? 1;
            return (
              <li
                className={`podium-place podium-rank-${Math.min(rank, 3)} ${player.id === session.playerId ? 'is-you' : ''}`}
                key={player.id}
                data-testid={`podium-${player.id}`}
              >
                <span className="podium-mob">
                  <Avatar value={player.avatar} />
                  {rank === 1 && <ItemImage id="golden_helmet" className="podium-crown" />}
                </span>
                <strong className="podium-name">
                  {player.name}
                  {player.id === session.playerId && <small> you</small>}
                </strong>
                <span className="podium-score">
                  {player.score}
                  <small> XP</small>
                </span>
                <span className="podium-block">
                  <span>{rank}</span>
                  <small>
                    {winners.length > 1 && rank === 1
                      ? 'Joint winner'
                      : room.practice
                        ? 'Practice score'
                        : rank === 1
                          ? 'Winner'
                          : rank === 2
                            ? 'Runner-up'
                            : 'Third place'}
                  </small>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {endedEarly && (
        <div className="empty-podium" aria-hidden="true">
          <ItemImage id="crafting_table" />
          <span>One empty table.</span>
        </div>
      )}
      <nav className="match-tabs" aria-label="Match results">
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
      <div
        className="match-detail-scroll"
        tabIndex={0}
        aria-label={panel === 'standings' ? 'Final standings' : 'Round history'}
      >
        {panel === 'standings' ? (
          <ol className="final-standing-list" aria-label="Final standings">
            {ranked.map((player) => (
              <li
                className={player.id === session.playerId ? 'is-you' : ''}
                key={player.id}
                data-testid={`final-standing-${player.id}`}
              >
                <span className="standing-rank">{ranks.get(player.id)}</span>
                <Avatar value={player.avatar} />
                <span className="standing-name">
                  <strong>
                    {player.name}
                    {player.id === session.playerId && <small> you</small>}
                  </strong>
                  <span>
                    {player.wins} round{player.wins === 1 ? '' : 's'} won
                    {!player.connected ? ' · Left' : ''}
                  </span>
                </span>
                <strong className="final-score" data-testid={`result-total-${player.id}`}>
                  {player.score}
                  <small> XP</small>
                </strong>
              </li>
            ))}
          </ol>
        ) : (
          <ol className="final-history-list">
            {room.history.map((entry, index) => {
              const winner = entry.standings?.find(
                (standing) => standing.playerId === entry.winnerId,
              );
              const own = entry.standings?.find(
                (standing) => standing.playerId === session.playerId,
              );
              return (
                <li key={`${entry.target}-${index}`}>
                  <span className="history-round">{index + 1}</span>
                  <ItemImage id={entry.target} />
                  <span>
                    <strong>{itemById[entry.target]?.name ?? entry.target}</strong>
                    <small>
                      {entry.winnerId
                        ? `${winner?.name ?? room.players.find((player) => player.id === entry.winnerId)?.name ?? 'Crafter'} crafted first`
                        : entry.endReason === 'forfeit'
                          ? 'Everyone gave up'
                          : 'Time expired'}
                    </small>
                  </span>
                  <strong className="history-earned">
                    {own ? `+${own.points}` : '—'}
                    <small> your XP</small>
                  </strong>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <footer className="match-actions">
        <p className="match-tiebreak">
          Ties: score → round wins → craft time. Exact ties share a place.
        </p>
        <div>
          {room.hostId === session.playerId ? (
            <button
              className="button primary"
              data-testid="rematch-button"
              disabled={!connected}
              onClick={() => send({ type: 'rematch' })}
            >
              {endedEarly ? 'Back to lobby' : 'Craft again'} <span aria-hidden="true">→</span>
            </button>
          ) : (
            <p className="match-waiting">Waiting for the host…</p>
          )}
          {onLeave && (
            <button className="button" data-testid="results-leave" onClick={onLeave}>
              Leave
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
