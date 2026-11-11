#!/usr/bin/env bash
# Installs the Service Console Remix into a Salesforce SDO.
# Usage: scripts/install/install.sh -o <org alias> [--validate-only] [--route-all-cases-to-me] [--no-seed] [--skip-preflight]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE="$ROOT/force-app/main/default/uiBundles/serviceConsole"
INSTALL="$ROOT/scripts/install"
TESTS=(SLK_CommandCenterTest SLK_ConsoleTest SLK_InsightsTest SLK_RoutingTest)
PERMSETS=(SLK_Service_Console SLK_Service_Console_Admin)

ORG=""
VALIDATE_ONLY=false
ROUTE_ALL=false
SEED=true
PREFLIGHT=true

usage() {
  sed -n '2,3p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# Prints the payload of USER_DEBUG lines tagged <tag>:: (the run output also echoes the script source).
debug_lines() { grep 'USER_DEBUG' | grep -o "$1::.*" | sed "s/^$1:://" || true; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mInstall stopped:\033[0m %s\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--target-org) ORG="${2:-}"; shift 2 ;;
    --validate-only) VALIDATE_ONLY=true; shift ;;
    --route-all-cases-to-me) ROUTE_ALL=true; shift ;;
    --no-seed) SEED=false; shift ;;
    --skip-preflight) PREFLIGHT=false; shift ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown option: $1" >&2; usage 1 ;;
  esac
done
[[ -n "$ORG" ]] || usage 1

cd "$ROOT"

step "Checking the Salesforce CLI and org login"
command -v sf >/dev/null || fail "The Salesforce CLI (sf) is not installed. Get it at https://developer.salesforce.com/tools/salesforcecli"
sf org display -o "$ORG" >/dev/null 2>&1 || fail "Not logged in to '$ORG'. Run: sf org login web -a $ORG"
USERNAME="$(sf org display -o "$ORG" --json 2>/dev/null | grep -m1 '"username"' | sed 's/.*"username": *"\([^"]*\)".*/\1/')"
echo "Target org: $USERNAME"

if $PREFLIGHT; then
  step "Preflight: checking the org has the features the app needs"
  output="$(sf apex run -o "$ORG" -f "$INSTALL/preflight.apex" 2>&1)" || fail "The preflight script could not run:
$output"
  results="$(debug_lines SLK_PREFLIGHT <<< "$output" | sort -u)"
  [[ -n "$results" ]] || fail "The preflight script ran but reported nothing:
$output"
  while IFS= read -r line; do
    outcome="${line%%::*}"; rest="${line#*::}"
    printf '  %-5s %s: %s\n' "$outcome" "${rest%%::*}" "${rest#*::}"
  done <<< "$results"
  if grep -q '^FAIL::' <<< "$results"; then
    fail "Fix the FAIL items above (see INSTALL.md, 'Org prerequisites'), then rerun."
  fi
fi

step "Preparing the UI bundle"
if [[ -f "$BUNDLE/dist/index.html" ]]; then
  echo "Using the prebuilt UI in $(basename "$BUNDLE")/dist"
else
  command -v npm >/dev/null || fail "No prebuilt UI found and Node.js is not installed. Install Node 20+ from https://nodejs.org or use a release zip, which includes the built UI."
  (cd "$BUNDLE" && npm ci --no-audit --no-fund && npm run build)
fi

if $VALIDATE_ONLY; then
  step "Validating the deployment (nothing is saved to the org)"
  sf project deploy validate -o "$ORG" -d force-app --test-level RunSpecifiedTests --tests "${TESTS[@]}" --wait 60 --concise
  printf '\n\033[32mValidation passed.\033[0m Rerun without --validate-only to install.\n'
  exit 0
fi

step "Deploying metadata and running the app's Apex tests"
sf project deploy start -o "$ORG" -d force-app --test-level RunSpecifiedTests --tests "${TESTS[@]}" --wait 60 --concise

step "Assigning permission sets to $USERNAME"
for permset in "${PERMSETS[@]}"; do
  if out="$(sf org assign permset -o "$ORG" -n "$permset" 2>&1)"; then
    echo "  Assigned $permset"
  elif grep -qi 'duplicate' <<< "$out"; then
    echo "  $permset was already assigned"
  else
    fail "Could not assign $permset:
$out"
  fi
done

if $SEED; then
  step "Seeding demo data (virtual agents, today's history, inbound work)"
  out="$(sf apex run -o "$ORG" -f "$INSTALL/seed-demo-data.apex" 2>&1)" || fail "Seeding failed:
$out"
  debug_lines SLK_INSTALL <<< "$out" | sed 's/^/  /'
fi

if $ROUTE_ALL; then
  step "Routing every new case to you"
  out="$(sf apex run -o "$ORG" -f "$INSTALL/route-all-cases-to-me.apex" 2>&1)" || fail "Could not turn on all-cases routing:
$out"
  debug_lines SLK_INSTALL <<< "$out" | sed 's/^/  /'
fi

printf '\n\033[32mService Console Remix is installed.\033[0m\n'
echo "Open it with: sf org open -o $ORG -p lightning/app/c__serviceConsole"
echo "(or App Launcher > Service Console Remix)"
