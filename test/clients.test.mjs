import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { verifyMavenLock } from '../dist/artifacts.js';
import { RTCTax, RTCClosedError, RTCHttpError, RTCTimeoutError } from '../dist/index.js';

async function server(handler) {
  const s = http.createServer(handler); s.listen(0, '127.0.0.1'); await once(s, 'listening');
  return { base: `http://127.0.0.1:${s.address().port}/`, close: () => new Promise((resolve) => s.close(resolve)) };
}
const regular = { id: 'example', versao: '1', dhFatoGerador: '2027-01-01T00:00:00-03:00', municipio: 4314902, itens: [{ numero: 1, cst: '000', cClassTrib: '000001', baseCalculo: '1000000000000.01' }] };
const simples = { id: 'example', versao: '2', data: '2027-01-01', tpDoc: '55', CRT: '1', itens: [{ numero: 1, cClassTrib: '000001', baseCalculo: '950.00', valorImpostoSeletivo: '0.00' }] };

test('remote clients use independent endpoints and retain decimal values', async () => {
  const calls = [];
  const s = await server(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    calls.push({ url: req.url, body: JSON.parse(body) });
    res.setHeader('content-type', 'application/json');
    res.end('{"objetos":[{"nObj":1,"valor":9999999999999.01}],"total":{"valor":9007199254740993}}');
  });
  try {
    const rtc = RTCTax.remote({ regimeRegularUrl: s.base, simplesNacionalUrl: s.base });
    const out = await rtc.regimeRegular.calculate(regular);
    await rtc.simplesNacional.calculate(simples);
    assert.equal(calls[0].url, '/api/calculadora/regime-geral');
    assert.equal(calls[1].url, '/api/calculadora/observabilidade/simples-nacional');
    assert.equal(calls[0].body.itens[0].baseCalculo, '1000000000000.01');
    assert.equal(out.objetos[0].valor, '9999999999999.01');
    assert.equal(out.total.valor, '9007199254740993');
    await assert.rejects(rtc.regimeRegular.calculate({ ...regular, itens: [{ ...regular.itens[0], baseCalculo: 0.1 }] }), TypeError);
    await rtc.close(); await assert.rejects(rtc.regimeRegular.calculate(regular), RTCClosedError);
  } finally { await s.close(); }
});

test('errors do not include sensitive HTTP bodies and timeouts are typed', async () => {
  const s = await server((req, res) => { if (req.url.includes('regime-geral')) { res.writeHead(422); res.end('private fiscal body'); } else setTimeout(() => res.end('{"objetos":[]}'), 600); });
  try {
    const rtc = RTCTax.remote({ regimeRegularUrl: s.base, simplesNacionalUrl: s.base, timeoutMs: 250 });
    await assert.rejects(rtc.regimeRegular.calculate(regular), (e) => e instanceof RTCHttpError && e.status === 422 && !e.message.includes('private'));
    await assert.rejects(rtc.simplesNacional.calculate(simples), RTCTimeoutError);
    await rtc.close();
  } finally { await s.close(); }
});

test('close waits for a request that has already started', async () => {
  const s = await server((_req, res) => setTimeout(() => res.end('{"objetos":[]}'), 30));
  try {
    const rtc = RTCTax.remote({ regimeRegularUrl: s.base, simplesNacionalUrl: s.base });
    const result = rtc.regimeRegular.calculate(regular); const close = rtc.close();
    await result; await close; await assert.rejects(rtc.regimeRegular.calculate(regular), RTCClosedError);
  } finally { await s.close(); }
});

test('invalid upstream JSON is reported without including its contents', async () => {
  const s = await server((_req, res) => res.end('{"secret":"private fiscal content" broken'));
  try {
    const rtc = RTCTax.remote({ regimeRegularUrl: s.base, simplesNacionalUrl: s.base });
    await assert.rejects(rtc.regimeRegular.calculate(regular), (e) => e.code === 'CONNECTION_ERROR' && !String(e).includes('private fiscal content') && e.cause === undefined);
    await rtc.close();
  } finally { await s.close(); }
});

test('remote mode operates without docker in PATH', async () => {
  const s = await server((_req, res) => res.end('{"objetos":[]}'));
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = '';
    const rtc = RTCTax.remote({ regimeRegularUrl: s.base, simplesNacionalUrl: s.base });
    assert.deepEqual(await rtc.regimeRegular.calculate(regular), { objetos: [] });
    await rtc.close();
  } finally {
    process.env.PATH = previousPath;
    await s.close();
  }
});

test('Maven artifact lock changes are detected before an engine build', async () => {
  const manifest = await readFile(new URL('../assets/maven-artifacts.sha256', import.meta.url));
  assert.doesNotThrow(() => verifyMavenLock(manifest));
  const modified = Buffer.from(manifest); modified[0] = modified[0] === 48 ? 49 : 48;
  assert.throws(() => verifyMavenLock(modified), /lock integrity check failed/);
});
