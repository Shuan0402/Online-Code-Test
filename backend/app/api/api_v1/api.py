from fastapi import APIRouter
from app.api.api_v1.endpoints import user, submission

api_router = APIRouter()

api_router.include_router(user.router, prefix="/users", tags=["users"])
api_router.include_router(submission.router, prefix="/submissions", tags=["submissions"])