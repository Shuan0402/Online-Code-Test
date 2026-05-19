def test_get_dashboard_summary_as_admin(client, override_auth, admin_user):
    """
    以 Admin 身份戳端點，應成功獲取所有維運健康指標
    """
    override_auth(admin_user)
    
    response = client.get("/api/v1/admin/dashboard/summary")
    assert response.status_code == 200
    
    data = response.json()
    assert "active_candidates_count" in data
    assert "active_exams_count" not in data
    assert "system_hardware" in data
    assert data["system_hardware"]["cpu_usage_percent"] >= 0
    assert "pending_tasks_count" in data


def test_get_dashboard_summary_as_candidate_denied(client, override_auth, candidate_user):
    """
    一般考生企圖偷看系統監控，系統應回傳 403
    """
    override_auth(candidate_user)
    
    response = client.get("/api/v1/admin/dashboard/summary")
    
    assert response.status_code == 403
    assert "權限不足" in response.json()["detail"]