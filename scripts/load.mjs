import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';

// Deliberately bounded local smoke, not a production load generator.
function options(args) {
  if (!args.includes('--local')) throw new Error('Pass --local to run against a loopback server.');
  const values = { origin: 'http://127.0.0.1:8787', rooms: 2, players: 2 };
  for (const arg of args) {
    if (arg === '--local') continue;
    const match = /^--(origin|rooms|players)=(.+)$/.exec(arg);
    if (!match) throw new Error('Use --local [--origin=URL] [--rooms=1..4] [--players=2..4].');
    const [, key, value] = match;
    values[key] = key === 'origin' ? value : Number(value);
  }
  const url = new URL(values.origin);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Only a loopback origin without credentials, path or query is allowed.');
  for (const key of ['rooms', 'players']) {
    if (!Number.isInteger(values[key]) || values[key] < 1 || values[key] > 4)
      throw new Error('Rooms and players must each be between 1 and 4.');
  }
  if (values.players < 2) throw new Error('Multiplayer smoke requires at least two players.');
  if (values.rooms * values.players > 12)
    throw new Error(
      'At most 12 participants per run keeps HTTP traffic below the local rate limit.',
    );
  return { ...values, origin: url.origin };
}

async function run(config) {
  const started = performance.now();
  const clients = [];
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20_000);
  const signal = controller.signal;
  const timings = [];
  async function post(path, body) {
    const response = await fetch(config.origin + path, {
      method: 'POST',
      signal,
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Origin: config.origin },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Local room request returned HTTP ${response.status}.`);
    return response.json();
  }
  async function connect(session) {
    signal.throwIfAborted();
    const url = new URL(`/api/rooms/${session.code}/ws`, config.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('playerId', session.playerId);
    url.searchParams.set('token', session.token);
    // Node's native WebSocketInit supports headers; preserve the same Origin
    // validation as a browser rather than weakening the server for smoke tests.
    const socket = new WebSocket(url, { headers: { Origin: config.origin } });
    const client = { socket, state: null, pongs: new Set(), error: '' };
    clients.push(client);
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'state') client.state = message.state;
        else if (message.type === 'pong') client.pongs.add(message.sentAt);
        else if (message.type === 'error') client.error = 'Server rejected a smoke action.';
      } catch {
        client.error = 'Server sent an unreadable message.';
      }
    });
    socket.addEventListener('error', () => {
      client.error = 'Local WebSocket failed.';
    });
    client.send = (message) => socket.send(JSON.stringify(message));
    client.wait = async (predicate) => {
      while (!predicate()) {
        signal.throwIfAborted();
        if (client.error) throw new Error(client.error);
        if (socket.readyState === WebSocket.CLOSED)
          throw new Error('Local WebSocket closed early.');
        await pause(20, undefined, { signal });
      }
    };
    await client.wait(() => client.state !== null);
    return client;
  }
  try {
    await Promise.all(
      Array.from({ length: config.rooms }, async (_, room) => {
        const start = performance.now();
        const host = await post('/api/rooms', { name: `Smoke${room}Host`, avatar: 'creeper' });
        const sessions = [
          host,
          ...(await Promise.all(
            Array.from({ length: config.players - 1 }, (_, i) =>
              post(`/api/rooms/${host.code}/join`, {
                name: `Smoke${room}Guest${i}`,
                avatar: 'pig',
              }),
            ),
          )),
        ];
        const peers = await Promise.all(sessions.map(connect));
        await peers[0].wait(() => peers[0].state.players.every((p) => p.connected));
        peers.forEach((peer) => peer.send({ type: 'ready', ready: true }));
        await peers[0].wait(() => peers[0].state.players.every((p) => p.ready));
        peers[0].send({ type: 'start' });
        await Promise.all(peers.map((peer) => peer.wait(() => peer.state.phase === 'playing')));
        const round = peers[0].state.round;
        assert(
          peers.every((peer) => peer.state.round.id === round.id),
          'Peers disagree on round.',
        );
        await Promise.all(
          peers.map(async (peer, index) => {
            const ticket = index + 1;
            peer.send({ type: 'grid', roundId: round.id, grid: Array(9).fill(null) });
            peer.send({ type: 'ping', sentAt: ticket });
            await peer.wait(() => peer.pongs.has(ticket));
            assert(
              peer.state.players.every((p) => p.score === 0),
              'An empty grid scored.',
            );
          }),
        );
        timings.push(Math.round(performance.now() - start));
      }),
    );
    console.log(
      JSON.stringify({
        ok: true,
        rooms: config.rooms,
        playersPerRoom: config.players,
        connections: clients.length,
        elapsedMs: Math.round(performance.now() - started),
        roomReadyMs: timings,
      }),
    );
  } finally {
    clearTimeout(deadline);
    // Cancel other rooms if one failed, so none can open sockets after cleanup.
    controller.abort();
    for (const { socket } of clients) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' }));
    }
    await pause(100);
    for (const { socket } of clients) socket.close();
  }
}

try {
  await run(options(process.argv.slice(2)));
} catch (error) {
  // Never print raw WebSocket errors/URLs: upgrade URLs contain session tokens.
  console.error(
    error?.name === 'AbortError' || error?.name === 'TimeoutError'
      ? 'Local smoke exceeded its 20-second limit.'
      : error instanceof TypeError
        ? 'Invalid options or unavailable local server.'
        : error.message,
  );
  process.exitCode = 1;
}
