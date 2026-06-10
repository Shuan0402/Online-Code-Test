import os

# Ensure required settings are available before module import.
os.environ.setdefault('JWT_SECRET', 'testsecret')

from fastapi import APIRouter
from app.api.api_v1 import api


def test_api_v1_router_is_apirouter():
    assert isinstance(api.api_router, APIRouter)


def test_api_v1_router_includes_expected_prefixes():
    paths = [route.path for route in api.api_router.routes if hasattr(route, 'path')]
    prefixes = {path.lstrip('/').split('/')[0] for path in paths if path.startswith('/')}

    expected_prefixes = {
        'users',
        'submissions',
        'auth',
        'problems',
        'internal',
        'exams',
        'testcases',
        'admin',
    }

    assert expected_prefixes.issubset(prefixes)


def test_api_v1_router_routes_have_tags():
    paths_with_tags = [(getattr(route, 'path', None), getattr(route, 'tags', [])) for route in api.api_router.routes]

    assert any('users' in tags for _, tags in paths_with_tags)
    assert any('submissions' in tags for _, tags in paths_with_tags)
    assert any('auth' in tags for _, tags in paths_with_tags)
    assert any('problems' in tags for _, tags in paths_with_tags)
    assert any('internal' in tags for _, tags in paths_with_tags)
    assert any('exams' in tags for _, tags in paths_with_tags)
    assert any('testcases' in tags for _, tags in paths_with_tags)
    assert any('admin' in tags for _, tags in paths_with_tags)
