import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const image = 'maven@sha256:99e61abcff91a9b1333463bd8451fb18495d6eba9250ac66a338b518f8278320';
test('locked artifacts are accepted intact and corrupted cached artifacts are rejected', { timeout: 180_000 }, async () => {
  const manifest = await readFile(join(root, 'assets', 'maven-artifacts.sha256'), 'utf8');
  const entry = manifest.split('\n').find((line) => line.endsWith('/aopalliance-1.0.pom'));
  assert.ok(entry); const [hash, path] = entry.split(' ');
  const response = await fetch(`https://repo.maven.apache.org/maven2/${path}`, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  const cache = await mkdtemp(join(tmpdir(), 'rtc-artifact-test-'));
  try {
    await writeFile(join(cache, hash), bytes);
    const args = ['run', '--rm', '--network', 'none', '-v', `${cache}:/root/.m2/rtc-tax-artifacts`, '-v', `${join(root, 'assets', 'fetch-maven-artifacts.sh')}:/work/fetch-maven-artifacts.sh:ro`, image, 'sh', '/work/fetch-maven-artifacts.sh', 'artifact', hash, path];
    await exec('docker', args, { timeout: 60_000 });
    await writeFile(join(cache, hash), 'tampered');
    await assert.rejects(exec('docker', args, { timeout: 60_000 }));
  } finally { await rm(cache, { recursive: true, force: true }); }
});
