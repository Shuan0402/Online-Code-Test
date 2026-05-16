from app.models.enums import UserRole


def test_create_user_api(client):
    data = {
        "username": "api_test_user",
        "full_name": "API Tester",
        "password": "testpassword123",
        "role": "Candidate"
    }

    response = client.post("/api/v1/users/", json=data)
    content = response.json()

    assert response.status_code == 200
    assert content["username"] == "api_test_user"
    assert "id" in content

# --- GET /users/me (獲取當前登入者資訊) ---
def test_get_me_success(client, candidate_user, override_auth):
    """
    已登入的使用者訪問 /users/me，應該成功獲取自身詳細資訊。
    """
    override_auth(candidate_user)
    
    response = client.get("/api/v1/users/me")
    
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == candidate_user.username
    assert data["full_name"] == candidate_user.full_name
    assert data["role"] == UserRole.Candidate.value
    assert "id" in data
    assert "created_at" in data


def test_get_me_unauthenticated(client):
    """
    未登入直接訪問 /me，應被 401 拒絕。
    """
    response = client.get("/api/v1/users/me")
    
    assert response.status_code == 401