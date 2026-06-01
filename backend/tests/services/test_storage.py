"""
StorageService unit tests — mock boto3 client, no MinIO needed.

Goal: verify we call boto3 with the right params for the contract
(bucket / key shape, signing options, soft-fail policy).
"""

import uuid
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from app.services.storage import StorageService, EXT_BY_LANGUAGE


# ── fixtures ───────────────────────────────────────────────────────


@pytest.fixture
def storage_with_mock_client():
    """Bypass __init__ boto3.client(...) by patching after construction."""
    s = StorageService(
        endpoint="http://minio:9000",
        access_key="user",
        secret_key="pass",
        bucket="octest-submissions",
        expires_sec=600,
    )
    s._client = MagicMock()
    s._signing_client = s._client
    return s


# ── upload_source ──────────────────────────────────────────────────


def test_upload_source_put_object_with_correct_key_and_body(storage_with_mock_client):
    s = storage_with_mock_client
    sub_id = uuid.uuid4()
    s.upload_source(sub_id, "print('hi')\n", "python")

    s._client.put_object.assert_called_once()
    kwargs = s._client.put_object.call_args.kwargs
    assert kwargs["Bucket"] == "octest-submissions"
    assert kwargs["Key"] == f"{sub_id}.py"
    assert kwargs["Body"] == b"print('hi')\n"
    assert kwargs["ContentType"].startswith("text/plain")


def test_upload_source_returns_s3_uri(storage_with_mock_client):
    sub_id = uuid.uuid4()
    uri = storage_with_mock_client.upload_source(sub_id, "x=1\n", "python")
    assert uri == f"s3://octest-submissions/{sub_id}.py"


def test_upload_source_cpp_uses_cpp_extension(storage_with_mock_client):
    sub_id = uuid.uuid4()
    uri = storage_with_mock_client.upload_source(sub_id, "int main(){}\n", "cpp")
    key_in_uri = uri.rsplit("/", 1)[1]
    assert key_in_uri == f"{sub_id}.cpp"


def test_upload_source_unknown_language_falls_back_to_txt(storage_with_mock_client):
    """Defensive: worker won't be asked to run unknown language, but DB write
    shouldn't crash if backend ever sees a new language before the mapping
    updates."""
    sub_id = uuid.uuid4()
    uri = storage_with_mock_client.upload_source(sub_id, "...", "rust")
    assert uri.endswith(".txt")


# ── sign_get_url ───────────────────────────────────────────────────


def test_sign_get_url_calls_generate_presigned_url(storage_with_mock_client):
    s = storage_with_mock_client
    s._client.generate_presigned_url.return_value = "http://minio:9000/signed-url"

    url = s.sign_get_url("s3://octest-submissions/abc.py")

    assert url == "http://minio:9000/signed-url"
    s._client.generate_presigned_url.assert_called_once_with(
        "get_object",
        Params={"Bucket": "octest-submissions", "Key": "abc.py"},
        ExpiresIn=600,
    )


def test_sign_get_url_accepts_bare_key(storage_with_mock_client):
    s = storage_with_mock_client
    s._client.generate_presigned_url.return_value = "url"

    s.sign_get_url("abc.py")

    kwargs = s._client.generate_presigned_url.call_args
    params = kwargs.args[1] if len(kwargs.args) > 1 else kwargs.kwargs["Params"]
    assert params["Bucket"] == "octest-submissions"
    assert params["Key"] == "abc.py"


def test_sign_get_url_custom_expires(storage_with_mock_client):
    s = storage_with_mock_client
    s._client.generate_presigned_url.return_value = "url"

    s.sign_get_url("abc.py", expires_sec=30)

    assert s._client.generate_presigned_url.call_args.kwargs["ExpiresIn"] == 30


def test_sign_get_url_zero_expires_passes_through(storage_with_mock_client):
    """expires_sec=0 should NOT fall back to default (None vs 0 distinction)."""
    s = storage_with_mock_client
    s._client.generate_presigned_url.return_value = "url"

    s.sign_get_url("abc.py", expires_sec=0)

    assert s._client.generate_presigned_url.call_args.kwargs["ExpiresIn"] == 0


# ── ensure_bucket ──────────────────────────────────────────────────


def test_ensure_bucket_no_op_when_exists(storage_with_mock_client):
    s = storage_with_mock_client
    s._client.head_bucket.return_value = {}

    s.ensure_bucket()

    s._client.head_bucket.assert_called_once_with(Bucket="octest-submissions")
    s._client.create_bucket.assert_not_called()


def test_ensure_bucket_creates_when_missing(storage_with_mock_client):
    s = storage_with_mock_client
    s._client.head_bucket.side_effect = ClientError(
        {"Error": {"Code": "404", "Message": "Not Found"}}, "HeadBucket"
    )

    s.ensure_bucket()

    s._client.create_bucket.assert_called_once_with(Bucket="octest-submissions")


def test_ensure_bucket_soft_fails_on_unreachable_minio(storage_with_mock_client):
    """ConnectionError / DNS fail / etc. → log warning, don't raise.

    Otherwise FastAPI startup crashes during tests that don't have MinIO.
    """
    s = storage_with_mock_client
    s._client.head_bucket.side_effect = ConnectionError("nodename not known")

    # Must not raise
    s.ensure_bucket()


def test_ensure_bucket_soft_fails_on_create_error(storage_with_mock_client):
    """Bucket missing + create fails (e.g. AccessDenied) → log + return, no raise."""
    s = storage_with_mock_client
    s._client.head_bucket.side_effect = ClientError(
        {"Error": {"Code": "404", "Message": "Not Found"}}, "HeadBucket"
    )
    s._client.create_bucket.side_effect = ClientError(
        {"Error": {"Code": "AccessDenied", "Message": "denied"}}, "CreateBucket"
    )

    # Must not raise
    s.ensure_bucket()


def test_storage_bucket_property(storage_with_mock_client):
    s = storage_with_mock_client
    assert s.bucket == "octest-submissions"


def test_ensure_bucket_head_fails_other_code(storage_with_mock_client):
    s = storage_with_mock_client
    s._client.head_bucket.side_effect = ClientError(
        {"Error": {"Code": "403", "Message": "Forbidden"}}, "HeadBucket"
    )
    s.ensure_bucket()


def test_upload_source_client_error(storage_with_mock_client):
    s = storage_with_mock_client
    s._client.put_object.side_effect = ClientError(
        {"Error": {"Code": "AccessDenied", "Message": "denied"}}, "PutObject"
    )
    with pytest.raises(ClientError):
        s.upload_source(uuid.uuid4(), "print(1)", "python")


def test_upload_source_general_exception(storage_with_mock_client):
    s = storage_with_mock_client
    s._client.put_object.side_effect = Exception("General network collapse")
    with pytest.raises(Exception, match="General network collapse"):
        s.upload_source(uuid.uuid4(), "print(1)", "python")


def test_sign_get_url_general_exception(storage_with_mock_client):
    s = storage_with_mock_client
    s._client.generate_presigned_url.side_effect = Exception("HMAC fail")
    with pytest.raises(Exception, match="HMAC fail"):
        s.sign_get_url("abc.py")
