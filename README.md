# 🎓 OmniStudy AI — Akıllı Ders & YouTube Senkronizasyon Asistanı

> **Bütün ders notlarını, slaytlarını, PDF'lerini, fotoğraflarını ve YouTube konu anlatımlarını tek bir çalışma masasında topla. Notlarında seçtiğin bir konunun YouTube videosundaki tam anlatım dakikasını anında bul ve izle!**

---

## 🌟 Öne Çıkan Özellikler

1. **Çapraz-Modal Video Zaman Damgası Eşleme (Cross-Modal Timestamp Alignment):**
   - Ders notunda veya slaytında takıldığın bir formülü veya paragrafı seç.
   - **"Videoda Bul"** butonuna bas; sistem YouTube oynatma listesindeki tüm videoların transkriptlerini tarayarak bu konunun **hangi videoda, hangi dakika ve saniyede** anlatıldığını bulur.
   - YouTube video oynatıcısı otomatik olarak o saniyeye atlar ve oynatır!

2. **Çoklu Materyal Desteği (Multimodal):**
   - 📄 **PDF & Sunumlar:** Sayfa sayfa bölünür ve incelenir.
   - 🖼️ **Defter & Tahta Fotoğrafları:** Google Gemini Vision ile el yazıları ve formüller taranıp metne dönüştürülür.
   - 🔗 **Web Linkleri:** İlgili makaleler ve belgeler otomatik ayrıştırılır.
   - ✍️ **Yazılı Notlar:** İstediğin notu doğrudan yapıştırabilirsin.

3. **YouTube Video & Playlist Entegrasyonu:**
   - Tekil video linki (`youtube.com/watch?v=...`) veya tam oynatma listesi (`youtube.com/playlist?list=...`) ekle.
   - Sistem arka planda Türkçe ve İngilizce altyazıları saniye saniye indeksler.

4. **Kişisel AI Ders Koçu (AI Study Tutor):**
   - *"Bana bu sayfadaki 2. adımı açıkla"*
   - *"Videodaki hocanın sınav için vurguladığı püf noktaları çıkar"*
   - Notunla video arasındaki bağı kurarak konuyu pekiştirir.

5. **Sınav & Quiz Modu:**
   - Yüklediğin ders notları ve video anlatımlarına göre çoktan seçmeli deneme sınavları ve quizler hazırlar.
   - Her sorunun çözümünü ve videodaki ipucunu gösterir.

---

## 🚀 Hızlı Başlangıç (Tek Tıkla Çalıştırma)

### 1. Gereksinimler
- Python 3.10+
- Node.js 18+ (geliştirme veya ilk derleme için)

### 2. Uygulamayı Başlatma
Proje dizininde terminalden şu komutu çalıştırmanız yeterlidir:

```bash
python run.py
```

Bu komut:
1. Gerekli veritabanını hazırlar.
2. FastAPI sunucusunu ayağa kaldırır.
3. Otomatik olarak tarayıcınızda **http://localhost:8000** adresini açar.

---

## 💻 Geliştirici Modu (Frontend + Backend Ayrı)

Eğer arayüzde (React/Tailwind) değişiklik yapmak isterseniz:

**Terminal 1 (Backend):**
```bash
uvicorn backend.app.main:app --reload --port 8000
```

**Terminal 2 (Frontend Canlı Önizleme):**
```bash
cd frontend
npm run dev
```
Frontend `http://localhost:5173` adresinde açılır ve backend ile senkronize çalışır.

---

## 🐳 Docker ile Çalıştırma

Projeyi herhangi bir sunucuya veya buluta tek komutla dağıtmak için:

```bash
docker compose up --build -d
```
Ardından `http://localhost:8000` adresinden erişebilirsiniz.

---

## 🔑 Gemini AI Anahtarı (Opsiyonel / Tavsiye Edilen)
- Uygulama temel semantik arama ve transkript eşleme özellikleriyle **herhangi bir API anahtarı olmadan da yerel olarak çalışır**.
- Ancak el yazısı defter fotoğraflarını okumak ve gelişmiş AI soru-cevap anlatımları almak için sağ üst köşedeki **Ayarlar** simgesinden [Google AI Studio](https://aistudio.google.com/app/apikey)'dan alacağınız ücretsiz Gemini API anahtarınızı ekleyebilirsiniz.

---

## 🛠️ Mimari ve Teknoloji Yığını

- **Backend:** FastAPI, Python, SQLite, TF-IDF / Cosine Similarity, Scikit-learn
- **Veri Çıkarıcılar:** `youtube-transcript-api`, `yt-dlp`, `pypdf`, `python-pptx`, `beautifulsoup4`
- **Frontend:** React 19, Vite, Tailwind CSS, Lucide Icons, Axios
- **Yapay Zeka:** Google Gemini 2.0 Flash (Multimodal Vision & Reasoning)

---

## 🌍 Açık Kaynak Lisansı
Bu proje MIT lisansı altındadır. Dilediğiniz gibi geliştirebilir, GitHub'da herkese açabilir veya üniversiteniz/topluluğunuz için kullanabilirsiniz!
