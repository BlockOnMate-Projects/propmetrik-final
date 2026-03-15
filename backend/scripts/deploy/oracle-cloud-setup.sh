#!/bin/bash
# ============================================================================
# PROPMETRIK Backend - Oracle Cloud Always Free Deployment Script
# ============================================================================
#
# This script sets up an Oracle Cloud Always Free ARM instance for production.
#
# Oracle Always Free Tier (as of 2025):
#   - ARM Ampere A1: Up to 4 OCPUs + 24GB RAM (split across max 4 VMs)
#   - 2x AMD Micro VMs: 1/8 OCPU + 1GB RAM each
#   - 200GB total block storage
#   - 10TB/month outbound data
#   - Load Balancer (1 instance, 10Mbps)
#
# Recommended setup for PropMetrik:
#   - 1x ARM VM: 2 OCPUs + 12GB RAM (API + PostgreSQL + Redis)
#   - Boot volume: 100GB
#
# Prerequisites:
#   1. Oracle Cloud account (https://cloud.oracle.com/registration)
#   2. SSH key pair generated locally
#   3. OCI CLI installed (optional but recommended)
#
# Usage:
#   1. Create the VM via Oracle Cloud Console (see STEP 1 below)
#   2. SSH into the VM: ssh -i ~/.ssh/oracle_propmetrik ubuntu@<public-ip>
#   3. Upload this script: scp oracle-cloud-setup.sh ubuntu@<ip>:~/
#   4. Run: chmod +x oracle-cloud-setup.sh && sudo ./oracle-cloud-setup.sh
#
# ============================================================================

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[SETUP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
section() { echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"; echo -e "${BLUE} $1${NC}"; echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"; }

# ============================================================================
# CONFIGURATION
# ============================================================================
APP_USER="propmetrik"
APP_DIR="/opt/propmetrik"
NODE_VERSION="20"
PG_VERSION="15"
DOMAIN="" # Set this to your domain if you have one

# ============================================================================
# STEP 0: System Update & Base Packages
# ============================================================================
section "Step 0: System Update & Base Packages"

apt-get update && apt-get upgrade -y
apt-get install -y \
  curl wget gnupg2 lsb-release ca-certificates \
  software-properties-common apt-transport-https \
  git build-essential python3 make g++ \
  ufw fail2ban unzip jq htop \
  certbot nginx

log "Base packages installed"

# ============================================================================
# STEP 1: Firewall Configuration
# ============================================================================
section "Step 1: Firewall Configuration"

# Oracle Cloud uses iptables by default - configure UFW
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw allow 4000/tcp   # API (temporary, will be proxied through Nginx)
ufw --force enable

log "Firewall configured (SSH, HTTP, HTTPS, API:4000)"

# IMPORTANT: Oracle Cloud also has Security Lists / Network Security Groups
warn "Remember to also open ports 80, 443 in your Oracle Cloud VCN Security List!"
warn "OCI Console → Networking → VCN → Security Lists → Add Ingress Rules"

# ============================================================================
# STEP 2: Create Application User
# ============================================================================
section "Step 2: Create Application User"

if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash -d /home/$APP_USER $APP_USER
  usermod -aG sudo $APP_USER
  log "Created user: $APP_USER"
else
  log "User $APP_USER already exists"
fi

mkdir -p $APP_DIR
chown $APP_USER:$APP_USER $APP_DIR

# ============================================================================
# STEP 3: Install Node.js 20 LTS
# ============================================================================
section "Step 3: Install Node.js $NODE_VERSION LTS"

curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

# Install PM2 globally for process management
npm install -g pm2

log "Node.js $(node -v) installed"
log "npm $(npm -v) installed"
log "PM2 installed"

# ============================================================================
# STEP 4: Install PostgreSQL 15 with PostGIS
# ============================================================================
section "Step 4: Install PostgreSQL $PG_VERSION with PostGIS"

# Add PostgreSQL repo
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt-get update

apt-get install -y postgresql-${PG_VERSION} postgresql-${PG_VERSION}-postgis-3

# Start and enable PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<EOF
CREATE USER propmetrik_user WITH PASSWORD 'CHANGE_ME_TO_SECURE_PASSWORD';
CREATE DATABASE propmetrik OWNER propmetrik_user;
\c propmetrik
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT ALL PRIVILEGES ON DATABASE propmetrik TO propmetrik_user;
GRANT ALL ON SCHEMA public TO propmetrik_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO propmetrik_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO propmetrik_user;
EOF

log "PostgreSQL $PG_VERSION with PostGIS installed and configured"
warn "IMPORTANT: Change the database password in the SQL above!"

# ============================================================================
# STEP 5: Install Redis
# ============================================================================
section "Step 5: Install Redis"

apt-get install -y redis-server

# Configure Redis for production
cat > /etc/redis/redis.conf.d/propmetrik.conf <<EOF
# PropMetrik Redis Configuration
maxmemory 512mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
# Require password
requirepass CHANGE_ME_TO_REDIS_PASSWORD
EOF

# Include custom config
if ! grep -q "include /etc/redis/redis.conf.d/" /etc/redis/redis.conf; then
  mkdir -p /etc/redis/redis.conf.d/
  echo "include /etc/redis/redis.conf.d/propmetrik.conf" >> /etc/redis/redis.conf
fi

systemctl restart redis-server
systemctl enable redis-server

log "Redis installed and configured"
warn "IMPORTANT: Change the Redis password above!"

# ============================================================================
# STEP 6: Install Docker (for OpenSearch)
# ============================================================================
section "Step 6: Install Docker (for OpenSearch)"

curl -fsSL https://get.docker.com | sh
usermod -aG docker $APP_USER

# Increase vm.max_map_count for OpenSearch
echo "vm.max_map_count=262144" >> /etc/sysctl.conf
sysctl -p

# Create OpenSearch docker compose
mkdir -p /opt/opensearch
cat > /opt/opensearch/docker-compose.yml <<'EOF'
version: '3.8'
services:
  opensearch:
    image: opensearchproject/opensearch:2.11.1
    container_name: propmetrik-opensearch
    environment:
      - discovery.type=single-node
      - bootstrap.memory_lock=true
      - "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m"
      - OPENSEARCH_INITIAL_ADMIN_PASSWORD=PropMetrik_OS_2024!
      - plugins.security.disabled=false
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    volumes:
      - opensearch-data:/usr/share/opensearch/data
    ports:
      - "9200:9200"
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1G

volumes:
  opensearch-data:
EOF

cd /opt/opensearch && docker compose up -d

log "OpenSearch installed via Docker (single-node, 512MB heap)"

# ============================================================================
# STEP 7: Configure Nginx Reverse Proxy
# ============================================================================
section "Step 7: Configure Nginx Reverse Proxy"

cat > /etc/nginx/sites-available/propmetrik <<'NGINX'
# PropMetrik API - Nginx Reverse Proxy
# Replace YOUR_DOMAIN with your actual domain

upstream propmetrik_api {
    server 127.0.0.1:4000;
    keepalive 64;
}

# HTTP → HTTPS redirect (uncomment when SSL is configured)
# server {
#     listen 80;
#     server_name YOUR_DOMAIN;
#     return 301 https://$host$request_uri;
# }

server {
    listen 80;
    # listen 443 ssl http2;  # Uncomment for SSL
    server_name YOUR_DOMAIN _;

    # SSL Configuration (uncomment after certbot)
    # ssl_certificate /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;
    # ssl_protocols TLSv1.2 TLSv1.3;
    # ssl_ciphers HIGH:!aNULL:!MD5;
    # ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Max upload size (for property images, documents)
    client_max_body_size 50M;

    # API proxy
    location / {
        proxy_pass http://propmetrik_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # WebSocket support (for real-time features)
    location /ws {
        proxy_pass http://propmetrik_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Health check endpoint (no logging)
    location /health {
        proxy_pass http://propmetrik_api;
        access_log off;
    }
}
NGINX

# Enable site
ln -sf /etc/nginx/sites-available/propmetrik /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl restart nginx
systemctl enable nginx

log "Nginx reverse proxy configured"
warn "Replace YOUR_DOMAIN in /etc/nginx/sites-available/propmetrik with your domain"

# ============================================================================
# STEP 8: Setup Application Directory
# ============================================================================
section "Step 8: Setup Application Directory"

mkdir -p $APP_DIR/{releases,shared,logs}
mkdir -p $APP_DIR/shared/{uploads,temp}

# Create .env template
cat > $APP_DIR/shared/.env <<'ENVFILE'
# ============================================================================
# PROPMETRIK Production Environment - Oracle Cloud Always Free
# ============================================================================

NODE_ENV=production
PORT=4000
API_VERSION=v1
APP_NAME=propmetrik
APP_URL=https://api.yourdomain.com
FRONTEND_URL=https://app.yourdomain.com

# Database (local PostgreSQL)
DATABASE_URL=postgresql://propmetrik_user:CHANGE_ME@localhost:5432/propmetrik?sslmode=disable
DB_HOST=localhost
DB_PORT=5432
DB_NAME=propmetrik
DB_USER=propmetrik_user
DB_PASSWORD=CHANGE_ME
DB_SSL=false
DB_POOL_MIN=2
DB_POOL_MAX=20

# Redis (local)
REDIS_URL=redis://:CHANGE_ME_REDIS@localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME_REDIS
REDIS_DB_AUTH=0
REDIS_DB_CACHE=1
REDIS_DB_QUEUE=2
REDIS_DB_PUBSUB=3

# OpenSearch (local Docker)
OPENSEARCH_URL=https://localhost:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=PropMetrik_OS_2024!
OPENSEARCH_INDEX_PREFIX=propmetrik_

# JWT
JWT_SECRET=GENERATE_A_STRONG_SECRET_HERE
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# CORS
CORS_ORIGINS=https://app.yourdomain.com,https://yourdomain.com

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760

# ============================================================================
# FILL IN YOUR EXTERNAL SERVICE CREDENTIALS BELOW
# ============================================================================

# Keycloak
KEYCLOAK_URL=
KEYCLOAK_REALM=propmetrik
KEYCLOAK_CLIENT_ID=
KEYCLOAK_CLIENT_SECRET=

# S3 / MinIO
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=

# Mapbox
MAPBOX_ACCESS_TOKEN=

# Paystack
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=

# E-Sign
ESIGN_INTERNAL_API_KEY=
ESIGN_WEBHOOK_SECRET=
ENVFILE

chown -R $APP_USER:$APP_USER $APP_DIR

log "Application directory structure created at $APP_DIR"
warn "Edit $APP_DIR/shared/.env with your actual credentials!"

# ============================================================================
# STEP 9: PM2 Ecosystem Configuration
# ============================================================================
section "Step 9: PM2 Ecosystem Configuration"

cat > $APP_DIR/ecosystem.config.js <<'PM2CONFIG'
module.exports = {
  apps: [
    {
      name: 'propmetrik-api',
      script: 'dist/index.js',
      cwd: '/opt/propmetrik/current',
      instances: 2,           // 2 instances for ARM (2 OCPUs)
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      // Symlink to shared .env
      env_file: '/opt/propmetrik/shared/.env',

      // Logging
      log_file: '/opt/propmetrik/logs/combined.log',
      error_file: '/opt/propmetrik/logs/error.log',
      out_file: '/opt/propmetrik/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Restart policy
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '1G',

      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 10000,

      // Watch (disabled in production)
      watch: false,
    }
  ]
};
PM2CONFIG

chown $APP_USER:$APP_USER $APP_DIR/ecosystem.config.js

# Setup PM2 startup
env PATH=$PATH:/usr/bin pm2 startup systemd -u $APP_USER --hp /home/$APP_USER

log "PM2 ecosystem configured"

# ============================================================================
# STEP 10: Deploy Script
# ============================================================================
section "Step 10: Deploy Script"

cat > $APP_DIR/deploy.sh <<'DEPLOY'
#!/bin/bash
# PropMetrik Deployment Script
# Usage: ./deploy.sh [branch]

set -euo pipefail

BRANCH=${1:-main}
APP_DIR="/opt/propmetrik"
REPO_URL="git@github.com:CedynGroup/propmetrik.git"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR="$APP_DIR/releases/$TIMESTAMP"

echo "🚀 Deploying PropMetrik API (branch: $BRANCH)"

# Clone repository
echo "📦 Cloning repository..."
git clone --branch $BRANCH --depth 1 $REPO_URL $RELEASE_DIR

# Install dependencies
echo "📦 Installing dependencies..."
cd $RELEASE_DIR/backend
npm ci --production=false

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Prune dev dependencies
npm prune --production

# Symlink shared .env
ln -sf $APP_DIR/shared/.env $RELEASE_DIR/backend/.env

# Symlink shared uploads
ln -sf $APP_DIR/shared/uploads $RELEASE_DIR/backend/uploads

# Run database migrations
echo "🗃️  Running migrations..."
cd $RELEASE_DIR/backend
NODE_ENV=production node -e "
  require('dotenv').config();
  const { execSync } = require('child_process');
  execSync('npx node-pg-migrate up', { stdio: 'inherit', env: process.env });
"

# Update current symlink
echo "🔗 Updating current release..."
ln -sfn $RELEASE_DIR/backend $APP_DIR/current

# Restart application
echo "♻️  Restarting application..."
cd $APP_DIR
pm2 startOrRestart ecosystem.config.js --update-env
pm2 save

# Cleanup old releases (keep last 3)
echo "🧹 Cleaning old releases..."
cd $APP_DIR/releases
ls -dt */ | tail -n +4 | xargs rm -rf 2>/dev/null || true

echo "✅ Deployment complete!"
echo "   Release: $TIMESTAMP"
echo "   Branch:  $BRANCH"

# Health check
sleep 5
if curl -sf http://localhost:4000/health/live > /dev/null 2>&1; then
  echo "   Health:  ✅ OK"
else
  echo "   Health:  ⚠️  API not responding yet (may need more startup time)"
fi
DEPLOY

chmod +x $APP_DIR/deploy.sh
chown $APP_USER:$APP_USER $APP_DIR/deploy.sh

log "Deploy script created at $APP_DIR/deploy.sh"

# ============================================================================
# STEP 11: Logrotate Configuration
# ============================================================================
section "Step 11: Logrotate Configuration"

cat > /etc/logrotate.d/propmetrik <<'LOGROTATE'
/opt/propmetrik/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 propmetrik propmetrik
    sharedscripts
    postrotate
        pm2 reloadLogs 2>/dev/null || true
    endscript
}
LOGROTATE

log "Logrotate configured (14 days retention)"

# ============================================================================
# STEP 12: Fail2Ban Configuration
# ============================================================================
section "Step 12: Fail2Ban Configuration"

cat > /etc/fail2ban/jail.local <<'F2B'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400

[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 10
F2B

systemctl restart fail2ban
systemctl enable fail2ban

log "Fail2Ban configured"

# ============================================================================
# STEP 13: Swap Space (Important for Always Free tier)
# ============================================================================
section "Step 13: Swap Space"

if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab

  # Optimize swap behavior
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
  sysctl -p

  log "4GB swap file created"
else
  log "Swap already exists"
fi

# ============================================================================
# STEP 14: PostgreSQL Tuning for 12GB RAM
# ============================================================================
section "Step 14: PostgreSQL Performance Tuning"

cat > /etc/postgresql/${PG_VERSION}/main/conf.d/propmetrik.conf <<'PGCONF'
# PropMetrik PostgreSQL Tuning (ARM 2 OCPUs, 12GB RAM)
# Allocate ~3GB to PostgreSQL (rest for app, Redis, OpenSearch)

# Memory
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB

# WAL
wal_buffers = 64MB
checkpoint_completion_target = 0.9
max_wal_size = 2GB
min_wal_size = 512MB

# Connections
max_connections = 100

# Query Planner
random_page_cost = 1.1
effective_io_concurrency = 200
default_statistics_target = 100

# Logging
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = on
log_disconnections = on
PGCONF

systemctl restart postgresql

log "PostgreSQL tuned for production"

# ============================================================================
# DONE!
# ============================================================================
section "Setup Complete!"

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           PropMetrik Oracle Cloud Setup Complete!           ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  Next Steps:                                               ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  1. Edit credentials:                                      ║${NC}"
echo -e "${GREEN}║     nano /opt/propmetrik/shared/.env                       ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  2. Change database password:                              ║${NC}"
echo -e "${GREEN}║     sudo -u postgres psql -c                               ║${NC}"
echo -e "${GREEN}║       \"ALTER USER propmetrik_user PASSWORD 'newpass';\"      ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  3. Change Redis password:                                 ║${NC}"
echo -e "${GREEN}║     Edit /etc/redis/redis.conf.d/propmetrik.conf           ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  4. Setup SSH key for GitHub deploy:                       ║${NC}"
echo -e "${GREEN}║     su - propmetrik                                        ║${NC}"
echo -e "${GREEN}║     ssh-keygen -t ed25519                                  ║${NC}"
echo -e "${GREEN}║     cat ~/.ssh/id_ed25519.pub                              ║${NC}"
echo -e "${GREEN}║     → Add as Deploy Key in GitHub repo settings            ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  5. Deploy:                                                ║${NC}"
echo -e "${GREEN}║     su - propmetrik                                        ║${NC}"
echo -e "${GREEN}║     /opt/propmetrik/deploy.sh main                         ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  6. Setup SSL (if you have a domain):                      ║${NC}"
echo -e "${GREEN}║     certbot --nginx -d api.yourdomain.com                  ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  7. Open OCI Security List ports:                          ║${NC}"
echo -e "${GREEN}║     → TCP 80 (HTTP)                                        ║${NC}"
echo -e "${GREEN}║     → TCP 443 (HTTPS)                                      ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║  Services Running:                                         ║${NC}"
echo -e "${GREEN}║     PostgreSQL 15  → localhost:5432                        ║${NC}"
echo -e "${GREEN}║     Redis          → localhost:6379                        ║${NC}"
echo -e "${GREEN}║     OpenSearch     → localhost:9200                        ║${NC}"
echo -e "${GREEN}║     Nginx          → :80 / :443                            ║${NC}"
echo -e "${GREEN}║     API (PM2)      → localhost:4000                        ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
