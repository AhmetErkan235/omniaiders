import os
import mimetypes
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Explicitly fix Windows registry MIME type bugs for JavaScript and CSS modules
mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")

from .database import init_db
from .config import UPLOADS_DIR
from .routers import courses, materials, youtube, study, settings

app = FastAPI(
    title="OmniStudy AI",
    description="Akıllı Ders Notu, PDF ve YouTube Video Eşleştirici Çalışma Asistanı",
    version="1.0.0"
)

# CORS for React frontend (Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files (PDFs, images)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Include API routers
app.include_router(courses.router)
app.include_router(materials.router)
app.include_router(youtube.router)
app.include_router(study.router)
app.include_router(settings.router)

@app.on_event("startup")
def on_startup():
    init_db()

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

# Robust custom asset server with strict MIME types for ES Modules
@app.get("/assets/{file_name}")
def serve_asset(file_name: str):
    file_path = FRONTEND_DIST / "assets" / file_name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    
    if file_name.endswith((".js", ".mjs")):
        media_type = "application/javascript"
    elif file_name.endswith(".css"):
        media_type = "text/css"
    elif file_name.endswith(".svg"):
        media_type = "image/svg+xml"
    elif file_name.endswith(".woff2"):
        media_type = "font/woff2"
    elif file_name.endswith(".woff"):
        media_type = "font/woff"
    elif file_name.endswith(".ttf"):
        media_type = "font/ttf"
    else:
        media_type = None

    return FileResponse(str(file_path), media_type=media_type)

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "OmniStudy AI"}

# Catch-all to serve React SPA (index.html) for any non-API route
@app.get("/{full_path:path}")
def serve_spa(full_path: str = ""):
    if full_path.startswith("api/"):
        return {"error": "API route not found"}
    
    if full_path:
        target_file = FRONTEND_DIST / full_path
        if target_file.is_file():
            return FileResponse(str(target_file))
    
    index_file = FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    
    return {
        "status": "online",
        "message": "OmniStudy AI Backend çalışıyor."
    }
