#!/usr/bin/env bash
# Runs ON the EC2 host. Provisioned by provision.sh via SSH.
# Inputs (env): PUBLIC_HOST (required), GIT_BRANCH (default: feat/aws-deploy)
set -euo pipefail

PUBLIC_HOST="${PUBLIC_HOST:?PUBLIC_HOST required, e.g. http://ec2-X-X-X-X.compute-1.amazonaws.com}"
GIT_BRANCH="${GIT_BRANCH:-feat/aws-deploy}"
REPO_URL="https://github.com/Shuan0402/Online-Code-Test.git"
REPO_DIR="/home/ec2-user/Online-Code-Test"

log() { echo ">> [ec2-setup] $*"; }

log "Installing docker + git"
sudo dnf update -y -q
sudo dnf install -y -q docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

log "Installing docker compose v2 plugin"
DOCKER_CONFIG=/usr/local/lib/docker
sudo mkdir -p "$DOCKER_CONFIG/cli-plugins"
sudo curl -fsSL https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64 \
  -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
sudo chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"

log "Cloning repo + checking out $GIT_BRANCH"
cd /home/ec2-user
if [ ! -d "$REPO_DIR" ]; then
  git clone "$REPO_URL"
fi
cd "$REPO_DIR"
git fetch origin
git checkout "$GIT_BRANCH"
git pull --ff-only

log "Generating .env from .env.prod.example"
cp .env.prod.example .env
gen_secret() { openssl rand -base64 32 | tr -d '\n=/+' | head -c 32; }
PG_PW=$(gen_secret)
MINIO_PW=$(gen_secret)
GRAFANA_PW=$(gen_secret)
JWT=$(openssl rand -base64 32 | tr -d '\n')
WSEC=$(openssl rand -base64 32 | tr -d '\n')

# Use | as sed delim because PUBLIC_HOST contains /
sed -i "s|^PUBLIC_HOST=.*|PUBLIC_HOST=$PUBLIC_HOST|" .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
sed -i "s|^WORKER_SECRET=.*|WORKER_SECRET=$WSEC|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG_PW|" .env
sed -i "s|^MINIO_PASSWORD=.*|MINIO_PASSWORD=$MINIO_PW|" .env
sed -i "s|^GRAFANA_PASSWORD=.*|GRAFANA_PASSWORD=$GRAFANA_PW|" .env

log "Building sandbox images (worker spawns these as siblings via DooD)"
sudo docker build -t sandbox:python judge-sandbox/images/python
sudo docker build -t sandbox:cpp judge-sandbox/images/cpp

log "Bringing up stack (first build ~8-15 min)"
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

log "Waiting for backend healthcheck"
for i in $(seq 1 90); do
  if sudo docker inspect -f '{{.State.Health.Status}}' online-code-test-backend-1 2>/dev/null | grep -q '^healthy$'; then
    log "Backend healthy"
    break
  fi
  sleep 10
  [ "$i" = "90" ] && { log "Timeout waiting for backend"; sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps; exit 1; }
done

log "Seeding manual test data"
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python -m app.scripts.seed_manual_test || \
  log "(seed failed — non-fatal, may already be seeded)"

log "Final status:"
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

log "DONE — open $PUBLIC_HOST in browser"
