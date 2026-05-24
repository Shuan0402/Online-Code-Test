FROM python:3.11-slim

WORKDIR /app

ARG BUILD_ENV=production

# Copy ONLY the dependency manifest first, install, THEN copy the rest of the source.
# Frequently-changing files (source code) live at the bottom so they don't
# invalidate the expensive pip-install layer above them.
COPY requirements.txt .
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && if [ "$BUILD_ENV" = "development" ] || [ "$BUILD_ENV" = "test" ]; then \
        pip install --no-cache-dir -r requirements-dev.txt; \
    fi

# Source code last — this layer is the only one that rebuilds on code edits.
COPY . .

EXPOSE 8000

CMD ["sh", "-c", "python app/db/init_db.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
