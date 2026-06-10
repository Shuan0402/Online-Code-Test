#!/usr/bin/env bash
# Provision a single-EC2 deploy of Online Code Test on a personal AWS account.
# Idempotent: re-running reuses existing key pair / SG / EIP by name.
#
# Usage:
#   aws configure        # one-off — input access key + secret + region
#   ./provision.sh       # creates EC2 + EIP + SG + SSHes in + runs ec2-setup.sh
#
# Override region via env: AWS_DEFAULT_REGION=us-east-1 ./provision.sh
set -euo pipefail

# --- CONFIG ---
NAME="octest-prod"
INSTANCE_TYPE="t3.large"
VOLUME_SIZE=30
REGION="${AWS_DEFAULT_REGION:-ap-northeast-1}"
KEY_NAME="${NAME}-key"
SG_NAME="${NAME}-sg"
PEM_PATH="$HOME/.ssh/${KEY_NAME}.pem"
GIT_BRANCH="${GIT_BRANCH:-feat/aws-deploy}"

log() { echo ">> [provision] $*"; }
die() { echo "!! $*" >&2; exit 1; }

# --- Precheck ---
command -v aws >/dev/null || die "aws CLI not installed (brew install awscli)"
aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1 \
  || die "aws CLI not configured. Run: aws configure"

log "Region: $REGION"
log "Caller: $(aws sts get-caller-identity --query 'Arn' --output text --region "$REGION")"

# --- Get latest AL2023 AMI ---
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters 'Name=name,Values=al2023-ami-2023.*-x86_64' \
            'Name=state,Values=available' \
  --query 'sort_by(Images, &CreationDate) | [-1].ImageId' \
  --output text --region "$REGION")
[ -n "$AMI_ID" ] && [ "$AMI_ID" != "None" ] || die "could not resolve AL2023 AMI"
log "AMI: $AMI_ID"

# --- Default VPC ---
VPC_ID=$(aws ec2 describe-vpcs \
  --filters 'Name=is-default,Values=true' \
  --query 'Vpcs[0].VpcId' --output text --region "$REGION")
[ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ] || die "no default VPC in $REGION"
log "VPC: $VPC_ID"

# --- My IP for SSH rule ---
MY_IP="$(curl -fsS https://checkip.amazonaws.com)/32"
log "SSH source restricted to: $MY_IP"

# --- Key pair ---
if [ ! -f "$PEM_PATH" ]; then
  # Delete any orphan key in AWS by the same name to avoid InvalidKeyPair.Duplicate
  aws ec2 delete-key-pair --key-name "$KEY_NAME" --region "$REGION" 2>/dev/null || true
  mkdir -p "$(dirname "$PEM_PATH")"
  aws ec2 create-key-pair --key-name "$KEY_NAME" \
    --query 'KeyMaterial' --output text --region "$REGION" > "$PEM_PATH"
  chmod 400 "$PEM_PATH"
  log "Key pair created: $PEM_PATH"
else
  log "Key pair exists locally: $PEM_PATH (reusing)"
fi

# --- Security group ---
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$REGION" 2>/dev/null || echo "None")
if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  SG_ID=$(aws ec2 create-security-group \
    --group-name "$SG_NAME" --description "octest prod" --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text --region "$REGION")
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 22 --cidr "$MY_IP" --region "$REGION" >/dev/null
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$REGION" >/dev/null
  log "Security group created: $SG_ID"
else
  log "Security group exists: $SG_ID (reusing)"
  # Best-effort: ensure SSH rule covers current IP (ignore duplicate-rule error)
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --protocol tcp --port 22 --cidr "$MY_IP" --region "$REGION" 2>/dev/null || true
fi

# --- Launch instance (reuse by Name tag if running/stopped) ---
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=running,stopped,pending" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text --region "$REGION" 2>/dev/null || echo "None")

if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
  INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --block-device-mappings "[{\"DeviceName\":\"/dev/xvda\",\"Ebs\":{\"VolumeSize\":$VOLUME_SIZE,\"VolumeType\":\"gp3\"}}]" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
    --query 'Instances[0].InstanceId' --output text --region "$REGION")
  log "Instance launched: $INSTANCE_ID"
else
  log "Instance exists: $INSTANCE_ID (reusing)"
  STATE=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].State.Name' --output text --region "$REGION")
  if [ "$STATE" = "stopped" ]; then
    aws ec2 start-instances --instance-ids "$INSTANCE_ID" --region "$REGION" >/dev/null
    log "Instance was stopped — starting"
  fi
fi

log "Waiting for instance to be running..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

# --- Elastic IP ---
EIP_ALLOC=$(aws ec2 describe-addresses \
  --filters "Name=tag:Name,Values=$NAME" \
  --query 'Addresses[0].AllocationId' --output text --region "$REGION" 2>/dev/null || echo "None")
if [ "$EIP_ALLOC" = "None" ] || [ -z "$EIP_ALLOC" ]; then
  EIP_ALLOC=$(aws ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME}]" \
    --query 'AllocationId' --output text --region "$REGION")
  log "EIP allocated: $EIP_ALLOC"
else
  log "EIP exists: $EIP_ALLOC (reusing)"
fi

aws ec2 associate-address --allocation-id "$EIP_ALLOC" --instance-id "$INSTANCE_ID" \
  --region "$REGION" >/dev/null
log "EIP associated to $INSTANCE_ID"

# Re-fetch instance metadata AFTER EIP associate (public DNS changes)
sleep 3
PUBLIC_DNS=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicDnsName' --output text --region "$REGION")
PUBLIC_IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text --region "$REGION")
log "Public DNS: $PUBLIC_DNS"
log "Public IP:  $PUBLIC_IP"

# --- Wait SSH ready ---
log "Waiting for SSH (~30-60s)..."
for i in $(seq 1 24); do
  if ssh -i "$PEM_PATH" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
       -o ConnectTimeout=5 -o BatchMode=yes ec2-user@"$PUBLIC_IP" 'echo ready' >/dev/null 2>&1; then
    log "SSH ready"
    break
  fi
  sleep 5
  [ "$i" = "24" ] && die "SSH did not become ready in 2 min"
done

# --- scp setup script + run ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log "Uploading ec2-setup.sh"
scp -i "$PEM_PATH" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  "$SCRIPT_DIR/ec2-setup.sh" ec2-user@"$PUBLIC_IP":/tmp/ec2-setup.sh

log "Running ec2-setup.sh on EC2 (this will stream output; ~10-15 min)"
ssh -i "$PEM_PATH" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  ec2-user@"$PUBLIC_IP" \
  "PUBLIC_HOST=http://$PUBLIC_DNS GIT_BRANCH=$GIT_BRANCH bash /tmp/ec2-setup.sh"

cat <<EOF

==================================================
 DEPLOY COMPLETE
--------------------------------------------------
 URL:        http://$PUBLIC_DNS
 SSH:        ssh -i $PEM_PATH ec2-user@$PUBLIC_IP
 Region:     $REGION
 Instance:   $INSTANCE_ID
 EIP alloc:  $EIP_ALLOC
==================================================
EOF
