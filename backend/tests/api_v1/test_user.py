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