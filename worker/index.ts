import { VERSION } from '../src/shared/catalogue';
import { GameError } from './game';
import { body, checkOrigin, errorResponse, json, MAX_BODY } from './http';
export { GameRoom } from './room';
export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
}
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => codeAlphabet[n % 32]).join(
    '',
  );
}
async function rateLimit(request: Request, env: Env): Promise<Response | null> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const key = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  const result = await env.ROOMS.get(env.ROOMS.idFromName('rate:' + key)).fetch(
    'https://internal/limit',
  );
  return result.ok ? null : result;
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health' && request.method === 'GET')
    return json({ ok: true, version: VERSION });
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  const create = url.pathname === '/api/rooms';
  const match = /^\/api\/rooms\/([a-z0-9]{6})\/(join|ws)$/i.exec(url.pathname);
  if (!create && !match) throw new GameError('Not found', 404);
  const websocket = match?.[2].toLowerCase() === 'ws';
  if (request.method !== (websocket ? 'GET' : 'POST'))
    throw new GameError('Method not allowed', 405);
  checkOrigin(request, websocket);
  if (url.search.length > 512) throw new GameError('Invalid query');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY)
    throw new GameError('Request too large', 413);
  const limited = await rateLimit(request, env);
  if (limited) return limited;
  if (create) {
    // Read a bounded body once so rare random code collisions can retry safely.
    const payload = JSON.stringify(await body(request));
    for (let i = 0; i < 4; i++) {
      const code = roomCode();
      const target = new URL('/create', url.origin);
      const headers = new Headers(request.headers);
      headers.set('X-Room-Code', code);
      headers.delete('Content-Length');
      const result = await env.ROOMS.get(env.ROOMS.idFromName('room:' + code)).fetch(
        new Request(target, { method: 'POST', headers, body: payload }),
      );
      if (result.status !== 409) return result;
    }
    throw new GameError('Unable to allocate room', 503);
  }
  const code = match![1].toUpperCase();
  const target = new URL(websocket ? '/ws' : '/join', url.origin);
  target.search = url.search;
  let forwarded = request;
  if (!websocket) {
    // Finish reading untrusted network streams before entering the room queue.
    const payload = JSON.stringify(await body(request));
    const headers = new Headers(request.headers);
    headers.delete('Content-Length');
    forwarded = new Request(target, { method: 'POST', headers, body: payload });
  }
  return env.ROOMS.get(env.ROOMS.idFromName('room:' + code)).fetch(new Request(target, forwarded));
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await route(request, env).catch(errorResponse);
    if (response.status === 101) return response;
    const socketOrigin = new URL(request.url);
    socketOrigin.protocol = socketOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    headers.set(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' https://open.spotify.com https://embed-cdn.spotifycdn.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.scdn.co; font-src 'self'; connect-src 'self' ${socketOrigin.origin} https://open.spotify.com; frame-src https://open.spotify.com; media-src 'self' blob: https://*.scdn.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`,
    );
    if (new URL(request.url).protocol === 'https:')
      headers.set('Strict-Transport-Security', 'max-age=31536000');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
