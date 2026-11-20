import { acquire, type Lease } from './engine.js';
import { RTCClosedError, RTCConnectionError } from './errors.js';
import { postJson } from './http.js';
import type { Engine, LocalOptions, RegularOperation, RegularResult, RemoteOptions, SimplesOperation, SimplesResult } from './types.js';
export * from './types.js';
export * from './errors.js';

function validTimeout(value: number | undefined, fallback: number): number {
  const ms = value ?? fallback;
  if (!Number.isSafeInteger(ms) || ms < 1 || ms > 2_147_483_647) throw new RangeError('Timeout must be a positive integer in milliseconds');
  return ms;
}
function validUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError('Engine URL must be HTTP(S), without credentials, query or fragment');
  return url.toString();
}
export class RTCTax {
  private closed = false;
  private closing?: Promise<void>;
  private readonly active = new Set<Promise<unknown>>();
  private readonly leases = new Map<Engine, Promise<Lease>>();
  readonly regimeRegular = { calculate: (operation: RegularOperation): Promise<RegularResult> => this.calculate('regular', operation) as Promise<RegularResult> };
  readonly simplesNacional = { calculate: (operation: SimplesOperation): Promise<SimplesResult> => this.calculate('simples', operation) as Promise<SimplesResult> };
  private constructor(private readonly remote: RemoteOptions | undefined, private readonly timeoutMs: number, private readonly startupTimeoutMs: number) {}
  static async local(options: LocalOptions = {}): Promise<RTCTax> {
    return new RTCTax(undefined, validTimeout(options.timeoutMs, 30_000), validTimeout(options.startupTimeoutMs, 120_000));
  }
  static remote(options: RemoteOptions): RTCTax {
    return new RTCTax({ ...options, regimeRegularUrl: validUrl(options.regimeRegularUrl), simplesNacionalUrl: validUrl(options.simplesNacionalUrl) }, validTimeout(options.timeoutMs, 30_000), 120_000);
  }
  private calculate(engine: Engine, operation: RegularOperation | SimplesOperation): Promise<RegularResult | SimplesResult> {
    if (this.closed) return Promise.reject(new RTCClosedError());
    const task = this.execute(engine, operation);
    this.active.add(task);
    void task.then(() => this.active.delete(task), () => this.active.delete(task));
    return task;
  }
  private async execute(engine: Engine, operation: RegularOperation | SimplesOperation): Promise<RegularResult | SimplesResult> {
    let base: string;
    if (this.remote) base = engine === 'regular' ? this.remote.regimeRegularUrl : this.remote.simplesNacionalUrl;
    else {
      let lease = this.leases.get(engine);
      if (!lease) { lease = acquire(engine, this.startupTimeoutMs); this.leases.set(engine, lease); }
      try { base = (await lease).base; } catch (error) { if (this.leases.get(engine) === lease) this.leases.delete(engine); throw error; }
    }
    const path = engine === 'regular' ? 'api/calculadora/regime-geral' : 'api/calculadora/observabilidade/simples-nacional';
    const result = await postJson(base, path, operation, this.timeoutMs, this.remote?.headers);
    if (!result || Array.isArray(result) || typeof result !== 'object' || !Array.isArray(result.objetos)) throw new RTCConnectionError('Tax engine returned an incompatible response');
    return result as unknown as RegularResult | SimplesResult;
  }
  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = (async () => {
      await Promise.allSettled([...this.active]);
      const settled = await Promise.allSettled([...this.leases.values()].map(async (lease) => (await lease).release()));
      this.leases.clear();
      const failure = settled.find((item): item is PromiseRejectedResult => item.status === 'rejected');
      if (failure) throw failure.reason;
    })();
    return this.closing;
  }
}
