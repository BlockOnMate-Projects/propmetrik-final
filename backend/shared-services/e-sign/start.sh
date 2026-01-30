#!/bin/bash
# PropMetrik E-Sign Service Startup Script
# Port: 8002 (following valuation service pattern on 8001)

set -e

echo "📝 Starting PropMetrik E-Sign Service..."
echo "==========================================="

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

# Load environment variables from PropMetrik root .env
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    # Try backend .env as fallback
    ENV_FILE="${SCRIPT_DIR}/../../.env"
    if [ ! -f "$ENV_FILE" ]; then
        echo "⚠️  No .env file found. Using defaults for development."
    fi
fi

if [ -f "$ENV_FILE" ]; then
    echo "📄 Loading environment variables from $ENV_FILE..."
    set -o allexport
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +o allexport
fi

# Override for PropMetrik integration
export KEYCLOAK_ENABLED=false
export POSTGRES_DB=${POSTGRES_DB:-propmetrik}

# Create uploads directory if it doesn't exist
mkdir -p uploads

# Check if required services are running
echo "🔍 Checking service dependencies..."

# Check PostgreSQL
if command -v psql &> /dev/null; then
    if PGPASSWORD=${POSTGRES_PASSWORD:-propmetrik_dev} psql -h ${POSTGRES_HOST:-localhost} -p ${POSTGRES_PORT:-5432} -U ${POSTGRES_USER:-propmetrik_app} -d ${POSTGRES_DB:-propmetrik} -c "SELECT 1;" > /dev/null 2>&1; then
        echo "✅ PropMetrik PostgreSQL database is accessible"
        # Check esign schema exists
        if PGPASSWORD=${POSTGRES_PASSWORD:-propmetrik_dev} psql -h ${POSTGRES_HOST:-localhost} -p ${POSTGRES_PORT:-5432} -U ${POSTGRES_USER:-propmetrik_app} -d ${POSTGRES_DB:-propmetrik} -c "SELECT 1 FROM esign.users LIMIT 1;" > /dev/null 2>&1; then
            echo "✅ esign schema exists"
        else
            echo "⚠️  esign schema may not exist. Run migration 127_esign_schema_tables.sql"
        fi
    else
        echo "⚠️  PostgreSQL database is not accessible. Make sure PostgreSQL is running."
    fi
else
    echo "⚠️  psql not found. Skipping PostgreSQL check."
fi

# PropMetrik API check (optional)
if curl -s -f "${PROPMETRIK_API_URL:-http://localhost:4000}/api/health" > /dev/null 2>&1; then
    echo "✅ PropMetrik API is accessible"
else
    echo "ℹ️  PropMetrik API not accessible at ${PROPMETRIK_API_URL:-http://localhost:4000}"
    echo "   E-Sign will still work with valid JWT tokens."
fi

# Start the application
echo "🚀 Starting E-Sign Service..."
echo ""
echo "📊 Service Information:"
echo "  • API URL: http://localhost:8002"
echo "  • Docs: http://localhost:8002/docs"
echo "  • Frontend: http://localhost:3001"
echo ""
echo "🔑 Authentication: PropMetrik JWT (HS256)"
echo "📁 Database: ${POSTGRES_DB:-propmetrik}/esign schema"
echo ""
echo "🛑 Press Ctrl+C to stop"
echo ""

# Start with hot reload in development
uvicorn main:app --host 0.0.0.0 --port 8002 --reload --log-level info