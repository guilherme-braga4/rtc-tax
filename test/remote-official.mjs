// Explicit integration test: prebuilt upstream services are owned by this test,
// not by the SDK remote client. RTC_SPIKE_SOURCES must contain the clean spike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RTCTax } from '../dist/index.js';
const exec = promisify(execFile);
const sources = process.env.RTC_SPIKE_SOURCES;
const useImages = process.env.RTC_REMOTE_FROM_IMAGES === '1';
// The built Regular image provides the pinned Java 25 runtime for either JAR.
const image = 'rtc-tax-regular:32df7196356e-r7';
const fixture = async (name) => JSON.parse(await readFile(new URL(`../spike/fixtures/${name}.json`, import.meta.url), 'utf8'));
async function docker(...args) { return (await exec('docker', args, { timeout: 120_000 })).stdout.trim(); }
async function launch(engine, port, health, jar) {
  if (useImages) {
    const tag = engine === 'regular' ? 'rtc-tax-regular:32df7196356e-r7' : 'rtc-tax-simples:f90b6525e6d5-r7';
    return docker('run', '-d', '--rm', '-p', `127.0.0.1::${port}`, '-p', `127.0.0.1::${health}`, tag);
  }
  const dir = resolve(sources, engine);
  if (dir.includes(',')) throw Error('Source path cannot contain commas');
  const id = await docker('run', '-d', '--rm', '-p', `127.0.0.1::${port}`, '-p', `127.0.0.1::${health}`,
    '--mount', `type=bind,source=${dir},target=/work,readonly`, '-w', '/work', '--entrypoint', 'java', image,
    '-Dspring.profiles.active=offline', '-jar', `target/${jar}`);
  return id;
}
async function port(id, internal) {
  const match = /^127\.0\.0\.1:(\d+)$/.exec(await docker('port', id, `${internal}/tcp`));
  assert.ok(match); return `http://127.0.0.1:${match[1]}/`;
}
async function ready(base) {
  const until = performance.now() + 120_000;
  while (performance.now() < until) {
    try { if ((await fetch(new URL('health', base), { signal: AbortSignal.timeout(2_000) })).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error('Readiness timeout');
}
test('remote SDK talks to both external official services and does not stop them', { timeout: 300_000, skip: !sources && !useImages }, async () => {
  const ids = []; let rtc;
  try {
    const reg = await launch('regular', 8080, 9101, 'api-regime-geral.jar'); ids.push(reg);
    const sn = await launch('simples', 8082, 9103, 'api-simples-nacional.jar'); ids.push(sn);
    await Promise.all([ready(await port(reg, 9101)), ready(await port(sn, 9103))]);
    rtc = RTCTax.remote({ regimeRegularUrl: await port(reg, 8080), simplesNacionalUrl: await port(sn, 8082), timeoutMs: 90_000 });
    const regular = await fixture('regular');
    regular.itens[0].baseCalculo = '1200.00';
    regular.itens[0].aliquotasNominais = { cbs: '8.8', ibsEstadual: '0.05', ibsMunicipal: '0.05' };
    assert.deepEqual(await rtc.regimeRegular.calculate(regular), await fixture('regular-response'));
    assert.deepEqual(await rtc.simplesNacional.calculate(await fixture('simples')), await fixture('simples-response'));
    await rtc.close();
    for (const id of ids) assert.equal(await docker('inspect', '--format', '{{.State.Running}}', id), 'true');
  } finally {
    await rtc?.close();
    for (const id of ids.reverse()) await docker('stop', '-t', '10', id);
  }
});
