#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[dev-reset] Stopping stale frontend/backend processes..."
pkill -f "next dev" 2>/dev/null || true
pkill -f "tsx watch --clear-screen=false src/index.ts" 2>/dev/null || true
pkill -f "ts-node-dev --respawn --transpile-only src/index.ts" 2>/dev/null || true

if command -v lsof >/dev/null 2>&1; then
  lsof -ti:3000,4000 2>/dev/null | xargs kill -9 2>/dev/null || true
fi

sleep 1

echo "[dev-reset] Starting backend (clean mode)..."
(
  cd "$ROOT_DIR/backend"
  npm run dev
) &
BACKEND_PID=$!

echo "[dev-reset] Starting frontend..."
(
  cd "$ROOT_DIR/frontend"
  npm run dev
) &
FRONTEND_PID=$!

cleanup() {
  echo "\n[dev-reset] Shutting down..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

wait "$BACKEND_PID" "$FRONTEND_PID"
