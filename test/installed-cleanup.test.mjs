import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupLocal } from './support/cleanup-local.mjs';

async function setup() {
  const work = await mkdtemp(join(tmpdir(), 'rtc-reaper-'));
  const scope = 'a'.repeat(20), engine = 'regular';
  await mkdir(join(work, 'coordination', scope), { recursive: true });
  const tag = 'rtc-tax-regular:32df7196356e-r7';
  const container = {
    Id: 'b'.repeat(64), Name: `/rtc-tax-${scope}-${engine}-v7`, Image: `sha256:${'c'.repeat(64)}`,
    Config: { Image: tag, Labels: { 'org.rtc-tax.scope': scope, 'org.rtc-tax.engine': engine, 'org.rtc-tax.nonce': 'd'.repeat(36) } }
  };
  let stopped = 0;
  const run = async (_command, args) => {
    if (args[0] === 'container' && args[2].includes('-simples-')) throw Object.assign(new Error('missing'), { stderr: 'No such container' });
    if (args[0] === 'container') return { stdout: JSON.stringify([container]) };
    if (args[0] === 'image') return { stdout: `${container.Image}\n` };
    if (args[0] === 'stop') { assert.equal(args.at(-1), container.Id); stopped++; return { stdout: '' }; }
    throw Error('unexpected docker command');
  };
  return { work, container, run, stopped: () => stopped, close: () => rm(work, { recursive: true, force: true }) };
}
test('test cleanup stops a container only when scope, labels and image match', async () => {
  const x = await setup();
  try { await cleanupLocal(x.work, x.run); assert.equal(x.stopped(), 1); }
  finally { await x.close(); }
});
test('test cleanup refuses a container with foreign ownership metadata', async () => {
  const x = await setup();
  try {
    x.container.Config.Labels['org.rtc-tax.scope'] = 'foreign';
    await assert.rejects(cleanupLocal(x.work, x.run));
    assert.equal(x.stopped(), 0);
  } finally { await x.close(); }
});
