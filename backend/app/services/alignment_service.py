import re
import unicodedata
import concurrent.futures
from typing import List, Dict, Any
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from ..database import get_db
from .youtube_service import fetch_transcript_chunks

TOPIC_ALIASES = {
    'ara deger teoremi': ('ara deger teoremi', 'ara deger', 'intermediate value theorem', 'intermediate value', 'ivt'),
    'sandvic teoremi': ('sandvic teoremi', 'sikistirma teoremi', 'sikistirma', 'sandwich theorem', 'squeeze theorem', 'squeeze', 'sandwich'),
    'ortalama deger teoremi': ('ortalama deger teoremi', 'mean value theorem', 'mvt'),
    'rolle teoremi': ('rolle teoremi', 'rolle theorem', 'rolle'),
    'lhopital kurali': ("l'hopital rule", "lhopital's rule", 'lhopital', 'l hopital'),
    'zincir kurali': ('zincir kurali', 'chain rule'),
    'asimptot': ('asimptot', 'asymptote'),
    'parcali fonksiyon': ('parcali fonksiyon', 'piecewise function', 'piecewise'),
    'turev tanimi': ('turev tanimi', 'teget ve turev', 'derivative at a point', 'tangent lines', 'derivative as a function', 'definition 3.1', 'tanim 3.1'),
    'limit tanimi': ('limit tanimi', 'the precise definition of a limit', 'epsilon delta', 'definition 2.1', 'tanim 2.1', 'definition 2.3'),
}

STOP_WORDS = set("""
bana anlat nedir nelerdir hakkinda soru hocam nasil cozulur ilk konu sey ve ile bir bu da de the and for with ders video videoda bul lutfen ac izleyeyim sen goster not pdf istiyorum hem nerede bulun ilgili videolari videoyu anlatmani acikla
""".split())

def format_timestamp(seconds: float) -> str:
    """Convert seconds to mm:ss or hh:mm:ss format."""
    total_sec = int(seconds)
    hours = total_sec // 3600
    minutes = (total_sec % 3600) // 60
    secs = total_sec % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"

def turkish_lower(text: str) -> str:
    """Normalize Turkish and repair common UTF-8/Latin-1 mojibake."""
    if not text:
        return ""
    for _ in range(2):
        if not any(marker in text for marker in (chr(0x00c3), chr(0x00c4), chr(0x00c5), chr(0x00e2))):
            break
        try:
            repaired = text.encode('latin-1').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            break
        if repaired == text:
            break
        text = repaired
    text = text.replace(chr(0x2019), "'").replace("`", "'").lower()
    return ''.join(ch for ch in unicodedata.normalize('NFKD', text) if not unicodedata.combining(ch))


def normalize_math_text(text: str) -> str:
    """Canonicalize Turkish/English calculus terms for retrieval."""
    if not text:
        return ""
    text = turkish_lower(text)
    text = re.sub(r'\b(?:theorems?|teoremi?)\b', 'theorem', text)
    text = re.sub(r'\b(?:functions?|fonksiyon(?:u|lar|lari)?)\b', 'function', text)
    text = re.sub(r'\b(?:limits?|limitleri?)\b', 'limit', text)
    text = re.sub(r'\b(?:derivatives?|turev(?:i|leri)?)\b', 'derivative', text)
    text = re.sub(r'\b(?:continuity|sureklilik)\b', 'continuity', text)
    return text


def expand_query(query: str) -> str:
    """Expand recognized concepts using the same normalization as indexing."""
    q_norm = normalize_math_text(query)
    for topic, aliases in TOPIC_ALIASES.items():
        if any(normalize_math_text(alias) in q_norm for alias in aliases):
            return ' '.join((topic, *aliases))
    return query

