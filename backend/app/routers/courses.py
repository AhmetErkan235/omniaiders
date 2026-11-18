from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from ..database import get_db
from ..models import CourseCreate, CourseOut

router = APIRouter(prefix="/api/courses", tags=["courses"])

@router.get("", response_model=List[Dict[str, Any]])
def list_courses():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT 
        c.id, c.name, c.description, c.created_at,
        (SELECT COUNT(*) FROM materials m WHERE m.course_id = c.id) as material_count,
        (SELECT COUNT(*) FROM youtube_videos v WHERE v.course_id = c.id) as video_count
    FROM courses c
    ORDER BY c.id DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@router.post("", response_model=Dict[str, Any])
def create_course(course: CourseCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO courses (name, description) VALUES (?, ?)",
        (course.name.strip(), course.description.strip() if course.description else "")
    )
    course_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"id": course_id, "name": course.name, "description": course.description}

@router.get("/{course_id}")
def get_course_detail(course_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM courses WHERE id = ?", (course_id,))
    course = cursor.fetchone()
    if not course:
        conn.close()
        raise HTTPException(status_code=404, detail="Ders bulunamadı.")

    # Get materials
    cursor.execute("SELECT id, title, type, file_path, url, created_at, metadata_json FROM materials WHERE course_id = ?", (course_id,))
    materials = [dict(m) for m in cursor.fetchall()]
    for m in materials:
        if m.get('file_path'):
            from pathlib import Path
            filename = Path(m['file_path']).name
            m['file_url'] = f"/uploads/{filename}"
        else:
            m['file_url'] = m.get('url')

    # Get videos
    cursor.execute("""
    SELECT 
        v.id, v.video_id, v.title, v.url, v.channel_name, v.thumbnail_url, v.duration_seconds,
        (SELECT COUNT(*) FROM transcript_chunks tc WHERE tc.video_id = v.video_id AND tc.course_id = v.course_id) as chunk_count
    FROM youtube_videos v 
    WHERE v.course_id = ?
    """, (course_id,))
    videos = [dict(v) for v in cursor.fetchall()]

    conn.close()
    return {
        "course": dict(course),
        "materials": materials,
        "videos": videos
    }

@router.delete("/{course_id}")
def delete_course(course_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM courses WHERE id = ?", (course_id,))
    cursor.execute("DELETE FROM materials WHERE course_id = ?", (course_id,))
    cursor.execute("DELETE FROM youtube_videos WHERE course_id = ?", (course_id,))
    cursor.execute("DELETE FROM transcript_chunks WHERE course_id = ?", (course_id,))
    cursor.execute("DELETE FROM flashcards WHERE course_id = ?", (course_id,))
    conn.commit()
    conn.close()
    return {"message": "Ders başarıyla silindi."}
