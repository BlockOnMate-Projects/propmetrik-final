#!/bin/bash
# PropMetrik Backend Dev Server — clean startup
# Usage: ./dev.sh

PORT=4000

echo "🧹 Cleaning up old processes..."

# Kill any zombie ts-node-dev processes
pkill -9 -f "ts-node-dev.*propmetrik" 2>/dev/null

# Kill anything on port 4000
lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null

# Wait for port to release
sleep 1

# Verify port is free
if lsof -ti:$PORT >/dev/null 2>&1; then
    echo "❌ Port $PORT still in use. Trying harder..."
    lsof -ti:$PORT | xargs kill -9 2>/dev/null
    sleep 2
    if lsof -ti:$PORT >/dev/null 2>&1; then
        echo "❌ Cannot free port $PORT. Check manually: lsof -i:$PORT"
        exit 1
    fi
fi

echo "✅ Port $PORT is free"
echo "🚀 Starting backend with tsx watch..."
echo ""

# Run with tsx watch (fast TypeScript dev with auto-reload)
exec npx tsx watch --clear-screen=false src/index.ts