def find_relevant_videos(course_id: int, query_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """Find a few relevant videos by concept/title, never timestamp segments."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT v.video_id, v.title, v.url, v.channel_name, v.thumbnail_url,
           COALESCE(GROUP_CONCAT(c.text, char(10)), '') AS cached_transcript
    FROM youtube_videos v
    LEFT JOIN transcript_chunks c ON c.course_id = v.course_id AND c.video_id = v.video_id
    WHERE v.course_id = ?
    GROUP BY v.id
    """, (course_id,))
    videos = [dict(row) for row in cursor.fetchall()]
    conn.close()
    if not videos:
        return []

    normalized_query = normalize_math_text(query_text)
    expanded_query = normalize_math_text(expand_query(query_text))
    topic = next((key for key, aliases in TOPIC_ALIASES.items()
                  if any(normalize_math_text(alias) in normalized_query for alias in aliases)), None)
    aliases = tuple(normalize_math_text(alias) for alias in TOPIC_ALIASES.get(topic, ())) if topic else ()
    requested_aliases = tuple(alias for alias in aliases if alias in normalized_query)
    title_aliases = requested_aliases or aliases
    words = [word for word in re.findall(r'\w+', expanded_query)
             if len(word) > 2 and word not in STOP_WORDS]
    ranked = []
    title_ranked = []
    for video in videos:
        title = normalize_math_text(video['title'] or '')
        transcript = normalize_math_text(video.get('cached_transcript') or '')
        if topic:
            title_hit = any(alias in title for alias in title_aliases)
            transcript_chunks = [normalize_math_text(chunk) for chunk in (video.get('cached_transcript') or '').splitlines()]
            transcript_hits = sum(any(alias in chunk for alias in aliases) for chunk in transcript_chunks)
            # Exact concept identity is required: a shared generic word like
            # "theorem" or one incidental caption mention cannot make another
            # lesson rank for the Intermediate Value Theorem.
            if title_hit:
                score = 100 + max((len(alias) for alias in title_aliases if alias in title), default=0)
                title_ranked.append((score, video))
            elif transcript_hits >= 2:
                score = 30 + max((len(alias) for alias in aliases if alias in transcript), default=0) + transcript_hits
            else:
                continue
        else:
            title_hits = sum(1 for word in set(words) if word in title)
            transcript_hits = sum(1 for word in set(words) if word in transcript)
            if not title_hits and transcript_hits < 2:
                continue
            score = title_hits * 5 + transcript_hits
            section_markers = re.findall(r'\b\d+\.\d+\b', normalized_query)
            score += 20 * sum(1 for marker in section_markers if marker in title)
        ranked.append((score, video))

    if title_ranked:
        ranked = title_ranked
    ranked.sort(key=lambda item: item[0], reverse=True)
    results = []
    seen_ids = set()
    seen_titles = set()
    for _, video in ranked:
        video_id = str(video.get('video_id') or '').strip()
        title_key = re.sub(r'\W+', ' ', normalize_math_text(video.get('title') or '')).strip()
        if not video_id or video_id in seen_ids or not title_key or title_key in seen_titles:
            continue
        seen_ids.add(video_id)
        seen_titles.add(title_key)
        results.append({key: video[key] for key in ('video_id', 'title', 'url', 'channel_name', 'thumbnail_url')})
        if len(results) >= max(1, min(top_k, 5)):
            break
    return results

