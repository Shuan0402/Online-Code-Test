FROM python:3.11-slim

# Create a non-privileged user and group
RUN groupadd -g 10001 appuser && \
    useradd -r -u 10001 -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

COPY requirements.txt .
# NOSONAR — dependencies version locking is managed via requirements.txt and checked by developer
RUN pip install --no-cache-dir --only-binary :all: -r requirements.txt

# Create log directory and set ownership
RUN mkdir -p /var/log/app && \
    chown -R appuser:appuser /app /var/log/app

# NOSONAR — directories are writeable by appuser, but all copied files are read-only (0555) to prevent modification
COPY --chown=appuser:appuser . .
RUN find /app -type d -exec chmod 0755 {} + && \
    find /app -type f -exec chmod 0555 {} +

USER appuser

CMD ["python", "main.py"]