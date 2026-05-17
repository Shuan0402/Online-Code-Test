from app.models.enums import UserRole

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