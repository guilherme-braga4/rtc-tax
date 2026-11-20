# MVP v0.1.0 — Definition of Done

Source: [Trello decisions](https://trello.com/c/3bQcAi9l/2-decisoes-mvp-v010-somente-regime-regular-simples-nacional), Discovery v1.1.

- [x] Installable npm package, published after explicit authorization.
- [x] Local SDK starts either official calculator lazily with operational Docker,
      and reproduces one reference calculation per engine without manual Docker commands.
- [x] Remote mode works for both engines without Docker.
- [x] Independent typed clients, decimal preservation, timeouts and clear errors for the documented subset.
- [ ] Container lifecycle is idempotent across concurrent consumers, does not stop
      unrelated containers, binds locally, and survives failures safely.
- [ ] Official versions, database, artifact integrity and licenses documented and verified.
- [x] Unit and integration tests, CI and bilingual documentation are reproducible.
- [x] Project independence from Receita Federal is explicit.

Only Regime Regular and Simples Nacional are in this release. The published MVP
still has open limitations: independent provenance of the first Maven artifact lock,
license obligations for possible image redistribution, local Docker validation on Windows and release verification remain
open. Cross-process coordination and stale lease recovery were tested for one
host and user; missing or inconsistent ownership state fails closed and can
require manual inspection. Check results in [the spike report](feasibility-spike.md)
and do not infer a passing integration test from the presence of test code.

The author's pre-existing local Excalidraw diagrams predate Discovery v1.1
and depict a third service. They are preserved separately and must be revised
before being used as a description of the v0.1.0 architecture. See the
[release preparation record](release-v0.1.0.md) for remaining gates.
