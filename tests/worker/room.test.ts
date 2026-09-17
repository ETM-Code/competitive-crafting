vi.mock('../../src/shared/catalogue', () => import('./fixtures'));
vi.mock('../../src/shared/recipes', () => import('./fixtures'));
vi.mock('../../src/shared/rules', () => import('./fixtures'));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameRoom } from '../../worker/room';
import type { Game } from '../../worker/game';
import type { RoomSnapshot, ServerMessage } from '../../src/shared/types';
import { GRACE, IDLE_TTL } from '../../worker/game';
import { DEFAULT_SETTINGS, solutionFor } from './fixtures';
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
    expect(h.storage.alarm).toBe(Date.now() + GRACE);
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
  it('transfers host and permits reconnect only inside the grace period', async () => {
    const h = await setup();
    await h.room.webSocketClose(h.a as unknown as WebSocket, 1000, '', true);
    expect((await h.storage.get<Game>('game'))!.public.hostId).toBe(h.two!.playerId);
    vi.setSystemTime(Date.now() + GRACE - 1);
    const fresh = await h.connect(h.one);
    expect((await h.storage.get<Game>('game'))!.public.hostId).toBe(h.two!.playerId);
    await h.room.webSocketClose(fresh as unknown as WebSocket, 1000, '', true);
    vi.setSystemTime(Date.now() + GRACE);
    await h.room.alarm();
    expect(
      (
        await h.room.fetch(
          req(`/ws?playerId=${h.one.playerId}&token=${h.one.token}`, undefined, {
            Upgrade: 'websocket',
          }),
        )
      ).status,
    ).toBe(401);
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

describe('persisted Overclock and private socket snapshots', () => {
  it('persists grids privately and tailors every broadcast for players and spectators', async () => {
    const h = await setup();
    const roundId = await start(h);
    const spectator = (await (
      await h.room.fetch(req('/join', { name: 'Watcher', avatar: 'alex' }))
    ).json()) as typeof h.one;
    const watcher = await h.connect(spectator);
    await send(h.room, h.a, { type: 'overclock', roundId });
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    const stored = (await h.storage.get<Game>('game'))!;
    expect(stored.public.round!.playerStates[h.one.playerId].grid).toEqual(solutionFor('target0'));
    expect(stored.members[0].player.score).toBe(0);
    expect(lastState(h.a).round!.playerStates[h.one.playerId].grid).toEqual(solutionFor('target0'));
    for (const socket of [h.b!, watcher]) {
      expect(lastState(socket).round!.playerStates[h.one.playerId]).toMatchObject({
        overclocked: true,
        engaged: true,
        grid: Array(9).fill(null),
      });
      expect(JSON.stringify(lastState(socket))).not.toContain(h.one.token);
    }
    expect(lastState(watcher).round!.playerStates[spectator.playerId]).toBeUndefined();
    await send(h.room, watcher, { type: 'overclock', roundId });
    expect(JSON.parse(watcher.sent.at(-1)!).type).toBe('error');
    await send(h.room, h.a, { type: 'collect', roundId, grid: solutionFor('target0') });
    expect(lastState(h.b!).round!.playerStates[h.one.playerId].grid).toEqual(Array(9).fill(null));
  });
  it('restores engagement, private grid, Overclock and absolute deadline across reconnect and hibernation', async () => {
    const h = await setup();
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'overclock', roundId });
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    const before = (await h.storage.get<Game>('game'))!.public.round!.playerStates[h.one.playerId];
    vi.setSystemTime(Date.now() + 1000);
    await h.room.webSocketClose(h.a as unknown as WebSocket, 1000, '', true);
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    const resumed = await h.connect(h.one, restored);
    expect(lastState(resumed).round!.playerStates[h.one.playerId]).toEqual(before);
    expect(lastState(h.b!).round!.playerStates[h.one.playerId].grid).toEqual(Array(9).fill(null));
    await send(restored, resumed, { type: 'overclock', roundId });
    expect(JSON.parse(resumed.sent.at(-1)!).message).toContain('locked');
    await send(restored, resumed, { type: 'collect', roundId, grid: solutionFor('target0') });
    expect(lastState(resumed).players.find((player) => player.id === h.one.playerId)?.score).toBe(
      150,
    );
  });
  it('expires a disconnected Overclock player on reconnect without extending their deadline', async () => {
    const h = await setup();
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'overclock', roundId });
    await send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    const deadline = (await h.storage.get<Game>('game'))!.public.round!.playerStates[h.one.playerId]
      .deadline;
    expect(h.storage.alarm).toBe(deadline);
    await h.room.webSocketClose(h.a as unknown as WebSocket, 1000, '', true);
    vi.setSystemTime(deadline);
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    const resumed = await h.connect(h.one, restored);
    expect(lastState(resumed).phase).toBe('playing');
    expect(lastState(resumed).round!.playerStates[h.one.playerId]).toMatchObject({
      expired: true,
      overclocked: true,
      deadline,
    });
    expect(lastState(h.b!).round!.playerStates[h.two!.playerId].expired).toBe(false);
    await send(restored, resumed, { type: 'collect', roundId, grid: solutionFor('target0') });
    expect(JSON.parse(resumed.sent.at(-1)!).message).toContain('expired');
    expect(
      (await h.storage.get<Game>('game'))!.members.every((member) => member.player.score === 0),
    ).toBe(true);
  });
  it('expires everyone and reveals on the earliest alarm even after object recreation', async () => {
    const h = await setup();
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'overclock', roundId });
    await send(h.room, h.b!, { type: 'overclock', roundId });
    const deadline = h.storage.alarm!;
    vi.setSystemTime(deadline);
    const restored = new GameRoom(h.ctx as unknown as DurableObjectState);
    await restored.alarm();
    const state = lastState(h.a);
    expect(state.phase).toBe('reveal');
    expect(Object.values(state.round!.playerStates).every((player) => player.expired)).toBe(true);
    expect(h.storage.alarm).toBe(deadline + 5000);
    await restored.alarm();
    expect((await h.storage.get<Game>('game'))!.public.history).toHaveLength(1);
  });
  it('serializes grid persistence ahead of collection and rejects subsequent stale clears', async () => {
    const h = await setup(true);
    const roundId = await start(h);
    await send(h.room, h.a, { type: 'overclock', roundId });
    let release!: () => void;
    let entered!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entry = new Promise<void>((resolve) => {
      entered = resolve;
    });
    h.storage.beforePut = async () => {
      entered();
      await barrier;
    };
    const grid = send(h.room, h.a, { type: 'grid', roundId, grid: solutionFor('target0') });
    await entry;
    const collect = send(h.room, h.a, { type: 'collect', roundId, grid: solutionFor('target0') });
    expect((await h.storage.get<Game>('game'))!.members[0].player.score).toBe(0);
    release();
    await Promise.all([grid, collect]);
    expect((await h.storage.get<Game>('game'))!.members[0].player.score).toBe(150);
    await send(h.room, h.a, { type: 'grid', roundId, grid: Array(9).fill(null) });
    expect(JSON.parse(h.a.sent.at(-1)!).type).toBe('error');
    expect(
      (await h.storage.get<Game>('game'))!.public.round!.playerStates[h.one.playerId].grid,
    ).toEqual(solutionFor('target0'));
  });
  it('preserves first-interaction ordering when an Overclock request races a durable engage', async () => {
    const h = await setup(true);
    const roundId = await start(h);
    const first = send(h.room, h.a, { type: 'engage', roundId });
    const second = send(h.room, h.a, { type: 'overclock', roundId });
    await Promise.all([first, second]);
    expect(
      (await h.storage.get<Game>('game'))!.public.round!.playerStates[h.one.playerId],
    ).toMatchObject({ engaged: true, overclocked: false });
    expect(JSON.parse(h.a.sent.at(-1)!).message).toContain('locked');
  });
  it('rolls back failed Overclock commits and never broadcasts an unpersisted shortened clock', async () => {
    const h = await setup(true);
    const roundId = await start(h);
    h.a.sent = [];
    h.storage.fail = true;
    await send(h.room, h.a, { type: 'overclock', roundId });
    expect(h.a.sent.map((raw) => (JSON.parse(raw) as ServerMessage).type)).toEqual(['error']);
    expect(
      (await h.storage.get<Game>('game'))!.public.round!.playerStates[h.one.playerId].overclocked,
    ).toBe(false);
    h.storage.fail = false;
    await send(h.room, h.a, { type: 'overclock', roundId });
    expect(lastState(h.a).round!.playerStates[h.one.playerId].overclocked).toBe(true);
  });
  it('rejects the removed preset and obsolete phase-related messages', async () => {
    const h = await setup(true);
    await send(h.room, h.a, {
      type: 'settings',
      settings: { ...DEFAULT_SETTINGS, preset: 'memory' },
    });
    expect(JSON.parse(h.a.sent.at(-1)!).type).toBe('error');
    await send(h.room, h.a, { type: 'preview' });
    expect(JSON.parse(h.a.sent.at(-1)!).type).toBe('error');
    expect((await h.storage.get<Game>('game'))!.public.settings.preset).toBe('classic');
  });
});
