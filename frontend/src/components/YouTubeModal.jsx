import React, { useState } from 'react';
import { X, ListVideo, AlertCircle } from 'lucide-react';
import { YouTubeIcon } from './Icons';

export default function YouTubeModal({
  isOpen,
  onClose,
  courseId,
  onAddYouTube
}) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setError('');
    setIsLoading(true);
    setStatusText('YouTube kaynağı ekleniyor. Transkript ve bölüm listesi video seçildiğinde hazırlanacak...');

    try {
      await onAddYouTube(courseId, url.trim());
      setUrl('');
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Video eklenirken bir hata oluştu.");
    } finally {
      setIsLoading(false);
      setStatusText('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/20 text-red-500 flex items-center justify-center border border-red-500/30">
              <YouTubeIcon className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-slate-100 text-sm">YouTube Videosu veya Playlist Ekle</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              YouTube Video veya Playlist Linki
            </label>
            <input
              type="text"
              placeholder="https://www.youtube.com/watch?v=... veya playlist linki"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500 transition"
              autoFocus
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <ListVideo className="w-3.5 h-3.5 text-indigo-400" />
              Desteklenen Bağlantılar:
            </div>
            <p>• Tekil YouTube videoları (`youtube.com/watch?v=...` veya `youtu.be/...`)</p>
            <p>• Oynatma listeleri (`youtube.com/playlist?list=...`)</p>
            <p>• Sistem transkriptleri otomatik çıkararak ders notlarınızdaki konularla saniye saniye eşleştirecektir.</p>
          </div>

          {statusText && (
            <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-[11px] text-indigo-300 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span>{statusText}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold shadow transition flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Transkriptler Çekiliyor...</span>
                </>
              ) : (
                <span>Videoyu İndeksle</span>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
