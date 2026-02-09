#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Zynk E2EE Messaging Test Runner
#
# Tests:
#   1. Register 2 users, upload E2EE keys
#   2. Establish WebSocket connections
#   3. Send encrypted messages A→B and B→A
#   4. Verify decryption works on both sides
#   5. Verify server never sees plaintext
#
# Usage:
#   chmod +x scripts/test-e2ee.sh
#   ./scripts/test-e2ee.sh
#
# Options:
#   --start-server     Start the server before testing (auto-stop after)
#   --api-base URL     Override API base URL (default: http://localhost:8000/api/v1)
#   --ws-url URL       Override WebSocket URL (default: http://localhost:8000)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"

API_BASE="${API_BASE:-http://localhost:8000/api/v1}"
WS_URL="${WS_URL:-http://localhost:8000}"
START_SERVER=false
SERVER_PID=""

# Parse args
for arg in "$@"; do
  case $arg in
    --start-server)  START_SERVER=true ;;
    --api-base=*)    API_BASE="${arg#*=}" ;;
    --ws-url=*)      WS_URL="${arg#*=}" ;;
  esac
done

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    echo ""
    echo "[INFO] Stopping server (PID: $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║        Zynk E2EE Messaging Test Runner                   ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# ─── Optionally start the server ─────────────────────────────────
if $START_SERVER; then
  echo "[INFO] Starting server..."
  cd "$SERVER_DIR"
  npx tsx src/index.ts &
  SERVER_PID=$!
  echo "[INFO] Server starting (PID: $SERVER_PID), waiting for it to be ready..."

  for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
      echo "[INFO] Server is ready!"
      break
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "[FAIL] Server exited unexpectedly"
      exit 1
    fi
    sleep 1
  done

  if ! curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "[FAIL] Server failed to start within 30 seconds"
    exit 1
  fi
else
  # Verify server is already running
  echo "[INFO] Checking if server is running at $API_BASE..."
  if ! curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "[FAIL] Server is not running. Start it with:"
    echo "       cd server && npm run dev"
    echo "  or run this script with --start-server"
    exit 1
  fi
  echo "[INFO] Server is running ✓"
fi

echo ""

# ─── Run the test ────────────────────────────────────────────────
cd "$SERVER_DIR"
NODE_PATH="$SERVER_DIR/node_modules" API_BASE="$API_BASE" WS_URL="$WS_URL" npx tsx "$SCRIPT_DIR/test-e2ee-messaging.ts"
EXIT_CODE=$?

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo "══════════════════════════════════════"
  echo "  ✅  ALL E2EE TESTS PASSED"
  echo "══════════════════════════════════════"
else
  echo "══════════════════════════════════════"
  echo "  ❌  SOME TESTS FAILED"
  echo "══════════════════════════════════════"
fi

exit $EXIT_CODE
