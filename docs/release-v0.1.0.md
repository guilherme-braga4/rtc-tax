# Release preparation — v0.1.0

This document records the candidate, not a published release. The MVP contains
only the Regime Regular and Simples Nacional calculators. The release requires
explicit owner authorization for each push, npm publication and release.

## Candidate

- npm package: `@rtc-tax/sdk@0.1.0`, ESM, Node.js 20 or newer. Node 20 is
  end-of-life; use a currently supported LTS release for production.
- Regular: official commit `32df7196356e81f2df08e6023fc2b6dbc48036d3`
  (1.7.2); Simples: official commit `f90b6525e6d5823e784baecfc6fef0ad2f04b74f`
  (1.0.2 when checked). Both build their own SQLite V0073 snapshots.
- The source commits, source SHA-256, Java runtime and Maven artifacts are fixed;
  the SDK constructs the images locally and does not distribute them.
- The classic Simples observability endpoint used by this candidate is marked
  obsolete upstream, although it remains operational in the pinned revision.
  The new non-assisted endpoint has a different contract and is not exposed.
- Test data is synthetic; the Regular sample supplies simulated nominal rates.

## Evidence and remaining release gates

See [the spike report](feasibility-spike.md), [integrity notes](versions-and-integrity.md)
and [license inventory](third-party/README.md) for scope, test results, provenance
and limitations. The SDK-installed Node HTTP server must pass in both modes for
this exact candidate. Windows and GitHub-hosted CI results must be observed, not
inferred from workflow configuration. The npm scope and publishing account must
be verified: the current environment is not authenticated to npm. A registry
404 for this package does not prove that a scope belongs to the owner.

The GitHub repository has no default-branch commit yet. Hosted CI needs an
explicitly authorized push of the reviewed commit; npm publication and a GitHub
release need separate explicit owner authorization. Record their actual results
before calling the release complete. Do not publish generated Docker images as
part of this release; their third-party license and source obligations require
separate review.
