import { parse } from 'lossless-json';
import { RTCConnectionError, RTCHttpError, RTCTimeoutError } from './errors.js';
import type { JsonValue } from './types.js';

function assertSafeNumbers(value: unknown): void {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new TypeError('Use decimal strings for fiscal values; only safe integer numbers are accepted');
  if (Array.isArray(value)) for (const v of value) assertSafeNumbers(v);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) assertSafeNumbers(v);
}
/** Decimal JSON number tokens and unsafe integers remain strings; safe integers remain numbers. */
function preserveNumber(value: string): string | number {
  if (/^-?\d+$/.test(value)) { const number = Number(value); if (Number.isSafeInteger(number)) return number; }
  return value;
}
export async function postJson(base: string, path: string, body: unknown, timeoutMs: number, headers: Record<string, string> = {}): Promise<JsonValue> {
  assertSafeNumbers(body);
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new RTCTimeoutError();
    throw new RTCConnectionError('Could not reach the tax engine', { cause: error });
  }
  if (!response.ok) throw new RTCHttpError(response.status);
  let text: string;
  try { text = await response.text(); }
  catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw new RTCTimeoutError();
    throw new RTCConnectionError('Could not read the tax engine response', { cause: error });
  }
  try { return parse(text, undefined, { parseNumber: preserveNumber }) as JsonValue; }
  catch { throw new RTCConnectionError('Tax engine returned invalid JSON'); }
}
