from fastapi import APIRouter, HTTPException
from app.services.queue_manager import queue_manager

router = APIRouter()

@router.post("/test-redis")
def test_redis_connection(payload: dict):
    """
    最簡單的測試：
    傳入任何 JSON，看它能不能進到 Redis
    """
    success = queue_manager.push_task(payload)
    
    if not success:
        raise HTTPException(status_code=500, detail="無法連線至 Redis")
        
    return {"status": "success", "message": "資料已成功推送到 Redis"}