import os
import json
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional, List
from ..database import get_db
from ..config import UPLOADS_DIR
from ..services.document_service import extract_content_from_file
from ..services.web_service import extract_web_content
from ..models import LinkAddRequest, TextNoteAddRequest

router = APIRouter(prefix="/api/materials", tags=["materials"])
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_EXTENSIONS = {'.pdf', '.pptx', '.ppt', '.txt', '.md', '.jpg', '.jpeg', '.png', '.webp'}

def save_upload(course_id: int, file: UploadFile):
    original_filename = Path(file.filename or 'upload').name
    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail='Desteklenmeyen dosya türü.')
    conn = get_db()
    exists = conn.execute('SELECT 1 FROM courses WHERE id = ?', (course_id,)).fetchone()
    conn.close()
    if not exists:
        raise HTTPException(status_code=404, detail='Ders bulunamadı.')

    clean_filename = f'{course_id}_{uuid.uuid4().hex}{ext}'
    save_path = UPLOADS_DIR / clean_filename
    size = 0
    try:
        with open(save_path, 'wb') as buffer:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail='Dosya boyutu 25 MB sınırını aşıyor.')
                buffer.write(chunk)
    except Exception:
        if save_path.exists():
            save_path.unlink()
        raise
    mat_type = 'pdf' if ext == '.pdf' else ('image' if ext in ('.jpg', '.jpeg', '.png', '.webp') else 'document')
    return original_filename, save_path, mat_type

@router.post("/upload-multiple")
async def upload_multiple_files(
    course_id: int = Form(...),
    files: List[UploadFile] = File(...)
):
    """Uploads multiple files (PDFs, slides, images) simultaneously."""
    results = []
    conn = get_db()
    cursor = conn.cursor()

    for file in files:
        original_filename, save_path, mat_type = save_upload(course_id, file)

        extracted = extract_content_from_file(str(save_path), original_filename)

        cursor.execute("""
        INSERT INTO materials (course_id, title, type, file_path, content, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            course_id,
            original_filename,
            mat_type,
            str(save_path),
            extracted['content'],
            json.dumps({'pages': extracted.get('pages', []), 'page_count': extracted.get('page_count', 1)})
        ))
        mat_id = cursor.lastrowid
        results.append({
            "id": mat_id,
            "title": original_filename,
            "type": mat_type,
            "page_count": extracted.get('page_count', 1)
        })

    conn.commit()
    conn.close()

    return {
        "message": f"{len(results)} dosya başarıyla yüklendi.",
        "materials": results
    }

@router.post("/upload")
async def upload_file(
    course_id: int = Form(...),
    file: UploadFile = File(...)
):
    """Uploads a PDF, PPTX, image or text note and parses content."""
    original_filename, save_path, mat_type = save_upload(course_id, file)

    # Extract content
    extracted = extract_content_from_file(str(save_path), original_filename)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO materials (course_id, title, type, file_path, content, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        course_id,
        original_filename,
        mat_type,
        str(save_path),
        extracted['content'],
        json.dumps({'pages': extracted.get('pages', []), 'page_count': extracted.get('page_count', 1)})
    ))
    mat_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "id": mat_id,
        "title": original_filename,
        "type": mat_type,
        "page_count": extracted.get('page_count', 1),
        "message": "Dosya başarıyla yüklendi ve incelendi."
    }

@router.post("/link")
def add_web_link(req: LinkAddRequest):
    """Add external webpage / article link."""
    extracted = extract_web_content(req.url)
    title = req.title if req.title else extracted['title']

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO materials (course_id, title, type, url, content, metadata_json)
    VALUES (?, ?, 'link', ?, ?, ?)
    """, (
        req.course_id,
        title,
        req.url,
        extracted['content'],
        json.dumps({'url': req.url})
    ))
    mat_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"id": mat_id, "title": title, "type": "link", "message": "Link başarıyla eklendi."}

@router.post("/text")
def add_text_note(req: TextNoteAddRequest):
    """Add a direct written note or copy-pasted lecture summary."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO materials (course_id, title, type, content, metadata_json)
    VALUES (?, ?, 'text', ?, ?)
    """, (
        req.course_id,
        req.title,
        req.content,
        json.dumps({'length': len(req.content)})
    ))
    mat_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"id": mat_id, "title": req.title, "type": "text", "message": "Ders notu kaydedildi."}

@router.get("/{material_id}")
def get_material_content(material_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM materials WHERE id = ?", (material_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Materyal bulunamadı.")

    data = dict(row)
    if data.get('metadata_json'):
        try:
            data['metadata'] = json.loads(data['metadata_json'])
        except Exception:
            data['metadata'] = {}
    return data

@router.delete("/{material_id}")
def delete_material(material_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM materials WHERE id = ?", (material_id,))
    row = cursor.fetchone()
    if row and row['file_path'] and os.path.exists(row['file_path']):
        try:
            os.remove(row['file_path'])
        except Exception:
            pass

    cursor.execute("DELETE FROM materials WHERE id = ?", (material_id,))
    conn.commit()
    conn.close()
    return {"message": "Materyal silindi."}
