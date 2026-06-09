FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as non-root user to follow the principle of least privilege.
RUN addgroup --system emailgroup && adduser --system --ingroup emailgroup emailuser \
 && chown -R emailuser:emailgroup /app
USER emailuser

CMD ["python", "main.py"]