#!/usr/bin/env bash
# Build the web client and backend without changing dependency lockfiles.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PNPM_CMD="${PNPM_BIN:-pnpm}"
GO_CMD="${GO_BIN:-go}"
expected_node="v$(tr -d '\r\n' < .node-version)"
expected_go="go$(tr -d '\r\n' < .go-version)"
expected_pnpm="$(node -p "require('./package.json').packageManager.split('@').pop()")"
[[ "$(node --version)" == "$expected_node" ]] || { echo "Node required: $expected_node" >&2; exit 1; }
[[ "$("$PNPM_CMD" --version)" == "$expected_pnpm" ]] || { echo "pnpm required: $expected_pnpm" >&2; exit 1; }
[[ "$("$GO_CMD" version)" == "go version $expected_go "* ]] || { echo "Go required: $expected_go" >&2; exit 1; }
export GOTOOLCHAIN=local CGO_ENABLED=0
mkdir -p .baseline

"$PNPM_CMD" install --frozen-lockfile --filter pelagica... > .baseline/install.log 2>&1
echo 'Dependencies: OK (frozen lockfile)'
"$PNPM_CMD" --filter pelagica run build > .baseline/frontend-build.log 2>&1
echo 'Frontend build: OK'
(cd backend && "$GO_CMD" mod download && "$GO_CMD" mod verify && "$GO_CMD" build -mod=readonly -trimpath -buildvcs=false -o ../.baseline/server .) > .baseline/backend-build.log 2>&1
echo 'Backend build: OK'
python3 - <<'PY'
import hashlib, json
from pathlib import Path
paths = [Path('.baseline/server'), *sorted(Path('frontend/dist').rglob('*'))]
checksums = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}
Path('.baseline/artifact-sha256.json').write_text(json.dumps(checksums, indent=2) + '\n')
print(f'SHA-256 recorded for {len(checksums)} build artifacts')
PY
