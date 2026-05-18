"""
StorageService integration tests — real MinIO.

Marked @pytest.mark.integration; default suite skips them. Run from inside
the backend container (it has all deps + compose DNS reaches minio):

    docker compose exec backend pytest -m integration -v

The endpoint URL comes from env: backend container has MINIO_ENDPOINT=
http://minio:9000 injected by compose. To run from host shell instead,
export MINIO_ENDPOINT=http://localhost:9000 + MINIO_USER + MINIO_PASSWORD.

Coverage:
  - bucket auto-create on first use
  - upload_source → object readable via presigned URL
  - presigned URL respects expires_sec (negative case: short-expiry then wait)
"""

import os
import time
import uuid

import pytest
import httpx

from app.services.storage import StorageService


pytestmark = pytest.mark.integration


@pytest.fixture
def real_storage():
    user = os.environ.get("MINIO_USER")
    password = os.environ.get("MINIO_PASSWORD")
    if not user or not password:
        pytest.skip("MINIO_USER / MINIO_PASSWORD env not set")

    # Container injects MINIO_ENDPOINT=http://minio:9000; host shell can
    # override with MINIO_ENDPOINT=http://localhost:9000 (exposed port).
    endpoint = os.environ.get("MINIO_ENDPOINT", "http://localhost:9000")

    # Unique bucket per test run so we don't collide with dev data
    bucket = f"test-storage-{uuid.uuid4().hex[:8]}"
    s = StorageService(
        endpoint=endpoint,
        access_key=user,
        secret_key=password,
        bucket=bucket,
        expires_sec=600,
    )
    s.ensure_bucket()
    yield s
    # Cleanup: best-effort delete all objects + bucket
    try:
        listing = s._client.list_objects_v2(Bucket=bucket).get("Contents", [])
        for obj in listing:
            s._client.delete_object(Bucket=bucket, Key=obj["Key"])
        s._client.delete_bucket(Bucket=bucket)
    except Exception:
        pass


def test_upload_then_fetch_via_presigned_url(real_storage):
    """End-to-end: upload python source → sign URL → requests.get matches body."""
    sub_id = uuid.uuid4()
    source = "a, b = map(int, input().split())\nprint(a + b)\n"

    uri = real_storage.upload_source(sub_id, source, "python")
    assert uri == f"s3://{real_storage.bucket}/{sub_id}.py"

    url = real_storage.sign_get_url(uri)
    assert "X-Amz-Signature" in url

    resp = httpx.get(url, timeout=5)
    assert resp.status_code == 200
    assert resp.text == source


def test_presigned_url_expires(real_storage):
    """1-second expiry then sleep → 403 SignatureDoesNotMatch / expired."""
    sub_id = uuid.uuid4()
    real_storage.upload_source(sub_id, "ok\n", "python")
    url = real_storage.sign_get_url(f"s3://{real_storage.bucket}/{sub_id}.py", expires_sec=1)

    time.sleep(2)
    resp = httpx.get(url, timeout=5)
    assert resp.status_code == 403
