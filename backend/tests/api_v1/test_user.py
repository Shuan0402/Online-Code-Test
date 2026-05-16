import uuid

from app.models.enums import UserRole


# --- POST /users/ (建立新使用者) ---
def test_create_user_success_by_admin(client, admin_user, override_auth):
    """
    最高權限 Admin 建立新使用者，應該成功通關並回傳 201。
    """
    override_auth(admin_user)
    
    data = {
        "username": "new_student_99",
        "full_name": "New Student",
        "password": "strong_password123",
        "role": "Candidate"
    }
    
    response = client.post("/api/v1/users/", json=data)
    
    assert response.status_code == 201
    content = response.json()
    assert content["username"] == "new_student_99"
    assert "id" in content


def test_create_user_success_by_interviewer(client, interviewer_user, override_auth):
    """
    面試主管建立新使用者，應該成功通關並回傳 201。
    """
    override_auth(interviewer_user)
    
    data = {
        "username": "candidate_alex",
        "full_name": "Alex Chang",
        "password": "alex_password_xyz",
        "role": "Candidate"
    }
    
    response = client.post("/api/v1/users/", json=data)
    assert response.status_code == 201


def test_create_user_forbidden_for_candidate(client, candidate_user, override_auth):
    """
    一般考生建立別的帳號，應被 403 Forbidden 擋下。
    """
    override_auth(candidate_user)
    
    data = {
        "username": "illegal_user",
        "full_name": "I am a hacker",
        "password": "hacker_password123",
        "role": "Admin"  # 企圖把自己升級成管理員
    }
    
    response = client.post("/api/v1/users/", json=data)
    
    assert response.status_code == 403
    assert "帳號角色權限不足" in response.json()["detail"]


def test_create_user_duplicate_username(client, admin_user, candidate_user, override_auth):
    """
    重複註冊相同帳號，應觸發 400 Bad Request。
    """
    override_auth(admin_user)
    
    data = {
        "username": candidate_user.username,
        "full_name": "Cloned User",
        "password": "cloned_password123",
        "role": "Candidate"
    }
    
    response = client.post("/api/v1/users/", json=data)
    
    assert response.status_code == 400
    assert "已存在" in response.json()["detail"]

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

