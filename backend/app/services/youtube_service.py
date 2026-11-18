import re
import urllib.parse
import concurrent.futures
from typing import List, Dict, Any, Optional
from youtube_transcript_api import YouTubeTranscriptApi
import yt_dlp

def extract_video_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from various URL formats."""
    parsed = urllib.parse.urlparse(url)
    if parsed.hostname in ('youtu.be', 'www.youtu.be'):
        return parsed.path.lstrip('/')
    if parsed.hostname in ('youtube.com', 'www.youtube.com', 'm.youtube.com'):
        if parsed.path == '/watch':
            qs = urllib.parse.parse_qs(parsed.query)
            return qs.get('v', [None])[0]
        elif parsed.path.startswith('/embed/'):
            return parsed.path.split('/')[2]
        elif parsed.path.startswith('/v/'):
            return parsed.path.split('/')[2]
        elif parsed.path.startswith('/shorts/'):
            return parsed.path.split('/')[2]
    # If the user directly pasted an 11-char ID
    if len(url) == 11 and re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
    return None

def is_playlist_url(url: str) -> bool:
    return 'list=' in url or '/playlist' in url or '/channel/' in url or '/c/' in url or '/@' in url

def fetch_playlist_or_channel_videos(url: str, max_videos: int = 250) -> List[Dict[str, Any]]:
    """Extract video entries from a playlist or channel URL (up to 250 videos) very quickly."""
    ydl_opts = {
        'extract_flat': 'in_playlist',
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'playlist_items': f'1-{max_videos}'
    }
    videos = []
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if 'entries' in info:
                for entry in info['entries']:
                    if entry and entry.get('id'):
                        videos.append({
                            'video_id': entry.get('id'),
                            'title': entry.get('title', f"Video {entry.get('id')}"),
                            'url': f"https://www.youtube.com/watch?v={entry.get('id')}",
                            'channel_name': entry.get('uploader') or entry.get('channel') or info.get('title', 'YouTube'),
                            'duration_seconds': int(entry.get('duration') or 0),
                            'thumbnail_url': f"https://img.youtube.com/vi/{entry.get('id')}/hqdefault.jpg"
                        })
            elif info.get('id'):
                videos.append({
                    'video_id': info.get('id'),
                    'title': info.get('title', 'YouTube Video'),
                    'url': f"https://www.youtube.com/watch?v={info.get('id')}",
                    'channel_name': info.get('uploader') or 'YouTube',
                    'duration_seconds': int(info.get('duration') or 0),
                    'thumbnail_url': f"https://img.youtube.com/vi/{info.get('id')}/hqdefault.jpg"
                })
    except Exception as e:
        print(f"Error fetching playlist info: {e}")
    return videos

def search_youtube_playlists(targets: List[Dict[str, Any]], max_per_target: int = 1) -> List[Dict[str, Any]]:
    """
    Given a list of search target dictionaries:
    [
        {"query": "Üniversite Kimyası Genel Kimya 1", "category": "yerli", "pedagogical_focus": "..."},
        ...
    ]
    Searches YouTube concurrently with the Playlist filter (sp=EgIQAw%253D%253D)
    and returns live, verified YouTube playlist items with deduping.
    """
    def search_single_target(target: Dict[str, Any]) -> List[Dict[str, Any]]:
        query_text = target.get("query", "").strip()
        if not query_text:
            return []
        
        encoded_q = urllib.parse.quote_plus(query_text)
        search_url = f"https://www.youtube.com/results?search_query={encoded_q}&sp=EgIQAw%253D%253D"
        
        ydl_opts = {
            'extract_flat': True,
            'skip_download': True,
            'quiet': True,
            'no_warnings': True,
            'playlist_items': f'1-{max(1, max_per_target)}'
        }
        
        found = []
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(search_url, download=False)
                entries = (info.get('entries') or [])[:max_per_target]
                for entry in entries:
                    if not entry:
                        continue
                    p_url = entry.get('url') or f"https://www.youtube.com/playlist?list={entry.get('id')}"
                    p_id = entry.get('id') or extract_video_id(p_url) or ""
                    
                    # Extract best thumbnail
                    thumbs = entry.get('thumbnails') or []
                    thumb_url = thumbs[-1].get('url') if thumbs else f"https://img.youtube.com/vi/{p_id}/hqdefault.jpg"
                    
                    found.append({
                        'playlist_id': p_id,
                        'url': p_url,
                        'title': entry.get('title') or query_text,
                        'channel_name': entry.get('uploader') or entry.get('channel') or "YouTube",
                        'thumbnail_url': thumb_url,
                        'category': target.get('category', 'global'),
                        'pedagogical_focus': target.get('pedagogical_focus', ''),
                        'matched_query': query_text
                    })
        except Exception as e:
            print(f"Error searching playlist for '{query_text}': {e}")
            
        return found

    results = []
    # Concurrently search targets with a max of 5 threads
    max_workers = min(6, max(1, len(targets)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures_to_target = {executor.submit(search_single_target, t): t for t in targets}
        for future in concurrent.futures.as_completed(futures_to_target):
            try:
                items = future.result()
                results.extend(items)
            except Exception as e:
                print(f"Playlist search future error: {e}")

    # Deduplicate by playlist_id and URL
    unique_playlists = []
    seen_ids = set()
    seen_urls = set()

    for item in results:
        pid = item.get('playlist_id')
        purl = item.get('url')
        if (pid and pid in seen_ids) or (purl and purl in seen_urls):
            continue
        if pid:
            seen_ids.add(pid)
        if purl:
            seen_urls.add(purl)
        unique_playlists.append(item)

    # Order yerli first, then global, maintaining rich variety
    unique_playlists.sort(key=lambda x: (0 if x.get('category') == 'yerli' else 1))
    return unique_playlists

def fetch_single_video_metadata(video_id: str) -> Dict[str, Any]:
    """Fetch title and channel for single video."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'video_id': video_id,
                'title': info.get('title', f"Video {video_id}"),
                'url': url,
                'channel_name': info.get('uploader', 'YouTube'),
                'duration_seconds': int(info.get('duration') or 0),
                'thumbnail_url': f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
                'description': info.get('description', ''),
                'chapters': info.get('chapters', [])
            }
    except Exception:
        return {
            'video_id': video_id,
            'title': f"YouTube Video ({video_id})",
            'url': url,
            'channel_name': 'YouTube',
            'duration_seconds': 0,
            'thumbnail_url': f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
            'description': '',
            'chapters': []
        }

