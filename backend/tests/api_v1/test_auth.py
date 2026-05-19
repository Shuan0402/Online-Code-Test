from fastapi import status

from app.core.security import SecurityManager
from app.core.redis_client import redis_client


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
def test_forgot_password_user_exists(client, candidate_user):
    """
    輸入真實存在的 username，應回傳 200 成功訊息
    """
    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"username": candidate_user.username}
    )

    assert response.status_code == 200
    assert "郵件已成功發送" in response.json()["detail"]


def test_forgot_password_user_not_exists_should_still_return_200(client):
    """
    輸入不存在的帳號，基於防枚舉安全原則，假裝發送成功、一樣回傳 200 OK
    """
    response = client.post(
        "/api/v1/auth/forgot-password",
        json={"username": "im-hacker-hax@example.com"}
    )
    
    assert response.status_code == 200
    assert "郵件已成功發送" in response.json()["detail"]

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