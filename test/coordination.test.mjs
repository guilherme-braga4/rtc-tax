import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { coordinatedEngine } from '../dist/coordination.js';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'rtc-lock-test-'));
  const old = process.env.RTC_TAX_COORDINATION_DIR; process.env.RTC_TAX_COORDINATION_DIR = root;
  const server = http.createServer((_q, r) => r.end('{"status":"UP"}'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  let image = 'sha256:' + 'a'.repeat(64); const id = 'b'.repeat(64);
  let container, name, starts = 0, stops = 0;
  const docker = {
    daemonId: async () => 'engine-1', imageId: async () => image,
    container: async (ref) => container && (ref === name || ref === id) ? container : undefined,
    start: async (_tag, _app, _health, _env, n, labels) => {
      starts++; name = n; container = { Id: id, Image: image, State: { Running: true }, Config: { Labels: labels } }; return id;
    },
    stop: async (ref) => { assert.equal(ref, id); stops++; container = undefined; },
    port: async () => url,
  };
  const config = { port: 1, health: 2, env: 'VERSION_URL', startupTimeoutMs: 10_000 };
  return { root, docker, config, counts: () => ({ starts, stops }),
    change: (fn) => { container = fn(container); },
    setImage: (value) => { image = value; },
    cleanup: async () => { if (old === undefined) delete process.env.RTC_TAX_COORDINATION_DIR; else process.env.RTC_TAX_COORDINATION_DIR = old; await new Promise((r) => server.close(r)); await rm(root, { recursive: true, force: true }); } };
}
test('concurrent consumers share a managed engine and the last release stops it', async () => {
  const x = await setup();
  try {
    const [a, b] = await Promise.all([1, 2].map(() => coordinatedEngine('regular', x.docker, x.config, async () => 'image')));
    assert.deepEqual(x.counts(), { starts: 1, stops: 0 });
    await a.release(); assert.deepEqual(x.counts(), { starts: 1, stops: 0 });
    await b.release(); assert.deepEqual(x.counts(), { starts: 1, stops: 1 });
  } finally { await x.cleanup(); }
});
test('engine readiness does not expire when the wall clock jumps', async () => {
  const x = await setup();
  const originalNow = Date.now;
  let now = originalNow();
  try {
    Date.now = () => { now += 86_400_000; return now; };
    const engine = await coordinatedEngine('regular', x.docker, x.config, async () => 'image');
    Date.now = originalNow;
    await engine.release();
    assert.equal(x.counts().stops, 1);
  } finally { Date.now = originalNow; await x.cleanup(); }
});
test('refuses to stop a container if ownership metadata changes', async () => {
  const x = await setup();
  try {
    const a = await coordinatedEngine('regular', x.docker, x.config, async () => 'image');
    x.change((c) => ({ ...c, Config: { Labels: { ...c.Config.Labels, 'org.rtc-tax.scope': 'foreign' } } }));
    await assert.rejects(a.release(), /identity changed/);
    assert.equal(x.counts().stops, 0);
  } finally { await x.cleanup(); }
});
test('a later process reuses an orphan after a dead owner', async () => {
  const x = await setup();
  try {
    await coordinatedEngine('regular', x.docker, x.config, async () => 'image');
    const scopes = await readdir(x.root); const statePath = join(x.root, scopes[0], 'regular', 'state.json');
    const dead = spawn(process.execPath, ['-e', '']); await once(dead, 'exit');
    const state = JSON.parse(await readFile(statePath, 'utf8')); state.owners[0].pid = dead.pid;
    await writeFile(statePath, JSON.stringify(state));
    const b = await coordinatedEngine('regular', x.docker, x.config, async () => 'image');
    assert.equal(x.counts().starts, 1); await b.release(); assert.equal(x.counts().stops, 1);
  } finally { await x.cleanup(); }
});

test('missing ownership state never causes reuse or termination of a running engine', async () => {
  const x = await setup();
  try {
    const a = await coordinatedEngine('regular', x.docker, x.config, async () => 'image');
    const scopes = await readdir(x.root); const statePath = join(x.root, scopes[0], 'regular', 'state.json');
    await unlink(statePath);
    await assert.rejects(coordinatedEngine('regular', x.docker, x.config, async () => 'image'), /without coordination state/);
    await assert.rejects(a.release(), /state changed/);
    assert.deepEqual(x.counts(), { starts: 1, stops: 0 });
  } finally { await x.cleanup(); }
});

test('a rebuilt image can start after the prior engine is released', async () => {
  const x = await setup();
  try {
    const first = await coordinatedEngine('regular', x.docker, x.config, async () => 'image');
    await first.release();
    x.setImage('sha256:' + 'c'.repeat(64));
    const second = await coordinatedEngine('regular', x.docker, x.config, async () => 'image');
    assert.equal(x.counts().starts, 2);
    await second.release(); assert.equal(x.counts().stops, 2);
  } finally { await x.cleanup(); }
});

test('an image change never stops an engine with a live lease', async () => {
  const x = await setup();
  try {
    const first = await coordinatedEngine('regular', x.docker, x.config, async () => 'image');
    x.setImage('sha256:' + 'c'.repeat(64));
    await assert.rejects(coordinatedEngine('regular', x.docker, x.config, async () => 'image'), /while it is in use/);
    assert.equal(x.counts().stops, 0);
    x.setImage('sha256:' + 'a'.repeat(64)); await first.release();
  } finally { await x.cleanup(); }
});
