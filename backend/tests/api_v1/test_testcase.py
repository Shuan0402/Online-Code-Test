# backend/tests/api_v1/test_testcase.py

import pytest
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