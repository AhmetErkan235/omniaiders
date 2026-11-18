import os
import json
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
import fitz
from typing import Optional, List
from ..database import get_db
from ..config import UPLOADS_DIR
from ..services.document_service import extract_content_from_file
from ..services.llm_service import analyze_page_with_vision
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


PAGE_CACHE_DIR = UPLOADS_DIR / "page_cache"
PAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

@router.get("/{material_id}/page-image/{page_number}")
def get_material_page_image(material_id: int, page_number: int):
    """
    Renders and serves a high-resolution, crisp PNG image of a specific PDF page.
    Results are cached on disk for instant loading.
    """
    cache_file = PAGE_CACHE_DIR / f"{material_id}_p{page_number}.png"
    if cache_file.exists():
        return FileResponse(cache_file, media_type="image/png")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path, type FROM materials WHERE id = ?", (material_id,))
    row = cursor.fetchone()
    conn.close()

    if not row or not row['file_path'] or not os.path.exists(row['file_path']):
        raise HTTPException(status_code=404, detail="Materyal veya dosya bulunamadı.")

    file_path = row['file_path']
    ext = Path(file_path).suffix.lower()

    if ext != '.pdf':
        if ext in ('.png', '.jpg', '.jpeg', '.webp'):
            return FileResponse(file_path)
        raise HTTPException(status_code=400, detail="Bu materyal bir PDF belgesi değil.")

    try:
        doc = fitz.open(file_path)
        total_pages = len(doc)
        if page_number < 1 or page_number > total_pages:
            raise HTTPException(status_code=404, detail=f"Sayfa {page_number} bulunamadı (Toplam sayfa: {total_pages}).")

        page = doc.load_page(page_number - 1)
        # 150 DPI gives crisp text and sharp math formulas
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        doc.close()

        with open(cache_file, "wb") as f:
            f.write(img_bytes)

        return Response(content=img_bytes, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sayfa görseli oluşturulamadı: {str(e)}")


@router.post("/{material_id}/analyze-page-vision/{page_number}")
def analyze_page_vision_endpoint(material_id: int, page_number: int):
    """
    Analyzes a specific document/PDF page visually with Gemini Vision.
    Extracts formulas, diagrams, chemical/physical structures, and rich academic notes,
    then updates the page content in the database.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, course_id, title, file_path, metadata_json FROM materials WHERE id = ?", (material_id,))
    row = cursor.fetchone()
    if not row or not row['file_path'] or not os.path.exists(row['file_path']):
        conn.close()
        raise HTTPException(status_code=404, detail="Materyal dosyası bulunamadı.")

    cursor.execute("SELECT name FROM courses WHERE id = ?", (row['course_id'],))
    course_row = cursor.fetchone()
    course_name = course_row['name'] if course_row else ""

    file_path = row['file_path']
    ext = Path(file_path).suffix.lower()

    img_bytes = None
    if ext == '.pdf':
        try:
            doc = fitz.open(file_path)
            if page_number < 1 or page_number > len(doc):
                doc.close()
                conn.close()
                raise HTTPException(status_code=404, detail="Geçersiz sayfa numarası.")
            page = doc.load_page(page_number - 1)
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("jpeg")
            doc.close()
        except Exception as e:
            conn.close()
            raise HTTPException(status_code=500, detail=f"Sayfa görseli oluşturulamadı: {str(e)}")
    elif ext in ('.png', '.jpg', '.jpeg', '.webp'):
        try:
            with open(file_path, 'rb') as f:
                img_bytes = f.read()
        except Exception as e:
            conn.close()
            raise HTTPException(status_code=500, detail=f"Görsel okunamadı: {str(e)}")
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Bu dosya türü görsel incelemeyi desteklemiyor.")

    # Call Gemini Multimodal Vision
    vision_text = analyze_page_with_vision(img_bytes, course_name, page_number)
    if not vision_text or vision_text.startswith("Görsel analiz edilirken bir hata oluştu"):
        conn.close()
        raise HTTPException(status_code=500, detail=vision_text)

    # Update metadata_json and content in SQLite
    meta = {}
    if row['metadata_json']:
        try:
            meta = json.loads(row['metadata_json'])
        except Exception:
            meta = {}

    pages = meta.get('pages', [])
    updated = False
    for p in pages:
        if p.get('page') == page_number:
            p['text'] = vision_text
            p['is_vision_analyzed'] = True
            updated = True
            break

    if not updated:
        pages.append({
            'page': page_number,
            'text': vision_text,
            'is_vision_analyzed': True
        })
        pages.sort(key=lambda x: x.get('page', 0))

    meta['pages'] = pages
    meta['page_count'] = len(pages)
    new_meta_json = json.dumps(meta, ensure_ascii=False)
    new_content = "\n\n".join([f"--- Sayfa {p['page']} ---\n{p['text']}" for p in pages])

    cursor.execute("""
    UPDATE materials 
    SET metadata_json = ?, content = ?
    WHERE id = ?
    """, (new_meta_json, new_content, material_id))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "page": page_number,
        "text": vision_text,
        "message": f"{page_number}. sayfa yapay zeka ile görsel olarak başarıyla incelendi ve notlara işlendi."
    }

@router.post("/{material_id}/analyze-sparse-pages-vision")
def analyze_sparse_pages_vision(material_id: int):
    """
    Scans through pages that have very little text (e.g. diagrams/scans with < 120 chars)
    and enriches up to 4 sparse pages per call using Gemini Vision.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, course_id, title, file_path, metadata_json FROM materials WHERE id = ?", (material_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Materyal bulunamadı.")

    meta = {}
    if row['metadata_json']:
        try:
            meta = json.loads(row['metadata_json'])
        except Exception:
            meta = {}

    pages = meta.get('pages', [])
    sparse_pages = [p.get('page') for p in pages if len(p.get('text', '').strip()) < 120 and not p.get('is_vision_analyzed')]
    conn.close()

    if not sparse_pages:
        return {"success": True, "analyzed_count": 0, "message": "Görsel olarak taranması gereken boş veya yetersiz sayfa bulunamadı."}

    # Process first 3 sparse pages to ensure quick response without timeout
    analyzed = []
    for pnum in sparse_pages[:3]:
        try:
            res = analyze_page_vision_endpoint(material_id, pnum)
            analyzed.append(pnum)
        except Exception as e:
            print(f"Error analyzing page {pnum}: {e}")

    return {
        "success": True,
        "analyzed_count": len(analyzed),
        "pages": analyzed,
        "remaining_sparse": len(sparse_pages) - len(analyzed),
        "message": f"{len(analyzed)} sayfa başarıyla görsel olarak incelendi ve notlara eklendi."
    }
