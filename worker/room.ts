import { clientMessageSchema, createSchema, joinSchema } from '../src/shared/protocol';
import type { ServerMessage } from '../src/shared/types';
import {
  addMember,
  advance,
  command,
  createGame,
  disconnect,
  expired,
  GameError,
  nextAlarm,
  requireCapacity,
  snapshot,
  settleDeparture,
  upgradeGame,
  type Game,
} from './game';
import { body, checkOrigin, errorResponse, json, MAX_BODY } from './http';

interface Attachment {
  playerId: string;
  connection: string;
  window: number;
  count: number;
}
export class GameRoom {
  private game: Game | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  private initialized: Promise<void>;
  constructor(private ctx: DurableObjectState) {
    this.initialized = ctx.blockConcurrencyWhile(async () => {
      this.game = await ctx.storage.get<Game>('game');
      if (!this.game) return;
      // Hibernation preserves attachments; process restarts or failed upgrades
      // can leave persisted membership without a surviving transport.
      const attachments = ctx.getWebSockets().map((socket) => this.attachment(socket));
      let changed = upgradeGame(this.game);
      let departed = false;
      for (const member of this.game.members) {
        if (
          member.player.connected &&
          !attachments.some(
            (a) => a?.playerId === member.player.id && a.connection === member.connection,
          )
        ) {
          disconnect(this.game, member, Date.now(), false);
          departed = true;
          changed = true;
        }
      }
      // Reconcile the whole transport set before counting survivors. Pending HTTP
      // joins have never had a transport and must not trigger a departure.
      if (departed) settleDeparture(this.game, Date.now());
      if (changed) await this.save();
    });
  }
  // Every entry point shares this queue, including alarms and close callbacks. Storage
  // awaits must never allow another claim to observe an uncommitted score.
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      await this.initialized;
      try {
        return await work();
      } catch (error) {
        this.game = await this.ctx.storage.get<Game>('game');
        throw error;
      }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
  private async save() {
    const game = this.game!;
    game.public.revision++;
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put('game', game);
      await storage.setAlarm(nextAlarm(game));
    });
  }
  private send(socket: WebSocket, message: ServerMessage) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      /* Close/error event updates membership. */
    }
  }
  private attachment(socket: WebSocket): Attachment | null {
    try {
      return socket.deserializeAttachment() as Attachment | null;
    } catch {
      return null;
    }
  }
  private broadcast() {
    if (!this.game) return;
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const a = this.attachment(socket);
      if (
        a &&
        this.game.members.some((m) => m.player.id === a.playerId && m.connection === a.connection)
      )
        this.send(socket, { type: 'state', state: snapshot(this.game, now, a.playerId) });
    }
  }
  private async wake(now: number): Promise<boolean> {
    if (!this.game) return false;
    if (expired(this.game, now)) {
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      this.game = undefined;
      for (const socket of this.ctx.getWebSockets()) socket.close(4004, 'Room expired');
      return false;
    }
    if (advance(this.game, now)) {
      await this.save();
      this.broadcast();
    }
    return true;
  }
  fetch(request: Request): Promise<Response> {
    return this.serial(async () => {
      const url = new URL(request.url);
      // Private routing is constructed only by the entry Worker, never forwarded
      // from arbitrary public paths. Rate objects use a separate namespace name.
      if (url.pathname === '/limit') return this.limit();
      const now = Date.now();
      await this.wake(now);
      if (url.pathname === '/create' && request.method === 'POST') {
        checkOrigin(request);
        if (this.game) throw new GameError('Room code collision', 409);
        const parsed = createSchema.safeParse(await body(request));
        if (!parsed.success) throw new GameError('Invalid room settings or player');
        const code = request.headers.get('X-Room-Code');
        if (!code || !/^[A-Z0-9]{6}$/.test(code)) throw new GameError('Invalid room code');
        this.game = createGame(code, parsed.data.practice ?? false, parsed.data.settings, now);
        const member = addMember(this.game, parsed.data.name, parsed.data.avatar, now);
        await this.save();
        return json({ code, playerId: member.player.id, token: member.token }, 201);
      }
      if (!this.game) throw new GameError('Room not found or expired', 404);
      if (url.pathname === '/join' && request.method === 'POST') {
        checkOrigin(request);
        const parsed = joinSchema.safeParse(await body(request));
        if (!parsed.success) throw new GameError('Invalid player name or avatar');
        const member = addMember(this.game, parsed.data.name, parsed.data.avatar, now);
        await this.save();
        this.broadcast();
        return json({
          code: this.game.public.code,
          playerId: member.player.id,
          token: member.token,
        });
      }
      if (url.pathname === '/ws' && request.method === 'GET') {
        checkOrigin(request, true);
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
          throw new GameError('WebSocket upgrade required', 426);
        const id = url.searchParams.get('playerId');
        const token = url.searchParams.get('token');
        if (!id || !token || token.length > 128) throw new GameError('Invalid session', 401);
        const member = this.game.members.find((m) => m.player.id === id && m.token === token);
        if (!member) throw new GameError('Invalid or expired session', 401);
        requireCapacity(this.game, now, member);
        const previous = member.connection;
        const connection = crypto.randomUUID();
        const pair = new WebSocketPair();
        member.connection = connection;
        member.player.connected = true;
        member.disconnectedAt = null;
        member.reservedUntil = null;
        this.game.activeAt = now;
        // A disconnected original host transfers to the first live member.
        if (
          !this.game.members.some(
            (m) => m.player.id === this.game!.public.hostId && m.player.connected,
          )
        )
          this.game.public.hostId = member.player.id;
        await this.save();
        this.ctx.acceptWebSocket(pair[1]);
        pair[1].serializeAttachment({
          playerId: id,
          connection,
          window: now,
          count: 0,
        } satisfies Attachment);
        for (const socket of this.ctx.getWebSockets()) {
          const a = this.attachment(socket);
          if (a?.playerId === id && a.connection === previous)
            socket.close(4001, 'Session opened in another tab');
        }
        this.broadcast();
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      throw new GameError('Not found', 404);
    }).catch(errorResponse);
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    return this.serial(async () => {
      const now = Date.now();
      if (!(await this.wake(now))) {
        socket.close(4004, 'Room expired');
        return;
      }
      const a = this.attachment(socket);
      const member =
        a &&
        this.game!.members.find((m) => m.player.id === a.playerId && m.connection === a.connection);
      if (!a || !member) {
        socket.close(4001, 'Session replaced or removed');
        return;
      }
      if (
        typeof message !== 'string' ||
        message.length > MAX_BODY ||
        new TextEncoder().encode(message).byteLength > MAX_BODY
      ) {
        socket.close(1009, 'Message too large or binary');
        return;
      }
      if (now - a.window >= 10_000) {
        a.window = now;
        a.count = 0;
      }
      a.count++;
      socket.serializeAttachment(a);
      if (a.count > 60) {
        socket.close(1008, 'Message rate exceeded');
        return;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(message);
      } catch {
        throw new GameError('Invalid JSON');
      }
      const parsed = clientMessageSchema.safeParse(raw);
      if (!parsed.success) throw new GameError('Invalid message');
      if (parsed.data.type === 'ping') {
        this.send(socket, { type: 'pong', sentAt: parsed.data.sentAt, serverNow: now });
        return;
      }
      command(this.game!, member, parsed.data, now);
      advance(this.game!, now);
      await this.save();
      this.broadcast();
      if (parsed.data.type === 'leave') socket.close(1000, 'Left room');
    }).catch((error) => {
      this.send(socket, {
        type: 'error',
        message: error instanceof GameError ? error.message : 'Server temporarily unavailable',
      });
    });
  }
  webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    void code;
    void reason;
    void wasClean;
    return this.closed(socket);
  }
  webSocketError(socket: WebSocket): Promise<void> {
    return this.closed(socket);
  }
  private closed(socket: WebSocket): Promise<void> {
    return this.serial(async () => {
      const now = Date.now();
      if (!(await this.wake(now))) return;
      const a = this.attachment(socket);
      const member =
        a &&
        this.game!.members.find((m) => m.player.id === a.playerId && m.connection === a.connection);
      if (!member) return; // A replaced tab's close cannot disconnect its successor.
      disconnect(this.game!, member, now);
      await this.save();
      this.broadcast();
      try {
        socket.close(1000, 'Disconnected');
      } catch {
        /* Already closed. */
      }
    });
  }
  alarm(): Promise<void> {
    return this.serial(async () => {
      if (!this.game) {
        const limit = await this.ctx.storage.get<{ until: number }>('limit');
        if (limit && limit.until > Date.now()) await this.ctx.storage.setAlarm(limit.until);
        else await this.ctx.storage.deleteAll();
        return;
      }
      if (await this.wake(Date.now())) await this.ctx.storage.setAlarm(nextAlarm(this.game!));
    });
  }
  private async limit(): Promise<Response> {
    const now = Date.now();
    let bucket = await this.ctx.storage.get<{ until: number; count: number }>('limit');
    if (!bucket || now >= bucket.until) bucket = { until: now + 60_000, count: 0 };
    if (++bucket.count > 30) return json({ error: 'Too many requests; try again shortly' }, 429);
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put('limit', bucket);
      await storage.setAlarm(bucket.until);
    });
    return json({ ok: true });
  }
}
