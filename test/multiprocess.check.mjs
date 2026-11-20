import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const exec = promisify(execFile);
async function message(child, action) {
  const wait = Promise.race([
    once(child, 'message').then(([m]) => m),
    once(child, 'exit').then(([code, signal]) => { throw Error(`Child exited ${code ?? signal}`); }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Child timeout')), 240_000); timer.unref(); })
  ]);
  if (action) child.send(action);
  const result = await wait;
  if (result.status === 'error') throw Error(result.message);
  return result;
}
async function child(root) {
  const p = fork(new URL('./fixtures/engine-child.mjs', import.meta.url), [], { env: { ...process.env, RTC_TAX_COORDINATION_DIR: root }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  assert.equal((await message(p)).status, 'ready'); return p;
}
async function state(root) {
  const names = await readdir(root); assert.equal(names.length, 1);
  return JSON.parse(await readFile(join(root, names[0], 'regular', 'state.json'), 'utf8'));
}
async function exists(id) {
  try { return (await exec('docker', ['inspect', '--format', '{{.State.Running}}', id])).stdout.trim() === 'true'; }
  catch (e) { if (/No such (object|container)/i.test(e.stderr ?? '')) return false; throw e; }
}
test('two independent Node processes share an engine and recover a dead lease', { timeout: 1_200_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'rtc-tax-process-test-')); const processes = [];
  try {
    const a = await child(root), b = await child(root); processes.push(a, b);
    const [first, second] = await Promise.all([message(a, 'calculate'), message(b, 'calculate')]);
    assert.equal(first.simulated, true); assert.equal(second.simulated, true);
    const initial = await state(root); assert.equal(initial.owners.length, 2); assert.equal(await exists(initial.id), true);
    assert.equal((await message(a, 'close')).status, 'closed');
    assert.equal(await exists(initial.id), true);
    assert.equal((await message(b, 'calculate')).status, 'calculated');
    b.kill('SIGKILL'); await once(b, 'exit');
    const c = await child(root); processes.push(c);
    assert.equal((await message(c, 'calculate')).status, 'calculated');
    const recovered = await state(root); assert.equal(recovered.id, initial.id); assert.equal(recovered.owners.length, 1);
    assert.equal((await message(c, 'close')).status, 'closed');
    assert.equal(await exists(initial.id), false);
  } finally {
    for (const p of processes) if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL');
    await rm(root, { recursive: true, force: true });
  }
});
