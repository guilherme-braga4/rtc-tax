# RTC Tax

[Português](README.pt-BR.md)

A TypeScript SDK to calculate CBS and IBS under Brazil's consumption tax reform
(Reforma Tributária do Consumo) with Receita Federal's official calculators:
Regime Regular and Simples Nacional. The SDK does not implement tax rules; all
calculations are delegated to the official engines.

This independent project is not affiliated with or endorsed by Receita Federal.

> **Status: v0.1.0, experimental.** Suitable for development, testing and
> evaluation. For production, run the official engines in your own environment
> and use remote mode. Read the [limitations](#verification-and-limitations)
> first.

## Requirements

- Node.js 20 or newer. For production, use a supported LTS release; Node 20 has
  reached end of life.
- ESM only; CommonJS is not supported.
- **Local mode:** a running Docker Engine. On the first call to each engine,
  the SDK downloads the official source, builds it and prepares the SQLite
  database. This needs internet access, can take several minutes and uses
  about 1 GB of disk per engine. After that, each new process still waits for
  the Java engines to start (tens of seconds). No manual Docker command is
  needed during SDK use.
- **Remote mode:** no Docker. You host the official engines and pass their URLs.

## Installation

```sh
npm install @rtc-tax/sdk
```

## Usage

```ts
import { RTCTax } from '@rtc-tax/sdk';

const rtc = await RTCTax.local();
try {
  const result = await rtc.regimeRegular.calculate({
    id: '6194602ea71cbf9431c236de4409d920', versao: '1.0.0',
    dhFatoGerador: '2027-03-10T10:00:00-03:00', municipio: 4314902, uf: 'RS',
    itens: [{ numero: 3, nbs: '122011200', cst: '200', cClassTrib: '200028', baseCalculo: '1200.00',
      aliquotasNominais: { cbs: '8.8', ibsEstadual: '0.05', ibsMunicipal: '0.05' } }]
  });
  const taxes = result.objetos[0].tribCalc?.IBSCBS?.gIBSCBS;
  console.log(taxes?.gCBS?.vCBS, taxes?.vIBS); // "42.24" "0.48"
} finally {
  await rtc.close();
}
```

The data is synthetic and the 2027 rates are supplied as simulation inputs
(`calculoSimulado: true`). The [full example](examples/calculate.mjs) also
calculates a Simples Nacional operation.

For externally hosted services, `RTCTax.remote({ regimeRegularUrl,
simplesNacionalUrl, timeoutMs?, headers? })` uses their base URLs and does not
require Docker. HTTPS and appropriate access controls are the consumer's
responsibility. URLs can include a path prefix. Headers are shared by both
clients; use separate instances if credentials differ.

Fiscal decimal inputs are **strings**, such as `"1200.00"` and `"0.05"`.
JavaScript numeric inputs must be safe integers. Decimal numeric tokens and
unsafe integer tokens in responses are returned as strings to avoid precision
loss; integer tokens within the safe range remain numbers. Existing JSON strings
stay strings. The exposed Regular input type intentionally covers the tested
subset, not every upstream endpoint or optional field. Simples observability
can return HTTP 200 with errors on individual items: inspect `estadoItem` and
`erros` before relying on results.

## Roadmap

No dates; the order depends on feedback from people who try it.

- Prebuilt engine images and a `docker-compose.yml` to make remote mode easier
  (pending license review).
- Optionally expose engine error details, such as an HTTP 422 body.
- More complete types and input validation.
- A command to prepare the engines before the first calculation.
- The current Simples Nacional endpoint, which replaces the classic one.
- Validate local mode on Windows.

## Tried it? Tell us how it went

Open an [issue](https://github.com/guilherme-braga4/rtc-tax/issues) with what
you tried, what you expected and what happened, including installation
problems. Reports from ERP, e-commerce or NF-e use cases help set priorities.
Never attach real fiscal data.

## Development

```sh
npm ci
npm run build
node examples/calculate.mjs
```

The example uses the package's self-reference, as an installed consumer would.

## Verification and limitations

Run `npm test` for unit tests; `npm run test:integration` builds official
engines and exercises both local calculations. `npm run test:installed-server`
installs the packed SDK into a separate Node HTTP server and tests both remote
calculations; see the spike report for its Java and engine prerequisites. See [the spike report](docs/feasibility-spike.md)
for commits, database provenance, reference values and clean reproduction.
The local manager starts engines lazily and binds to loopback. SDK instances
using the same host, OS user, Docker Engine and coordination directory share
each calculator across Node processes. A lock and per-process leases prevent
the last consumer from stopping an engine while another process still uses it;
container identity is checked before reuse and shutdown. The SDK uses
`~/.cache/rtc-tax` by default; set `RTC_TAX_COORDINATION_DIR` to an absolute
path to choose another local directory. All cooperating processes must use the
same directory. A dead process's lease is removed on a later acquisition or
release. If ownership state is missing or inconsistent, the SDK fails closed
and may require manual inspection. Abrupt termination can leave a container
running until another SDK operation recovers it. Coordination across different
hosts or users is not provided.

Pinned source archives are SHA-256 verified; the Maven base image is pinned by
Docker digest. The Maven Wrapper, distribution and Maven build artifacts are
SHA-256 pinned. Builds use the verified artifact set offline. The lock is a
trust-on-first-capture baseline, and a local image tag is checked by label, not
an externally verified image digest. See [versions and integrity](docs/versions-and-integrity.md)
and the [license inventory](docs/third-party/README.md). Both engines use pinned V0073 database snapshots; they are not guaranteed current. The Simples client uses an upstream classic endpoint marked obsolete; see the spike report. Startup may take several minutes. Only the tested
platforms and Node versions reported in the spike are confirmed. Hosted CI passed on Linux, macOS and Windows for unit tests, and on Ubuntu for both installed-server integration modes; local Docker execution on Windows remains unverified.
