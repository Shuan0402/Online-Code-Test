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
import time
from typing import Optional
from uuid import UUID

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError


log = logging.getLogger("app")


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
                    log.info(
                        f"儲存設施初始化：成功動態建立基礎儲存桶 -> {self._bucket}",
                        extra={"bucket": self._bucket, "action": "storage_bucket_created"}
                    )
                    return
                except ClientError as ce:
                    log.warning(
                        f"儲存設施警告：嘗試建立儲存桶 {self._bucket} 失敗！原因: {ce}",
                        extra={"bucket": self._bucket, "action": "storage_bucket_create_failed"}
                    )
                    return
            log.warning(
                f"儲存設施警告：無法對儲存桶 {self._bucket} 執行頭部檢查。原因: {e}",
                extra={"bucket": self._bucket, "action": "storage_bucket_head_failed"}
            )
        except Exception as e:
            # ConnectionError, DNS failure, etc. — MinIO unreachable.
            log.warning(
                f"儲存設施警告：開機 bootstrap 跳過（MinIO 目前無法連線: {e}）",
                extra={"bucket": self._bucket, "action": "storage_bootstrap_skipped"}
            )

    def upload_source(self, submission_id: UUID, source_code: str, language: str) -> str:
        """Put source under {bucket}/{submission_id}.{ext}. Returns s3://… URI."""
        ext = EXT_BY_LANGUAGE.get(language, "txt")
        key = f"{submission_id}.{ext}"

        storage_extra = {
            "submission_id": str(submission_id),
            "bucket": self._bucket,
            "s3_key": key,
            "language": language,
            "code_size_bytes": len(source_code.encode("utf-8")),
            "action": "storage_upload_source"
        }
        
        start_time = time.perf_counter()
        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=source_code.encode("utf-8"),
                ContentType="text/plain; charset=utf-8",
            )
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            storage_extra["duration_ms"] = duration_ms
            
            log.info(
                f"原始碼成功寫入物體儲存 | ID: {submission_id} (耗時: {duration_ms}ms)",
                extra=storage_extra
            )
            return f"s3://{self._bucket}/{key}"
            
        except ClientError as ce:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            aws_error_code = ce.response.get("Error", {}).get("Code", "UnknownClientError")
            
            storage_extra["duration_ms"] = duration_ms
            storage_extra["aws_error_code"] = aws_error_code
            storage_extra["action"] = "storage_upload_failed_client_error"
            
            log.error(
                f"物件儲存 Boto3 拒絕請求！[SubmissionID: {submission_id}] Code: {aws_error_code}",
                extra=storage_extra
            )
            raise ce
        except Exception as e:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            storage_extra["duration_ms"] = duration_ms
            storage_extra["action"] = "storage_upload_failed_unexpected"
            
            log.exception(
                f"物件儲存突發未知網路崩潰！[SubmissionID: {submission_id}]",
                extra=storage_extra
            )
            raise e

    def sign_get_url(self, s3_uri_or_key: str, expires_sec: Optional[int] = None) -> str:
        """Pre-signed HTTP GET URL. Accepts either `s3://bucket/key` or bare key."""
        if s3_uri_or_key.startswith("s3://"):
            rest = s3_uri_or_key[len("s3://"):]
            bucket, _, key = rest.partition("/")
        else:
            bucket = self._bucket
            key = s3_uri_or_key
        
        final_expires = expires_sec if expires_sec is not None else self._expires_sec

        try:
            presigned_url = self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=final_expires,
            )
            
            log.info(
                f"成功為任務物件生成時效性 Pre-signed 安全下載權杖 (TTL: {final_expires}s)",
                extra={
                    "bucket": bucket,
                    "s3_key": key,
                    "expires_sec": final_expires,
                    "action": "storage_presign_success"
                }
            )
            return presigned_url
        except Exception as e:
            log.exception(
                f"安全簽章失敗：無法為物件 {key} 產生 Pre-signed URL",
                extra={"bucket": bucket, "s3_key": key, "action": "storage_presign_failed"}
            )
            raise e


def build_storage_from_env() -> StorageService:
    """Construct a StorageService from process env. Called from get_storage dep."""
    return StorageService(
        endpoint=os.environ.get("MINIO_ENDPOINT", "http://minio:9000"),
        access_key=os.environ["MINIO_USER"],
        secret_key=os.environ["MINIO_PASSWORD"],
        bucket=os.environ.get("MINIO_BUCKET", "octest-submissions"),
        expires_sec=int(os.environ.get("MINIO_PRESIGN_EXPIRES_SEC", "600")),
    )
