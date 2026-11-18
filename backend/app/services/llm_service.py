import os
import json
import re
from typing import Optional, Dict, Any, List
from google import genai
from google.genai import types
from ..database import get_db
from ..config import DEFAULT_GEMINI_MODEL

CANDIDATE_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3-flash-preview"
]

def get_gemini_api_key() -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = 'gemini_api_key'")
    row = cursor.fetchone()
    conn.close()
    if row and row['value']:
        return row['value'].strip()
    return os.getenv("GEMINI_API_KEY", "").strip()

def get_client() -> Optional[genai.Client]:
    api_key = get_gemini_api_key()
    if not api_key:
        return None
    try:
        # 15s timeout complies with Gemini API minimum (>= 10s) and keeps requests snappy
        return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=60000))
    except Exception as e:
        print(f"Failed to initialize Gemini Client: {e}")
        return None

def generate_with_fallback(client: genai.Client, contents: Any) -> Any:
    """Try primary model, fallback on 404, 503, 504 deadline, or timeout."""
    models_to_try = []
    for m in CANDIDATE_MODELS:
        if m not in models_to_try:
            models_to_try.append(m)

    last_error = None
    for model_name in models_to_try:
        try:
            return client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=0.35,
                    max_output_tokens=2500
                )
            )
        except Exception as e:
            err_str = str(e)
            last_error = e
            print(f"Model {model_name} failed ({err_str[:70]}), trying next model...")
            if any(marker in err_str.lower() for marker in ('401', '403', 'api_key_invalid', 'unauthenticated', 'permission denied')):
                break
            continue

    raise last_error

def extract_text_from_image_vision(image_path: str) -> str:
    """Use Gemini Vision to extract handwritten notes, formulas, diagrams or slide text from photos."""
    client = get_client()
    if not client:
        return "Not fotoğrafı yüklendi. (Daha detaylı el yazısı/formül analizi için Ayarlar'dan Gemini API anahtarı ekleyin)."

    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        prompt = (
            "Sen uzman bir ders çalışma asistanısın. Bu fotoğraftaki ders notunu, el yazısını, "
            "tahta yazısını veya slaytı eksiksiz olarak metne dök. Formülleri, başlıkları ve maddeleri "
            "anlaşılır markdown formatında yaz. Türkçe ise Türkçe olarak çıkar."
        )

        response = generate_with_fallback(
            client=client,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                prompt
            ]
        )
        return response.text or ""
    except Exception as e:
        return f"Görsel analiz edilirken hata oluştu: {str(e)}"

