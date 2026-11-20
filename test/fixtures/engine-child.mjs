import { readFile } from 'node:fs/promises';
import { RTCTax } from '../../dist/index.js';
const rtc = await RTCTax.local({ timeoutMs: 90_000, startupTimeoutMs: 180_000 });
const operation = JSON.parse(await readFile(new URL('../../spike/fixtures/regular.json', import.meta.url), 'utf8'));
operation.itens[0].baseCalculo = '1200.00';
operation.itens[0].aliquotasNominais = { cbs: '8.8', ibsEstadual: '0.05', ibsMunicipal: '0.05' };
process.on('message', async (message) => {
  try {
    if (message === 'calculate') {
      const result = await rtc.regimeRegular.calculate(operation);
      process.send?.({ status: 'calculated', simulated: result.objetos[0]?.calculoSimulado });
    } else if (message === 'close') {
      await rtc.close(); process.send?.({ status: 'closed' }); process.disconnect?.();
    }
  } catch (error) { process.send?.({ status: 'error', message: String(error) }); process.exitCode = 1; }
});
process.send?.({ status: 'ready' });
