FROM python:3.11-slim

# Create a non-privileged user and group
RUN groupadd -g 10001 appuser && \
    useradd -r -u 10001 -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

ARG BUILD_ENV=production

# Copy ONLY the dependency manifest first, install, THEN copy the rest of the source.
COPY requirements.txt .
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && if [ "$BUILD_ENV" = "development" ] || [ "$BUILD_ENV" = "test" ]; then \
        pip install --no-cache-dir -r requirements-dev.txt; \
    fi

# Create log directory and set ownership
RUN mkdir -p /var/log/app && \
    chown -R appuser:appuser /app /var/log/app

# Source code last
COPY --chown=appuser:appuser --chmod=0555 . .

USER appuser

EXPOSE 8000

CMD ["sh", "-c", "python app/db/init_db.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