def find_candidate_videos(
    course_id: int,
    query_text: str,
    top_k: int = 5
) -> List[Dict[str, Any]]:
    """
    Stage 1: Fast Candidate Video Finder with Semantic Concept Mapping.
    Analyzes video titles across hundreds of videos in milliseconds,
    matching chapters, sections (e.g. 2.1, 1.3), acronyms (IVT, MVT), and topic keywords.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT v.id, v.video_id, v.title, v.channel_name, v.duration_seconds, v.thumbnail_url,
           COALESCE(GROUP_CONCAT(c.text, ' '), '') AS cached_transcript
    FROM youtube_videos v
    LEFT JOIN transcript_chunks c ON c.course_id = v.course_id AND c.video_id = v.video_id
    WHERE v.course_id = ?
    GROUP BY v.id
    """, (course_id,))
    all_videos = [dict(r) for r in cursor.fetchall()]
    conn.close()

    if not all_videos:
        return []

    # Expand acronyms and canonicalize
    expanded_q = expand_query(query_text.strip())
    clean_q = normalize_math_text(expanded_q)

    # Extract any section markers like '2.1', '1.2', '3.4', '2.5'
    # Only boost a section explicitly requested by the learner. Concept map
    # expansions contain illustrative section numbers and must not bias results.
    section_markers = re.findall(r'\b\d+\.\d+\b', normalize_math_text(query_text))

    # Clean words
    q_words = [w for w in re.split(r'\W+', clean_q) if len(w) > 2 and w not in STOP_WORDS]

    # Cached transcript text helps surface a lesson even when its title is
    # generic (e.g. "Lecture 4") and the topic appears only in its captions.
    video_docs = [normalize_math_text(f"{v['title']} {v.get('cached_transcript') or ''}") for v in all_videos]
    titles_norm = [normalize_math_text(v['title']) for v in all_videos]

    try:
        vec = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)
        X = vec.fit_transform(video_docs)
        q_vec = vec.transform([clean_q])
        sims = cosine_similarity(q_vec, X).flatten()
    except Exception:
        sims = [0.0] * len(all_videos)

    scored = []
    for idx, v in enumerate(all_videos):
        base_score = float(sims[idx])
        t_lower = titles_norm[idx]
        doc_lower = video_docs[idx]

        # Section and chapter routing: decisive boost for exact section, strong penalty for wrong chapter
        section_bonus = 0.0
        v_chap_match = re.search(r'\b(?:bolum|bölüm|chapter)\s*(\d+)', t_lower)
        v_chap = v_chap_match.group(1) if v_chap_match else None

        for sec in section_markers:
            if sec in t_lower:
                section_bonus += 5.0
            else:
                target_chap = sec.split('.')[0]
                if v_chap and v_chap != target_chap:
                    section_bonus -= 10.0

        # Topic concept title match boost (e.g. "ara değer teoremi" -> video title contains "ara değer")
        for topic_key, aliases in TOPIC_ALIASES.items():
            if any(alias in clean_q for alias in aliases):
                if any(alias in t_lower for alias in aliases):
                    section_bonus += 4.0
                break

        # Keyword overlap bonus
        matches = sum(1 for w in q_words if w in doc_lower)
        overlap = matches / len(q_words) if q_words else 0

        total_score = (base_score * 0.45) + (overlap * 0.35) + section_bonus
        scored.append((v, total_score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [item[0] for item in scored[:top_k]]

def ensure_candidate_transcripts(course_id: int, candidate_video_ids: List[str]):
    """
    Stage 2: Ultra-Fast Parallel On-Demand Chapter & Transcript Indexer.
    Only fetches for top candidate videos in parallel if uncached,
    and caches them permanently in SQLite.
    """
    if not candidate_video_ids:
        return

    target_ids = candidate_video_ids[:6]

    conn = get_db()
    cursor = conn.cursor()

    uncached_ids = []
    for v_id in target_ids:
        cursor.execute("SELECT count(*) as cnt FROM transcript_chunks WHERE course_id = ? AND video_id = ?", (course_id, v_id))
        row = cursor.fetchone()
        if not row or row['cnt'] == 0:
            uncached_ids.append(v_id)

    if not uncached_ids:
        conn.close()
        return

    # Fetch in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(uncached_ids)) as executor:
        results = list(executor.map(fetch_transcript_chunks, uncached_ids))

    for v_id, chunks in zip(uncached_ids, results):
        if chunks:
            for ch in chunks:
                cursor.execute("""
                INSERT INTO transcript_chunks (video_id, course_id, start_seconds, duration, text)
                VALUES (?, ?, ?, ?, ?)
                """, (v_id, course_id, ch['start_seconds'], ch['duration'], ch['text']))

    conn.commit()
    conn.close()

def match_topic_to_video_timestamps(
    course_id: int,
    query_text: str,
    top_k: int = 5
) -> List[Dict[str, Any]]:
    """
    Stage 3: Fine-Grained Timestamp and Segment Alignment.
    """
    if not query_text or not query_text.strip():
        return []

    expanded_q = expand_query(query_text.strip())

    # 1. Stage 1: Candidate videos
    candidate_videos = find_candidate_videos(course_id, query_text, top_k=6)
    candidate_v_ids = [v['video_id'] for v in candidate_videos]
    if not candidate_v_ids:
        return []

    # 2. Stage 2: Ensure chapters/transcripts for candidates
    ensure_candidate_transcripts(course_id, candidate_v_ids)

    # 3. Stage 3: Retrieve chunks from DB
    conn = get_db()
    cursor = conn.cursor()

    placeholders = ','.join('?' for _ in candidate_v_ids)
    cursor.execute(f"""
    SELECT 
        c.id, c.video_id, c.start_seconds, c.duration, c.text,
        v.title as video_title, v.channel_name, v.thumbnail_url
    FROM transcript_chunks c
    JOIN youtube_videos v ON c.video_id = v.video_id AND c.course_id = v.course_id
    WHERE c.course_id = ? AND c.video_id IN ({placeholders})
    """, (course_id, *candidate_v_ids))
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return []

    clean_q = normalize_math_text(expanded_q)
    corpus = [normalize_math_text(row['text']) for row in rows]

    try:
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)
        tfidf_matrix = vectorizer.fit_transform(corpus)
        query_vec = vectorizer.transform([clean_q])
        similarities = cosine_similarity(query_vec, tfidf_matrix).flatten()
    except Exception:
        similarities = [0.0] * len(corpus)

    section_markers = re.findall(r'\b\d+\.\d+\b', normalize_math_text(query_text))
    q_words = [w for w in re.split(r'\W+', clean_q) if len(w) > 2 and w not in STOP_WORDS]

    results = []
    for idx, row in enumerate(rows):
        base_score = float(similarities[idx])
        chunk_text_lower = corpus[idx]
        v_id = row['video_id']

        # Section and chapter routing
        v_title_norm = normalize_math_text(row['video_title'])
        sec_bonus = 0.0
        v_chap_match = re.search(r'\b(?:bolum|bölüm|chapter)\s*(\d+)', v_title_norm)
        v_chap = v_chap_match.group(1) if v_chap_match else None

        for sec in section_markers:
            if sec in v_title_norm or sec in chunk_text_lower:
                sec_bonus += 5.0
            else:
                target_chap = sec.split('.')[0]
                if v_chap and v_chap != target_chap:
                    sec_bonus -= 10.0

        # Topic concept title match boost
        for topic_key, aliases in TOPIC_ALIASES.items():
            if any(alias in clean_q for alias in aliases):
                if any(alias in v_title_norm for alias in aliases):
                    sec_bonus += 4.0
                break

        # Keyword match
        overlap_count = sum(1 for word in q_words if word in chunk_text_lower)
        overlap_ratio = overlap_count / len(q_words) if q_words else 0

        final_score = (base_score * 0.6) + (overlap_ratio * 0.4) + sec_bonus

        if final_score > 0.04 or overlap_count > 0 or sec_bonus > 0:
            start_sec = float(row['start_seconds'])
            dur = float(row['duration'])
            end_sec = start_sec + dur

            results.append({
                'video_id': v_id,
                'video_title': row['video_title'],
                'channel_name': row['channel_name'],
                'thumbnail_url': row['thumbnail_url'],
                'start_seconds': start_sec,
                'end_seconds': round(end_sec, 2),
                'timestamp_formatted': format_timestamp(start_sec),
                'text_snippet': row['text'],
                'score': round(final_score, 4),
                'youtube_embed_url': f"https://www.youtube.com/embed/{v_id}?start={int(start_sec)}&autoplay=1",
                'youtube_watch_url': f"https://www.youtube.com/watch?v={v_id}&t={int(start_sec)}s"
            })

    results.sort(key=lambda x: x['score'], reverse=True)

    # Strictly deduplicate by video_id: each video appears AT MOST ONCE with its best timestamp
    deduped = []
    seen_ids = set()
    for r in results:
        if r['score'] < 0:
            continue
        if r['video_id'] not in seen_ids:
            seen_ids.add(r['video_id'])
            deduped.append(r)
            if len(deduped) >= top_k:
                break

    # If transcript chunks didn't yield enough, fill with candidate_videos
    if len(deduped) < top_k and candidate_videos:
        for cv in candidate_videos:
            if cv['video_id'] not in seen_ids:
                seen_ids.add(cv['video_id'])
                deduped.append({
                    'video_id': cv['video_id'],
                    'video_title': cv['title'],
                    'channel_name': cv.get('channel_name', ''),
                    'thumbnail_url': cv.get('thumbnail_url', ''),
                    'start_seconds': 0,
                    'end_seconds': 0,
                    'timestamp_formatted': '00:00',
                    'text_snippet': cv.get('title', ''),
                    'score': 1.0,
                    'youtube_embed_url': f"https://www.youtube.com/embed/{cv['video_id']}?start=0&autoplay=1",
                    'youtube_watch_url': f"https://www.youtube.com/watch?v={cv['video_id']}"
                })
                if len(deduped) >= top_k:
                    break

    return deduped
