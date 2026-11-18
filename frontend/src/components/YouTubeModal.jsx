import React, { useState, useEffect } from 'react';
import { 
  X, 
  ListVideo, 
  AlertCircle, 
  Sparkles, 
  Globe, 
  GraduationCap, 
  Check, 
  ExternalLink, 
  Search, 
  Plus, 
  BookOpen,
  Layers
} from 'lucide-react';
import { YouTubeIcon } from './Icons';
import { api } from '../api';

export default function YouTubeModal({
  isOpen,
  onClose,
  courseId,
  courseName = '',
  onAddYouTube
}) {
  const [activeTab, setActiveTab] = useState('discover'); // 'discover' | 'manual'
  
  // Manual tab state
  const [url, setUrl] = useState('');
  const [isManualLoading, setIsManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualStatus, setManualStatus] = useState('');

  // Discover tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [isDiscoverLoading, setIsDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [curriculumData, setCurriculumData] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'yerli' | 'global'
  const [addingPlaylistUrls, setAddingPlaylistUrls] = useState({}); // { [url]: 'loading' | 'added' | 'error' }

  // Set default search query when modal opens or course changes
  useEffect(() => {
    if (isOpen) {
      if (courseName && !searchQuery) {
        setSearchQuery(`${courseName} dersi`);
      }
      setManualError('');
      setDiscoverError('');
    }
  }, [isOpen, courseName]);

  if (!isOpen) return null;

  // Handle manual YouTube link addition
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setManualError('');
    setIsManualLoading(true);
    setManualStatus('YouTube kaynağı ekleniyor. Videolar derse aktarılıyor...');

    try {
      await onAddYouTube(courseId, url.trim());
      setUrl('');
      onClose();
    } catch (err) {
      setManualError(err.response?.data?.detail || err.message || "Video eklenirken bir hata oluştu.");
    } finally {
      setIsManualLoading(false);
      setManualStatus('');
    }
  };

  // Handle AI Curriculum & Playlist Discovery
  const handleDiscover = async (e) => {
    if (e) e.preventDefault();
    const q = (searchQuery || courseName || '').trim();
    if (!q) return;

    setDiscoverError('');
    setIsDiscoverLoading(true);

    try {
      const res = await api.discoverPlaylists(courseId, q);
      setCurriculumData(res.data);
    } catch (err) {
      setDiscoverError(
        err.response?.data?.detail || 
        err.message || 
        "Müfredat ve playlist araması sırasında bir sorun oluştu."
      );
    } finally {
      setIsDiscoverLoading(false);
    }
  };

  // Handle adding a discovered playlist to the course
  const handleAddDiscoveredPlaylist = async (playlist) => {
    const pUrl = playlist.url;
    if (!pUrl || addingPlaylistUrls[pUrl] === 'loading' || addingPlaylistUrls[pUrl] === 'added') return;

    setAddingPlaylistUrls(prev => ({ ...prev, [pUrl]: 'loading' }));

    try {
      await onAddYouTube(courseId, pUrl);
      setAddingPlaylistUrls(prev => ({ ...prev, [pUrl]: 'added' }));
    } catch (err) {
      console.error("Error importing playlist:", err);
      setAddingPlaylistUrls(prev => ({ ...prev, [pUrl]: 'error' }));
      alert(err.response?.data?.detail || "Playlist eklenirken bir hata oluştu.");
    }
  };

  // Filter playlists by category
  const playlists = curriculumData?.playlists || [];
  const filteredPlaylists = playlists.filter(p => {
    if (categoryFilter === 'yerli') return p.category === 'yerli';
    if (categoryFilter === 'global') return p.category === 'global';
    return true;
  });

  const yerliCount = playlists.filter(p => p.category === 'yerli').length;
  const globalCount = playlists.filter(p => p.category === 'global').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl sm:max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 text-red-500 flex items-center justify-center border border-red-500/30 shadow-sm">
              <YouTubeIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                YouTube Ders Kaynağı ve Playlist Merkezi
              </h2>
              <p className="text-[11px] text-slate-400">
                {courseName ? `Seçili Ders: ${courseName}` : 'Dersinize uygun oynatma listeleri ekleyin'}
              </p>
            </div>
          </div>
          
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 pt-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition border-t border-x ${
              activeTab === 'discover'
                ? 'bg-slate-900 text-indigo-300 border-indigo-500/40 border-b-slate-900 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>AI ile Müfredatı İncele & Playlist Keşfet</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded-full font-mono">Otomatik</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-xl transition border-t border-x ${
              activeTab === 'manual'
                ? 'bg-slate-900 text-slate-200 border-slate-700/60 border-b-slate-900 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/40'
            }`}
          >
            <ListVideo className="w-3.5 h-3.5 text-slate-400" />
            <span>Manuel Link Ekle</span>
          </button>
        </div>

        {/* Tab 1: AI Discover */}
        {activeTab === 'discover' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
            {/* Search Input Box */}
            <form onSubmit={handleDiscover} className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                Dersinizin Adı veya Üniversite Müfredatı
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Örn: Boğaziçi CHEM 105 dersi, İTÜ MAT 101, Diferansiyel Denklemler..."
                    className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isDiscoverLoading || !searchQuery.trim()}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 flex items-center gap-1.5 shrink-0 transition"
                >
                  {isDiscoverLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Müfredat Taranıyor...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Playlistleri Keşfet</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Yapay zeka üniversitenizin müfredatını analiz eder, hem 🇹🇷 yerli hem de 🌍 global en iyi YouTube oynatma listelerini doğrudan listeler.
              </p>
            </form>

            {discoverError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{discoverError}</span>
              </div>
            )}

            {/* Curriculum Summary & Topics */}
            {curriculumData && (
              <div className="space-y-4 animate-fadeIn">
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/40 via-slate-950/60 to-purple-950/30 border border-indigo-500/30 space-y-2.5 shadow-sm">
                  <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
                    <GraduationCap className="w-4 h-4 text-indigo-400" />
                    <span>{curriculumData.course_title || 'Müfredat Kapsamı'}</span>
                  </div>
                  {curriculumData.curriculum_summary && (
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {curriculumData.curriculum_summary}
                    </p>
                  )}
                  {curriculumData.core_topics && curriculumData.core_topics.length > 0 && (
                    <div className="pt-1">
                      <div className="text-[11px] font-medium text-slate-400 mb-1.5 flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-indigo-400" />
                        <span>Kapsanan Temel Konu Başlıkları:</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {curriculumData.core_topics.map((t, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-lg bg-indigo-900/40 border border-indigo-500/30 text-[11px] text-indigo-200 font-medium"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                        categoryFilter === 'all'
                          ? 'bg-slate-800 text-white border border-slate-700'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Tümü ({playlists.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('yerli')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                        categoryFilter === 'yerli'
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>🇹🇷 Yerli Kanallar</span>
                      <span className="text-[10px] opacity-75">({yerliCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('global')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                        categoryFilter === 'global'
                          ? 'bg-sky-950/60 text-sky-300 border border-sky-500/40 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>🌍 Global / İngilizce</span>
                      <span className="text-[10px] opacity-75">({globalCount})</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    {filteredPlaylists.length} oynatma listesi bulundu
                  </span>
                </div>

                {/* Playlist Cards List */}
                <div className="space-y-3">
                  {filteredPlaylists.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-950/30 rounded-xl border border-slate-800/60">
                      Bu filtreye uygun oynatma listesi bulunamadı.
                    </div>
                  ) : (
                    filteredPlaylists.map((pl, idx) => {
                      const status = addingPlaylistUrls[pl.url];
                      const isYerli = pl.category === 'yerli';

                      return (
                        <div
                          key={pl.playlist_id || idx}
                          className="p-3 sm:p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {/* Thumbnail or Fallback */}
                            <div className="relative w-24 h-16 rounded-lg overflow-hidden bg-slate-800 shrink-0 border border-slate-700/60 shadow-sm">
                              {pl.thumbnail_url ? (
                                <img
                                  src={pl.thumbnail_url}
                                  alt={pl.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-500">
                                  <YouTubeIcon className="w-6 h-6 text-red-500/70" />
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5 text-[9px] font-semibold text-slate-300 flex items-center justify-center gap-1">
                                <Layers className="w-2.5 h-2.5 text-indigo-400" />
                                <span>PLAYLIST</span>
                              </div>
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                                  isYerli 
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' 
                                    : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                                }`}>
                                  {isYerli ? '🇹🇷 Yerli Seri' : '🌍 Global / Dünya Çapında'}
                                </span>
                                <span className="text-[11px] font-medium text-slate-400 truncate">
                                  {pl.channel_name}
                                </span>
                              </div>

                              <h4 className="text-xs font-semibold text-white group-hover:text-indigo-200 transition line-clamp-1">
                                {pl.title}
                              </h4>

                              {pl.pedagogical_focus && (
                                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                                  💡 {pl.pedagogical_focus}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                            <a
                              href={pl.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition flex items-center gap-1 border border-slate-700/80"
                              title="YouTube'da Yeni Sekmede İncele"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">İncele</span>
                            </a>

                            <button
                              type="button"
                              onClick={() => handleAddDiscoveredPlaylist(pl)}
                              disabled={status === 'loading' || status === 'added'}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition flex items-center gap-1.5 ${
                                status === 'added'
                                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-default'
                                  : status === 'loading'
                                  ? 'bg-indigo-600/50 text-indigo-200 cursor-wait'
                                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/25 active:scale-95'
                              }`}
                            >
                              {status === 'loading' ? (
                                <>
                                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  <span>Ekleniyor...</span>
                                </>
                              ) : status === 'added' ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Derse Eklendi</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>+ Derse Ekle</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Manual Link Add */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
            {manualError && (
              <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{manualError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                YouTube Video veya Playlist Linki
              </label>
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=... veya https://www.youtube.com/playlist?list=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500 transition shadow-inner"
                autoFocus
              />
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
              <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                <ListVideo className="w-3.5 h-3.5 text-indigo-400" />
                Desteklenen Bağlantılar:
              </div>
              <p>• Tekil YouTube videoları (`youtube.com/watch?v=...` veya `youtu.be/...`)</p>
              <p>• Tam Oynatma Listeleri (`youtube.com/playlist?list=...`)</p>
              <p>• Eklenen videolardan transkriptler ve konu anlatımı / soru çözümü bölümleri otomatik olarak hazırlanır.</p>
            </div>

            {manualStatus && (
              <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-300 flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span>{manualStatus}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Kapat
              </button>
              <button
                type="submit"
                disabled={isManualLoading || !url.trim()}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold shadow transition flex items-center gap-1.5"
              >
                {isManualLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Ekleniyor...</span>
                  </>
                ) : (
                  <span>Kaynağı Ekle</span>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
