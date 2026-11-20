// Probe SDK remote mode using independently started pinned official images.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, ['--test', 'test/remote-official.mjs'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, RTC_REMOTE_FROM_IMAGES: '1' }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
