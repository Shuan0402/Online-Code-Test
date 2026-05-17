from app.models.enums import UserRole


# --- GET /problems/{id}/testcases (獲得完整測資) ---
def test_get_problem_testcases_success(client, questioner_user, override_auth, create_test_problem, db_session):
    """
    出題者取得題目測資。
    """
    override_auth(questioner_user)
    prob = create_test_problem(title="測資測試題")
    
    response = client.get(f"/api/v1/problems/{prob.id}/testcases")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_problem_testcases_candidate_blocked(client, candidate_user, override_auth, create_test_problem):
    """
    普通考生禁止窺探完整測資。
    """
    override_auth(candidate_user)
    prob = create_test_problem()
    
    response = client.get(f"/api/v1/problems/{prob.id}/testcases")

    assert response.status_code == 403

# --- POST /problems/{id}/testcases (建立測資) ---
def test_create_problem_testcase_success(client, questioner_user, override_auth, create_test_problem):
    """
    出題者成功為題目建立全新測資。
    """
    override_auth(questioner_user)
    prob = create_test_problem(title="增量功能測試題")
    
    payload = {
        "input_data": "5\n1 2 3 4 5",
        "expected_output": "15",
        "score_weight": 25,
        "is_sample": False
    }
    
    response = client.post(f"/api/v1/problems/{prob.id}/testcases", json=payload)
    
    assert response.status_code == 201
    data = response.json()
    assert data["problem_id"] == prob.id
    assert data["input_data"] == payload["input_data"]
    assert data["expected_output"] == payload["expected_output"]
    assert data["score_weight"] == 25
    assert data["is_sample"] is False
    assert "id" in data


def test_create_problem_testcase_candidate_blocked(client, candidate_user, override_auth, create_test_problem):
    """
    普通考生禁止塞入自訂測資
    """
    override_auth(candidate_user)
    prob = create_test_problem()
    
    payload = {
        "input_data": "惡意攻擊輸入",
        "expected_output": "無所謂",
        "score_weight": 100
    }
    
    response = client.post(f"/api/v1/problems/{prob.id}/testcases", json=payload)

    assert response.status_code == 403

# --- PATCH /problems/{id} (修改測資) ---
def test_update_testcase_success(client, questioner_user, override_auth, create_test_problem, db_session):
    """
    出題者成功修改指定測資的部分欄位
    """
    override_auth(questioner_user)
    prob = create_test_problem()
    
    from app.models.testcase import TestCase
    tc = TestCase(
        problem_id=prob.id,
        input_data="OLD_INPUT",
        expected_output="OLD_OUTPUT",
        score_weight=10,
        is_sample=True
    )
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)
    
    payload = {
        "input_data": "NEW_INPUT",
        "score_weight": 99
    }
    
    response = client.patch(f"/api/v1/testcases/{tc.id}", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert data["id"] == tc.id
    assert data["input_data"] == "NEW_INPUT"
    assert data["score_weight"] == 99 
    assert data["expected_output"] == "OLD_OUTPUT"
    assert data["is_sample"] is True


def test_update_testcase_candidate_blocked(client, candidate_user, override_auth, db_session, create_test_problem):
    """
    考生禁止修改任何測資
    """
    override_auth(candidate_user)
    prob = create_test_problem()
    
    from app.models.testcase import TestCase
    tc = TestCase(problem_id=prob.id, input_data="IN", expected_output="OUT")
    db_session.add(tc)
    db_session.commit()
    
    response = client.patch(f"/api/v1/testcases/{tc.id}", json={"score_weight": 100})
    assert response.status_code == 403