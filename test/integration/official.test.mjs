import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RTCTax } from '../../dist/index.js';

const fixture = async (name) => JSON.parse(await readFile(new URL(`../../spike/fixtures/${name}.json`, import.meta.url), 'utf8'));

test('local SDK runs both official engines and reuses a shared engine', { timeout: 1_800_000 }, async () => {
  const regular = await fixture('regular');
  regular.itens[0].baseCalculo = '1200.00';
  regular.itens[0].aliquotasNominais = { cbs: '8.8', ibsEstadual: '0.05', ibsMunicipal: '0.05' };
  const simples = await fixture('simples');
  const expectedRegular = await fixture('regular-response');
  const expectedSimples = await fixture('simples-response');
  const a = await RTCTax.local({ startupTimeoutMs: 180_000, timeoutMs: 90_000 });
  const b = await RTCTax.local({ startupTimeoutMs: 180_000, timeoutMs: 90_000 });
  try {
    const [first, shared] = await Promise.all([a.regimeRegular.calculate(regular), b.regimeRegular.calculate(regular)]);
    assert.deepEqual(first, expectedRegular); assert.deepEqual(shared, expectedRegular);
    await a.close();
    assert.deepEqual(await b.regimeRegular.calculate(regular), expectedRegular);
    const result = await b.simplesNacional.calculate(simples);
    assert.deepEqual(result, expectedSimples);
    assert.equal(result.objetos[0].estadoItem, 'CALCULADO');
  } finally { await a.close(); await b.close(); }
});
