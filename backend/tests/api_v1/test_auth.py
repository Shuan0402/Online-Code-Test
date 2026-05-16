from fastapi import status

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