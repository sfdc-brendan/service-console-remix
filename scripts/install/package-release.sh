#!/usr/bin/env bash
# Builds the UI and writes releases/service-console-remix-<version>.zip, a self-contained kit that installs
# with only the Salesforce CLI (no Node needed). Usage: scripts/install/package-release.sh [version]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE="$ROOT/force-app/main/default/uiBundles/serviceConsole"
VERSION="${1:-$(date +%Y.%m.%d)-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)}"
NAME="service-console-remix-$VERSION"
STAGE="$(mktemp -d)/$NAME"
OUT="$ROOT/releases/$NAME.zip"

echo "==> Building the UI bundle"
(cd "$BUNDLE" && { [[ -d node_modules ]] || npm ci --no-audit --no-fund; } && npm run build)
[[ -f "$BUNDLE/dist/index.html" ]] || { echo "Build did not produce dist/index.html" >&2; exit 1; }

echo "==> Staging $NAME"
mkdir -p "$STAGE/scripts"
cp "$ROOT/sfdx-project.json" "$ROOT/.forceignore" "$ROOT/INSTALL.md" "$STAGE/"
cp -R "$ROOT/scripts/install" "$STAGE/scripts/install"
rsync -a \
  --exclude 'node_modules/' \
  --exclude '.DS_Store' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude 'test-results/' \
  --exclude 'playwright-report/' \
  "$ROOT/force-app" "$STAGE/"
chmod +x "$STAGE/scripts/install/"*.sh

mkdir -p "$ROOT/releases"
rm -f "$OUT"
(cd "$(dirname "$STAGE")" && zip -qr "$OUT" "$NAME")
echo "==> Wrote ${OUT#$ROOT/} ($(du -h "$OUT" | cut -f1))"
