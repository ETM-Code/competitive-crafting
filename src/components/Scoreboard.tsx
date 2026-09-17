import { rankPlayers } from '../shared/rules';
import type { Player, RoundPlayer } from '../shared/types';
export const AVATARS = [
  'creeper',
  'pig',
  'ender_dragon',
  'wither',
  'zombie',
  'iron_golem',
  'blaze',
  'villager',
  'skeleton',
  'herobrine',
  'enderman',
  'spider',
];
export const AVATAR_NAMES: Record<string, string> = {
  creeper: 'Creeper',
  pig: 'Pig',
  ender_dragon: 'Ender Dragon',
  wither: 'Wither',
  zombie: 'Zombie',
  iron_golem: 'Iron Golem',
  blaze: 'Blaze',
  villager: 'Villager',
  skeleton: 'Skeleton',
  herobrine: 'Herobrine',
  enderman: 'Enderman',
  spider: 'Spider',
};

export function playerRanks(players: Player[]): Map<string, number> {
  const ranked = rankPlayers(players);
  const ranks = new Map<string, number>();
  let rank = 1;
  ranked.forEach((player, index) => {
    const previous = ranked[index - 1];
    if (
      previous &&
      (player.score !== previous.score ||
        player.wins !== previous.wins ||
        player.winningTime !== previous.winningTime)
    )
      rank = index + 1;
    ranks.set(player.id, rank);
  });
  return ranks;
}

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
  const ranked = rankPlayers(players);
  const ranks = playerRanks(ranked.filter((player) => !player.spectator));
  return (
    <section className="scoreboard" data-testid="scoreboard" aria-label="Player standings">
      <div className="section-line">
        <h2>{lobby ? 'Around the table' : 'Standings'}</h2>
        <span>{players.length}/12</span>
      </div>
      <ol>
        {ranked.map((player) => (
          <li
            key={player.id}
            className={player.id === me ? 'is-me' : ''}
            data-testid={`player-${player.id}`}
          >
            <span className="rank">
              {player.spectator ? '—' : String(ranks.get(player.id)).padStart(2, '0')}
            </span>
            <Avatar value={player.avatar} />
            <div className="player-name">
              <strong>
                {player.name}
                {player.id === me && <small> you</small>}
              </strong>
              <span>
                {!player.connected
                  ? 'Left'
                  : player.spectator
                    ? 'Spectating'
                    : playerStates?.[player.id]?.forfeited
                      ? 'Gave up'
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
