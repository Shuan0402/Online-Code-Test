"""
MinIO / S3-compatible storage helper.

Used by:
  - Backend POST /submissions: upload_source() writes user code to MinIO,
    then sign_get_url() produces the URL embedded in the queue payload.
  - Worker (judge-worker) consumes that URL via requests.get() — does not
    talk to MinIO through this module.

DB Submission.code_s3_url stores the permanent `s3://bucket/key` URI
(rejudge / audit). The queue payload's `presigned_url` is the short-lived
HTTP URL — they are different shapes of the same object (see contracts.md).

Signing is purely local (HMAC); MinIO is only contacted at upload time
and when the worker later GETs the signed URL.
"""

import logging
import os
from typing import Optional
from uuid import UUID

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError


log = logging.getLogger(__name__)


# language → file extension (對齊 judge-worker SOURCE_FILENAME_BY_LANGUAGE)
EXT_BY_LANGUAGE = {
    "python": "py",
    "cpp": "cpp",
}


class StorageService:
    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        expires_sec: int = 600,
    ):
        self._endpoint = endpoint
        self._bucket = bucket
        self._expires_sec = expires_sec
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="us-east-1",                # MinIO accepts any region
            config=Config(signature_version="s3v4"),
        )

    @property
    def bucket(self) -> str:
        return self._bucket

    def ensure_bucket(self) -> None:
        """Idempotent bucket bootstrap.

        Soft-fail policy: a startup-time MinIO outage logs a warning instead
        of crashing the backend, so tests / CI without MinIO still boot.
        Production bucket creation should happen at deploy time (e.g. `mc mb`)
        — this is a dev-convenience safety net.
        """
        try:
            self._client.head_bucket(Bucket=self._bucket)
            return
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in ("404", "NoSuchBucket"):
                try:
                    self._client.create_bucket(Bucket=self._bucket)
                    log.info("storage: created bucket %s", self._bucket)
                    return
                except ClientError as ce:
                    log.warning("storage: could not create bucket %s: %s", self._bucket, ce)
                    return
            log.warning("storage: could not check bucket %s: %s", self._bucket, e)
        except Exception as e:
            # ConnectionError, DNS failure, etc. — MinIO unreachable.
            log.warning("storage: init skipped (MinIO unreachable: %s)", e)

    def upload_source(self, submission_id: UUID, source_code: str, language: str) -> str:
        """Put source under {bucket}/{submission_id}.{ext}. Returns s3://… URI."""
        ext = EXT_BY_LANGUAGE.get(language, "txt")
        key = f"{submission_id}.{ext}"
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=source_code.encode("utf-8"),
            ContentType="text/plain; charset=utf-8",
        )
        return f"s3://{self._bucket}/{key}"

    def sign_get_url(self, s3_uri_or_key: str, expires_sec: Optional[int] = None) -> str:
        """Pre-signed HTTP GET URL. Accepts either `s3://bucket/key` or bare key."""
        if s3_uri_or_key.startswith("s3://"):
            rest = s3_uri_or_key[len("s3://"):]
            bucket, _, key = rest.partition("/")
        else:
            bucket = self._bucket
            key = s3_uri_or_key
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_sec if expires_sec is not None else self._expires_sec,
        )


def build_storage_from_env() -> StorageService:
    """Construct a StorageService from process env. Called from get_storage dep."""
    return StorageService(
        endpoint=os.environ.get("MINIO_ENDPOINT", "http://minio:9000"),
        access_key=os.environ["MINIO_USER"],
        secret_key=os.environ["MINIO_PASSWORD"],
        bucket=os.environ.get("MINIO_BUCKET", "octest-submissions"),
        expires_sec=int(os.environ.get("MINIO_PRESIGN_EXPIRES_SEC", "600")),
    )
