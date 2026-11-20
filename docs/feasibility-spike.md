# Feasibility spike — MVP v0.1.0

Scope: only the official Regime Regular and Simples Nacional calculators.
Source of truth: [Trello Discovery v1.1 and decisions](https://trello.com/b/uTZWRKjd/rtc-tax).

## Official sources and observed behavior

| Engine | Pinned commit | Calculation path | Health port |
| --- | --- | --- | --- |
| Regular | [32df7196356e81f2df08e6023fc2b6dbc48036d3](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/tree/32df7196356e81f2df08e6023fc2b6dbc48036d3) | `POST /api/calculadora/regime-geral` | 9101 `/health` |
| Simples | [f90b6525e6d5823e784baecfc6fef0ad2f04b74f](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/tree/f90b6525e6d5823e784baecfc6fef0ad2f04b74f) | `POST /api/calculadora/observabilidade/simples-nacional` | 9103 `/health` |

On macOS ARM64, Docker Engine 29.1.3 and Node 24.13.1, the upstream Regular
example returned CBS `42.24`, IBS `0.48`, and `calculoSimulado: true` because
its 2027 nominal rates are supplied as simulation inputs. The upstream Simples
example returned item state `CALCULADO`, IBS `11.88`, CBS `26.12`, and total
`88.00`. Exact observed responses and synthetic inputs are in `spike/fixtures/`.

The Simples README misidentifies its migration source. Its
[ADR009](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/c5b0f01c8351c3f0d0795cc617b29d233e9f98df/docs/adr/ADR009-migracoes-e-versionamento-do-banco.md)
identifies the Regular repository. Both engines now independently build SQLite V0073 using the pinned Regular 1.7.2 Flyway scripts. The older Simples 0.0.6 failed against V0073 because V0071 removed a column it required. The Simples commit is official version 1.0.2. The original 1.0.2 tag pointed to a revision that failed to compile; the Receita subsequently corrected the source and moved the tag to the pinned commit. Its 376 upstream tests passed, and the reference operation succeeded through the SDK. This proves one scenario per engine, not general compatibility or current tax data. The Simples SDK currently uses the classic observability endpoint, which the newer official source marks obsolete; the newer non-assisted endpoint uses a different payload and is not exposed by this MVP. Both upstream engines
can contact an online version service even in offline mode; the SDK overrides
that URL when it runs its managed containers.

## Clean preparation and probe

Run the SDK-managed builds and both calculations, then probe remote mode against separately started containers:

```sh
npm ci
./spike/prepare.sh
node spike/probe.mjs
```

The first command builds both images from pinned official sources and checks the
full calculation responses, sharing and cleanup. The second starts separate
containers and verifies remote mode and independent ownership. Initial builds
need network access; compilation and migrations run with network disabled.
The earlier, clean 18 November spike used Regular 1.6.1 and V0059 for both
engines. The 19 November tests validate the newer pair separately as described
below. Maven's own upstream test suites were skipped.

Sources are obtained from Receita Federal's repositories, each MIT licensed.
Source tarball SHA-256 checks are in `src/engine.ts`; the Maven base image is
referenced by digest. The Maven Wrapper JAR and Maven distribution have pinned
SHA-256 values. A lock pins 1,314 Maven POMs and JARs by SHA-256; fetched and
cached copies are verified, and compilation runs offline with network access
disabled. The lock is a trust-on-first-capture baseline and the local image
label remains a trust boundary. See [versions and integrity](versions-and-integrity.md)
and the [third-party inventory](third-party/README.md). Generated images are not
redistributed.

## Installed Node server test

For remote mode, provide pre-built official JARs and database snapshots in `regular` and `simples` subdirectories, and Java 25+:

```sh
export RTC_SPIKE_SOURCES=/absolute/path/to/spike-work
export RTC_JAVA_BIN=/absolute/path/to/java
npm run test:installed-server
```

The test creates a temporary npm package, installs it in a separate directory,
starts the two official JARs and a Node HTTP server using the installed SDK's
remote mode, sends synthetic inputs over HTTP and compares complete responses.
Set `RTC_SERVER_MODE=local` instead to let the installed SDK start both Docker
engines; this mode requires an operational Docker Engine and the first run builds
the pinned images. Both modes passed on macOS ARM64 on 19 November 2026 with
Regular 1.7.2 and Simples 1.0.2 at the pinned commit. Local mode
also checks that closing the server stops both managed containers. The test
requires npm registry access for dependencies and never publishes a package.
Both installed-server modes also passed on the GitHub-hosted Ubuntu x64 runner in [CI run 44763770433](https://github.com/guilherme-braga4/rtc-tax/actions/runs/44763770433).

On 19 November, two independent Node processes were tested concurrently against
a single Regular container. After one process closed and another was killed,
a third recovered the stale lease and the final close stopped the container.
Unit tests also check refusal to stop a container whose ownership is uncertain.
The unit suite passed on macOS ARM64/Node 24 and in Linux ARM64 containers with
Node 20, 22, 24 and 26. The same 15 unit tests passed in hosted CI for all four Node versions on Linux, macOS and Windows. Local Docker lifecycle and official-engine integration were tested on macOS ARM64 and hosted Ubuntu x64; local Docker execution on Windows was not tested.

The current pinned pair was built from its official sources and exercised through the installed SDK on the GitHub-hosted Ubuntu x64 runner. An older combination was also probed under Linux AMD64 emulation on an ARM64 host.
