FROM python:3.11-slim

# Create a non-privileged user and group
RUN groupadd -g 10001 appuser && \
    useradd -r -u 10001 -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create log directory and set ownership
RUN mkdir -p /var/log/app && \
    chown -R appuser:appuser /app /var/log/app

COPY --chown=appuser:appuser . .

USER appuser

CMD ["python", "main.py"]