#!/usr/bin/env bash
# Build pinned engines from verified official sources and run the local spike.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run test:integration
