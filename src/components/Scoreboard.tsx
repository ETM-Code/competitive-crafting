import { rankPlayers } from '../shared/rules';
import type { Player, RoundPlayer } from '../shared/types';
export const AVATARS = ['creeper', 'pig', 'ender_dragon', 'wither', 'zombie', 'iron_golem'];
export function Avatar({ value }: { value: string }) {
  const mob = AVATARS.includes(value) ? value : 'creeper';
  return (
    <span className={`avatar mob-avatar avatar-${mob}`} aria-hidden="true">
      <img src={`/assets/avatars/${mob}.png`} alt="" width="48" height="48" />
    </span>
  );
}
export function Scoreboard({
  players,
  me,
  hostId,
  lobby = false,
  playerStates,
}: {
  players: Player[];
  me: string;
  hostId: string;
  lobby?: boolean;
  playerStates?: Record<string, RoundPlayer>;
}) {
  return (
    <section className="scoreboard" data-testid="scoreboard" aria-label="Player standings">
      <div className="section-line">
        <h2>{lobby ? 'Around the table' : 'Standings'}</h2>
        <span>{players.length}/12</span>
      </div>
      <ol>
        {rankPlayers(players).map((player, index) => (
          <li
            key={player.id}
            className={player.id === me ? 'is-me' : ''}
            data-testid={`player-${player.id}`}
          >
            <span className="rank">{String(index + 1).padStart(2, '0')}</span>
            <Avatar value={player.avatar} />
            <div className="player-name">
              <strong>
                {player.name}
                {player.id === me && <small> you</small>}
              </strong>
              {playerStates?.[player.id]?.overclocked && (
                <span className="overclock-badge" data-testid={`overclock-player-${player.id}`}>
                  Overclock · 1.5×
                </span>
              )}
              <span>
                {!player.connected
                  ? 'Reconnecting…'
                  : player.spectator
                    ? 'Spectating'
                    : playerStates?.[player.id]?.expired
                      ? 'Time expired'
                      : lobby
                        ? player.ready
                          ? 'Ready to craft'
                          : 'Getting ready'
                        : `${player.wins} round${player.wins === 1 ? '' : 's'} won`}
                {player.id === hostId ? ' · Host' : ''}
              </span>
            </div>
            <strong className={lobby ? (player.ready ? 'ready-mark' : 'waiting-mark') : 'score'}>
              {lobby ? (player.ready ? '✓' : '·') : player.score}
            </strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