# --- GET /users/ (獲取所有人清單) ---
def test_read_users_list_success(client, admin_user, override_auth):
    """
    管理方應能順利取得所有人名冊。
    """
    override_auth(admin_user)
    response = client.get("/api/v1/users/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_read_users_list_forbidden_for_candidate(client, candidate_user, override_auth):
    """
    一般考生嘗試偷看所有人名冊，應被 403 拒絕。
    """
    override_auth(candidate_user)
    response = client.get("/api/v1/users/")
    assert response.status_code == 403


# --- GET /users/{user_id} (獲取特定使用者細節) ---
def test_get_user_by_id_success(client, admin_user, candidate_user, override_auth):
    """
    管理方透過 UUID 查詢特定學生，應成功回傳。
    """
    override_auth(admin_user)
    response = client.get(f"/api/v1/users/{candidate_user.id}")
    assert response.status_code == 200
    assert response.json()["username"] == candidate_user.username

def test_get_user_by_id_not_found(client, admin_user, override_auth):
    """
    查詢不存在的 UUID，應回傳 404。
    """
    override_auth(admin_user)
    fake_id = uuid.uuid4()
    response = client.get(f"/api/v1/users/{fake_id}")
    assert response.status_code == 404
    assert "找不到" in response.json()["detail"]

# --- PATCH /users/me (修改個人資料) ---
def test_update_me_full_name_success(client, candidate_user, override_auth):
    """
    一般考生應能自由修改自己的姓名。
    """
    override_auth(candidate_user)
    
    update_data = {"full_name": "Tony Stark (IronMan)"}
    response = client.patch("/api/v1/users/me", json=update_data)
    
    assert response.status_code == 200
    assert response.json()["full_name"] == "Tony Stark (IronMan)"


def test_update_me_role_forbidden(client, candidate_user, override_auth):
    """
    一般考生企圖把自己改成 Admin，必須被 403 攔截。
    """
    override_auth(candidate_user)
    
    evil_data = {"full_name": "Hacker Nick", "role": "Admin"}
    response = client.patch("/api/v1/users/me", json=evil_data)
    
    assert response.status_code == 403
    assert "沒有權限變更" in response.json()["detail"]


def test_update_me_unauthenticated(client):
    """
    未登入者修改個人資料，應被 401 拒絕。
    """
    response = client.patch("/api/v1/users/me", json={"full_name": "Ghost"})
    assert response.status_code == 401

# --- PATCH /users/{user_id} (修改特定使用者) ---
def test_update_other_user_by_admin_success(client, admin_user, candidate_user, override_auth):
    """
    最高管理員 Admin 應該要能成功把一般學生的角色提拔為 Interviewer。
    """
    override_auth(admin_user)
    
    update_payload = {
        "full_name": "Upgraded Interviewer",
        "role": "Interviewer"
    }
    response = client.patch(f"/api/v1/users/{candidate_user.id}", json=update_payload)
    
    assert response.status_code == 200
    data = response.json()
    assert data["full_name"] == "Upgraded Interviewer"
    assert data["role"] == UserRole.Interviewer.value


def test_update_other_user_forbidden_for_interviewer(client, interviewer_user, candidate_user, override_auth):
    """
    一般面試官企圖修改其他人的權限，應回傳 403。"""
    override_auth(interviewer_user)
    
    update_payload = {"role": "Admin"}
    response = client.patch(f"/api/v1/users/{candidate_user.id}", json=update_payload)
    
    assert response.status_code == 403


def test_update_other_user_not_found(client, admin_user, override_auth):
    """
    管理員嘗試修改一組不存在的 UUID 時，應回傳 404。
    """
    override_auth(admin_user)
    fake_id = uuid.uuid4()
    
    response = client.patch(f"/api/v1/users/{fake_id}", json={"full_name": "NoOne"})
    assert response.status_code == 404
    assert "找不到" in response.json()["detail"]

# --- PUT /users/me/password (修改個人密碼) ---
def test_update_my_password_success(client, candidate_user, override_auth):
    """
    輸入正確的舊密碼，應該要能成功變更為新密碼。
    """
    override_auth(candidate_user)
    
    password_payload = {
        "old_password": "testpassword123",
        "new_password": "my_brand_new_password_999"
    }
    response = client.put("/api/v1/users/me/password", json=password_payload)
    
    assert response.status_code == 200
    assert response.json()["detail"] == "密碼已成功修改"


def test_update_my_password_wrong_old(client, candidate_user, override_auth):
    """
    如果舊密碼猜錯，應回傳 400 Bad Request。
    """
    override_auth(candidate_user)
    
    wrong_payload = {
        "old_password": "wrong_old_password_haha",
        "new_password": "secure_password_abc"
    }
    response = client.put("/api/v1/users/me/password", json=wrong_payload)
    
    assert response.status_code == 400
    assert "舊密碼輸入錯誤" in response.json()["detail"]


def test_update_my_password_unauthenticated(client):
    """
    未登入的使用者嘗試修改密碼，應回傳 401。
    """
    ghost_payload = {
        "old_password": "any",
        "new_password": "any"
    }
    response = client.put("/api/v1/users/me/password", json=ghost_payload)
    assert response.status_code == 401

# --- PUT /users/{user_id}/password-reset (強制重設他人密碼) ---
def test_reset_user_password_by_admin_success(client, admin_user, candidate_user, override_auth):
    """
    最高管理員 Admin 應能無條件強制重設一般考生的密碼。
    """
    override_auth(admin_user)
    
    reset_payload = {"new_password": "admin_forced_password_555"}
    response = client.put(f"/api/v1/users/{candidate_user.id}/password-reset", json=reset_payload)
    
    assert response.status_code == 200
    assert response.json()["detail"] == "已成功強制重設該使用者密碼"


def test_reset_user_password_forbidden_for_interviewer(client, interviewer_user, candidate_user, override_auth):
    """
    面試主管沒有權力重設他人密碼，應回傳 403。
    """
    override_auth(interviewer_user)
    
    reset_payload = {"new_password": "interviewer_hacked_pass"}
    response = client.put(f"/api/v1/users/{candidate_user.id}/password-reset", json=reset_payload)
    
    assert response.status_code == 403


def test_reset_user_password_not_found(client, admin_user, override_auth):
    """
    管理員若傳入不存在的 UUID 改密碼，應回傳 404。
    """
    override_auth(admin_user)
    fake_id = uuid.uuid4()
    
    reset_payload = {"new_password": "some_password_123"}
    response = client.put(f"/api/v1/users/{fake_id}/password-reset", json=reset_payload)
    
    assert response.status_code == 404
    assert "找不到" in response.json()["detail"]