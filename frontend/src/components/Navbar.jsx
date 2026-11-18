import React from 'react';
import { BookOpen, Sparkles, Plus, Settings, Video, FileText, Trash2 } from 'lucide-react';
import { YouTubeIcon } from './Icons';

export default function Navbar({ 
  courses, 
  activeCourse, 
  onSelectCourse, 
  onOpenNewCourse, 
  onDeleteCourse,
  onOpenUpload, 
  onOpenYouTube,
  onOpenQuiz,
  onOpenSettings 
}) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-sky-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">OmniStudy AI</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30">
                Study & Video Sync
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Notlar, PDF'ler ve YouTube Anlatımları Tek Ekranda</p>
          </div>
        </div>

        {/* Course Selector */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <select
            value={activeCourse ? activeCourse.id : ''}
            onChange={(e) => {
              const c = courses.find(item => item.id === parseInt(e.target.value));
              if (c) onSelectCourse(c);
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
          >
            {courses.length === 0 ? (
              <option value="">Henüz ders yok - Yeni ders ekleyin</option>
            ) : (
              courses.map(c => (
                <option key={c.id} value={c.id}>
                  📚 {c.name} ({c.material_count || 0} Not, {c.video_count || 0} Video)
                </option>
              ))
            )}
          </select>

          <button
            onClick={onOpenNewCourse}
            title="Yeni Ders Ekle"
            className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 transition"
          >
            <Plus className="w-4 h-4" />
          </button>

          {activeCourse && onDeleteCourse && (
            <button
              onClick={() => {
                if (window.confirm(`"${activeCourse.name}" dersini ve içindeki tüm notları/videoları silmek istediğinize emin misiniz?`)) {
                  onDeleteCourse(activeCourse.id);
                }
              }}
              title="Bu Dersi Sil"
              className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 shrink-0 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Action Buttons */}
        {activeCourse && (
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenUpload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden md:inline">Not / PDF Yükle</span>
            </button>

            <button
              onClick={onOpenYouTube}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <YouTubeIcon className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden md:inline">YouTube Ekle</span>
            </button>

            <button
              onClick={onOpenQuiz}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white text-xs font-medium transition shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Quiz Modu</span>
            </button>
          </div>
        )}

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          title="Ayarlar & API Anahtarı"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
        >
          <Settings className="w-4 h-4" />
        </button>

      </div>
    </header>
  );
}
