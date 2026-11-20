# Feasibility spike — 18 November 2026

Status: **partially validated; not complete**. Node.js has called all three
pinned official services running in local Docker containers. Both calculation
responses were captured and DANFSe produced a structurally readable PDF. The Node probe repeated the scenario and matched both captured responses. This is not an SDK or a production-readiness
claim; XML validity, source artifact reproducibility, version compatibility across releases and multi-platform behavior still require work.

The product scope is the [RTC Tax Trello board](https://trello.com/b/uTZWRKjd/rtc-tax).

## Sources and observed contracts

| Service | Source commit | Endpoint and configured port |
| --- | --- | --- |
| Regular | [150cccbe414d4a5edea703e4f7a424af5aa222c7](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/tree/150cccbe414d4a5edea703e4f7a424af5aa222c7) | `POST /api/calculadora/regime-geral`, 8080; health port 9101. |
| Simples | [c5b0f01c8351c3f0d0795cc617b29d233e9f98df](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/tree/c5b0f01c8351c3f0d0795cc617b29d233e9f98df) | `POST /api/calculadora/observabilidade/simples-nacional`, 8082; health port 9103. |
| DANFSe | [8d79e6b2f7fad6375340afcb51c85ed370c64a14](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse/tree/8d79e6b2f7fad6375340afcb51c85ed370c64a14) | `POST /api/danfse` accepts XML and returns PDF; `GET /health/ready`, port 8080. |

These repositories have MIT licenses attributed to Receita Federal. Review of
licenses for transitive dependencies, images, fonts and data remains open.

## Observed results

- **Regular:** the source example's education item returned HTTP 200 with CBS
  `42.24` and IBS `0.48` on base `1200.00`. The response says
  `calculoSimulado: true`: its nominal rates were supplied as simulation
  inputs. The exact response is `spike/fixtures/regular-response.json`.
- **Simples:** the upstream integration-test scenario returned HTTP 200,
  `CALCULADO`, IBS `11.88`, CBS `26.12` and total `88.00`; a repeated request
  returned the same bytes. The exact response is
  `spike/fixtures/simples-response.json`. This is evidence for one scenario,
  not validation of all calculations or the database provenance.
- **DANFSe:** HTTP 200, `application/pdf`, 79,944 bytes and `%PDF-`; `pdfinfo`
  read a one-page PDF 1.7. The input was a public third-party
  [test fixture](https://github.com/nfse-nacional/nfse-php/blob/7bf2936592a8dde879f14d93a33a610efe577c10/tests/fixtures/nfse.xml)
  marked as homologation (`tpAmb=2`), SHA-256
  `be936319423acad394cbd23f235b99a972ae9438e3096b20b993fd981ea586e2`.
  It is XML-well-formed and declares version 1.00. Validation against that project's v1.01 XSD with
  `xmllint` failed on its `serie` pattern; validity and authorization have not
  been independently established. Neither that XML nor the PDF is included
  here because they may contain fiscal data.
- The initial attempt ran out of host disk space before any motor started.
  After space was freed, Regular Flyway applied 59 migrations and both Java
  packages built with `-DskipTests`; no Java test suite was run.

The Simples checkout does not contain `flyway/`, although its README says to
copy it from that same repository. For this experiment only, the pinned
Regular migrations were copied to Simples. The observed calculation worked,
including a repeat, and the [Simples ADR009](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/c5b0f01c8351c3f0d0795cc617b29d233e9f98df/docs/adr/ADR009-migracoes-e-versionamento-do-banco.md) explicitly identifies the Regular repository as the source of those scripts. The tested version pair works for this scenario; broader compatibility remains unverified. Both
services reported local DB V0059 (2026-09-30) and an online version V0073
(2026-11-09). The services attempted an online version comparison even while
using the offline profile. These versions and data must not be assumed current.

## Reproduction

On macOS ARM64 this was tested with Node 24.13.1 and Docker Engine 29.1.3.
Other platforms are untested. Commands below build upstream software, download
dependencies and require substantial disk space and internet. The official
DANFSe Dockerfile uses floating base-image tags and hard-codes an AMD64 binary;
the observed ARM64 host used Docker's emulation. Build identity and transitive
artifacts are **not yet reproducibly pinned**.

Set a fresh absolute workspace path, prepare the sources and build the images:

```sh
export RTC_SPIKE_SOURCES=/absolute/path/to/new-spike-work
./spike/prepare.sh
```

The script checks out the source commits above, copies the official Regular
Flyway scripts to Simples as specified in ADR009, generates both SQLite
bases and builds both jars. It does not run the Java tests. It builds the
upstream DANFSe Dockerfile and prints the local image ID. The individual
commands were executed for this investigation; the newly assembled preparation
script has been syntax-checked but not rerun from an empty workspace.

Set `RTC_DANFSE_IMAGE` to the printed image ID. Provide a suitable XML locally;
do not commit sensitive fiscal documents. From this repository run:

```sh
export RTC_DANFSE_IMAGE=sha256:YOUR_IMAGE_ID
node spike/probe.mjs /path/to/nfse.xml
```

`RTC_SPIKE_SOURCES` must remain exported. The probe verifies the two Git
commits, starts each engine when needed, binds dynamically allocated ports on
`127.0.0.1`, waits for readiness, checks the complete calculation responses
against the captured fixtures, and checks the PDF signature and EOF. It stops
its own containers on normal completion and caught errors. It is a spike, not
a production lifecycle manager: interruption or process termination may leave
containers behind, and it does not establish trusted image provenance or
verify the generated database. Inspect a PDF with `pdfinfo` independently.

## Outstanding work

- Repeat the probe from a clean environment and resolve valid NFS-e schema and
  authorization evidence. No signature or fiscal authorization was verified.
- Establish an update/version policy and a tested compatibility matrix for the
  shared database; pin and verify upstream artifacts and transitive licenses.
- Implement and test the TypeScript SDK, lazy Engine Manager, remote clients,
  decimal-safe contracts, typed errors, lifecycle ownership, CI and bilingual
  documentation. No SDK or release-ready package exists yet.