def ask_tutor_llm(
    course_name: str,
    user_message: str,
    notes_context: str = "",
    video_context: str = "",
    selected_text: Optional[str] = None,
    history: Optional[List[Dict[str, Any]]] = None
) -> str:
    """
    Intelligent Study Tutor that explains concepts, teaches step-by-step,
    formats formulas with KaTeX, and connects explanations directly to real videos.
    """
    client = get_client()

    if not client:
        if notes_context:
            return f"Ders notlarından ilgili bölüm:\n\n{notes_context[:1000]}\n\nSorunuz ('{user_message}') hakkında detaylı bir anlatım için lütfen Ayarlar'dan geçerli bir Gemini API anahtarı ekleyin."
        return f"Sorunuz ('{user_message}') alındı. Detaylı yapay zeka konu anlatımı için lütfen Ayarlar'dan Gemini API anahtarı ekleyin."

    system_prompt = """Sen üniversite ve sınav dersleri için üst düzey, samimi ve son derece bilgili bir Yapay Zeka Akademik Çalışma Koçusun (OmniStudy AI Tutor). Görevin öğrenciye konuyu en derin, kapsamlı, pedagojik ve anlaşılır şekilde öğretmek; kavramları sağlam temellere oturtmak ve ders notlarındaki konuları ilgili YouTube videolarıyla bağdaştırmaktır.

TEMEL PRENSİPLER VE KURALLAR:
1. DOĞAL İNSAN DİYALOĞU VE SOHBET BAĞLAMI:
   - Öğrenciyle birebir özel ders veren usta bir hoca gibi sıcak, doğal, akıcı ve teşvik edici konuş.
   - Önceki konuşmaları MUTLAKA hatırla. Öğrenci "tamam sen de anlatsana", "örnek çöz", "anlamadım", "nasıl yani", "ispatı nedir", "devam et" gibi devam soruları sorduğunda önceki konuşulan konuyu bilerek doğrudan ve derinlemesine yanıt ver. Asla konuyu unutma veya sıfırdan yapay şablonlarla başlama!
   - KESİNLİKLE ROBOTİK ŞABLONLAR KULLANMA ("X konusunu ders notlarındaki tanımlarla inceledik" gibi yapay kalıplar KESİNLİKLE YASAKTIR). Doğrudan bir hoca gibi konuya gir ve anlat.
2. KESİNLİKLE DAKİKA, SANİYE VEYA ZAMAN DAMGASI VERME: '03:15\'te', '00:00 - 05:00', 'dakika 12' gibi zaman ifadeleri KESİNLİKLE YAZMA.
3. VİDEO REHBERLİĞİ VE TIKLANABİLİR VİDEO BUTONLARI:
   - Sana sağlanan listeden konunun gerektirdiği kadar en alakalı videoları seç.
   - Her video için şu tıklanabilir formatı kullan:
     [▶ Videoyu Aç: Video Başlığı](video://VIDEO_ID)
   - Butonun hemen altında o videoda ne anlatıldığını özetle ve videolar arasında bağlantı kur.
   - Eğer öğrenci devam sorusu soruyorsa (örn: "şurayı anlamadım", "örnek çöz", "sen anlat"), önce onun sorusunu detaylıca çöz ve açıkla, gerekiyorsa ilgili videoya atıfta bulun.
4. KONU ANLATIMINI KAPSAMLI, DERİN VE DOYURUCU YAP:
   - Kavramın Sezgisel Mantığı, Geometrik Anlamı ve 'Neden buna ihtiyaç var?' sorusunun açıklaması.
   - Matematiksel Formülasyon ve Koşullar (LaTeX formatında).
   - Adım Adım Çözümlü Uygulama Örnekleri (somut problemler).
   - Püf Noktaları ve Sınav Tuzakları.
5. MATEMATİKSEL FORMÜLLERİ KaTeX FORMATINDA YAZ: Satır içi için tek dolar ($x \in \mathbb{R}$), blok formüller için çift dolar ($$\lim_{{x \to a}} f(x) = L$$).
6. Türkçe, samimi, teşvik edici ve akıcı bir öğretmen üslubu kullan. Cümleleri asla yarım veya kesik bırakma."""

    history_prompt = ""
    if history:
        recent = [h for h in history if (h.get("text") or h.get("content"))]
        turns = []
        for h in recent[-8:]:
            role = "Öğrenci" if h.get("role") == "user" else "OmniStudy AI"
            t = (h.get("text") or h.get("content") or "").strip()
            if t:
                turns.append(f"{role}: {t[:600]}")
        if turns:
            history_prompt = "\n--- ÖNCEKİ SOHBET GEÇMİŞİ (DİYALOG BAĞLAMI) ---\n" + "\n".join(turns) + "\n--------------------------------------------\n"

    context_prompt = ""
    if selected_text:
        context_prompt += f"\nÖğrencinin üzerinde çalıştığı özel not kesiti:\n```\n{selected_text}\n```\n"
    if notes_context:
        context_prompt += f"\nDers Notlarından ve Materyallerden Bağlam:\n{notes_context[:4500]}\n"
    if video_context:
        context_prompt += f"\n{video_context[:3000]}\n"

    final_prompt = f"{history_prompt}{context_prompt}\nÖğrencinin Güncel Sorusu / Talebi: {user_message}"

    try:
        response = generate_with_fallback(client=client, contents=[system_prompt, final_prompt])
        text = (getattr(response, 'text', None) or '').strip()
        if text:
            return text
    except Exception as e:
        print(f"All LLM candidate models failed: {e}")

    # Fallback if generation completely failed
    if notes_context:
        match_exc = re.search(r'İlgili Not Kesiti:\s*(.*)', notes_context, re.DOTALL)
        clean_excerpt = (match_exc.group(1).strip() if match_exc else notes_context.strip())[:600]
        return (
            f"Harika bir konuyu çalışıyoruz! Notlarımızdaki ilgili tanım şöyle:\n\n"
            f"> **Ders Notu:**\n> {clean_excerpt}\n\n"
            f"'{user_message}' sorunla ilgili bu konunun ispatını, sezgisel mantığını veya sınav tipi bir örnek çözümünü hemen detaylandırayım mı?"
        )
    return f"'{user_message}' sorunla ilgili çalışmaya devam ediyoruz! Bu konunun mantığını ve adım adım örnek çözümünü birlikte inceleyelim."

