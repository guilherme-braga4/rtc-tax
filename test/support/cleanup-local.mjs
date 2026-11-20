import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

// A killed test server can leave an engine before it records its lease. Only
// reap containers whose private test scope, name, labels and image all match.
export async function cleanupLocal(work, run = exec) {
  const root = join(work, 'coordination');
  let scopes;
  try { scopes = await readdir(root); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const scope of scopes) {
    assert.match(scope, /^[a-f0-9]{20}$/);
    for (const [engine, tag] of [['regular', 'rtc-tax-regular:32df7196356e-r7'], ['simples', 'rtc-tax-simples:f90b6525e6d5-r7']]) {
      const name = `rtc-tax-${scope}-${engine}-v7`;
      let container;
      try { container = JSON.parse((await run('docker', ['container', 'inspect', name])).stdout)[0]; }
      catch (error) {
        if (/No such (?:container|object)/i.test(error.stderr ?? '')) continue;
        throw error;
      }
      const labels = container.Config.Labels ?? {};
      assert.equal(container.Name, `/${name}`);
      assert.equal(container.Config.Image, tag);
      assert.equal(labels['org.rtc-tax.scope'], scope);
      assert.equal(labels['org.rtc-tax.engine'], engine);
      assert.match(labels['org.rtc-tax.nonce'], /^[a-f0-9-]{36}$/);
      const imageId = (await run('docker', ['image', 'inspect', tag, '--format', '{{.Id}}'])).stdout.trim();
      assert.equal(container.Image, imageId);
      await run('docker', ['stop', '-t', '10', container.Id], { timeout: 30_000 });
    }
  }
}
