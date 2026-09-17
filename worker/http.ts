import { GameError } from './game';

export const MAX_BODY = 8192;
export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export function errorResponse(error: unknown): Response {
  return error instanceof GameError
    ? json({ error: error.message }, error.status)
    : json({ error: 'Server temporarily unavailable' }, 503);
}
export function checkOrigin(request: Request, websocket = false) {
  const origin = request.headers.get('Origin');
  if (
    (websocket && !origin) ||
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  )
    throw new GameError('Origin not allowed', 403);
}
export async function body(request: Request): Promise<unknown> {
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  )
    throw new GameError('Expected application/json', 415);
  if (Number(request.headers.get('Content-Length')) > MAX_BODY)
    throw new GameError('Request too large', 413);
  if (!request.body) throw new GameError('Missing request body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) {
        await reader.cancel();
        throw new GameError('Request too large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new GameError('Invalid JSON');
  }
}
