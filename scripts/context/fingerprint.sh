#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

echo "time: $(date -Is)"
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo "git-branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "git-head: $(git rev-parse HEAD)"
  echo "git-dirty: $(git status --porcelain | wc -l | tr -d ' ') changes"
else
  echo "git: not a repo"
fi

sha() { local f="$1"; [[ -f "$f" ]] && sha256sum "$f" | awk '{print $1}' || echo "missing"; }
for f in SYSTEM_OVERVIEW.md QUICK_RETURN.md DEPLOYMENT.md SETTINGS_ARCHITECTURE.md MCP_MEMORY.md; do
  echo "sha256 $f: $(sha "$f")"
done
