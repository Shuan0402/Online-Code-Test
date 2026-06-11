FROM python:3.11-slim

# Create a non-privileged user and group
RUN groupadd -g 10001 appuser && \
    useradd -r -u 10001 -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

ARG BUILD_ENV=production

# Copy ONLY the dependency manifest first, install, THEN copy the rest of the source.
COPY requirements.txt .
COPY requirements-dev.txt .
# NOSONAR — dependencies version locking is managed via requirements.txt and checked by developer
# PyPI can be slow from some networks; use longer timeout + retries (same pattern as backend-ci.yml).
RUN pip install --upgrade pip \
 && for attempt in 1 2 3 4 5; do \
        pip install --no-cache-dir \
            --default-timeout=180 \
            --retries 10 \
            --only-binary :all: \
            -r requirements.txt \
        && break \
        || { \
            if [ "$attempt" -eq 5 ]; then exit 1; fi; \
            echo "pip install requirements.txt failed (attempt ${attempt}/5), retrying in 10s..."; \
            sleep 10; \
        }; \
    done \
 && if [ "$BUILD_ENV" = "development" ] || [ "$BUILD_ENV" = "test" ]; then \
        for attempt in 1 2 3 4 5; do \
            pip install --no-cache-dir \
                --default-timeout=180 \
                --retries 10 \
                --only-binary :all: \
                -r requirements-dev.txt \
            && break \
            || { \
                if [ "$attempt" -eq 5 ]; then exit 1; fi; \
                echo "pip install requirements-dev.txt failed (attempt ${attempt}/5), retrying in 10s..."; \
                sleep 10; \
            }; \
        done; \
    fi

# Create log directory and set ownership
RUN mkdir -p /var/log/app && \
    chown -R appuser:appuser /app /var/log/app

# Source code last
# NOSONAR — directories are writeable by appuser, but all copied files are read-only (0555) to prevent modification
COPY --chown=appuser:appuser . .
RUN find /app -type d -exec chmod 0755 {} + && \
    find /app -type f -exec chmod 0555 {} +

USER appuser

EXPOSE 8000

CMD ["sh", "-c", "python app/db/init_db.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
