#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
GO_CMD="${GO_BIN:-go}"
PNPM_CMD="${PNPM_BIN:-pnpm}"
export GOTOOLCHAIN=local
bash scripts/baseline-build.sh
(cd backend && "$GO_CMD" test ./... && "$GO_CMD" vet ./...) > .baseline/jalon2-go-checks.log 2>&1
echo 'Go behavior tests and vet: OK'
"$PNPM_CMD" --filter pelagica run lint > .baseline/jalon2-lint.log 2>&1
"$PNPM_CMD" --filter pelagica run format:check > .baseline/jalon2-format.log 2>&1
echo 'Frontend lint and formatting: OK'
node scripts/check-frontend.mjs > .baseline/jalon2-ssr-tests.log 2>&1
echo 'Frontend HTML integration checks: OK'
node --test scripts/check-hero-rotation.mjs > .baseline/hero-rotation-tests.log 2>&1
echo 'Hero rotation timing and pause checks: OK'
python3 scripts/baseline-smoke.py
