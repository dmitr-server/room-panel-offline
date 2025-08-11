#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

missing=()
need=(
  "SYSTEM_OVERVIEW.md"
  "QUICK_RETURN.md"
  "DEPLOYMENT.md"
  "SETTINGS_ARCHITECTURE.md"
  "MCP_MEMORY.md"
  "docs/adr/README.md"
  "docs/adr/0001-template.md"
  "offline-panel/index.html"
  "offline-panel/app.css"
  "offline-panel/app.js"
)
for f in "${need[@]}"; do [[ -f "$f" ]] || missing+=("$f"); done
if (( ${#missing[@]} )); then
  echo "Missing files:"; printf ' - %s\n' "${missing[@]}"; exit 1
fi

python3 scripts/context/verify-endpoints.py | sed 's/^/[verify] /'

scripts/context/fingerprint.sh | sed 's/^/[fp] /'

echo "docs check: OK"
