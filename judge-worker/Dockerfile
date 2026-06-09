# judge-worker image — Step 8
#
# Build:   docker build -t judge-worker:dev judge-worker
# Or via:  docker compose build worker
#
# Runtime model: DooD (Docker-out-of-Docker).
# Worker container mounts host's /var/run/docker.sock and uses host's docker
# daemon to spawn sandbox containers as siblings (not nested).
# Step 9+ should migrate to a K8s Job spawner (or sysbox / rootless docker)
# to remove the host-root-equivalent privilege the docker.sock mount carries.
#
# Image only ships docker CLI (no daemon). Use the docker-cli debian package
# directly — docker.io used to bundle daemon+CLI, but Debian 13 (trixie) split
# the CLI into its own package, so installing docker.io alone now leaves the
# image without /usr/bin/docker and spawner subprocess.run(["docker", ...])
# fails with FileNotFoundError.

FROM python:3.13-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends docker-cli \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# requirements.txt first → leverage docker layer cache when only source changes
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# spawner package + worker entrypoint
COPY spawner /app/spawner
COPY worker.py /app/

# Run as non-root user to follow the principle of least privilege.
# Note: docker.sock access at runtime requires the compose GID mapping
# (see docker-compose.yml worker.group_add) rather than baking GID here.
RUN addgroup --system workergroup && adduser --system --ingroup workergroup workeruser \
 && chown -R workeruser:workergroup /app
USER workeruser

# WORKER_SECRET is required at startup (worker.main() exits if unset).
# Provide it via compose env / k8s Secret — do not bake into image.
CMD ["python3", "worker.py"]
