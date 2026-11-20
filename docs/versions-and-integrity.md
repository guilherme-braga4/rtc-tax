# Engine versions and integrity

The SDK's local mode builds, on the consumer's machine, the pinned Receita
Federal source versions listed in the [spike](feasibility-spike.md). Simples
uses the Regular repository's Flyway migrations as described by its ADR009.
Both engines build their own SQLite V0073 from the pinned Regular 1.7.2 Flyway scripts. The pinned Simples source is official commit `f90b6525e6d5823e784baecfc6fef0ad2f04b74f`, which the 1.0.2 tag pointed to when checked on 19 November 2026 (São Paulo time). Earlier that day the tag pointed to `352a341`, which failed to compile; the upstream tag was subsequently moved to the corrected commit. The SDK pins the commit and archive digest, not the mutable tag. No fiscal source code or POM is patched by the SDK. The SDK does not auto-update engines or data;
both databases are pinned snapshots and consumers must assess their suitability for the
intended calculation date. Remote mode uses the consumer's endpoints and the
consumer controls their versions and data.

On 19 November 2026 (São Paulo time), the official [version endpoint](https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo/api/calculadora/dados-abertos/versao)
reported environment `apr`, database `V0073`, and database version date
`2026-11-09`, matching the pinned migration version. This comparison is a
point-in-time version check, not an assessment of every fiscal rule or future
effective date. The SDK does not automatically download newer data.

Each source archive is verified against its SHA-256 in `src/engine.ts`. The
Maven Docker image is selected by digest. The builder and runtime use Temurin
25.0.5.1+2, fetched for Linux ARM64 or AMD64 and verified by a pinned SHA-256,
following the [November 2026 OpenJDK security advisory](https://openjdk.org/groups/vulnerability/advisories/2026-11-17).
Before building the local image, the
SDK adds pinned SHA-256 values for the Maven Wrapper JAR (3.2.0) and Maven
3.9.5 distribution to the extracted wrapper properties. The release includes
`assets/maven-artifacts.sha256`, a lock of 1,314 Maven POMs and JARs. Each is
retrieved from Maven Central and checked against the lock, including cached
copies. Maven then runs in offline mode inside a build step with network access
disabled and with a repository containing only verified artifacts. Two clean
offline builds and a test rejecting a corrupted cached artifact have passed.

The baseline was captured from the pinned-source builds. All 1,314 cached
files matched the Maven Central SHA-1 sidecars downloaded at capture time.
This does not provide independent provenance. The SHA-256 lock protects
subsequent builds from changes, but it is a
trust-on-first-capture baseline, not an independent signature or legal audit.
Maven Central's published SHA-512 matched the observed Maven 3.9.5 distribution.
A locally cached SDK image is still identified by its recipe label rather than
an independently signed image digest. These controls are not full supply-chain
attestation.

Changing engine versions requires reviewing both upstream source licenses and
release notes, updating archive hashes, the Maven dependency lock and the database pairing, checking the
HTTP contracts and decimal serialization, regenerating reference fixtures
from both official engines, rerunning local/remote/installed-server and
cross-process tests, and updating the compatibility documentation. Never
replace expected fixture outputs by hand without recording the source and the
actual response. No automatic cache update or image redistribution is implied.

The [third-party inventory](third-party/README.md) records the generated
runtime dependency license reports and their limitations.
