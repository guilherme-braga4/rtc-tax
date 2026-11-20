import { createHash, randomUUID } from 'node:crypto';
import { homedir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import lockfile from 'proper-lockfile';
import { DockerAdapter, type DockerContainer } from './docker.js';
import { RTCEngineError, RTCTimeoutError } from './errors.js';
import type { Engine } from './types.js';

interface Owner { token: string; pid: number }
interface State { version: 1; id: string; nonce: string; image: string; owners: Owner[] }
export interface CoordinatedEngine { base: string; release(): Promise<void> }
export interface EngineConfig { port: number; health: number; env: string; startupTimeoutMs: number }

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
function verify(state: State, container: DockerContainer, engine: Engine, scope: string): void {
  const labels = container.Config.Labels ?? {};
  if (container.Id !== state.id || container.Image !== state.image || labels['org.rtc-tax.scope'] !== scope ||
      labels['org.rtc-tax.engine'] !== engine || labels['org.rtc-tax.nonce'] !== state.nonce || !container.State.Running) {
    throw new RTCEngineError('Managed engine identity changed; refusing to reuse or stop it');
  }
}
function parseState(raw: string): State | undefined {
  if (!raw) return undefined;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new RTCEngineError('Engine coordination state is corrupted'); }
  const s = value as State;
  if (!s || s.version !== 1 || !/^[a-f0-9]{64}$/.test(s.id) || !/^sha256:[a-f0-9]{64}$/.test(s.image) ||
      !/^[a-f0-9-]{36}$/.test(s.nonce) || !Array.isArray(s.owners) || s.owners.length > 10_000 ||
      s.owners.some((x) => !x || !/^[a-f0-9-]{36}$/.test(x.token) || !Number.isSafeInteger(x.pid) || x.pid <= 0)) {
    throw new RTCEngineError('Engine coordination state has an invalid format');
  }
  return s;
}
async function ready(docker: DockerAdapter, id: string, config: EngineConfig): Promise<string> {
  const base = await docker.port(id, config.port), health = await docker.port(id, config.health);
  const deadline = performance.now() + config.startupTimeoutMs;
  while (performance.now() < deadline) {
    try { if ((await fetch(`${health}/health`, { signal: AbortSignal.timeout(2_000) })).ok) return base; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new RTCTimeoutError('Managed engine did not become ready');
}
async function locked<T>(dir: string, action: (assertLock: () => void) => Promise<T>): Promise<T> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = join(dir, 'mutex');
  const fd = await open(target, 'a', 0o600); await fd.close();
  let compromised: Error | undefined;
  const release = await lockfile.lock(target, { stale: 120_000, update: 10_000, retries: { retries: 7200, factor: 1, minTimeout: 250, maxTimeout: 250 }, onCompromised(error) { compromised = error; } });
  const assertLock = () => { if (compromised) throw new RTCEngineError('Engine coordination lock was lost', { cause: compromised }); };
  try { const result = await action(assertLock); assertLock(); return result; }
  finally { await release(); }
}
async function readState(file: string): Promise<State | undefined> {
  try { return parseState(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
async function saveState(file: string, state: State, assertLock: () => void): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  assertLock();
  await rename(temporary, file);
}
/** Coordinates a single user's SDK processes against the same Docker Engine. */
export async function coordinatedEngine(engine: Engine, docker: DockerAdapter, config: EngineConfig, imageFor: () => Promise<string>): Promise<CoordinatedEngine> {
  const daemon = await docker.daemonId();
  const root = resolve(process.env.RTC_TAX_COORDINATION_DIR ?? join(homedir(), '.cache', 'rtc-tax'));
  const scope = createHash('sha256').update(`${root}\0${hostname()}\0${daemon}\0${process.getuid?.() ?? 'user'}\0v7`).digest('hex').slice(0, 20);
  const dir = join(root, scope, engine), stateFile = join(dir, 'state.json');
  const name = `rtc-tax-${scope}-${engine}-v7`;
  const token = randomUUID();
  const launched = await locked(dir, async (assertLock) => {
    let state = await readState(stateFile);
    if (state) state.owners = state.owners.filter((owner) => isAlive(owner.pid));
    const tag = await imageFor(); assertLock();
    const image = await docker.imageId(tag); assertLock();
    if (state && state.image !== image) {
      if (state.owners.length) throw new RTCEngineError('Managed engine image changed while it is in use');
      const previous = await docker.container(state.id); assertLock();
      if (previous) { verify(state, previous, engine, scope); await docker.stop(state.id); }
      state = undefined;
    }
    let existing = state ? await docker.container(state.id) : await docker.container(name);
    if (state && !existing && state.owners.length) throw new RTCEngineError('Managed engine disappeared while another process is using it');
    let created = false;
    if (!existing) {
      const nonce = randomUUID();
      assertLock();
      const id = await docker.start(tag, config.port, config.health, config.env, name,
        { 'org.rtc-tax.scope': scope, 'org.rtc-tax.engine': engine, 'org.rtc-tax.nonce': nonce });
      created = true;
      state = { version: 1, id, nonce, image, owners: [] };
      existing = await docker.container(id);
      if (!existing) throw new RTCEngineError('Managed engine disappeared after startup');
    } else if (!state) {
      throw new RTCEngineError('Container exists without coordination state; refusing to reuse or stop it');
    }
    verify(state!, existing!, engine, scope);
    try {
      const base = await ready(docker, state!.id, config); assertLock();
      state!.owners.push({ token, pid: process.pid });
      await saveState(stateFile, state!, assertLock);
      return { base, id: state!.id, nonce: state!.nonce, image };
    } catch (error) {
      if (created) {
        try { assertLock(); const current = await docker.container(state!.id); if (current) { verify(state!, current, engine, scope); await docker.stop(state!.id); } } catch { /* never stop if identity or lock is uncertain */ }
      }
      throw error;
    }
  });
  let released = false;
  return { base: launched.base, async release() {
    if (released) return;
    await locked(dir, async (assertLock) => {
      const state = await readState(stateFile);
      if (!state || state.id !== launched.id || state.nonce !== launched.nonce || state.image !== launched.image) throw new RTCEngineError('Managed engine state changed; refusing to stop it');
      if (!state.owners.some((owner) => owner.token === token && owner.pid === process.pid)) throw new RTCEngineError('Managed engine lease is missing');
      state.owners = state.owners.filter((owner) => owner.token !== token && isAlive(owner.pid));
      await saveState(stateFile, state, assertLock);
      if (state.owners.length === 0) {
        const current = await docker.container(state.id); assertLock();
        if (current) { verify(state, current, engine, scope); await docker.stop(state.id); }
      }
    });
    released = true;
  } };
}
