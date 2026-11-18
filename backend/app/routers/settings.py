import os
from fastapi import APIRouter
from ..database import get_db
from ..models import SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("")
def get_settings():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    rows = dict(cursor.fetchall())
    conn.close()

    api_key = rows.get('gemini_api_key') or os.getenv("GEMINI_API_KEY", "")
    masked_key = ""
    if api_key:
        masked_key = api_key[:6] + "..." + api_key[-4:] if len(api_key) > 10 else "***"

    return {
        "has_gemini_key": bool(api_key),
        "gemini_api_key_masked": masked_key,
        "default_model": "gemini-3.8-flash"
    }

@router.post("")
def update_settings(update: SettingsUpdate):
    conn = get_db()
    cursor = conn.cursor()
    if update.gemini_api_key is not None:
        cursor.execute("""
        INSERT INTO settings (key, value) VALUES ('gemini_api_key', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (update.gemini_api_key.strip(),))
    conn.commit()
    conn.close()
    return {"message": "Ayarlar başarıyla güncellendi."}
