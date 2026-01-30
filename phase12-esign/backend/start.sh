#!/bin/bash
# Cedyn E-Sign Backend Startup Script

set -e

echo "📝 Starting Cedyn E-Sign Backend..."
echo "==================================="

# Check if Python 3.8+ is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is not installed or not in PATH"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
if python3 -c 'import sys; exit(0 if sys.version_info >= (3, 8) else 1)'; then
    echo "✅ Python $PYTHON_VERSION detected"
else
    echo "❌ Python 3.8+ is required. Current version: $PYTHON_VERSION"
    exit 1
fi

# Navigate to script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip > /dev/null 2>&1

# Install dependencies
echo "📦 Installing dependencies..."
pip install -r requirements.txt

# Load environment variables from root .env
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Root .env not found at $ENV_FILE"
    echo "   Create it from .env.example and populate credentials."
    exit 1
fi

echo "📄 Loading environment variables from $ENV_FILE..."
set -o allexport
# shellcheck disable=SC1090
source "$ENV_FILE"
set +o allexport

# Create uploads directory if it doesn't exist
mkdir -p uploads

# Check if required services are running
echo "🔍 Checking service dependencies..."

# Check PostgreSQL
if command -v psql &> /dev/null; then
    if PGPASSWORD=${ESIGN_POSTGRES_PASSWORD:-esign_password_dev} psql -h ${ESIGN_POSTGRES_HOST:-localhost} -p ${ESIGN_POSTGRES_PORT:-5432} -U ${ESIGN_POSTGRES_USER:-esign_user} -d ${ESIGN_POSTGRES_DB:-esign_db} -c "SELECT 1;" > /dev/null 2>&1; then
        echo "✅ E-Sign PostgreSQL database is accessible"
    else
        echo "⚠️  E-Sign PostgreSQL database is not accessible. Make sure PostgreSQL is running and the database is initialized."
        echo "   You may need to run the database initialization scripts first."
    fi
else
    echo "⚠️  psql not found. Skipping PostgreSQL check."
fi

# Check Keycloak
if curl -s -f "${KEYCLOAK_URL:-http://localhost:8080}/health/ready" > /dev/null 2>&1; then
    echo "✅ Keycloak is accessible"
else
    echo "⚠️  Keycloak is not accessible. Make sure Keycloak is running."
fi

# Start the application
echo "🚀 Starting E-Sign Backend..."
echo ""
echo "📊 Service Information:"
echo "  • API URL: http://localhost:8000"
echo "  • Docs: http://localhost:8000/docs"
echo "  • Frontend: http://localhost:3000"
echo ""
echo "🔑 Authentication: Keycloak SSO required"
echo ""
echo "🛑 Press Ctrl+C to stop"
echo ""

# Start with hot reload in development
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level info