# Changelog

## Unreleased

## 0.1.0 — 2026-11-20

- Initial work on clients for the official Regime Regular and Simples Nacional
  engines, plus a Docker-based local manager and remote mode.
- Pin Regime Regular 1.7.2 and the official Simples Nacional 1.0.2 revision,
  each with database V0073; run both with Temurin 25.0.5.1+2.
- Verify pinned source and Maven artifacts and exercise the installed SDK from
  a separate Node HTTP server in both local and remote modes.
- Preserve LF line endings in checksum manifests and shell scripts on Windows.
