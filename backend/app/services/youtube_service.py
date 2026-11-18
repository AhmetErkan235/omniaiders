import re
import urllib.parse
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

    # 2. Add Native Chapters (Highest precision topic timestamps!)
    if chapters:
        for ch in chapters:
            st = float(ch.get('start_time', 0))
            et = float(ch.get('end_time', st + 30))
            ch_title = ch.get('title', '').strip()
            if ch_title:
                chunks.append({
                    'video_id': video_id,
                    'start_seconds': round(st, 2),
                    'duration': round(max(5.0, et - st), 2),
                    'text': f"{ch_title} - {video_title}"
                })

    # 3. Add Description Timestamps if any (e.g. '01:08 Limitin Temel Mantığı')
    if description:
        timestamp_pattern = r'(?:^|\n)\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–:]?\s*([^\n\r]+)'
        matches = re.findall(timestamp_pattern, description)
        for m in matches:
            h, mins, s, ch_text = m
            st = float((int(h) * 3600 if h else 0) + int(mins) * 60 + int(s))
            clean_ch_text = ch_text.strip()
            if clean_ch_text and not any(abs(c['start_seconds'] - st) < 3.0 for c in chunks):
                chunks.append({
                    'video_id': video_id,
                    'start_seconds': round(st, 2),
                    'duration': 30.0,
                    'text': f"{clean_ch_text} - {video_title}"
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