def clean_and_harmonize_chapters(raw_items: List[Dict[str, Any]], video_title: str = "") -> List[Dict[str, Any]]:
    """
    Cleans, deduplicates, and harmonizes video chapters:
    - Merges timestamps within 35 seconds of each other.
    - Resolves conflicting numbering (e.g. 1. soru vs 2. soru).
    - Harmonizes question and example titles to clean, professional Turkish.
    - Guarantees strictly increasing timestamps and 00:00 intro.
    """
    if not raw_items:
        return []

    # Sort strictly by timestamp
    sorted_items = sorted(raw_items, key=lambda x: float(x.get('start_seconds', 0)))

    clusters = []
    current_cluster = []

    for item in sorted_items:
        sec = round(float(item.get('start_seconds', 0)), 1)
        title = str(item.get('title', '')).strip()
        if video_title:
            clean_suf = f" - {video_title}".strip()
            if title.endswith(clean_suf):
                title = title[:-len(clean_suf)].strip()
        
        title = re.sub(r'^[#*_\-\s\.\:]+', '', title).strip()
        if not title:
            continue

        item_cleaned = {
            'start_seconds': sec,
            'title': title,
            'description': str(item.get('description', '')).strip(),
            'source': item.get('source', 'youtube')
        }

        if not current_cluster:
            current_cluster.append(item_cleaned)
        else:
            prev_sec = current_cluster[0]['start_seconds']
            if abs(sec - prev_sec) <= 35:
                current_cluster.append(item_cleaned)
            else:
                clusters.append(current_cluster)
                current_cluster = [item_cleaned]

    if current_cluster:
        clusters.append(current_cluster)

    merged = []
    question_regex = re.compile(r'(?:(?:örnek|ornek|soru|problem)\s*(\d+)|\b(\d+)\s*\.?\s*(?:soru|örnek|ornek|problem))', re.IGNORECASE)

    for cluster in clusters:
        best = cluster[0]
        best_score = -1

        for c in cluster:
            score = 0
            t = c['title']
            score += min(len(t), 50)
            if re.search(r'\d+\.\s*(?:Soru|Örnek)', t):
                score += 30
            if 'çözüm' in t.lower() or 'cozum' in t.lower():
                score += 15
            if c.get('description'):
                score += 10
            if question_regex.search(t):
                score += 20

            if score > best_score:
                best_score = score
                best = c

        merged.append(best)

    # Check sequential question/problem numbering
    question_count = 0
    for idx, item in enumerate(merged):
        t = item['title']
        m = re.match(r'^(?:(\d+)\.?\s*(?:soru|örnek|ornek|problem)\s*(?:çözümü|cozumu)?|(?:örnek|ornek|soru|problem)\s*(\d+)\s*(?:çözümü|cozumu)?)(.*)$', t, re.IGNORECASE)
        if m:
            question_count += 1
            extra = m.group(3).strip()
            if extra.startswith(('-', ':', '—')):
                extra = extra[1:].strip()
            
            if extra:
                if not extra.startswith('(') and not extra.endswith(')'):
                    extra = f"({extra})"
                item['title'] = f"{question_count}. Soru Çözümü {extra}".strip()
            else:
                item['title'] = f"{question_count}. Soru Çözümü"

    # Ensure 00:00 exists
    if not merged or merged[0]['start_seconds'] > 15:
        clean_title = re.sub(r'^[^\w]+', '', video_title)
        intro_title = f"{clean_title[:45]} — Giriş ve Konu Özeti" if clean_title else "Giriş ve Konu Özeti"
        merged.insert(0, {
            'start_seconds': 0.0,
            'title': intro_title,
            'description': 'Dersin başlangıcı ve temel kavramlara genel bakış.',
            'source': 'generated'
        })
    else:
        merged[0]['start_seconds'] = 0.0

    return merged

