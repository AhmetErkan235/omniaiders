import os
from pathlib import Path
from typing import Dict, Any, List
import pypdf
import pptx
from .llm_service import extract_text_from_image_vision

def extract_content_from_file(file_path: str, filename: str) -> Dict[str, Any]:
    """
    Extract text, page count, and structured sections from uploaded document/file.
    Supports: .pdf, .pptx, .ppt, .txt, .md, .png, .jpg, .jpeg, .webp
    """
    ext = Path(filename).suffix.lower()
    content_text = ""
    pages_data = []

    if ext == '.pdf':
        try:
            reader = pypdf.PdfReader(file_path)
            for idx, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                clean_text = text.strip()
                if clean_text:
                    pages_data.append({
                        'page': idx + 1,
                        'text': clean_text
                    })
            content_text = "\n\n".join([f"--- Sayfa {p['page']} ---\n{p['text']}" for p in pages_data])
        except Exception as e:
            content_text = f"PDF okuma hatası: {str(e)}"

    elif ext in ('.pptx', '.ppt'):
        try:
            prs = pptx.Presentation(file_path)
            for idx, slide in enumerate(prs.slides):
                slide_texts = []
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text:
                        slide_texts.append(shape.text.strip())
                slide_content = "\n".join(slide_texts)
                if slide_content:
                    pages_data.append({
                        'page': idx + 1,
                        'text': slide_content
                    })
            content_text = "\n\n".join([f"--- Slayt {p['page']} ---\n{p['text']}" for p in pages_data])
        except Exception as e:
            content_text = f"Slayt okuma hatası: {str(e)}"

    elif ext in ('.png', '.jpg', '.jpeg', '.webp'):
        # Image of handwritten notes or slides
        try:
            vision_text = extract_text_from_image_vision(file_path)
            content_text = vision_text or "Görsel yüklendi. Görsel metin analizi yapıldı."
            pages_data.append({'page': 1, 'text': content_text})
        except Exception as e:
            content_text = f"Görsel analizi hatası: {str(e)}"

    elif ext in ('.txt', '.md'):
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content_text = f.read()
                pages_data.append({'page': 1, 'text': content_text})
        except Exception as e:
            content_text = f"Metin okuma hatası: {str(e)}"

    else:
        content_text = "Desteklenmeyen dosya formatı."

    return {
        'content': content_text,
        'pages': pages_data,
        'page_count': len(pages_data),
        'file_extension': ext
    }
