import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  ChevronRight, 
  ExternalLink,
  ListOrdered,
  Maximize2, 
  Minimize2, 
  Minus,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search
} from 'lucide-react';
import { YouTubeIcon } from './Icons';
import { api } from '../api';

export default function YouTubePlayer({
  videos = [],
  activeVideoId,
  currentTimestamp = 0,
  matchedSegments = [],
  onSelectVideo,
  onSeekTimestamp,
  onDeleteVideo,
  isMaximized = false,
  onToggleMaximize,
  isMinimized = false,
  onToggleMinimize,
  courseId
}) {
  const [selectedVideoId, setSelectedVideoId] = useState(activeVideoId || (videos[0] ? videos[0].video_id : ''));
  const [currentSeek, setCurrentSeek] = useState(currentTimestamp || 0);
  const [viewMode, setViewMode] = useState('chapters');
  const [chapterData, setChapterData] = useState({ courseId: null, videoId: '', chapters: [], error: '' });
  const isCurrentChapterData = chapterData.courseId === courseId && chapterData.videoId === selectedVideoId;
  const videoChapters = isCurrentChapterData ? chapterData.chapters : [];
  const chapterError = isCurrentChapterData ? chapterData.error : '';
  const isLoadingChapters = Boolean(selectedVideoId && courseId && !isCurrentChapterData);
  const [isListExpanded, setIsListExpanded] = useState(true);
  const [chapterSearch, setChapterSearch] = useState('');

  const getChapterBadge = (title = '') => {
    const t = title.toLowerCase();
    if (t.includes('soru') || t.includes('problem') || t.includes('çözüm') || t.includes('cozum') || t.includes('vize') || t.includes('final')) {
      return { label: 'Soru', bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    }
    if (t.includes('örnek') || t.includes('ornek') || t.includes('example')) {
      return { label: 'Örnek', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
    }
    if (t.includes('teorem') || t.includes('tanım') || t.includes('tanim') || t.includes('ispat') || t.includes('kural') || t.includes('formül')) {
      return { label: 'Teori', bg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' };
    }
    return { label: 'Konu', bg: 'bg-sky-500/15 text-sky-300 border-sky-500/30' };
  };

  const filteredChapters = videoChapters.filter(c => {
    if (!chapterSearch.trim()) return true;
    const q = chapterSearch.toLowerCase();
    return (c.title && c.title.toLowerCase().includes(q)) || (c.description && c.description.toLowerCase().includes(q));
  });

  // Sync when prop changes
  useEffect(() => {
    if (activeVideoId) {
      setSelectedVideoId(activeVideoId);
    } else if (videos.length > 0 && !selectedVideoId) {
      setSelectedVideoId(videos[0].video_id);
    }
  }, [activeVideoId, videos]);

  useEffect(() => {
    if (currentTimestamp !== undefined) {
      setCurrentSeek(currentTimestamp);
    }
  }, [currentTimestamp]);

  // Load the compact, AI-generated table of contents for the selected video.
  useEffect(() => {
    let cancelled = false;
    if (!selectedVideoId || !courseId) return () => { cancelled = true; };

    api.getVideoChapters(courseId, selectedVideoId)
      .then((res) => {
        if (!cancelled) setChapterData({ courseId, videoId: selectedVideoId, chapters: res.data || [], error: '' });
      })
      .catch((error) => {
        if (!cancelled) {
          setChapterData({
            courseId,
            videoId: selectedVideoId,
            chapters: [],
            error: error.response?.data?.detail || 'Video bölümleri oluşturulamadı.'
          });
        }
      });

    return () => { cancelled = true; };
  }, [selectedVideoId, courseId]);

  const activeVideo = videos.find(v => v.video_id === selectedVideoId) || videos[0];

  const handleTimestampClick = (seconds, videoId) => {
    if (videoId && videoId !== selectedVideoId) {
      setSelectedVideoId(videoId);
      if (onSelectVideo) onSelectVideo(videoId);
    }
    setCurrentSeek(seconds);
    if (onSeekTimestamp) onSeekTimestamp(seconds);
  };

  if (!videos || videos.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-slate-900/50 rounded-2xl border border-slate-800">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-400 mb-2 border border-red-500/20">
          <YouTubeIcon className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-slate-200 text-xs mb-1">Henüz YouTube Videosu Eklenmedi</h3>
        <p className="text-[11px] text-slate-400 max-w-sm">
          Üst menüden YouTube linki ekleyin.
        </p>
      </div>
    );
  }

  // MINIMIZED STATE
  if (isMinimized) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 truncate text-xs text-slate-300">
          <YouTubeIcon className="w-4 h-4 text-red-500 shrink-0" />
          <span className="font-medium truncate">{activeVideo?.title || 'YouTube Oynatıcı'}</span>
          <span className="text-[10px] text-slate-500">(Küçültüldü)</span>
        </div>
        <button
          type="button"
          onClick={onToggleMinimize}
          title="Pencereyi Genişlet"
          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const embedUrl = activeVideo 
    ? `https://www.youtube.com/embed/${activeVideo.video_id}?start=${Math.floor(currentSeek)}&autoplay=1&enablejsapi=1`
    : '';

  return (
    <div className="flex flex-col h-full bg-slate-900/70 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
      
      {/* 1. Top Selector bar (Compact) */}
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <YouTubeIcon className="w-4 h-4 text-red-500 shrink-0" />
          <select
            value={selectedVideoId}
            onChange={(e) => {
              setSelectedVideoId(e.target.value);
              setCurrentSeek(0);
              if (onSelectVideo) onSelectVideo(e.target.value);
            }}
            className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-2 py-1 truncate max-w-xs md:max-w-md focus:outline-none focus:border-indigo-500"
          >
            {videos.map(v => (
              <option key={v.video_id} value={v.video_id}>
                {v.title}
              </option>
            ))}
          </select>

          {/* Delete Current Video Button */}
          {activeVideo && onDeleteVideo && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`"${activeVideo.title}" videosunu kaldırmak istediğinize emin misiniz?`)) {
                  onDeleteVideo(activeVideo.video_id);
                }
              }}
              title="Bu Videoyu Sil"
              className="p-1 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeVideo && (
            <a
              href={`https://www.youtube.com/watch?v=${activeVideo.video_id}&t=${Math.floor(currentSeek)}s`}
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-slate-200 p-1 hover:bg-slate-800 rounded transition"
              title="YouTube'da Aç"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {/* Minimize Button */}
          {onToggleMinimize && (
            <button
              type="button"
              onClick={onToggleMinimize}
              title="Pencereyi Küçült"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Maximize Button */}
          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              title={isMaximized ? "Eski Boyuta Dön" : "Tam Ekran Yap"}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* 2. Embedded Player (Properly Contained 16:9, NEVER Cut Off) */}
      <div className={`relative w-full ${isListExpanded ? 'h-[200px] sm:h-[230px] shrink-0' : 'flex-1'} min-h-[140px] bg-black flex items-center justify-center overflow-hidden p-1 transition-all duration-200`}>
        {activeVideo ? (
          <div className="w-full h-full max-w-full max-h-full flex items-center justify-center">
            <iframe
              key={`${selectedVideoId}-${Math.floor(currentSeek)}`}
              src={embedUrl}
              title={activeVideo.title}
              className="border-0 shadow-lg"
              style={{
                width: '100%',
                height: '100%',
                maxWidth: '100%',
                maxHeight: '100%',
                aspectRatio: '16 / 9'
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="text-slate-500 text-xs">Video seçilmedi</div>
        )}
      </div>

      {/* 3. Collapsible Timestamps & Chapters Strip (Fills remaining height, never clips, perfect scrolling) */}
      <div className={`border-t border-slate-800 bg-slate-950/80 ${isListExpanded ? 'flex-1 min-h-0' : 'shrink-0'} flex flex-col overflow-hidden transition-all duration-200`}>
        <div className="flex items-center justify-between px-3 py-1.5 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setViewMode('chapters');
                setIsListExpanded(true);
              }}
              className={`font-medium flex items-center gap-1.5 px-2 py-0.5 rounded-md transition ${
                viewMode === 'chapters' 
                  ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 font-semibold' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5 text-indigo-400" />
              <span>Video Bölümleri & Soru Çözümleri ({videoChapters.length || (isLoadingChapters ? '…' : 0)})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('matched');
                setIsListExpanded(true);
              }}
              className={`font-medium flex items-center gap-1.5 px-2 py-0.5 rounded-md transition ${
                viewMode === 'matched' 
                  ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/30 font-semibold' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Arama Eşleşmeleri ({matchedSegments.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsListExpanded(prev => !prev)}
            title={isListExpanded ? "Listeyi Kapat" : "Listeyi Aç"}
            className="p-1 rounded text-slate-400 hover:text-white transition"
          >
            {isListExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Search bar for chapters if list is expanded */}
        {isListExpanded && viewMode === 'chapters' && videoChapters.length > 0 && (
          <div className="px-3 pb-1.5 pt-0.5 shrink-0">
            <div className="relative">
              <input
                type="text"
                placeholder="Bölümlerde ara (örn: soru, örnek, teorem, tanım)..."
                value={chapterSearch}
                onChange={(e) => setChapterSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-[11px] text-white rounded-lg pl-7 pr-2 py-1 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
              />
              <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2" />
            </div>
          </div>
        )}

        {/* List Content (Collapsible, Rich Scrollable) */}
        {isListExpanded && (
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 space-y-1.5 text-xs overscroll-contain">
            {viewMode === 'matched' ? (
              matchedSegments.length === 0 ? (
                <div className="py-3 text-center text-slate-500 text-[11px]">
                  Bir konu eşleştirmesi yapıldığında ilgili video bölümleri burada listelenir.
                </div>
              ) : (
                matchedSegments.map((seg, i) => (
                  <div
                    key={i}
                    onClick={() => handleTimestampClick(seg.start_seconds, seg.video_id)}
                    className="p-2 rounded-xl bg-slate-900/80 hover:bg-indigo-950/60 border border-slate-800 hover:border-indigo-500/40 cursor-pointer transition flex items-center justify-between gap-2.5 shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold shrink-0 border border-indigo-500/30">
                        {seg.timestamp_formatted}
                      </span>
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate text-[11px]">
                          {seg.video_title || 'Video Kesiti'}
                        </div>
                        <div className="text-slate-400 truncate text-[10px]">
                          {seg.text_snippet}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </div>
                ))
              )
            ) : (
              isLoadingChapters ? (
                <div className="py-4 text-center text-slate-400 text-[11px]">
                  Transkript inceleniyor ve ayrıntılı video bölümleri hazırlanıyor…
                </div>
              ) : chapterError ? (
                <div className="py-3 text-center text-amber-300 text-[11px]">{chapterError}</div>
              ) : videoChapters.length === 0 ? (
                <div className="py-3 text-center text-slate-500 text-[11px]">
                  Bu videoda bölüm çıkarmak için kullanılabilir transkript bulunamadı.
                </div>
              ) : filteredChapters.length === 0 ? (
                <div className="py-3 text-center text-slate-500 text-[11px]">
                  "{chapterSearch}" ile eşleşen bir bölüm bulunamadı.
                </div>
              ) : (
                filteredChapters.map((chapter, idx) => {
                  const badge = getChapterBadge(chapter.title);
                  return (
                    <div
                      key={`${chapter.start_seconds}-${idx}`}
                      onClick={() => handleTimestampClick(chapter.start_seconds, selectedVideoId)}
                      className="p-2 rounded-xl bg-slate-900/70 hover:bg-indigo-950/50 border border-slate-800 hover:border-indigo-500/30 cursor-pointer transition flex items-center justify-between gap-2 shadow-xs group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px] font-semibold shrink-0 border border-slate-700/60 group-hover:bg-indigo-600 group-hover:text-white transition">
                          {chapter.timestamp_formatted}
                        </span>

                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 border ${badge.bg}`}>
                          {badge.label}
                        </span>

                        <div className="min-w-0">
                          <div className="text-slate-200 group-hover:text-indigo-200 font-medium truncate text-[11px] transition">
                            {chapter.title}
                          </div>
                          {chapter.description && (
                            <div className="text-slate-400 truncate text-[10px]">
                              {chapter.description}
                            </div>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-300 shrink-0 transition" />
                    </div>
                  );
                })
              )
            )}
          </div>
        )}
      </div>

    </div>
  );
}