def fetch_transcript_chunks(video_id: str) -> List[Dict[str, Any]]:
    """
    High-precision video segment and transcript extractor.
    Combines:
    1. Native YouTube chapters with exact second markers.
    2. Description timestamp lines (e.g., '01:08 Konu Mantığı', '05:27 Örnek').
    3. Fine-grained 15-20s subtitle micro-chunks from youtube-transcript-api.
    """
    chunks = []
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    video_title = ""
    duration = 0
    chapters = []
    description = ""

    # 1. Fetch metadata & chapters via yt-dlp
    try:
        ydl_opts = {'skip_download': True, 'quiet': True, 'no_warnings': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            video_title = info.get('title', '')
            duration = int(info.get('duration') or 0)
            chapters = info.get('chapters') or []
            description = info.get('description', '')
    except Exception as e:
        print(f"Error fetching yt-dlp metadata for {video_id}: {e}")

    # 2. Extract & Harmonize Native Chapters and Description Timestamps
    raw_chapter_candidates = []
    if chapters:
        for ch in chapters:
            st = float(ch.get('start_time', 0))
            ch_title = ch.get('title', '').strip()
            if ch_title:
                raw_chapter_candidates.append({
                    'start_seconds': round(st, 2),
                    'title': ch_title,
                    'source': 'youtube'
                })

    if description:
        timestamp_pattern = r'(?:^|\n)\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–:]?\s*([^\n\r]+)'
        matches = re.findall(timestamp_pattern, description)
        for m in matches:
            h, mins, s, ch_text = m
            st = float((int(h) * 3600 if h else 0) + int(mins) * 60 + int(s))
            clean_ch_text = ch_text.strip()
            if clean_ch_text:
                raw_chapter_candidates.append({
                    'start_seconds': round(st, 2),
                    'title': clean_ch_text,
                    'source': 'description'
                })

    # Harmonize and deduplicate so question sequence and timestamps are pristine
    cleaned_markers = clean_and_harmonize_chapters(raw_chapter_candidates, video_title)
    for idx, cm in enumerate(cleaned_markers):
        next_sec = cleaned_markers[idx + 1]['start_seconds'] if idx + 1 < len(cleaned_markers) else (cm['start_seconds'] + 45.0)
        dur = max(5.0, next_sec - cm['start_seconds'])
        chunks.append({
            'video_id': video_id,
            'start_seconds': cm['start_seconds'],
            'duration': round(dur, 2),
            'text': f"{cm['title']} - {video_title}"
        })

    # 4. Try fetching subtitles using youtube-transcript-api (short 15-20s windows)
    raw_subtitles = []
    try:
        ytt = YouTubeTranscriptApi()
        if hasattr(ytt, 'fetch'):
            try:
                raw_subtitles = ytt.fetch(video_id, languages=['tr', 'en'])
            except Exception:
                try:
                    raw_subtitles = ytt.fetch(video_id)
                except Exception:
                    pass
    except Exception as e:
        pass

    if raw_subtitles:
        sub_chunks = []
        current_text = []
        chunk_start = 0.0
        chunk_end = 0.0

        for item in raw_subtitles:
            if isinstance(item, dict):
                start = float(item.get('start', 0.0))
                dur = float(item.get('duration', 0.0))
                text = str(item.get('text', '')).strip()
            else:
                start = float(getattr(item, 'start', 0.0))
                dur = float(getattr(item, 'duration', 0.0))
                text = str(getattr(item, 'text', '')).strip()

            if not text:
                continue

            if not current_text:
                chunk_start = start
                chunk_end = start + dur
                current_text.append(text)
            else:
                # Fine-grained 15-20 second windows for pinpoint precision
                if (start + dur - chunk_start) >= 18.0 or len(" ".join(current_text)) > 200:
                    sub_chunks.append({
                        'video_id': video_id,
                        'start_seconds': round(chunk_start, 2),
                        'duration': round(chunk_end - chunk_start, 2),
                        'text': " ".join(current_text)
                    })
                    chunk_start = start
                    chunk_end = start + dur
                    current_text = [text]
                else:
                    chunk_end = max(chunk_end, start + dur)
                    current_text.append(text)

        if current_text:
            sub_chunks.append({
                'video_id': video_id,
                'start_seconds': round(chunk_start, 2),
                'duration': round(chunk_end - chunk_start, 2),
                'text': " ".join(current_text)
            })

        chunks.extend(sub_chunks)

    # Do not fabricate time windows when YouTube exposes neither captions nor
    # chapters. Such placeholders created misleading matches and fake sections.
    chunks.sort(key=lambda x: x['start_seconds'])
    return chunks
