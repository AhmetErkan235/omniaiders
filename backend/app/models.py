from pydantic import BaseModel
from typing import List, Optional, Any

class CourseCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class CourseOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = ""
    created_at: str

class YouTubeAddRequest(BaseModel):
    course_id: int
    url: str  # Video URL or Playlist URL

class LinkAddRequest(BaseModel):
    course_id: int
    title: str
    url: str

class TextNoteAddRequest(BaseModel):
    course_id: int
    title: str
    content: str

class CrossMatchRequest(BaseModel):
    course_id: int
    query_text: str
    top_k: Optional[int] = 5

class VideoMatchResult(BaseModel):
    video_id: str
    video_title: str
    start_seconds: float
    end_seconds: float
    timestamp_formatted: str
    text_snippet: str
    score: float
    youtube_embed_url: str

class AskTutorRequest(BaseModel):
    course_id: int
    message: str
    context_material_id: Optional[int] = None
    selected_text: Optional[str] = None
    video_id: Optional[str] = None
    timestamp: Optional[float] = None

class QuizGenerateRequest(BaseModel):
    course_id: int
    topic: Optional[str] = None
    count: Optional[int] = 5

class SettingsUpdate(BaseModel):
    gemini_api_key: Optional[str] = None
