from fastapi import APIRouter
from app.api.api_v1.endpoints import user, submission, auth, problem, internal

api_router = APIRouter()

api_router.include_router(user.router, prefix="/users", tags=["users"])
api_router.include_router(submission.router, prefix="/submissions", tags=["submissions"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(problem.router, prefix="/problems", tags=["problems"])
api_router.include_router(internal.router, prefix="/internal", tags=["internal"])