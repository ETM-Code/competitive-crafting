import { afterAll, beforeAll, expect, it } from 'vitest';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import type { RoomSnapshot, ServerMessage, Session } from '../../src/shared/types';
import { DEFAULT_SETTINGS, solutionFor } from './fixtures';

let mf: Miniflare;
beforeAll(async () => {
  // Fail promptly in sandboxes that cannot run workerd's local listener.
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const built = await build({
    entryPoints: [fileURLToPath(new URL('../../worker/index.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    // Real protocol validation, DO storage, alarm scheduler and hibernatable
    // sockets; only Minecraft data/rules are deterministic fixture inputs.
    plugins: [
      {
        name: 'test-corpus',
        setup(build) {
          build.onResolve({ filter: /shared\/(catalogue|recipes|rules)$/ }, () => ({
            path: fileURLToPath(new URL('./fixtures.ts', import.meta.url)),
          }));
        },
      },
    ],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'game',
          modules: true,
          script: built.outputFiles[0].text,
          compatibilityDate: '2026-09-01',
          durableObjects: { ROOMS: { className: 'GameRoom', useSQLite: true } },
          serviceBindings: { ASSETS: async () => new Response('asset') },
        },
      ],
    }),
  );
  await mf.ready;
}, 30_000);
afterAll(async () => {
  await mf?.dispose();
});
async function post(path: string, value: unknown) {
  return mf.dispatchFetch('https://game.example' + path, {
    method: 'POST',
    headers: {
      Origin: 'https://game.example',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.1',
    },
    body: JSON.stringify(value),
  });
}
async function connect(session: Session) {
  const response = await mf.dispatchFetch(
    `https://game.example/api/rooms/${session.code}/ws?playerId=${session.playerId}&token=${session.token}`,
    {
      headers: {
        Origin: 'https://game.example',
        Upgrade: 'websocket',
        'CF-Connecting-IP': '192.0.2.1',
      },
    },
  );
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  const messages: ServerMessage[] = [];
  socket.addEventListener('message', (e) => {
    messages.push(JSON.parse(e.data as string) as ServerMessage);
  });
  socket.accept();
  async function waitState(predicate: (state: RoomSnapshot) => boolean): Promise<RoomSnapshot> {
    const until = Date.now() + 10_000;
    while (Date.now() < until) {
      const state = [...messages].reverse().find((m) => m.type === 'state' && predicate(m.state));
      if (state?.type === 'state') return state.state;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for authoritative state');
  }
  return {
    socket,
    messages,
    waitState,
    send: (message: unknown) => socket.send(JSON.stringify(message)),
  };
}
it('real runtime: create, normalize join code, upgrade, alarm-driven countdown, concurrent awards and resync', async () => {
  const response = await post('/api/rooms', { name: 'One', avatar: 'steve' });
  expect(response.status).toBe(201);
  const one = (await response.json()) as Session;
  const joined = await post(`/api/rooms/${one.code.toLowerCase()}/join`, {
    name: 'Two',
    avatar: 'alex',
  });
  expect(joined.status).toBe(200);
  const two = (await joined.json()) as Session;
  const a = await connect(one);
  const b = await connect(two);
  a.send({ type: 'ready', ready: true });
  b.send({ type: 'ready', ready: true });
  await a.waitState((s) => s.players.length === 2 && s.players.every((p) => p.ready));
  a.send({ type: 'start' });
  const countdown = await a.waitState((s) => s.phase === 'countdown');
  expect(countdown.round).toBeNull();
  const playing = await a.waitState((s) => s.phase === 'playing');
  expect(playing.round?.solution).toBeUndefined();
  const claim = { type: 'collect', roundId: playing.round!.id, grid: solutionFor('target0') };
  a.send({ ...claim, type: 'grid' });
  b.send({ ...claim, type: 'grid' });
  a.send(claim);
  b.send(claim);
  const result = await a.waitState((s) => s.phase === 'reveal');
  expect(result.players.reduce((sum, player) => sum + player.score, 0)).toBe(100);
  expect(result.round!.finishers).toHaveLength(1);
  expect(result.history).toHaveLength(1);
  const fresh = await connect(one);
  const restored = await fresh.waitState((s) => s.phase === 'reveal');
  expect(restored.round!.finishers).toEqual(result.round!.finishers);
  expect(JSON.stringify(restored)).not.toContain(one.token);
  fresh.socket.close();
  b.socket.close();
}, 20_000);
it('real runtime: personal alarms, private grid resync and all-finish Overclock points', async () => {
  const response = await post('/api/rooms', {
    name: 'Creeper',
    avatar: 'creeper',
    settings: { ...DEFAULT_SETTINGS, seconds: 15, scoring: 'all-finish', preset: 'all-finish' },
  });
  const one = (await response.json()) as Session;
  const joined = await post(`/api/rooms/${one.code}/join`, { name: 'Pig', avatar: 'pig' });
  const two = (await joined.json()) as Session;
  const a = await connect(one);
  const b = await connect(two);
  a.send({ type: 'ready', ready: true });
  b.send({ type: 'ready', ready: true });
  await a.waitState((state) => state.players.length === 2 && state.players.every((p) => p.ready));
  a.send({ type: 'start' });
  const playing = await a.waitState((state) => state.phase === 'playing');
  const roundId = playing.round!.id;
  a.send({ type: 'overclock', roundId });
  a.send({ type: 'grid', roundId, grid: solutionFor('target0') });
  const accepted = await a.waitState((state) => !!state.round?.playerStates[one.playerId].engaged);
  expect(accepted.round!.playerStates[one.playerId].deadline).toBe(playing.round!.startsAt + 7500);
  const peer = await b.waitState((state) => state.revision >= accepted.revision);
  expect(peer.round!.playerStates[one.playerId].grid).toEqual(Array(9).fill(null));
  const fresh = await connect(one);
  const restored = await fresh.waitState(
    (state) => !!state.round?.playerStates[one.playerId].engaged,
  );
  expect(restored.round!.playerStates[one.playerId]).toEqual(
    accepted.round!.playerStates[one.playerId],
  );
  fresh.send({ type: 'collect', roundId, grid: solutionFor('target0') });
  const first = await b.waitState((state) => state.round?.finishers.length === 1);
  expect(first.phase).toBe('playing');
  expect(first.players.find((p) => p.id === one.playerId)?.score).toBe(150);
  b.send({ type: 'grid', roundId, grid: solutionFor('target0') });
  b.send({ type: 'collect', roundId, grid: solutionFor('target0') });
  const result = await fresh.waitState((state) => state.phase === 'reveal');
  expect(result.round!.finishers.map((p) => p.points)).toEqual([150, 75]);
  fresh.socket.close();
  b.socket.close();
}, 20_000);

it('real runtime: an Overclock alarm expires only its player while the peer can still collect', async () => {
  const response = await post('/api/rooms', {
    name: 'Creeper',
    avatar: 'creeper',
    settings: { ...DEFAULT_SETTINGS, seconds: 15 },
  });
  const one = (await response.json()) as Session;
  const joined = await post(`/api/rooms/${one.code}/join`, { name: 'Pig', avatar: 'pig' });
  const two = (await joined.json()) as Session;
  const a = await connect(one);
  const b = await connect(two);
  a.send({ type: 'ready', ready: true });
  b.send({ type: 'ready', ready: true });
  await a.waitState((state) => state.players.length === 2 && state.players.every((p) => p.ready));
  a.send({ type: 'start' });
  const playing = await a.waitState((state) => state.phase === 'playing');
  const roundId = playing.round!.id;
  a.send({ type: 'overclock', roundId });
  const expired = await a.waitState((state) => !!state.round?.playerStates[one.playerId].expired);
  expect(expired.phase).toBe('playing');
  expect(expired.round!.playerStates[two.playerId].expired).toBe(false);
  expect(expired.deadline).toBe(playing.round!.endsAt);
  a.send({ type: 'grid', roundId, grid: solutionFor('target0') });
  a.send({ type: 'collect', roundId, grid: solutionFor('target0') });
  b.send({ type: 'grid', roundId, grid: solutionFor('target0') });
  b.send({ type: 'collect', roundId, grid: solutionFor('target0') });
  const result = await b.waitState((state) => state.phase === 'reveal');
  expect(result.round!.finishers.map((p) => p.playerId)).toEqual([two.playerId]);
  expect(result.players.find((p) => p.id === one.playerId)?.score).toBe(0);
  expect(result.players.find((p) => p.id === two.playerId)?.score).toBe(100);
  a.socket.close();
  b.socket.close();
}, 25_000);

it('real runtime: rejects credential/origin forgery and serves assets through security headers', async () => {
  const created = await post('/api/rooms', { name: 'Solo', avatar: 'steve', practice: true });
  const session = (await created.json()) as Session;
  const forged = await mf.dispatchFetch(
    `https://game.example/api/rooms/${session.code}/ws?playerId=${session.playerId}&token=forged`,
    { headers: { Origin: 'https://game.example', Upgrade: 'websocket' } },
  );
  expect(forged.status).toBe(401);
  const foreign = await mf.dispatchFetch('https://game.example/api/rooms', {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  expect(foreign.status).toBe(403);
  const asset = await mf.dispatchFetch('https://game.example/join/ABC234');
  expect(await asset.text()).toBe('asset');
  expect(asset.headers.get('Content-Security-Policy')).toContain('https://open.spotify.com');
});