def generate_video_chapters(video_title: str, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Turn transcript snippets into an insightful, granular chapter and problem-solving index."""
    if not chunks:
        return []

    windows = []
    for idx, chunk in enumerate(chunks):
        second = float(chunk.get('start_seconds') or 0)
        bucket = int(second // 35)
        t = ' '.join(str(chunk.get('text') or '').split())
        if not t:
            continue
        if windows and windows[-1]['bucket'] == bucket:
            if len(windows[-1]['text']) < 600:
                windows[-1]['text'] += ' ' + t[:250]
        else:
            windows.append({'bucket': bucket, 'index': idx, 'second': second, 'text': t[:500]})

    if len(windows) > 120:
        stride = (len(windows) - 1) / 119
        windows = [windows[round(i * stride)] for i in range(120)]

    client = get_client()
    if client and len(windows) >= 3:
        transcript = '\n'.join(
            f"{i}. [{int(item['second'])}s] {item['text']}"
            for i, item in enumerate(windows)
        )
        prompt = (
            "Aşağıdaki zaman sıralı transkript kesitlerinden bu ders videosunun kapsamlı, zengin ve ayrıntılı içindekiler akışını çıkar.\n"
            "Öğrencinin videoda aradığı soru çözümünü, teorem ispatını veya konu tanımını nokta atışı bulabilmesi için "
            "en az 8, en fazla 16 ayrıntılı bölüm üret.\n"
            "Her bölümün başlığında (title) tam olarak ne yapıldığını belirt (örn: 'Giriş & Hatırlatma', 'Teorem Tanımı & Geometrik Yorum', 'Örnek 1: Temel Hesaplama', 'Örnek 2: Fonksiyon Analizi', 'Soru Çözümü 1: Vize Tipi', 'Soru Çözümü 2: Kritik Nokta', 'Önemli Püf Noktaları & Özet').\n"
            "Her bölüme 1 cümlelik açıklayıcı 'description' ekle.\n"
            "Sadece geçerli bir JSON listesi döndür: [{\"start_index\":0,\"title\":\"...\",\"description\":\"...\"}].\n\n"
            f"Video: {video_title}\nTranskript kesitleri:\n{transcript}"
        )
        try:
            response = generate_with_fallback(client, prompt)
            raw = (response.text or '').strip()
            raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw, flags=re.IGNORECASE)
            parsed = json.loads(raw)
            if isinstance(parsed, list) and len(parsed) >= 4:
                by_index = {index: item for index, item in enumerate(windows)}
                chapters = []
                used = set()
                for item in parsed:
                    try:
                        index = int(item.get('start_index'))
                    except (TypeError, ValueError):
                        continue
                    if index not in by_index or index in used:
                        continue
                    used.add(index)
                    chapters.append({
                        'start_seconds': float(by_index[index]['second']),
                        'title': str(item.get('title') or f"Bölüm {len(chapters) + 1}")[:100],
                        'description': str(item.get('description') or '')[:300],
                        'source': 'generated'
                    })
                chapters.sort(key=lambda x: x['start_seconds'])
                if len(chapters) >= 5:
                    return chapters
        except Exception as e:
            print(f"AI chapter generation error: {e}")

    # High-quality heuristic fallback based on natural transcript markers
    fallback_chapters = []
    seen_sec = set()
    keywords_pattern = re.compile(r'\b(soru|ornek|örnek|problem|teorem|tanim|tanım|ispat|kural|formül|grafik|özet|ozet)\b', re.IGNORECASE)
    
    # Always start with an intro
    if windows:
        fallback_chapters.append({
            'start_seconds': 0.0,
            'title': f"{video_title[:45]} — Giriş ve Konu Özeti",
            'description': 'Dersin başlangıcı ve temel kavramlara genel bakış.',
            'source': 'transcript'
        })
        seen_sec.add(0.0)

    last_sec = 0.0
    for w in windows:
        sec = float(w['second'])
        if sec - last_sec < 120:  # Minimum 2 minutes between chapters
            continue
        text_lower = w['text'].lower()
        m = keywords_pattern.search(text_lower)
        if m:
            kw = m.group(1).capitalize()
            desc = w['text'][:120].strip()
            fallback_chapters.append({
                'start_seconds': sec,
                'title': f"{kw} ve Çözüm Aşaması",
                'description': desc,
                'source': 'transcript'
            })
            last_sec = sec
            seen_sec.add(sec)
            if len(fallback_chapters) >= 14:
                break

    # If still fewer than 6, create evenly spaced chapters
    if len(fallback_chapters) < 6 and windows:
        total_dur = windows[-1]['second']
        target_count = 8
        interval = max(60, total_dur / target_count)
        fallback_chapters = []
        for i in range(target_count):
            sec = round(i * interval, 1)
            fallback_chapters.append({
                'start_seconds': sec,
                'title': f"Bölüm {i + 1}: Konu Anlatımı ve Detaylar" if i > 0 else "Giriş ve Temel Kavramlar",
                'description': f"{video_title} konusunun {i + 1}. inceleme aşaması.",
                'source': 'transcript'
            })

    return fallback_chapters


def generate_quiz_questions(course_name: str, topic: str, context_text: str, count: int = 5) -> List[Dict[str, Any]]:
    """Generate multiple choice study questions with explanations."""
    client = get_client()
    default_questions = [
        {
            "question": f"{topic or course_name} konusunda temel kavram nedir?",
            "options": ["A) Temel Tanım ve İlkeler", "B) İkincil Etkenler", "C) İlgisiz Faktör", "D) İstisnai Durum"],
            "correct_answer": "A) Temel Tanım ve İlkeler",
            "explanation": "Bu soru ders notlarınızdaki temel kurallar üzerinden hazırlanmıştır."
        }
    ]

    if not client:
        return default_questions

    prompt = (
        f"Aşağıdaki ders materyaline dayanarak '{course_name}' dersi '{topic}' konusu için "
        f"öğrencinin konuyu anlayıp anlamadığını ölçecek {count} adet çoktan seçmeli quiz sorusu hazırla.\n\n"
        f"Materyal:\n{context_text[:3000]}\n\n"
        "Çıktıyı SADECE geçerli bir JSON listesi olarak ver. Başka hiçbir metin veya markdown tırnağı yazma.\n"
        "JSON Formatı:\n"
        "[\n"
        "  {\n"
        "    \"question\": \"Soru metni\",\n"
        "    \"options\": [\"A) ...\", \"B) ...\", \"C) ...\", \"D) ...\"],\n"
        "    \"correct_answer\": \"A) ...\",\n"
        "    \"explanation\": \"Açıklama ve videodan ilgili tüyo\"\n"
        "  }\n"
        "]"
    )

    try:
        response = generate_with_fallback(client=client, contents=prompt)
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        parsed = json.loads(text)
        return parsed
    except Exception as e:
        print(f"Quiz generation error: {e}")
        return default_questions
