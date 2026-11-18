#!/usr/bin/env python3
"""
OmniStudy AI - Tek Tıkla Başlatıcı
Bu dosya hem FastAPI backend'ini hem de React arayüzünü ayağa kaldırır.
"""
import sys
import os
import webbrowser
import subprocess
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

def main():
    print("=" * 60)
    print("🚀 OmniStudy AI - Akıllı Ders & YouTube Senkronizasyon Asistanı")
    print("=" * 60)
    print("\n[1/3] Veritabanı ve ortam kontrol ediliyor...")

    # Set working directory to backend
    os.chdir(BASE_DIR)

    # Check if frontend is built
    dist_index = BASE_DIR / "frontend" / "dist" / "index.html"
    if not dist_index.exists():
        print("[!] Frontend dist bulunamadı, derleniyor...")
        subprocess.run(["npm", "run", "build"], cwd=BASE_DIR / "frontend", shell=True)

    print("[2/3] Backend sunucusu başlatılıyor: http://localhost:8000")
    print("[3/3] Tarayıcı açılıyor...")

    # Open browser after a slight delay
    def open_browser():
        time.sleep(1.5)
        webbrowser.open("http://localhost:8000")

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    # Launch uvicorn
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=False)

if __name__ == "__main__":
    main()
