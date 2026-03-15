# PropMetrik — Oracle Cloud Always Free Deployment Guide

## What You Get (Always Free Tier)

| Resource | Always Free Allowance |
|----------|----------------------|
| **ARM Ampere A1 Compute** | 4 OCPUs + 24GB RAM total (across up to 4 VMs) |
| **AMD Micro Compute** | 2 VMs (1/8 OCPU + 1GB RAM each) |
| **Boot Volume Storage** | 200GB total |
| **Object Storage** | 10GB |
| **Outbound Data** | 10TB/month |
| **Load Balancer** | 1 instance (10 Mbps) |
| **Autonomous Database** | 2 instances (20GB each) — but we use PostgreSQL |

**Recommended for PropMetrik:** 1x ARM A1 VM with 2 OCPUs + 12GB RAM + 100GB boot volume

---

## Step 1: Create Oracle Cloud Account

1. Go to **https://cloud.oracle.com/registration**
2. Sign up with your email (credit card required for verification, but **won't be charged**)
3. Select your **Home Region** — choose the closest to Ghana:
   - `uk-london-1` (London) — recommended
   - `eu-frankfurt-1` (Frankfurt)
   - `af-johannesburg-1` (Johannesburg) — if available
4. Wait for account activation (usually 5-15 minutes)

> **Important:** Always Free resources are only available in your **Home Region**. Choose wisely — it cannot be changed later.

---

## Step 2: Generate SSH Key Pair

On your local machine:

```bash
# Generate a new SSH key pair for Oracle Cloud
ssh-keygen -t ed25519 -f ~/.ssh/oracle_propmetrik -C "propmetrik-oracle"

# Display the public key (you'll paste this in OCI Console)
cat ~/.ssh/oracle_propmetrik.pub
```

---

## Step 3: Create the Compute Instance

### Via OCI Console (Recommended for first time)

1. Log into **https://cloud.oracle.com**
2. Navigate to **Compute → Instances → Create Instance**
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `propmetrik-api` |
| **Compartment** | Root compartment (default) |
| **Availability Domain** | Any available |
| **Image** | Ubuntu 22.04 (Canonical) |
| **Shape** | `VM.Standard.A1.Flex` (Ampere ARM) |
| **OCPUs** | 2 |
| **Memory** | 12 GB |
| **Boot Volume** | 100 GB |
| **Network** | Create new VCN or use existing |
| **Public IP** | Assign ephemeral public IP |
| **SSH Keys** | Paste contents of `~/.ssh/oracle_propmetrik.pub` |

4. Click **Create**
5. Wait for the instance to reach **Running** state
6. Note the **Public IP Address**

### Via OCI CLI (For automation)

```bash
# Install OCI CLI
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"

# Configure
oci setup config

# Create VCN
oci network vcn create \
  --compartment-id $COMPARTMENT_ID \
  --cidr-blocks '["10.0.0.0/16"]' \
  --display-name "propmetrik-vcn"

# Create instance (ARM A1)
oci compute instance launch \
  --compartment-id $COMPARTMENT_ID \
  --availability-domain "$AD_NAME" \
  --shape "VM.Standard.A1.Flex" \
  --shape-config '{"ocpus": 2, "memoryInGBs": 12}' \
  --image-id $UBUNTU_IMAGE_ID \
  --subnet-id $SUBNET_ID \
  --ssh-authorized-keys-file ~/.ssh/oracle_propmetrik.pub \
  --display-name "propmetrik-api" \
  --assign-public-ip true \
  --boot-volume-size-in-gbs 100
```

> **Tip:** If ARM instances aren't available (common in popular regions), try:
> - Different Availability Domains within your region
> - Running the command repeatedly (instances become available as others are released)
> - Using a script that retries: see `oracle-retry-create.sh`

---

## Step 4: Open Network Ports

Oracle Cloud VMs have **two layers** of firewall:
1. **VCN Security List** (Oracle cloud level)
2. **iptables/UFW** (OS level — handled by setup script)

### Open VCN Security List Ports

1. Go to **Networking → Virtual Cloud Networks → your VCN**
2. Click on **Security Lists → Default Security List**
3. Click **Add Ingress Rules**
4. Add these rules:

| Source CIDR | Protocol | Port Range | Description |
|-------------|----------|------------|-------------|
| `0.0.0.0/0` | TCP | 80 | HTTP |
| `0.0.0.0/0` | TCP | 443 | HTTPS |

> Port 22 (SSH) should already be open by default.

---

## Step 5: SSH Into Your Instance

```bash
ssh -i ~/.ssh/oracle_propmetrik ubuntu@<PUBLIC_IP>
```

---

## Step 6: Run the Setup Script

```bash
# Upload the setup script
scp -i ~/.ssh/oracle_propmetrik \
  backend/scripts/deploy/oracle-cloud-setup.sh \
  ubuntu@<PUBLIC_IP>:~/

# SSH in
ssh -i ~/.ssh/oracle_propmetrik ubuntu@<PUBLIC_IP>

# Run setup (takes ~10-15 minutes)
chmod +x oracle-cloud-setup.sh
sudo ./oracle-cloud-setup.sh
```

This installs and configures:
- Node.js 20 + PM2
- PostgreSQL 15 + PostGIS
- Redis 7
- OpenSearch 2.11 (Docker)
- Nginx reverse proxy
- UFW firewall + Fail2Ban
- 4GB swap

---

## Step 7: Configure Credentials

```bash
# Switch to propmetrik user
sudo su - propmetrik

# Edit environment variables
nano /opt/propmetrik/shared/.env
```

**Critical variables to set:**
- `DB_PASSWORD` — your PostgreSQL password
- `REDIS_PASSWORD` — your Redis password
- `JWT_SECRET` — generate with `openssl rand -hex 32`
- `KEYCLOAK_*` — your Keycloak credentials
- `MINIO_*` — your S3/MinIO credentials
- `FRONTEND_URL` / `APP_URL` — your actual domains

Also change database and Redis passwords:
```bash
# Change PostgreSQL password
sudo -u postgres psql -c "ALTER USER propmetrik_user PASSWORD 'your-secure-password-here';"

# Change Redis password
sudo nano /etc/redis/redis.conf.d/propmetrik.conf
sudo systemctl restart redis-server
```

---

## Step 8: Setup GitHub Deploy Key

```bash
sudo su - propmetrik

# Generate deploy key
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""

# Display public key
cat ~/.ssh/id_ed25519.pub
```

1. Go to GitHub → **CedynGroup/propmetrik** → Settings → Deploy Keys
2. Add the public key (read-only access is sufficient)

---

## Step 9: Deploy!

```bash
sudo su - propmetrik
/opt/propmetrik/deploy.sh main
```

This will:
1. Clone the latest code from `main` branch
2. Install dependencies
3. Build TypeScript
4. Run database migrations
5. Symlink the new release
6. Restart PM2 processes
7. Run health check

---

## Step 10: Setup SSL (Optional but Recommended)

If you have a domain pointed to your instance:

```bash
# Point your domain's A record to the instance public IP first
# Then:
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

---

## Monitoring & Maintenance

### Check Status
```bash
# Application status
pm2 status
pm2 logs propmetrik-api --lines 50

# System resources
htop
df -h

# Database
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('propmetrik'));"

