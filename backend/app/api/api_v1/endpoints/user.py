import json
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from typing import List, Annotated
from uuid import UUID

from app.api import deps
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserRead,
    UserUpdate,
    UserUpdatePassword,
    UserPasswordReset,
    UserCandidateTagsUpdate,
    BatchImportResult,
    BatchImportRowResult,
)
from app.core.security import SecurityManager
from app.models.enums import UserRole
from app.services.tags import replace_candidate_tags
from app.services.candidate_batch import (
    parse_candidate_upload,
    batch_import_candidates,
    BatchImportFileError,
)

USER_NOT_FOUND = "找不到該使用者"


router = APIRouter()

@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED, responses={400: {"description": "帳號名稱已存在"}})
def create_user(
    obj_in: UserCreate, 
    db: Annotated[Session, Depends(deps.get_db)], 
    current_user: Annotated[User, Depends(deps.get_interviewer_user)]
):
    user = db.query(User).filter(User.username == obj_in.username).first()
    if user:
        raise HTTPException(status_code=400, detail="該帳號名稱已存在")
    
    new_user = User(
        username=obj_in.username,
        full_name=obj_in.full_name,
        password_hash=SecurityManager.hash_password(obj_in.password),
        role=obj_in.role
    )
    db.add(new_user)
    db.flush()

    if obj_in.tags and obj_in.role == UserRole.Candidate:
        replace_candidate_tags(db, new_user.id, obj_in.tags)

    db.commit()
    return (
        db.query(User)
        .options(joinedload(User.candidate_tags))
        .filter(User.id == new_user.id)
        .one()
    )

@router.post("/batch-import", response_model=BatchImportResult)
async def batch_import_users(
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_interviewer_user)],
    file: UploadFile = File(...),
    tags: str = Form("[]"),
):
    """
    批次匯入考生（CSV / Excel）。
    - 檔案需包含欄位：真實姓名、帳號
    - 密碼由系統依帳號自動產生
    - tags 為 JSON 陣列字串，套用於所有成功建立的考生
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="請上傳檔案")

    try:
        tag_list = json.loads(tags)
        if not isinstance(tag_list, list):
            raise ValueError("tags must be a list")
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=400, detail="tags 格式錯誤，需為 JSON 陣列")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="檔案內容為空")

    try:
        rows = parse_candidate_upload(content, file.filename)
    except BatchImportFileError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not rows:
        raise HTTPException(status_code=400, detail="檔案中沒有可匯入的考生資料")

    summary = batch_import_candidates(db, rows, tag_list)
    return BatchImportResult(
        total=summary.total,
        created=summary.created,
        failed=summary.failed,
        results=[
            BatchImportRowResult.model_validate(asdict(r))
            for r in summary.results
        ],
    )

@router.get("/", response_model=List[UserRead])
def read_users(
    db: Annotated[Session, Depends(deps.get_db)], 
    current_user: Annotated[User, Depends(deps.get_interviewer_user)]
):
    return (
        db.query(User)
        .options(joinedload(User.candidate_tags))
        .all()
    )

@router.get("/me", response_model=UserRead)
def get_current_user_info(current_user: Annotated[User, Depends(deps.get_current_user)]):
    """
    獲取當前登入使用者的詳細資訊。
    """
    return current_user

@router.get("/{user_id}", response_model=UserRead)
def read_user_by_id(
    user_id: UUID,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_interviewer_user)]
):
    """
    獲取特定使用者細節。
    - 僅限 Admin 或 Interviewer 操作。
    """
    user = (
        db.query(User)
        .options(joinedload(User.candidate_tags))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=USER_NOT_FOUND
        )
    return user

@router.patch("/{user_id}/tags", response_model=UserRead)
def update_candidate_tags(
    user_id: UUID,
    obj_in: UserCandidateTagsUpdate,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_interviewer_user)],
):
    """
    更新考生標籤（完整取代現有標籤清單）。
    - 僅限 Admin 或 Interviewer 操作。
    - 目標使用者必須為 Candidate。
    """
    user = (
        db.query(User)
        .options(joinedload(User.candidate_tags))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=USER_NOT_FOUND,
        )
    if user.role != UserRole.Candidate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="僅能為考生設定標籤",
        )

    replace_candidate_tags(db, user.id, obj_in.tags)
    db.commit()
    return (
        db.query(User)
        .options(joinedload(User.candidate_tags))
        .filter(User.id == user.id)
        .one()
    )

@router.patch("/me", response_model=UserRead)
def update_current_user_profile(
    obj_in: UserUpdate,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)] # 已登入者皆可
):
    """
    修改個人資料。
    - 任何人皆可修改自己的 full_name。
    - 非 Admin 企圖變更自己的 role 回傳 403。
    """
    if obj_in.role is not None and current_user.role != UserRole.Admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您沒有權限變更您的帳號角色"
        )

    if obj_in.full_name is not None:
        current_user.full_name = obj_in.full_name
        
    if obj_in.role is not None and current_user.role == UserRole.Admin:
        current_user.role = obj_in.role

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user

@router.patch("/{user_id}", response_model=UserRead)
def update_user_by_id(
    user_id: UUID,
    obj_in: UserUpdate,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_admin_user)]
):
    """
    修改特定使用者（改姓名或變更權限角色）。
    - 僅限最高管理員 Admin 操作。
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=USER_NOT_FOUND
        )
        
    if obj_in.full_name is not None:
        user.full_name = obj_in.full_name
        
    if obj_in.role is not None:
        user.role = obj_in.role

    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.put("/me/password", status_code=status.HTTP_200_OK)
def update_my_password(
    payload: UserUpdatePassword,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_current_user)]
):
    """
    一般使用者/考生自行修改密碼。
    - 必須驗證舊密碼（old_password）是否正確。
    """
    if not SecurityManager.verify_password(payload.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="舊密碼輸入錯誤"
        )
        
    current_user.password_hash = SecurityManager.hash_password(payload.new_password)
    db.add(current_user)
    db.commit()
    
    return {"detail": "密碼已成功修改"}

@router.put("/{user_id}/password-reset", status_code=status.HTTP_200_OK)
def reset_user_password(
    user_id: UUID,
    payload: UserPasswordReset,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_admin_user)]
):
    """
    最高管理員強制重設他人密碼。
    - 僅限最高管理員 Admin 操作。
    - 僅需提供 new_password，無需舊密碼。
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=USER_NOT_FOUND
        )
        
    user.password_hash = SecurityManager.hash_password(payload.new_password)
    db.add(user)
    db.commit()
    
    return {"detail": "已成功強制重設該使用者密碼"}

@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
def delete_user_by_id(
    user_id: UUID,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[User, Depends(deps.get_admin_user)] 
):
    """
    刪除使用者帳號。
    - 僅限最高管理員 Admin 操作。
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=USER_NOT_FOUND
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="管理員無法刪除自身的管理員帳號"
        )
        
    db.delete(user)
    db.commit()
    
    return {"detail": "使用者帳號已成功刪除"}