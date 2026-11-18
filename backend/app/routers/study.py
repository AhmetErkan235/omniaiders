import re
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from ..database import get_db
from ..models import CrossMatchRequest, VideoMatchResult, AskTutorRequest, QuizGenerateRequest
from ..services.alignment_service import (
    match_topic_to_video_timestamps,
    format_timestamp,
    expand_query,
    normalize_math_text,
    TOPIC_ALIASES,
    STOP_WORDS
)
from ..services.llm_service import ask_tutor_llm, generate_quiz_questions

router = APIRouter(prefix="/api/study", tags=["study"])

def find_relevant_note_page(content: str, query: str) -> Optional[Dict[str, Any]]:
    """Find the actual PDF/slide page that contains the requested concept."""
    if not content or not query:
        return None
    normalized_query = normalize_math_text(query)
    topic_aliases = next((tuple(normalize_math_text(alias) for alias in aliases)
                          for _, aliases in TOPIC_ALIASES.items()
                          if any(normalize_math_text(alias) in normalized_query for alias in aliases)), ())
    parts = re.split(r'---\s*(?:Sayfa|Slayt)\s+(\d+)\s*---', content, flags=re.IGNORECASE)
    pages = []
    if len(parts) > 1:
        pages = [(int(parts[i]), parts[i + 1].strip()) for i in range(1, len(parts), 2)]
    else:
        pages = [(1, content.strip())]

    # Resolve textbook labels (e.g. "Definition 2.1", "Theorem 2.13", "Example 3.5")
    label = re.search(r'\b(?:definit(?:ion|on)|de(?:fi|.)nition|tan.m|theor(?:em|y)|teor(?:em|i)|example|ornek|örnek|lemma|corollary|section|bolum|bölüm)\s*(\d+(?:\.\d+)*)', query, re.I)
    if label:
        wanted = label.group(1)
        for page_number, page_text in pages:
            match = re.search(r'\b(?:De(?:fi|.)nition|Tan.m|Theor(?:em|y)|Teor(?:em|i)|Example|Ornek|Lemma|Corollary)\s*' + re.escape(wanted) + r'\b', page_text, re.I)
            if not match:
                continue
            next_heading = re.search(r'\n\s*(?:De(?:fi|.)nition|Tan.m|Theor(?:em|y)|Teor(?:em|i)|Example|Theorem|Lemma)\s+\d', page_text[match.end():], re.I)
            end = match.end() + next_heading.start() if next_heading else min(len(page_text), match.start() + 2600)
            excerpt = page_text[match.start():end].strip()
            return {'page': page_number, 'score': 1000, 'excerpt': excerpt[:2600],
                    'location': f"Sayfa {page_number}"}

    query_words = [word for word in re.findall(r'\w+', normalized_query)
                   if len(word) > 2 and word not in STOP_WORDS]
    best = None
    for page_number, page_text in pages:
        normalized_page = normalize_math_text(page_text)
        phrase_matches = [alias for alias in topic_aliases if alias in normalized_page]
        word_matches = sum(1 for word in set(query_words) if word in normalized_page)
        score = (100 + max((len(alias) for alias in phrase_matches), default=0)) if phrase_matches else word_matches
        if score <= 0:
            continue

        positions = [normalized_page.find(alias) for alias in phrase_matches]
        positions = [position for position in positions if position >= 0]
        if positions:
            start = max(0, min(positions) - 420)
            excerpt = page_text[start:start + 1450]
        else:
            excerpt = page_text[:1100]
        result = {
            'page': page_number,
            'score': score,
            'excerpt': excerpt.strip(),
            'location': f"Sayfa {page_number}"
        }
        if best is None or result['score'] > best['score']:
            best = result
    return best

def find_best_material(materials: List[Dict[str, Any]], query: str) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    best_material, best_page = None, None
    for material in materials:
        page = find_relevant_note_page(material.get('content') or '', query)
        if page and (best_page is None or page['score'] > best_page['score']):
            best_material, best_page = material, page
    return best_material, best_page

