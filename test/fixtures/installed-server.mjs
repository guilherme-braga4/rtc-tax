// Fixture for the installed-package integration test. Bind only to loopback.
import http from 'node:http';
import { RTCTax } from '@rtc-tax/sdk';

const rtc = process.env.RTC_SERVER_MODE === 'local'
  ? await RTCTax.local({ timeoutMs: 90_000, startupTimeoutMs: 180_000 })
  : RTCTax.remote({
      regimeRegularUrl: process.env.RTC_REGULAR_URL,
      simplesNacionalUrl: process.env.RTC_SIMPLES_URL,
      timeoutMs: 90_000,
    });
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"status":"ok"}');
    return;
  }
  if (req.method !== 'POST' || !['/calculate/regular', '/calculate/simples'].includes(req.url)) {
    res.writeHead(404); res.end(); return;
  }
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1_000_000) throw new Error('Request exceeds size limit');
    }
    const operation = JSON.parse(body);
    const result = req.url === '/calculate/regular'
      ? await rtc.regimeRegular.calculate(operation)
      : await rtc.simplesNacional.calculate(operation);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json' });
    const code = typeof error?.code === 'string' ? error.code : 'UNEXPECTED';
    res.end(JSON.stringify({ error: 'calculation failed', code }));
  }
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ port: server.address().port, sdk: import.meta.resolve('@rtc-tax/sdk') })));
process.on('SIGTERM', () => server.close(() => { void rtc.close().then(() => process.exit(0), () => process.exit(1)); }));
