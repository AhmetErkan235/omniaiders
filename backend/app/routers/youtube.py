import re
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from ..database import get_db
from ..models import YouTubeAddRequest
from ..services.youtube_service import (
    extract_video_id,
    is_playlist_url,
    fetch_playlist_or_channel_videos,
    fetch_single_video_metadata,
    fetch_transcript_chunks
)
from ..services.llm_service import generate_video_chapters

router = APIRouter(prefix="/api/youtube", tags=["youtube"])

@router.post("/add")
def add_youtube_source(req: YouTubeAddRequest):
    """
    Ultra-fast YouTube Video / Playlist / Channel addition.
    Extracts all video entries (even 120+ videos) in seconds.
    Transcripts and chapters are fetched on-demand (lazy) when studying or matching,
    preventing timeouts and rate limits!
    """
    url = req.url.strip()
    course_id = req.course_id

    is_playlist = is_playlist_url(url)
    video_entries = []
    
    if is_playlist:
        video_entries = fetch_playlist_or_channel_videos(url, max_videos=250)
        if not video_entries:
            v_id = extract_video_id(url)
            if v_id:
                video_entries = [fetch_single_video_metadata(v_id)]
    else:
        v_id = extract_video_id(url)
        if not v_id:
            raise HTTPException(status_code=400, detail="Geçersiz YouTube linki veya video ID'si.")
        video_entries = [fetch_single_video_metadata(v_id)]

    if not video_entries:
        raise HTTPException(status_code=400, detail="Videonun bilgileri YouTube üzerinden alınamadı.")

    conn = get_db()
    cursor = conn.cursor()

    added_videos = []
    for v in video_entries:
        v_id = v['video_id']

        cursor.execute("SELECT id FROM youtube_videos WHERE course_id = ? AND video_id = ?", (course_id, v_id))
        exists = cursor.fetchone()

        if not exists:
            cursor.execute("""
            INSERT INTO youtube_videos (course_id, video_id, title, url, channel_name, duration_seconds, thumbnail_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                course_id,
                v_id,
                v['title'],
                v['url'],
                v.get('channel_name', 'YouTube'),
                v.get('duration_seconds', 0),
                v.get('thumbnail_url', '')
            ))
        else:
            cursor.execute("""
            UPDATE youtube_videos 
            SET title = ?, url = ?, channel_name = ?, duration_seconds = ?, thumbnail_url = ?
            WHERE course_id = ? AND video_id = ?
            """, (
                v['title'],
                v['url'],
                v.get('channel_name', 'YouTube'),
                v.get('duration_seconds', 0),
                v.get('thumbnail_url', ''),
                course_id,
                v_id
            ))

        added_videos.append({
            'video_id': v_id,
            'title': v['title']
        })

    conn.commit()
    conn.close()

    return {
        "message": f"{len(added_videos)} video başarıyla eklendi! Konu çalıştıkça ilgili videoların bölümleri anında senkronize edilecek.",
        "videos": added_videos
    }

@router.get("/{course_id}/transcripts/{video_id}")
def get_video_transcripts(course_id: int, video_id: str):
    """
    Retrieve all timestamped segments for a specific video.
    If not yet indexed, fetches and caches chapters/transcripts on-demand!
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, start_seconds, duration, text 
    FROM transcript_chunks 
    WHERE course_id = ? AND video_id = ?
    ORDER BY start_seconds ASC
    """, (course_id, video_id))
    rows = cursor.fetchall()

    # If not yet indexed, fetch on-the-fly and save to cache
    if not rows:
        chunks = fetch_transcript_chunks(video_id)
        if chunks:
            for ch in chunks:
                cursor.execute("""
                INSERT INTO transcript_chunks (video_id, course_id, start_seconds, duration, text)
                VALUES (?, ?, ?, ?, ?)
                """, (video_id, course_id, ch['start_seconds'], ch['duration'], ch['text']))
            conn.commit()
            cursor.execute("""
            SELECT id, start_seconds, duration, text 
            FROM transcript_chunks 
            WHERE course_id = ? AND video_id = ?
            ORDER BY start_seconds ASC
            """, (course_id, video_id))
            rows = cursor.fetchall()

    conn.close()
    
    from ..services.alignment_service import format_timestamp
    result = []
    for r in rows:
        d = dict(r)
        d['timestamp_formatted'] = format_timestamp(d['start_seconds'])
        result.append(d)
    return result

@router.get("/{course_id}/chapters/{video_id}")
def get_video_chapters(course_id: int, video_id: str):
    """Return a compact AI-generated chapter list for one selected video."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT title FROM youtube_videos WHERE course_id = ? AND video_id = ?",
        (course_id, video_id)
    )
    video = cursor.fetchone()
    if not video:
        conn.close()
        raise HTTPException(status_code=404, detail="Video bu derste bulunamadı.")

    cursor.execute("""
    SELECT start_seconds, title, description, source FROM video_chapters
    WHERE course_id = ? AND video_id = ? ORDER BY start_seconds ASC
    """, (course_id, video_id))
    cached_chapters = [dict(row) for row in cursor.fetchall()]
    if cached_chapters:
        conn.close()
        from ..services.alignment_service import format_timestamp
        for chapter in cached_chapters:
            chapter['timestamp_formatted'] = format_timestamp(chapter['start_seconds'])
        return cached_chapters

    cursor.execute("""
    SELECT start_seconds, duration, text FROM transcript_chunks
    WHERE course_id = ? AND video_id = ? ORDER BY start_seconds ASC
    """, (course_id, video_id))
    chunks = [dict(row) for row in cursor.fetchall()]
    conn.close()

    if not chunks:
        chunks = fetch_transcript_chunks(video_id)
        if chunks:
            conn = get_db()
            cursor = conn.cursor()
            for chunk in chunks:
                cursor.execute("""
                INSERT INTO transcript_chunks (video_id, course_id, start_seconds, duration, text)
                VALUES (?, ?, ?, ?, ?)
                """, (video_id, course_id, chunk['start_seconds'], chunk['duration'], chunk['text']))
            conn.commit()
            conn.close()

    if not chunks:
        return []

    # Preserve creator-authored YouTube chapters (and description chapters) as
    # exact boundaries when available; use AI segmentation for videos without them.
    creator_suffix = f" - {video['title']}"
    creator_chapters = []
    for chunk in chunks:
        text = str(chunk.get('text') or '').strip()
        if text.endswith(creator_suffix):
            title = text[:-len(creator_suffix)].strip()
            if title:
                creator_chapters.append({
                    'start_seconds': float(chunk['start_seconds']),
                    'title': title[:100],
                    'description': '',
                    'source': 'youtube'
                })
    def is_valid_creator_chapters(items):
        if not items or len(items) < 3:
            return False
        for i in range(len(items) - 1):
            if (items[i+1]['start_seconds'] - items[i]['start_seconds']) < 25:
                return False
        seen_t = set()
        for ch in items:
            cl = re.sub(r'[\s\.\-_]+', '', ch['title'].lower())
            if cl in seen_t:
                return False
            seen_t.add(cl)
        return True

    if creator_chapters and is_valid_creator_chapters(creator_chapters):
        chapters = creator_chapters
    else:
        chapters = generate_video_chapters(video['title'], chunks)
    if not chapters:
        return []

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM video_chapters WHERE course_id = ? AND video_id = ?", (course_id, video_id))
    for chapter in chapters:
        cursor.execute("""
        INSERT INTO video_chapters (course_id, video_id, start_seconds, title, description, source)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            course_id, video_id, chapter['start_seconds'], chapter['title'],
            chapter.get('description', ''), chapter.get('source', 'generated')
        ))
    conn.commit()
    cursor.execute("""
    SELECT start_seconds, title, description, source FROM video_chapters
    WHERE course_id = ? AND video_id = ? ORDER BY start_seconds ASC
    """, (course_id, video_id))
    result = [dict(row) for row in cursor.fetchall()]
    conn.close()

    from ..services.alignment_service import format_timestamp
    for chapter in result:
        chapter['timestamp_formatted'] = format_timestamp(chapter['start_seconds'])
    return result

@router.delete("/{course_id}/{video_id}")
def delete_video(course_id: int, video_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM youtube_videos WHERE course_id = ? AND video_id = ?", (course_id, video_id))
    cursor.execute("DELETE FROM transcript_chunks WHERE course_id = ? AND video_id = ?", (course_id, video_id))
    cursor.execute("DELETE FROM video_chapters WHERE course_id = ? AND video_id = ?", (course_id, video_id))
    conn.commit()
    conn.close()
    return {"message": "Video ve transkriptleri silindi."}