def detect_referenced_material(user_message: str, materials: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Detect if the user referenced a specific material (e.g. '2. pdften', '2. not') or find best match."""
    if not materials:
        return None

    msg_clean = user_message.lower()

    # 1. Regex matching ordinal references
    ordinal_regex = r'(?:^|\b)(?:(\d+)\.?(?:inci|nci|üncü|ncı)?|(ilk|birinci|ikinci|üçüncü|dördüncü|beşinci))\s*(?:pdf|not|materyal|slayt|dosya|konu|bölüm|bolum|chapter)'
    match = re.search(ordinal_regex, msg_clean)
    if match:
        num_str = match.group(1)
        word_str = match.group(2)
        idx = None
        if num_str:
            idx = int(num_str) - 1
        elif word_str:
            word_map = {'ilk': 0, 'birinci': 0, 'ikinci': 1, 'üçüncü': 2, 'dördüncü': 3, 'beşinci': 4}
            idx = word_map.get(word_str)

        if idx is not None and 0 <= idx < len(materials):
            return materials[idx]

    # 2. Chapter / Section reference (e.g. 'definition 3.1' -> Chapter 3 -> 3-DifferentiableFunctions.pdf)
    label_match = re.search(r'\b(?:definit(?:ion|on)|de(?:fi|.)nition|tan.m|theor(?:em|y)|teor(?:em|i)|example|ornek|örnek|lemma|corollary|section|bolum|bölüm|chapter)\s*(\d+)(?:\.(\d+))?', msg_clean, re.I)
    if label_match:
        chap_num = label_match.group(1)
        for mat in materials:
            if mat['title'].startswith(f"{chap_num}-") or f"chapter {chap_num}" in mat['title'].lower():
                return mat

    # 3. Check for title keywords
    for mat in materials:
        title_lower = mat['title'].lower()
        base_name = re.sub(r'\.(pdf|pptx|ppt|txt)$', '', title_lower)
        words = [w for w in re.split(r'[-_\s]+', base_name) if len(w) > 3 and not w.isdigit()]
        for w in words:
            if w in msg_clean:
                return mat

    target, _ = find_best_material(materials, expand_query(msg_clean))
    return target

@router.post("/match", response_model=List[VideoMatchResult])
def match_concept_to_video(req: CrossMatchRequest):
    """
    Finds the exact moment in uploaded YouTube videos
    that teaches the concept found in the notes or PDF!
    """
    matches = match_topic_to_video_timestamps(
        course_id=req.course_id,
        query_text=req.query_text,
        top_k=req.top_k or 5
    )
    return matches

@router.post("/ask-tutor")
def ask_tutor(req: AskTutorRequest):
    """
    Intelligent AI Study Companion that teaches concepts, resolves doubts,
    and references course materials and YouTube videos with verified timestamps.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM courses WHERE id = ?", (req.course_id,))
    c_row = cursor.fetchone()
    course_name = c_row['name'] if c_row else "Ders"

    cursor.execute("SELECT id, title, type, content, metadata_json FROM materials WHERE course_id = ? ORDER BY id ASC", (req.course_id,))
    all_materials = [dict(m) for m in cursor.fetchall()]

    # Check if current message explicitly specifies a new math concept or chapter
    clean_msg = req.message.lower().strip()
    topic_keywords = [
        'teorem', 'theorem', 'tanim', 'tanım', 'definition', 'limit', 'turev', 'türev',
        'integral', 'fonksiyon', 'function', 'sandvic', 'sandviç', 'squeeze', 'ivt', 'mvt',
        'rolle', 'lhopital', 'zincir', 'chain', 'parcali', 'piecewise', 'asimptot',
        'intermediate', 'mean value', 'extreme value', 'sureklilik', 'süreklilik'
    ]
    
    has_explicit_topic = any(kw in clean_msg for kw in topic_keywords)
    has_ordinal = bool(re.search(r'(?:^|)(?:(\d+)\.?(?:inci|nci|üncü|ncı)?|(ilk|birinci|ikinci|üçüncü|dördüncü|beşinci))\s*(?:pdf|not|materyal|slayt|dosya|konu|bölüm|bolum|chapter)', clean_msg))
    has_label = bool(re.search(r'(?:definit(?:ion|on)|de(?:fi|.)nition|tan.m|theor(?:em|y)|teor(?:em|i)|example|ornek|örnek|lemma|corollary|section|bolum|bölüm|chapter)\s*(\d+(?:\.\d+)*)', clean_msg, re.I))

    previous_topic = ""
    if not (has_explicit_topic or has_ordinal or has_label) and req.history:
        for h in reversed(req.history):
            if h.get("role") == "user":
                txt = (h.get("text") or h.get("content") or "").strip()
                if any(kw in txt.lower() for kw in topic_keywords):
                    previous_topic = txt
                    break

    effective_topic_query = f"{previous_topic} {req.message}" if previous_topic else (req.selected_text or req.message)
    search_query = expand_query(effective_topic_query)

    explicit_material = detect_referenced_material(effective_topic_query, all_materials)
    active_material = next((m for m in all_materials if m['id'] == req.context_material_id), None)

    target_material, target_page = None, None

    if explicit_material:
        target_material = explicit_material
        target_page = find_relevant_note_page(target_material.get('content') or '', req.selected_text or effective_topic_query)
        if not target_page:
            target_page = find_relevant_note_page(target_material.get('content') or '', search_query)
        if not target_page:
            target_page = {'page': 1, 'location': 'Sayfa 1', 'score': 10, 'excerpt': (target_material.get('content') or '')[:1000]}
    elif req.selected_text and active_material:
        # If user explicitly selected a snippet of text on the current page, stay on this material
        target_material = active_material
        target_page = find_relevant_note_page(active_material.get('content') or '', req.selected_text)
        if not target_page:
            target_page = {'page': 1, 'location': 'Sayfa 1', 'score': 100, 'excerpt': req.selected_text[:1200]}
    else:
        # User asked a topic question in chat: search across all materials
        best_material, best_page = find_best_material(all_materials, search_query)
        if best_material and best_page and best_page.get('score', 0) >= 10:
            target_material, target_page = best_material, best_page
        elif active_material:
            active_page = find_relevant_note_page(active_material.get('content') or '', search_query)
            if active_page and active_page.get('score', 0) >= 10:
                target_material, target_page = active_material, active_page

    notes_context = ""
    if target_material and target_page:
        notes_context = (
            f"Kaynak Not: {target_material['title']} ({target_page['location']})\n"
            f"İlgili Not Kesiti:\n{target_page['excerpt']}"
        )
    elif target_material:
        content_preview = (target_material.get('content') or '')[:3000]
        notes_context = f"Kaynak Materyal: {target_material['title']}\n{content_preview}"
    else:
        notes_context = (
            "Ders Notlarında Bulunmuyor: Yüklenen ders materyallerinde bu konunun doğrudan bir tanımı yer almamaktadır. "
            "Konu anlatımı ve soru çözümleri için ilgili YouTube videolarını kullanabilirsin."
        )

    # Precise Timestamp Alignment across candidate videos
    matched_videos = match_topic_to_video_timestamps(
        course_id=req.course_id,
        query_text=search_query,
        top_k=5
    )

    # Format real video matches to feed into LLM context (strictly without timestamps as requested)
    video_context = "--- SİSTEMDE BULUNAN İLGİLİ GERÇEK YOUTUBE VİDEOLARI ---\n"
    if matched_videos:
        for idx, mv in enumerate(matched_videos):
            mv['video_title'] = mv.get('video_title') or mv.get('title')
            mv['title'] = mv['video_title']
            video_context += (
                f"{idx + 1}. Video (ID: {mv['video_id']}): \"{mv['video_title']}\"\n"
                f"   Kanal: {mv.get('channel_name', 'Ders Anlatımı')}\n"
                f"   İçerik Odak Noktası: \"{mv.get('text_snippet', '')[:180]}\"\n\n"
            )
    else:
        video_context += "(Bu konu için henüz eşleşen bir video bulunamadı.)\n"

    # If a target page is identified, render its visual page image for Gemini Vision
    page_image_bytes = None
    if target_material and target_page and target_material.get('file_path'):
        fpath = target_material['file_path']
        if os.path.exists(fpath):
            ext = Path(fpath).suffix.lower()
            if ext == '.pdf':
                try:
                    import fitz
                    p_num = int(target_page.get('page') or 1)
                    doc = fitz.open(fpath)
                    if 1 <= p_num <= len(doc):
                        pix = doc.load_page(p_num - 1).get_pixmap(dpi=150)
                        page_image_bytes = pix.tobytes("jpeg")
                    doc.close()
                except Exception:
                    pass
            elif ext in ('.png', '.jpg', '.jpeg', '.webp'):
                try:
                    with open(fpath, 'rb') as f:
                        page_image_bytes = f.read()
                except Exception:
                    pass

    conn.close()

    answer = ask_tutor_llm(
        course_name=course_name,
        user_message=req.message,
        notes_context=notes_context,
        video_context=video_context,
        selected_text=req.selected_text,
        history=req.history,
        page_image_bytes=page_image_bytes
    )

    top_match = matched_videos[0] if matched_videos else None

    return {
        "course_name": course_name,
        "answer": answer,
        "matched_videos": matched_videos,
        "top_video_id": top_match['video_id'] if top_match else None,
        "top_timestamp": top_match['start_seconds'] if top_match else None,
        "top_timestamp_formatted": top_match['timestamp_formatted'] if top_match else None,
        "target_material_id": target_material['id'] if target_material else None,
        "target_material_title": target_material['title'] if target_material else None,
        "target_page": target_page['page'] if target_page else None,
        "target_location": target_page['location'] if target_page else None
    }

@router.post("/quiz")
def generate_quiz(req: QuizGenerateRequest):
    """Generates interactive quiz test questions based on notes and video content."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM courses WHERE id = ?", (req.course_id,))
    c_row = cursor.fetchone()
    course_name = c_row['name'] if c_row else "Ders"

    context_text = ""
    if req.topic:
        context_text = f"Quiz Konusu: {req.topic}\n"

    cursor.execute("SELECT content FROM materials WHERE course_id = ? LIMIT 2", (req.course_id,))
    m_rows = cursor.fetchall()
    for mr in m_rows:
        if mr['content']:
            context_text += f"{mr['content'][:1500]}\n"

    conn.close()

    questions = generate_quiz_questions(
        course_name=course_name,
        topic=req.topic or "Ders Genel Konuları",
        context_text=context_text,
        count=req.question_count or 5
    )

    return {"questions": questions}
