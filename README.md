# RTC Tax

A pre-release TypeScript SDK for the official Brazilian RTC Regime Regular and
Simples Nacional calculators. This independent project is not affiliated with
or endorsed by Receita Federal. It delegates all tax calculations to the
upstream engines and does not implement tax rules.

**Status: development, not published or production-ready.** The implementation
has outstanding artifact-integrity, lifecycle and platform validation described
below. The example uses synthetic data and simulated Regular rates.

## Development quickstart

Node.js 20+ and an operational Docker Engine are required for local mode. For production, use a supported Node.js LTS release; Node 20 has reached end of life. The
package currently exposes ESM imports; CommonJS is not supported. The
first call to each calculator needs internet and sufficient disk space to
retrieve and build the pinned official source and SQLite database. No manual
Docker command is needed during SDK use.

```sh
npm ci
npm run build
node examples/calculate.mjs
```

The example uses the package's self-reference, as an installed consumer would.
The package is not yet available on npm. See [Portuguese documentation](README.pt-BR.md).

```ts
import { RTCTax } from '@rtc-tax/sdk';

const rtc = await RTCTax.local();
try {
  const regular = await rtc.regimeRegular.calculate(regularOperation);
  const simples = await rtc.simplesNacional.calculate(simplesOperation);
} finally {
  await rtc.close();
}
```

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
platforms and Node versions reported in the spike are confirmed; CI is intended
to cover additional Node versions but is not evidence until it runs.