# Redis
redis-cli -a YOUR_PASSWORD info memory

# OpenSearch
curl -ku admin:PropMetrik_OS_2024! https://localhost:9200/_cluster/health?pretty

# Nginx
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

### PM2 Commands
```bash
pm2 restart propmetrik-api    # Restart
pm2 reload propmetrik-api     # Zero-downtime reload
pm2 logs propmetrik-api       # View logs
pm2 monit                     # Real-time monitoring
pm2 save                      # Save current process list
```

### Redeployment
```bash
sudo su - propmetrik
/opt/propmetrik/deploy.sh main
```

---

## Memory Budget (12GB RAM)

| Service | Allocation |
|---------|-----------|
| PostgreSQL | ~3GB (shared_buffers=1GB + cache) |
| Node.js API (2 workers) | ~2GB (1GB max per worker) |
| OpenSearch | ~1.5GB (512MB heap + overhead) |
| Redis | ~512MB |
| OS + System | ~2GB |
| Swap (emergency) | 4GB on disk |
| **Headroom** | **~3GB free** |

---

## Troubleshooting

### Instance creation fails (Out of Capacity)
ARM instances in popular regions often have limited availability. Solutions:
- Keep retrying (set up a cron job or script)
- Try a different Availability Domain
- Use an AMD Micro instance (1/8 OCPU, 1GB RAM) as a placeholder

### Cannot SSH
- Check VCN Security List has port 22 open
- Verify you're using the correct SSH key
- Check instance is in "Running" state

### API not responding after deploy
```bash
pm2 logs propmetrik-api --err --lines 100
# Check if .env is properly symlinked
ls -la /opt/propmetrik/current/.env
```

### PostgreSQL connection refused
```bash
sudo systemctl status postgresql
sudo -u postgres psql -c "SELECT 1;"
# Check pg_hba.conf if needed
sudo nano /etc/postgresql/15/main/pg_hba.conf
```
