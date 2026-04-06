"""routers/iot.py — IoT webhook ingestion and device management."""
from fastapi import APIRouter, Depends, Request
from routers.auth import get_current_user
router = APIRouter()

@router.post("/ingest/{device_uid}")
async def ingest_reading(device_uid: str, request: Request):
    """Webhook endpoint for IoT sensors to push water quality readings."""
    payload = await request.json()
    # Validate, store to water_readings table
    return {"device_uid": device_uid, "received": True, "payload": payload}

@router.get("/devices")
async def list_devices(current_user=Depends(get_current_user)):
    return {"devices": []}
