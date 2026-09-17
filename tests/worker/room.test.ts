vi.mock('../../src/shared/catalogue', () => import('./fixtures'));
vi.mock('../../src/shared/recipes', () => import('./fixtures'));
vi.mock('../../src/shared/rules', () => import('./fixtures'));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameRoom } from '../../worker/room';
import type { Game } from '../../worker/game';
import type { RoomSnapshot, ServerMessage } from '../../src/shared/types';
import { IDLE_TTL, JOIN_RESERVATION_MS, MAX_AGE, MAX_IDENTITIES } from '../../worker/game';
import { COUNTDOWN_MS, DEFAULT_SETTINGS, REVEAL_MS, solutionFor } from './fixtures';
import worker from '../../worker/index';

class Socket {
  attachment: unknown;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | undefined;
  send(message: string) {
    this.sent.push(message);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
}
class Storage {
  values = new Map<string, unknown>();
  alarm: number | null = null;
  fail = false;
  beforePut: (() => Promise<void>) | undefined;
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
    if (this.beforePut) await this.beforePut();
    if (this.fail) throw new Error('disk unavailable');
    this.values.set(key, structuredClone(value));
  }
  async setAlarm(at: number) {
    this.alarm = at;
  }
  async deleteAlarm() {
    this.alarm = null;
  }
  async deleteAll() {
    this.values.clear();
  }
  async transaction<T>(fn: (storage: Storage) => Promise<T>): Promise<T> {
    const previous = structuredClone(this.values);
    const alarm = this.alarm;
    try {
      return await fn(this);
    } catch (error) {
      this.values = previous;
      this.alarm = alarm;
      throw error;
    }
  }
}
function harness() {
  const storage = new Storage();
  const sockets: Socket[] = [];
  const ctx = {
    storage,
    blockConcurrencyWhile: (fn: () => Promise<void>) => fn(),
    getWebSockets: () => sockets,
    acceptWebSocket: (socket: Socket) => sockets.push(socket),
  };
  const room = new GameRoom(ctx as unknown as DurableObjectState);
  return { room, storage, sockets, ctx };
}
function req(path: string, payload?: unknown, headers?: Record<string, string>) {
  return new Request('https://game.example' + path, {
    method: payload ? 'POST' : 'GET',
    headers: {
      Origin: 'https://game.example',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}
async function setup(practice = false) {
  const h = harness();
  const response = await h.room.fetch(
    req('/create', { name: 'One', avatar: 'steve', practice }, { 'X-Room-Code': 'ABC234' }),
  );
  expect(response.status).toBe(201);
  const one = (await response.json()) as { code: string; playerId: string; token: string };
  const two = practice
    ? undefined
    : ((await (
        await h.room.fetch(req('/join', { name: 'Two', avatar: 'alex' }))
      ).json()) as typeof one);
  const connect = async (session: typeof one, room = h.room) => {
    const response = await room.fetch(
      req(`/ws?playerId=${session.playerId}&token=${session.token}`, undefined, {
        Upgrade: 'websocket',
      }),
    );
    expect(response.status).toBe(101);
    return h.sockets.at(-1)!;
  };
  const a = await connect(one);
  const b = two ? await connect(two) : undefined;
  return { ...h, one, two, a, b, connect };
}
const send = (room: GameRoom, socket: Socket, message: unknown) =>
  room.webSocketMessage(socket as unknown as WebSocket, JSON.stringify(message));
async function start(h: Awaited<ReturnType<typeof setup>>) {
  await send(h.room, h.a, { type: 'ready', ready: true });
  if (h.b) await send(h.room, h.b, { type: 'ready', ready: true });
  await send(h.room, h.a, { type: 'start' });
  vi.setSystemTime(Date.now() + 3000);
  await h.room.alarm();
  return (await h.storage.get<Game>('game'))!.public.round!.id;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  const NativeResponse = globalThis.Response;
  vi.stubGlobal(
    'Response',
    class extends NativeResponse {
      private code: number;
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        super(body, init?.status === 101 ? { ...init, status: 200 } : init);
        this.code = init?.status ?? 200;
      }
      override get status() {
        return this.code;
      }
    },
  );
  vi.stubGlobal(
    'WebSocketPair',
    class {
      0 = new Socket();
      1 = new Socket();
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('Durable Object adapter', () => {
  it('repairs connected membership when a restart loses its sockets', async () => {
    const h = await setup();
    h.sockets.length = 0;
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    await restored.alarm();
    const game = (await h.storage.get<Game>('game'))!;
    expect(game.members.every((m) => !m.player.connected && m.disconnectedAt === Date.now())).toBe(
      true,
    );
    expect(h.storage.alarm).toBe(game.activeAt + IDLE_TTL);
  });
  it('enforces bounded and valid HTTP bodies without mutating the room', async () => {
    const h = await setup();
    const request = new Request('https://game.example/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: ' '.repeat(8193),
    });
    expect((await h.room.fetch(request)).status).toBe(413);
    const invalid = new Request('https://game.example/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect((await h.room.fetch(invalid)).status).toBe(400);
    expect((await h.storage.get<Game>('game'))!.members).toHaveLength(2);
  });

  it('serializes simultaneous claims across storage awaits and commits before broadcasting', async () => {
    const h = await setup();
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    await send(h.room, h.b!, { type: 'grid', roundId, grid: solutionFor('target0') });
    h.a.sent = [];
    h.b!.sent = [];
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const entry = new Promise<void>((resolve) => {
      entered = resolve;
    });
    h.storage.beforePut = async () => {
      entered();
      await barrier;
    };
    const claim = { type: 'collect', roundId, grid: solutionFor('target0') };
    const first = send(h.room, h.a, claim);
    await entry;
    const second = send(h.room, h.b!, claim);
    expect(h.a.sent).toHaveLength(0);
    expect((await h.storage.get<Game>('game'))!.public.round!.finishers).toHaveLength(0);
    release();
    await Promise.all([first, second]);
    const game = (await h.storage.get<Game>('game'))!;
    expect(game.public.round!.finishers).toHaveLength(1);
    expect(game.public.round!.finishers[0].playerId).toBe(h.one.playerId);
    expect(game.members.map((m) => m.player.score)).toEqual([100, 0]);
    expect(h.b!.sent.map((s) => JSON.parse(s)).some((m) => m.type === 'error')).toBe(true);
  });
  it('restores state and authenticated websocket attachments after hibernation', async () => {
    const h = await setup();
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    await send(h.room, h.b!, { type: 'grid', roundId, grid: solutionFor('target0') });
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    await send(restored, h.a, { type: 'collect', roundId, grid: solutionFor('target0') });
    expect((await h.storage.get<Game>('game'))!.members[0].player.score).toBe(100);
    await restored.alarm();
    expect((await h.storage.get<Game>('game'))!.public.history).toHaveLength(1);
  });
  it('rolls back failed commits and never announces an unpersisted award', async () => {
    const h = await setup();
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    await send(h.room, h.b!, { type: 'grid', roundId, grid: solutionFor('target0') });
    h.a.sent = [];
    h.storage.fail = true;
    const claim = { type: 'collect', roundId, grid: solutionFor('target0') };
    await send(h.room, h.a, claim);
    expect(h.a.sent.map((s) => JSON.parse(s).type)).toEqual(['error']);
    expect((await h.storage.get<Game>('game'))!.members[0].player.score).toBe(0);
    h.storage.fail = false;
    await send(h.room, h.b!, claim);
    expect((await h.storage.get<Game>('game'))!.members[1].player.score).toBe(100);
  });
  it('replaces duplicate sessions and ignores old-tab messages and close events', async () => {
    const h = await setup();
    const fresh = await h.connect(h.one);
    expect(h.a.closed?.code).toBe(4001);
    await send(h.room, h.a, { type: 'ready', ready: true });
    await h.room.webSocketClose(h.a as unknown as WebSocket, 1000, '', true);
    const game = (await h.storage.get<Game>('game'))!;
    expect(game.members[0].player.connected).toBe(true);
    expect(game.members[0].player.ready).toBe(false);
    await send(h.room, fresh, { type: 'ready', ready: true });
    expect((await h.storage.get<Game>('game'))!.members[0].player.ready).toBe(true);
  });
  it('transfers host, keeps reconnect identity past a minute, and never revives expired rooms', async () => {
    const h = await setup();
    await h.room.webSocketClose(h.a as unknown as WebSocket, 1000, '', true);
    expect((await h.storage.get<Game>('game'))!.public.hostId).toBe(h.two!.playerId);
    vi.setSystemTime(Date.now() + 120000);
    const fresh = await h.connect(h.one);
    expect((await h.storage.get<Game>('game'))!.public.hostId).toBe(h.two!.playerId);
    await h.room.webSocketClose(fresh as unknown as WebSocket, 1000, '', true);
    vi.setSystemTime(Date.now() + IDLE_TTL);
    expect(
      (
        await h.room.fetch(
          req(`/ws?playerId=${h.one.playerId}&token=${h.one.token}`, undefined, {
            Upgrade: 'websocket',
          }),
        )
      ).status,
    ).toBe(404);
    expect(await h.storage.get('game')).toBeUndefined();
  });
  it('rejects forged credentials, foreign origins, invalid settings and forged hosts', async () => {
    const h = await setup();
    expect(
      (
        await h.room.fetch(
          req(`/ws?playerId=${h.one.playerId}&token=forged`, undefined, { Upgrade: 'websocket' }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await h.room.fetch(
          req('/join', { name: 'Evil', avatar: 'steve' }, { Origin: 'https://evil.example' }),
        )
      ).status,
    ).toBe(403);
    await send(h.room, h.b!, { type: 'start' });
    expect(JSON.parse(h.b!.sent.at(-1)!).message).toContain('host');
    await send(h.room, h.a, {
      type: 'settings',
      settings: { ...DEFAULT_SETTINGS, rounds: 1000000 },
    });
    expect(JSON.parse(h.a.sent.at(-1)!).type).toBe('error');
    const fake = new Socket();
    fake.serializeAttachment({ playerId: h.one.playerId, connection: 'forged' });
    await send(h.room, fake, { type: 'start' });
    expect(fake.closed?.code).toBe(4001);
  });
  it('bounds messages and submission rates and does not persist ping traffic', async () => {
    const h = await setup(true);
    const revision = (await h.storage.get<Game>('game'))!.public.revision;
    await send(h.room, h.a, { type: 'ping', sentAt: 1 });
    expect((await h.storage.get<Game>('game'))!.public.revision).toBe(revision);
    for (let i = 0; i < 60; i++) await send(h.room, h.a, { type: 'ping', sentAt: i });
    expect(h.a.closed?.code).toBe(1008);
    const fresh = await h.connect(h.one);
    await h.room.webSocketMessage(fresh as unknown as WebSocket, ' '.repeat(8193));
    expect(fresh.closed?.code).toBe(1009);
  });
  it('expires inactive rooms, closes sockets and bounds practice rooms', async () => {
    const h = await setup(true);
    expect((await h.room.fetch(req('/join', { name: 'Two', avatar: 'steve' }))).status).toBe(409);
    vi.setSystemTime(Date.now() + IDLE_TTL);
    await h.room.alarm();
    expect(await h.storage.get('game')).toBeUndefined();
    expect(h.a.closed?.code).toBe(4004);
    expect((await h.room.fetch(req('/join', { name: 'Two', avatar: 'steve' }))).status).toBe(404);
  });
  it('persists the HTTP rate limiter across recreation and resets on its alarm', async () => {
    const h = harness();
    for (let i = 0; i < 30; i++) expect((await h.room.fetch(req('/limit'))).status).toBe(200);
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    expect((await restored.fetch(req('/limit'))).status).toBe(429);
    vi.setSystemTime(Date.now() + 60_000);
    await restored.alarm();
    expect((await restored.fetch(req('/limit'))).status).toBe(200);
  });
});
describe('live capacity and retained identities', () => {
  const join = async (h: Awaited<ReturnType<typeof setup>>, name = 'Replacement') => {
    const response = await h.room.fetch(req('/join', { name, avatar: 'pig' }));
    expect(response.status).toBe(200);
    return (await response.json()) as typeof h.one;
  };
  const tryConnect = (
    h: Awaited<ReturnType<typeof setup>>,
    session: Awaited<ReturnType<typeof setup>>['one'],
  ) =>
    h.room.fetch(
      req(`/ws?playerId=${session.playerId}&token=${session.token}`, undefined, {
        Upgrade: 'websocket',
      }),
    );

  it('reuses a departed slot but never lets old identities overfill live or reserved capacity', async () => {
    const h = await setup();
    for (let i = 2; i < 12; i++) await h.connect(await join(h, `Player ${i}`));
    await h.room.webSocketClose(h.a as unknown as WebSocket, 1000, '', true);
    expect(lastState(h.b!).players).toHaveLength(11);
    const replacement = await join(h);
    const before = (await h.storage.get<Game>('game'))!;
    expect((await tryConnect(h, h.one)).status).toBe(409);
    expect((await h.storage.get<Game>('game'))!.public.revision).toBe(before.public.revision);
    const fresh = await h.connect(replacement);
    expect(
      (await h.storage.get<Game>('game'))!.members.find(
        (m) => m.player.id === replacement.playerId,
      )!.reservedUntil,
    ).toBeNull();
    await h.connect(replacement);
    expect(fresh.closed?.code).toBe(4001);
    expect((await tryConnect(h, h.one)).status).toBe(409);
    expect(lastState(h.b!).players).toHaveLength(12);
    await h.room.webSocketClose(h.b! as unknown as WebSocket, 1000, '', true);
    const returned = await h.connect(h.one);
    expect(lastState(returned).players).toHaveLength(12);
    expect((await h.storage.get<Game>('game'))!.members).toHaveLength(13);
  });

  it('reserves HTTP joins serially and releases unclaimed slots after thirty seconds', async () => {
    const h = await setup();
    const responses = await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        h.room.fetch(req('/join', { name: `Pending ${i}`, avatar: 'pig' })),
      ),
    );
    expect(responses.filter((response) => response.status === 200)).toHaveLength(10);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
    const pending = (await responses
      .find((response) => response.status === 200)!
      .json()) as typeof h.one;
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    await restored.alarm();
    expect((await restored.fetch(req('/join', { name: 'Still full', avatar: 'pig' }))).status).toBe(
      409,
    );
    vi.setSystemTime(Date.now() + JOIN_RESERVATION_MS);
    await restored.alarm();
    expect(lastState(h.a).players).toHaveLength(2);
    h.room = restored;
    for (let i = 0; i < 10; i++) await join(h, `New ${i}`);
    expect((await tryConnect(h, pending)).status).toBe(409);
    expect(
      (await h.storage.get<Game>('game'))!.members.filter((m) => m.player.connected),
    ).toHaveLength(2);
  });

  it('enforces practice capacity on reconnect and preserves the retained identity bound', async () => {
    const h = await setup(true);
    await h.room.webSocketClose(h.a as unknown as WebSocket, 1000, '', true);
    const replacement = await join(h);
    await h.connect(replacement);
    expect((await tryConnect(h, h.one)).status).toBe(409);
    const game = (await h.storage.get<Game>('game'))!;
    const template = game.members[0];
    for (let i = game.members.length; i < MAX_IDENTITIES; i++)
      game.members.push({
        ...structuredClone(template),
        player: { ...template.player, id: `retained-${i}`, connected: false },
        reservedUntil: null,
      });
    await h.storage.put('game', game);
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    const response = await restored.fetch(
      req('/join', { name: 'Too many sessions', avatar: 'pig' }),
    );
    expect(response.status).toBe(409);
    expect(await response.text()).toContain('session limit');
    const reused = await h.connect(replacement, restored);
    expect(lastState(reused).players).toHaveLength(1);
  });

  it('upgrades schema-three membership without changing forfeits, expiry or scores', async () => {
    const h = await setup();
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'forfeit', roundId });
    const game = (await h.storage.get<Game>('game'))!;
    game.schemaVersion = 3;
    game.members[0].player.score = 150;
    game.public.round!.playerStates[h.two!.playerId].expired = true;
    for (const member of game.members) delete (member as Partial<typeof member>).reservedUntil;
    await h.storage.put('game', game);
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    await restored.alarm();
    const migrated = (await h.storage.get<Game>('game'))!;
    expect(migrated.members.every((member) => member.reservedUntil === null)).toBe(true);
    expect(migrated.members[0].player.score).toBe(150);
    expect(migrated.public.round!.playerStates[h.one.playerId].forfeited).toBe(true);
    expect(migrated.public.round!.playerStates[h.two!.playerId].expired).toBe(true);
  });
});

describe('HTTP entry', () => {
  it('routes create, case-insensitive join and websocket sessions through isolated room objects', async () => {
    const objects = new Map<string, ReturnType<typeof harness>>();
    const env = {
      ROOMS: {
        idFromName: (name: string) => name,
        get: (name: string) => ({
          fetch: (input: Request | string) => {
            let h = objects.get(name);
            if (!h) {
              h = harness();
              objects.set(name, h);
            }
            return h.room.fetch(typeof input === 'string' ? new Request(input) : input);
          },
        }),
      } as unknown as DurableObjectNamespace,
      ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    };
    const created = await worker.fetch(req('/api/rooms', { name: 'One', avatar: 'steve' }), env);
    expect(created.status).toBe(201);
    const one = (await created.json()) as { code: string; playerId: string; token: string };
    expect(one.code).toMatch(/^[A-Z2-9]{6}$/);
    const joined = await worker.fetch(
      req(`/api/rooms/${one.code.toLowerCase()}/join`, { name: 'Two', avatar: 'alex' }),
      env,
    );
    expect(joined.status).toBe(200);
    expect(((await joined.json()) as { code: string }).code).toBe(one.code);
    const connected = await worker.fetch(
      req(`/api/rooms/${one.code}/ws?playerId=${one.playerId}&token=${one.token}`, undefined, {
        Upgrade: 'websocket',
      }),
      env,
    );
    expect(connected.status).toBe(101);
    expect(
      (await objects.get('room:' + one.code)!.storage.get<Game>('game'))!.members,
    ).toHaveLength(2);
    const asset = await worker.fetch(req('/join/' + one.code), env);
    expect(await asset.text()).toBe('asset');
  });

  it('serves health with security headers, denies cross-origin and unknown API paths', async () => {
    const env = {
      ROOMS: {} as DurableObjectNamespace,
      ASSETS: { fetch: vi.fn() } as unknown as Fetcher,
    };
    const health = await worker.fetch(req('/api/health'), env);
    expect(await health.json()).toEqual({ ok: true, version: 'test' });
    expect(health.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(
      (await worker.fetch(req('/api/rooms', {}, { Origin: 'https://evil.example' }), env)).status,
    ).toBe(403);
    expect((await worker.fetch(req('/api/rooms'), env)).status).toBe(405);
    expect((await worker.fetch(req('/api/hidden'), env)).status).toBe(404);
  });
});

function lastState(socket: Socket): RoomSnapshot {
  const message = [...socket.sent]
    .reverse()
    .map((raw) => JSON.parse(raw) as ServerMessage)
    .find((message) => message.type === 'state');
  if (message?.type !== 'state') throw new Error('Expected state message');
  return message.state;
}

describe('persisted host intermission skips', () => {
  it('serializes duplicate skips with alarms, persists before broadcasting and rejects the guest', async () => {
    const h = await setup();
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'forfeit', roundId });
    await send(h.room, h.b!, { type: 'forfeit', roundId });
    const reveal = (await h.storage.get<Game>('game'))!;
    expect(reveal.public.deadline).toBe(Date.now() + REVEAL_MS);
    await send(h.room, h.b!, { type: 'skipReveal', roundId });
    expect(JSON.parse(h.b!.sent.at(-1)!)).toMatchObject({
      type: 'error',
      message: 'Only the host can do that',
    });
    expect((await h.storage.get<Game>('game'))!.public.phase).toBe('reveal');
    h.storage.fail = true;
    await send(h.room, h.a, { type: 'skipReveal', roundId });
    expect((await h.storage.get<Game>('game'))!.public.phase).toBe('reveal');
    h.storage.fail = false;
    vi.setSystemTime(Date.now() + 100);
    const nextDeadline = Date.now() + COUNTDOWN_MS;
    await Promise.all([
      send(h.room, h.a, { type: 'skipReveal', roundId }),
      send(h.room, h.a, { type: 'skipReveal', roundId }),
      h.room.alarm(),
    ]);
    const game = (await h.storage.get<Game>('game'))!;
    expect(game.public.phase).toBe('countdown');
    expect(game.public.deadline).toBe(nextDeadline);
    expect(game.public.history).toEqual(reveal.public.history);
    expect(h.storage.alarm).toBe(nextDeadline);
    expect(JSON.parse(h.b!.sent.at(-1)!)).toMatchObject({
      type: 'state',
      state: { phase: 'countdown', deadline: nextDeadline },
    });
    vi.setSystemTime(nextDeadline);
    await h.room.alarm();
    const next = (await h.storage.get<Game>('game'))!;
    expect(next.public.round?.index).toBe(1);
    expect(next.public.round?.startsAt).toBe(nextDeadline);
    await send(h.room, h.a, { type: 'skipReveal', roundId });
    expect((await h.storage.get<Game>('game'))!.public).toEqual(next.public);
  });
});

describe('persisted forfeits, departures and legacy migration', () => {
  it('persists a private grid, forfeit and standings through hibernation and session replacement', async () => {
    const h = await setup();
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    expect(lastState(h.a).round!.playerStates[h.one.playerId].grid).toEqual(solutionFor('target0'));
    expect(lastState(h.b!).round!.playerStates[h.one.playerId].grid).toEqual(Array(9).fill(null));
    await send(h.room, h.a, { type: 'forfeit', roundId });
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    const fresh = await h.connect(h.one, restored);
    expect(lastState(fresh).round!.playerStates[h.one.playerId].forfeited).toBe(true);
    await send(restored, fresh, { type: 'collect', roundId, grid: solutionFor('target0') });
    expect(JSON.parse(fresh.sent.at(-1)!).type).toBe('error');
    await send(restored, h.b!, { type: 'forfeit', roundId });
    expect(lastState(fresh).round!.endReason).toBe('forfeit');
    expect(lastState(fresh).round!.standings.every((s) => s.points === 0)).toBe(true);
    await send(restored, h.b!, { type: 'forfeit', roundId });
    expect((await h.storage.get<Game>('game'))!.public.history).toHaveLength(1);
  });
  it('serializes a forfeit before collection and rolls back a failed forfeit commit', async () => {
    const h = await setup();
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    h.a.sent = [];
    h.storage.fail = true;
    await send(h.room, h.a, { type: 'forfeit', roundId });
    expect(h.a.sent.map((raw) => JSON.parse(raw).type)).toEqual(['error']);
    expect(
      (await h.storage.get<Game>('game'))!.public.round!.playerStates[h.one.playerId].forfeited,
    ).toBe(false);
    h.storage.fail = false;
    await Promise.all([
      send(h.room, h.a, { type: 'forfeit', roundId }),
      send(h.room, h.a, { type: 'collect', roundId, grid: solutionFor('target0') }),
    ]);
    expect((await h.storage.get<Game>('game'))!.members[0].player.score).toBe(0);
    expect(lastState(h.b!).round!.playerStates[h.one.playerId].forfeited).toBe(true);
  });
  it('collection winning a race cannot be cancelled by a later forfeit', async () => {
    const h = await setup(true);
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    await Promise.all([
      send(h.room, h.a, { type: 'collect', roundId, grid: solutionFor('target0') }),
      send(h.room, h.a, { type: 'forfeit', roundId }),
    ]);
    expect((await h.storage.get<Game>('game'))!.members[0].player.score).toBe(100);
    expect(lastState(h.a).round!.endReason).toBe('crafted');
  });
  it('current socket closure ends alone but replacement closure cannot end the match', async () => {
    const h = await setup();
    await start(h);
    const fresh = await h.connect(h.one);
    await h.room.webSocketClose(h.a as unknown as WebSocket, 4001, '', true);
    expect((await h.storage.get<Game>('game'))!.public.phase).toBe('playing');
    await h.room.webSocketClose(fresh as unknown as WebSocket, 1000, '', true);
    expect(lastState(h.b!).phase).toBe('finished');
    expect(lastState(h.b!).endReason).toBe('alone');
    const resumed = await h.connect(h.one);
    expect(lastState(resumed).phase).toBe('finished');
    expect(lastState(resumed).players.every((p) => p.score === 0)).toBe(true);
  });
  it('reconciles all lost transports before classifying a zero-survivor restart', async () => {
    const h = await setup();
    await start(h);
    h.sockets.length = 0;
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    await restored.alarm();
    const game = (await h.storage.get<Game>('game'))!;
    expect(game.public.phase).toBe('finished');
    expect(game.public.endReason).toBe('abandoned');
    expect(game.members).toHaveLength(2);
    expect(game.members.every((m) => !m.player.connected && m.player.score === 0)).toBe(true);
    const resumed = await h.connect(h.one, restored);
    expect(lastState(resumed).phase).toBe('finished');
    expect(lastState(resumed).players).toHaveLength(2);
    expect(lastState(resumed).endReason).toBe('abandoned');
  });
  it('keeps an unfinished practice round and private grid through close, alarm and reconnect', async () => {
    const h = await setup(true);
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    const deadline = lastState(h.a).deadline;
    await h.room.webSocketClose(h.a as unknown as WebSocket, 1000, '', true);
    vi.setSystemTime(Date.now() + 1000);
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    await restored.alarm();
    const resumed = await h.connect(h.one, restored);
    const state = lastState(resumed);
    expect(state.phase).toBe('playing');
    expect(state.deadline).toBe(deadline);
    expect(state.round!.id).toBe(roundId);
    expect(state.round!.playerStates[h.one.playerId].grid).toEqual(solutionFor('target0'));
    expect(state.history).toEqual([]);
    vi.setSystemTime(deadline!);
    await restored.alarm();
    expect(lastState(resumed).phase).toBe('reveal');
    expect(lastState(resumed).round!.endReason).toBe('timeout');
  });
  it('reconciles a lost peer transport as alone during restart', async () => {
    const h = await setup();
    await start(h);
    h.sockets.splice(h.sockets.indexOf(h.b!), 1);
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    await restored.alarm();
    const game = (await h.storage.get<Game>('game'))!;
    expect(game.public.phase).toBe('finished');
    expect(game.public.endReason).toBe('alone');
    expect(game.members.every((m) => m.player.score === 0)).toBe(true);
  });
  it('pending late joins cannot cause match termination and cannot block all forfeits', async () => {
    const h = await setup();
    const roundId = await start(h);
    await h.room.fetch(req('/join', { name: 'Pending', avatar: 'pig' }));
    expect((await h.storage.get<Game>('game'))!.public.phase).toBe('playing');
    await send(h.room, h.a, { type: 'forfeit', roundId });
    await send(h.room, h.b!, { type: 'forfeit', roundId });
    expect(lastState(h.a).phase).toBe('reveal');
  });
  it('legacy actions return errors without closing sockets or changing clocks and points', async () => {
    const h = await setup(true);
    const roundId = await start(h);
    const deadline = lastState(h.a).deadline;
    for (const type of ['engage', 'overclock']) {
      await send(h.room, h.a, { type, roundId });
      expect(JSON.parse(h.a.sent.at(-1)!).type).toBe('error');
      expect(h.a.closed).toBeUndefined();
    }
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    await send(h.room, h.a, { type: 'collect', roundId, grid: solutionFor('target0') });
    expect(lastState(h.a).players[0].score).toBe(100);
    expect(lastState(h.a).round!.endsAt).toBe(deadline);
  });
  it('upgrades persisted accelerated states without discarding earned scores', async () => {
    const h = await setup();
    await start(h);
    const game = (await h.storage.get<Game>('game'))!;
    game.schemaVersion = 2;
    game.members[0].player.score = 150;
    Object.assign(game.public.round!.playerStates[h.one.playerId], {
      engaged: true,
      overclocked: true,
      deadline: Date.now() + 1,
      expired: true,
    });
    await h.storage.put('game', game);
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    await restored.alarm();
    const migrated = (await h.storage.get<Game>('game'))!;
    expect(migrated.members[0].player.score).toBe(150);
    expect(migrated.public.round!.playerStates[h.one.playerId]).toEqual({
      forfeited: false,
      expired: false,
      grid: Array(9).fill(null),
    });
    expect(migrated.public.deadline).toBe(migrated.public.round!.endsAt);
  });
  it.each(['fetch', 'socket', 'alarm'] as const)(
    'enforces absolute expiry via %s even with recent activity',
    async (entry) => {
      const h = await setup(true);
      const game = (await h.storage.get<Game>('game'))!;
      game.activeAt = game.createdAt + MAX_AGE - 1;
      await h.storage.put('game', game);
      const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
      vi.setSystemTime(game.createdAt + MAX_AGE);
      if (entry === 'fetch')
        expect((await restored.fetch(req('/join', { name: 'Late', avatar: 'pig' }))).status).toBe(
          404,
        );
      else if (entry === 'socket') await send(restored, h.a, { type: 'ping', sentAt: 1 });
      else await restored.alarm();
      expect(await h.storage.get('game')).toBeUndefined();
      expect(h.a.closed?.code).toBe(4004);
    },
  );
});
