from fastapi import status
import json
from unittest.mock import MagicMock

from app.core.security import SecurityManager
from app.core.redis_client import redis_client
from app.services.queue_manager import queue_manager


# --- POST /login (使用者登入) ---
def test_login_success(client, create_test_user):
    """
    測試正常登入流程。
    """
    create_test_user(username="auth_test_user")
    
    login_data = {
        "username": "auth_test_user",
        "password": "testpassword123"
    }
    response = client.post("/api/v1/auth/login", data=login_data)

    assert response.status_code == 200
    assert "access_token" in response.json()
    assert "refresh_token" in response.json()
    assert "token_type" in response.json()
    assert "role" in response.json()
    assert "user_id" in response.json()

def test_login_wrong_password(client, create_test_user):
    """
    測試密碼錯誤的情況。
    """
    create_test_user(username="auth_test_user")
    login_data = {
        "username": "auth_test_user",
        "password": "wrongpassword"
    }
    response = client.post("/api/v1/auth/login", data=login_data)
    
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "帳號或密碼錯誤"

def test_login_non_existent_user(client):
    """
    測試帳號不存在的情況。
    """
    login_data = {
        "username": "nobody_here",
        "password": "somepassword"
    }
    response = client.post("/api/v1/auth/login", data=login_data)
    
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

 # --- POST /logout (使用者登出) ---
def test_logout_authenticated(client, create_test_user):
    """
    測試已登入使用者執行登出。
    """
    create_test_user(username="auth_test_user")
    
    login_data = {"username": "auth_test_user", "password": "testpassword123"}
    login_res = client.post("/api/v1/auth/login", data=login_data)
    assert login_res.status_code == 200, f"登入失敗: {login_res.json()}"
    
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.post("/api/v1/auth/logout", headers=headers)
    assert response.status_code == 200
    assert response.json()["detail"] == "已成功登出"
    
def test_logout_unauthenticated(client):
    """
    測試未登入（未帶 Token）請求登出。
    """
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

# --- POST /refresh (重整 Token) ---
def test_refresh_token_lifecycle_success(client, candidate_user):
    """
    產生合法 refresh token 應成功換回 access token
    """
    refresh_token = SecurityManager.create_refresh_token(subject=candidate_user.id)
    
    response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_refresh_token_rejected_if_in_blacklist(client, candidate_user):
    """
    已被塞入 Redis 黑名單的 Token 戳 API 應回傳 401
    """
    refresh_token = SecurityManager.create_refresh_token(subject=candidate_user.id)
    
    redis_client.setex(f"blacklist:{refresh_token}", 100, "true")
    
    response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token}
    )
    
    assert response.status_code == 401
    assert "已失效" in response.json()["detail"]

# --- POST /forgot-password (忘記密碼) ---
def test_forgot_password_user_exists(client, candidate_user, monkeypatch):
    """
    輸入真實存在的 username，應回傳 200 成功訊息
    """
    mock_push = MagicMock()
    monkeypatch.setattr(queue_manager, "push_to_queue", mock_push)

    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"username": candidate_user.username}
    )

    assert response.status_code == 200
    assert "重設密碼的郵件已成功發送" in response.json()["detail"]

    expected_email = candidate_user.username
    if "@" not in expected_email:
        expected_email = f"{expected_email}@mock-test.com"
    
    mock_push.assert_called_once()

    args, kwargs = mock_push.call_args
    
    actual_queue_name = kwargs.get("queue_name") or args[0]
    
    actual_payload = None
    if kwargs:
        remaining_kwargs = {k: v for k, v in kwargs.items() if k != "queue_name"}
        if remaining_kwargs:
            actual_payload = list(remaining_kwargs.values())[0]
            
    if not actual_payload and len(args) > 1:
        actual_payload = args[1]

    assert actual_queue_name == "messages:email"
    
    if hasattr(actual_payload, "model_dump"):
        payload_dict = actual_payload.model_dump()
    elif hasattr(actual_payload, "dict"):
        payload_dict = actual_payload.dict()
    else:
        payload_dict = actual_payload

    assert payload_dict["task_type"] == "PASSWORD_RESET"
    assert payload_dict["to_email"] == expected_email
    assert "reset_url" in payload_dict["context"]


def test_forgot_password_user_not_exists_should_still_return_200(client, monkeypatch):
    """
    輸入不存在的帳號，基於防枚舉安全原則，假裝發送成功、一樣回傳 200 OK
    """
    mock_push = MagicMock()
    monkeypatch.setattr(queue_manager, "push_to_queue", mock_push)

    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"username": "nobody_exists_in_nthu@nthu.edu.tw"}
    )
    
    assert response.status_code == 200
    assert "重設密碼的郵件已成功發送" in response.json()["detail"]

    assert mock_push.call_count == 0

# --- POST /reset-password (重設密碼) ---
def test_reset_password_success(client, db_session, candidate_user):
    """
    持有合法的 reset token 應成功修改資料庫密碼
    """
    token = SecurityManager.create_password_reset_token(subject=candidate_user.id)
    
    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "NewSecurePassword123!"}
    )
    
    assert response.status_code == 200
    assert "密碼已變更成功" in response.json()["detail"]
    
    db_session.refresh(candidate_user)
    assert SecurityManager.verify_password("NewSecurePassword123!", candidate_user.password_hash) is True


