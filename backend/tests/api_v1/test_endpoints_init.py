import pytest
from fastapi import APIRouter


def test_api_v1_endpoints_init_exports_routers():
    """測試 app.api.api_v1.endpoints.__init__.py 是否正確匯出 router 物件。"""
    import app.api.api_v1.endpoints as endpoints

    assert hasattr(endpoints, "user_router"), "缺少 user_router"
    assert hasattr(endpoints, "submission_route"), "缺少 submission_route"
    assert hasattr(endpoints, "auth_router"), "缺少 auth_router"

    assert isinstance(endpoints.user_router, APIRouter)
    assert isinstance(endpoints.submission_route, APIRouter)
    assert isinstance(endpoints.auth_router, APIRouter)


def test_api_v1_endpoints_init_direct_import():
    """測試從 package 直接匯入 router 名稱應當可用。"""
    from app.api.api_v1.endpoints import user_router, submission_route, auth_router

    assert user_router.__class__ is APIRouter or isinstance(user_router, APIRouter)
    assert submission_route.__class__ is APIRouter or isinstance(submission_route, APIRouter)
    assert auth_router.__class__ is APIRouter or isinstance(auth_router, APIRouter)
