import pytest
from fastapi import status

def test_login_success(client):
    """
    測試正常登入流程。
    """
    user_data = {
        "username": "auth_test_user",
        "full_name": "Auth Tester",
        "password": "testpassword123",
        "role": "Candidate"
    }
    client.post("/api/v1/users/", json=user_data)

    login_data = {
        "username": "auth_test_user",
        "password": "testpassword123"
    }
    response = client.post("/api/v1/auth/login", data=login_data)

    assert response.status_code == status.HTTP_200_OK
    content = response.json()
    assert "access_token" in content
    assert content["token_type"] == "bearer"

def test_login_wrong_password(client):
    """
    測試密碼錯誤的情況。
    """
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