def test_reset_password_replay_attack_prevented(client, candidate_user):
    """
    同一個 Token 企圖重設密碼兩次（重播攻擊），第二次應回傳 400
    """
    token = SecurityManager.create_password_reset_token(subject=candidate_user.id)
    
    res1 = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Pass1!"})
    assert res1.status_code == 200
    
    res2 = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Pass2!"})
    assert res2.status_code == 400
    assert "已失效或已被使用" in res2.json()["detail"]


# --- POST /refresh Edge Cases ---

def test_refresh_token_invalid_type(client, candidate_user):
    """
    使用 Access Token (非 Refresh Token) 去戳 /refresh 應該被拒絕，回傳 401。
    """
    # 建立 access token
    access_token = SecurityManager.create_access_token(subject=candidate_user.id)
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
    assert response.status_code == 401
    assert "無效的憑證類型" in response.json()["detail"]


def test_refresh_token_expired_or_corrupt(client):
    """
    使用過期或損毀的 JWT Token 戳 /refresh，應回傳 401。
    """
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": "corrupt.token.here"})
    assert response.status_code == 401
    assert "已過期或損毀" in response.json()["detail"]


def test_refresh_token_user_not_found(client, db_session):
    """
    Refresh Token 結構有效，但該使用者已被刪除，應回傳 404。
    """
    import uuid
    non_existent_id = uuid.uuid4()
    refresh_token = SecurityManager.create_refresh_token(subject=non_existent_id)
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 404
    assert "找不到對應的使用者" in response.json()["detail"]


# --- POST /forgot-password Edge Cases ---

def test_forgot_password_x_forwarded_for(client, candidate_user, monkeypatch):
    """
    忘記密碼請求帶有 X-Forwarded-For 標頭時，應正確解析客戶端 IP。
    """
    mock_push = MagicMock()
    monkeypatch.setattr(queue_manager, "push_to_queue", mock_push)

    headers = {"X-Forwarded-For": "203.0.113.195, 70.41.3.18"}
    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"username": candidate_user.username},
        headers=headers
    )
    assert response.status_code == 200
    assert mock_push.call_count == 1


def test_forgot_password_no_client_info(client, candidate_user, monkeypatch):
    """
    在沒有 client 資訊的極端情況下，IP 應安全回退為 0.0.0.0。
    """
    mock_push = MagicMock()
    monkeypatch.setattr(queue_manager, "push_to_queue", mock_push)

    from fastapi import Request
    # 模擬 request.client 為 None，且無 X-Forwarded-For
    monkeypatch.setattr(Request, "client", None, raising=False)

    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"username": candidate_user.username}
    )
    assert response.status_code == 200
    assert mock_push.call_count == 1


def test_forgot_password_email_already_contains_at(client, create_test_user, monkeypatch):
    """
    當 username 已經是帶有 @ 的信箱格式時，不應重複附加後綴。
    """
    mock_push = MagicMock()
    monkeypatch.setattr(queue_manager, "push_to_queue", mock_push)

    user = create_test_user(username="test_email@example.com")

    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"username": "test_email@example.com"}
    )
    assert response.status_code == 200
    mock_push.assert_called_once()
    args, kwargs = mock_push.call_args
    payload = kwargs.get("data") or args[1]
    
    assert payload["to_email"] == "test_email@example.com"  # 維持原樣，沒有加 @mock-test.com


def test_forgot_password_queue_push_failure(client, candidate_user, monkeypatch):
    """
    模擬 Redis 發信任務佇列推送失敗時，回傳 503 服務不可用。
    """
    # 模擬佇列推送失敗 (回傳 False)
    monkeypatch.setattr(queue_manager, "push_to_queue", lambda queue_name, data: False)

    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"username": candidate_user.username}
    )
    assert response.status_code == 503
    assert "郵件調度伺服器繁忙" in response.json()["detail"]


# --- POST /reset-password Edge Cases ---

def test_reset_password_invalid_token_type(client, candidate_user):
    """
    使用 Refresh Token 去戳 /reset-password 應該被拒絕，回傳 400。
    """
    token = SecurityManager.create_refresh_token(subject=candidate_user.id)
    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "NewPassword123!"}
    )
    assert response.status_code == 400
    assert "憑證類型錯誤" in response.json()["detail"]


def test_reset_password_expired_or_corrupt(client):
    """
    使用損毀或過期的 Token 去重設密碼，應回傳 400。
    """
    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": "corrupt.reset.token", "new_password": "NewPassword123!"}
    )
    assert response.status_code == 400
    assert "重設密碼連結已過期或毀損" in response.json()["detail"]


def test_reset_password_user_inactive(client, db_session, candidate_user):
    """
    當對應的使用者被停用 (is_active = False) 時，應回傳 404。
    """
    token = SecurityManager.create_password_reset_token(subject=candidate_user.id)
    
    # 停用該使用者
    candidate_user.is_active = False
    db_session.commit()

    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "NewPassword123!"}
    )
    assert response.status_code == 404
    assert "該帳號不存在或已被停用" in response.json()["detail"]


def test_reset_password_user_deleted(client, db_session, candidate_user):
    """
    當對應的使用者被刪除時，應回傳 404。
    """
    token = SecurityManager.create_password_reset_token(subject=candidate_user.id)
    
    # 從資料庫刪除該使用者
    db_session.delete(candidate_user)
    db_session.commit()

    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "NewPassword123!"}
    )
    assert response.status_code == 404
    assert "該帳號不存在或已被停用" in response.json()["detail"]