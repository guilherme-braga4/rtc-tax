// Integration using the packed SDK installed into a separate Node HTTP server.
// Run with RTC_SPIKE_SOURCES and RTC_JAVA_BIN pointing to pre-built official engines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { mkdtemp, readFile, readdir, cp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { cleanupLocal } from './support/cleanup-local.mjs';

const exec = promisify(execFile);
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const java = process.env.RTC_JAVA_BIN;
const sources = process.env.RTC_SPIKE_SOURCES;
const local = process.env.RTC_SERVER_MODE === 'local';
const fixture = async (name) => JSON.parse(await readFile(join(repo, 'spike', 'fixtures', `${name}.json`), 'utf8'));
async function freePort(used) {
  while (true) {
    const s = createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening');
    const port = s.address().port; await new Promise((r) => s.close(r));
    if (!used.has(port)) { used.add(port); return port; }
  }
}
async function ready(url, processHandle) {
  const deadline = performance.now() + 120_000;
  while (performance.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`Service exited with ${processHandle.exitCode}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Service readiness timed out');
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
  try { await once(child, 'exit'); } finally { clearTimeout(timer); }
}
async function request(url, body) {
  // The first local request includes the image build and engine startup, in
  // addition to the calculation timeout. Cold builds can take many minutes.
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(local ? 1_500_000 : 90_000) });
  const result = await response.json();
  assert.equal(response.status, 200, `Node server returned ${response.status}: ${result.code ?? 'unknown error'}`);
  return result;
}

test('installed SDK calculates both regimes through a Node HTTP server', { timeout: 1_800_000 }, async () => {
  if (!local) {
    assert.ok(java, 'RTC_JAVA_BIN is required in remote mode');
    assert.ok(sources, 'RTC_SPIKE_SOURCES is required in remote mode');
  }
  const work = await mkdtemp(join(tmpdir(), 'rtc-tax-installed-test-'));
  const children = [];
  try {
    const output = await exec('npm', ['pack', '--json', '--pack-destination', work], { cwd: repo, timeout: 120_000 });
    const filename = JSON.parse(output.stdout)[0].filename;
    const app = join(work, 'app');
    await exec('npm', ['install', '--prefix', app, '--no-audit', '--no-fund', '--ignore-scripts', join(work, filename)], { timeout: 120_000 });
    await cp(join(repo, 'test', 'fixtures', 'installed-server.mjs'), join(app, 'server.mjs'));
    const environment = { ...process.env, RTC_SERVER_MODE: local ? 'local' : 'remote', RTC_TAX_COORDINATION_DIR: join(work, 'coordination') };
    if (!local) {
      const used = new Set();
      const regularPort = await freePort(used), simplesPort = await freePort(used);
      const regularHealth = await freePort(used), simplesHealth = await freePort(used);
      function engine(name, jar, port, health, versionEnv) {
        const child = spawn(java, ['-Dspring.profiles.active=offline', '-jar', `target/${jar}`], {
          cwd: join(sources, name), stdio: 'ignore',
          env: { ...process.env, SERVER_ADDRESS: '127.0.0.1', SERVER_PORT: String(port), MANAGEMENT_SERVER_ADDRESS: '127.0.0.1', MANAGEMENT_SERVER_PORT: String(health), [versionEnv]: 'http://127.0.0.1:1/' }
        });
        children.push(child); return child;
      }
      const regularProcess = engine('regular', 'api-regime-geral.jar', regularPort, regularHealth, 'VERSAO_OFFLINE_URL');
      const simplesProcess = engine('simples', 'api-simples-nacional.jar', simplesPort, simplesHealth, 'VERSAO_URL');
      await Promise.all([ready(`http://127.0.0.1:${regularHealth}/health`, regularProcess), ready(`http://127.0.0.1:${simplesHealth}/health`, simplesProcess)]);
      environment.RTC_REGULAR_URL = `http://127.0.0.1:${regularPort}/`;
      environment.RTC_SIMPLES_URL = `http://127.0.0.1:${simplesPort}/`;
    }
    const server = spawn(process.execPath, ['server.mjs'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], env: environment });
    children.push(server);
    let outputLine = '';
    for await (const chunk of server.stdout) { outputLine += chunk; if (outputLine.includes('\n')) break; }
    const { port, sdk } = JSON.parse(outputLine.trim());
    const installedPath = await realpath(join(app, 'node_modules', '@rtc-tax', 'sdk'));
    const resolvedSdk = await realpath(fileURLToPath(sdk));
    assert.ok(resolvedSdk.startsWith(installedPath + sep), 'SDK must be resolved from the separate installation');
    await ready(`http://127.0.0.1:${port}/health`, server);
    const reg = await fixture('regular');
    reg.itens[0].baseCalculo = '1200.00';
    reg.itens[0].aliquotasNominais = { cbs: '8.8', ibsEstadual: '0.05', ibsMunicipal: '0.05' };
    assert.deepEqual(await request(`http://127.0.0.1:${port}/calculate/regular`, reg), await fixture('regular-response'));
    const simples = await request(`http://127.0.0.1:${port}/calculate/simples`, await fixture('simples'));
    assert.deepEqual(simples, await fixture('simples-response'));
    assert.equal(simples.objetos[0].estadoItem, 'CALCULADO');
    await stop(server);
    assert.equal(server.exitCode, 0, 'server must close the SDK cleanly');
    if (local) {
      const root = join(work, 'coordination');
      const scopes = await readdir(root);
      assert.equal(scopes.length, 1);
      for (const name of ['regular', 'simples']) {
        const state = JSON.parse(await readFile(join(root, scopes[0], name, 'state.json'), 'utf8'));
        assert.equal(state.owners.length, 0);
        let exists = true;
        try { await exec('docker', ['container', 'inspect', state.id]); }
        catch (error) {
          if (/No such (?:container|object)/i.test(error.stderr ?? '')) exists = false;
          else throw error;
        }
        assert.equal(exists, false, `${name} engine should have been stopped`);
      }
    }
  } finally {
    for (const child of children.reverse()) await stop(child);
    if (local) await cleanupLocal(work);
    await rm(work, { recursive: true, force: true });
  }
});
