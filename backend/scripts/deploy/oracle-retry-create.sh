#!/bin/bash
# ============================================================================
# Oracle Cloud ARM Instance Creation Retry Script
# ============================================================================
#
# ARM A1 instances on Oracle Always Free are often "Out of Capacity".
# This script retries every 60 seconds until successful.
#
# Prerequisites:
#   - OCI CLI installed and configured: https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm
#   - Run `oci setup config` first
#
# Usage:
#   1. Fill in the variables below
#   2. Run: chmod +x oracle-retry-create.sh && ./oracle-retry-create.sh
#
# ============================================================================

set -uo pipefail

# ============================================================================
# CONFIGURATION - Fill these in!
# ============================================================================

# Your compartment OCID (find in OCI Console → Identity → Compartments)
COMPARTMENT_ID="ocid1.compartment.oc1..REPLACE_ME"

# Availability Domain name (find with: oci iam availability-domain list --compartment-id $COMPARTMENT_ID)
# Example: "Uocm:UK-LONDON-1-AD-1"
AVAILABILITY_DOMAIN="REPLACE_ME"

# Subnet OCID (find in OCI Console → Networking → VCN → Subnets)
SUBNET_ID="ocid1.subnet.oc1..REPLACE_ME"

# Ubuntu 22.04 ARM image OCID for your region
# Find with: oci compute image list --compartment-id $COMPARTMENT_ID --shape "VM.Standard.A1.Flex" --operating-system "Canonical Ubuntu" --sort-by TIMECREATED --sort-order DESC --limit 5
IMAGE_ID="ocid1.image.oc1..REPLACE_ME"

# Path to your SSH public key
SSH_KEY_FILE="$HOME/.ssh/oracle_propmetrik.pub"

# Instance configuration
INSTANCE_NAME="propmetrik-api"
OCPUS=2
MEMORY_GB=12
BOOT_VOLUME_GB=100

# Retry configuration
RETRY_INTERVAL=60  # seconds between attempts
MAX_RETRIES=1440   # 24 hours of retries at 60s intervals

# ============================================================================
# SCRIPT
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Oracle Cloud ARM Instance Creator (with retry) ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Shape:  VM.Standard.A1.Flex                    ║${NC}"
echo -e "${GREEN}║  OCPUs:  $OCPUS                                     ║${NC}"
echo -e "${GREEN}║  Memory: ${MEMORY_GB}GB                                   ║${NC}"
echo -e "${GREEN}║  Boot:   ${BOOT_VOLUME_GB}GB                                  ║${NC}"
echo -e "${GREEN}║  Retry:  every ${RETRY_INTERVAL}s (max $MAX_RETRIES attempts)        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Validate configuration
if [[ "$COMPARTMENT_ID" == *"REPLACE_ME"* ]] || [[ "$AVAILABILITY_DOMAIN" == "REPLACE_ME" ]] || [[ "$SUBNET_ID" == *"REPLACE_ME"* ]] || [[ "$IMAGE_ID" == *"REPLACE_ME"* ]]; then
  echo -e "${RED}ERROR: Please fill in all REPLACE_ME values in the script${NC}"
  echo ""
  echo "To find your values, run these OCI CLI commands:"
  echo ""
  echo "  # Compartment ID (use tenancy OCID if using root compartment):"
  echo "  oci iam compartment list --query 'data[].{name:name, id:id}' --output table"
  echo ""
  echo "  # Availability Domains:"
  echo "  oci iam availability-domain list --query 'data[].name' --output table"
  echo ""
  echo "  # Subnets:"
  echo "  oci network subnet list --compartment-id \$COMPARTMENT_ID --query 'data[].{name:\"display-name\", id:id}' --output table"
  echo ""
  echo "  # Ubuntu ARM images:"
  echo "  oci compute image list --compartment-id \$COMPARTMENT_ID --shape VM.Standard.A1.Flex --operating-system 'Canonical Ubuntu' --sort-by TIMECREATED --sort-order DESC --limit 3 --query 'data[].{name:\"display-name\", id:id}' --output table"
  exit 1
fi

if [ ! -f "$SSH_KEY_FILE" ]; then
  echo -e "${RED}ERROR: SSH key file not found: $SSH_KEY_FILE${NC}"
  echo "Generate one with: ssh-keygen -t ed25519 -f ~/.ssh/oracle_propmetrik"
  exit 1
fi

attempt=0

while [ $attempt -lt $MAX_RETRIES ]; do
  attempt=$((attempt + 1))
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  echo -e "${YELLOW}[$timestamp] Attempt $attempt/$MAX_RETRIES — Creating instance...${NC}"

  result=$(oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" \
    --availability-domain "$AVAILABILITY_DOMAIN" \
    --shape "VM.Standard.A1.Flex" \
    --shape-config "{\"ocpus\": $OCPUS, \"memoryInGBs\": $MEMORY_GB}" \
    --image-id "$IMAGE_ID" \
    --subnet-id "$SUBNET_ID" \
    --ssh-authorized-keys-file "$SSH_KEY_FILE" \
    --display-name "$INSTANCE_NAME" \
    --assign-public-ip true \
    --boot-volume-size-in-gbs $BOOT_VOLUME_GB \
    --metadata '{"user_data": ""}' \
    2>&1)

  if echo "$result" | grep -q '"lifecycle-state"'; then
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          ✅ INSTANCE CREATED SUCCESSFULLY!       ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""

    # Extract instance details
    instance_id=$(echo "$result" | jq -r '.data.id')
    echo "Instance ID: $instance_id"
    echo ""
    echo "Waiting for public IP assignment..."
    sleep 30

    # Get VNIC attachments to find public IP
    vnic_id=$(oci compute vnic-attachment list \
      --compartment-id "$COMPARTMENT_ID" \
      --instance-id "$instance_id" \
      --query 'data[0]."vnic-id"' \
      --raw-output 2>/dev/null)

    if [ -n "$vnic_id" ] && [ "$vnic_id" != "null" ]; then
      public_ip=$(oci network vnic get \
        --vnic-id "$vnic_id" \
        --query 'data."public-ip"' \
        --raw-output 2>/dev/null)

      if [ -n "$public_ip" ] && [ "$public_ip" != "null" ]; then
        echo -e "${GREEN}Public IP: $public_ip${NC}"
        echo ""
        echo "Connect with:"
        echo "  ssh -i ~/.ssh/oracle_propmetrik ubuntu@$public_ip"
      fi
    fi

    echo ""
    echo "Next: Upload and run oracle-cloud-setup.sh"
    exit 0
  fi

  # Check if it's an "Out of Capacity" error
  if echo "$result" | grep -qi "out of capacity\|out of host capacity\|capacity"; then
    echo -e "  ${YELLOW}Out of capacity — retrying in ${RETRY_INTERVAL}s...${NC}"
  elif echo "$result" | grep -qi "limit\|quota"; then
    echo -e "  ${RED}Account limit reached. You may already have Always Free instances.${NC}"
    echo "$result" | grep -i "message" || echo "$result"
    exit 1
  else
    echo -e "  ${RED}Unexpected error:${NC}"
    echo "$result" | head -5
    echo -e "  ${YELLOW}Retrying in ${RETRY_INTERVAL}s...${NC}"
  fi

  sleep $RETRY_INTERVAL
done

echo -e "${RED}Max retries ($MAX_RETRIES) reached. Instance not created.${NC}"
echo "Try a different Availability Domain or Region."
exit 1
