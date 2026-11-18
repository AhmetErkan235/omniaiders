import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Search, 
  Sparkles, 
  PlayCircle, 
  Copy, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  X, 
  Maximize2, 
  Minimize2, 
  Minus,
  Plus,
  Eye,
  AlignLeft,
  Layers,
  ArrowRight,
  ExternalLink
} from 'lucide-react';

export default function DocumentViewer({
  materials = [],
  activeMaterialId,
  targetPage = 1,
  onSelectMaterial,
  onSelectPage,
  onDeleteMaterial,
  onMatchVideo,
  onAskTutorWithText,
  isMaximized = false,
  onToggleMaximize,
  isMinimized = false,
  onToggleMinimize
}) {
  const [selectedMatId, setSelectedMatId] = useState(activeMaterialId || (materials[0] ? materials[0].id : null));
  const [activePage, setActivePage] = useState(targetPage || 1);
  const [selectedText, setSelectedText] = useState('');
  const [copied, setCopied] = useState(false);
  const [matchStatus, setMatchStatus] = useState('');
  const [viewMode, setViewMode] = useState('text'); // default 'text' for interactive note exploration
  const [quickSearchInput, setQuickSearchInput] = useState('');
  const [analyzedPagesMap, setAnalyzedPagesMap] = useState({});
  const [analyzingPages, setAnalyzingPages] = useState({});
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const scrollContainerRef = useRef(null);
  const pdfScrollContainerRef = useRef(null);
  const isScrollingProgrammatically = useRef(false);

  const scrollToPageElement = (pageNum, retryCount = 0) => {
    const isPdfMode = viewMode === 'pdf';
    const prefix = isPdfMode ? 'doc-pdf-page-' : 'doc-page-';
    const container = isPdfMode ? pdfScrollContainerRef.current : scrollContainerRef.current;
    const el = document.getElementById(`${prefix}${pageNum}`);
    if (el && container) {
      isScrollingProgrammatically.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 700);
    } else if (retryCount < 8) {
      setTimeout(() => scrollToPageElement(pageNum, retryCount + 1), 60);
    }
  };

  // Sync material ID from parent
  useEffect(() => {
    if (activeMaterialId && activeMaterialId !== selectedMatId) {
      setSelectedMatId(activeMaterialId);
    } else if (materials.length > 0 && !selectedMatId) {
      setSelectedMatId(materials[0].id);
    }
  }, [activeMaterialId, materials]);

  // Sync page number from parent whenever targetPage, material or viewMode changes
  useEffect(() => {
    if (targetPage && targetPage > 0) {
      setActivePage(targetPage);
      scrollToPageElement(targetPage);
    }
  }, [targetPage, selectedMatId, viewMode]);

  const activeMaterial = materials.find(m => m.id === selectedMatId) || materials[0];

  // Derive file URL for authentic PDF / image rendering
  const getFileUrl = (mat) => {
    if (!mat) return null;
    if (mat.file_url) return mat.file_url;
    if (mat.file_path) {
      const filename = mat.file_path.split(/[\\/]/).pop();
      return `/uploads/${filename}`;
    }
    return mat.url || null;
  };

  const fileUrl = getFileUrl(activeMaterial);
  const isPdf = activeMaterial?.type === 'pdf' || activeMaterial?.title?.toLowerCase().endsWith('.pdf');
  const isImage = activeMaterial?.type === 'image' || /\.(jpe?g|png|webp|gif)$/i.test(activeMaterial?.title || '');

  // Parse pages if available in metadata
  let pages = [];
  if (activeMaterial && activeMaterial.metadata_json) {
    try {
      const meta = typeof activeMaterial.metadata_json === 'string' 
        ? JSON.parse(activeMaterial.metadata_json) 
        : activeMaterial.metadata_json;
      pages = meta.pages || [];
    } catch (e) {
      pages = [];
    }
  }

  const totalPages = pages.length > 0 ? pages.length : 1;

  // Change page helper (with smooth scroll to that page section)
  const handlePageChange = (newPage) => {
    const validPage = Math.max(1, Math.min(totalPages, newPage));
    setActivePage(validPage);
    setSelectedText('');
    if (onSelectPage) onSelectPage(validPage);
    scrollToPageElement(validPage);
  };

  // Continuous scroll tracker: when user scrolls by hand up/down, dynamically update activePage indicator
  const handleScroll = (e) => {
    if (isScrollingProgrammatically.current) return;
    const container = e.currentTarget;
    const pageElements = container.querySelectorAll('[data-page]');
    if (!pageElements || pageElements.length === 0) return;

    const containerTop = container.scrollTop;
    let closestPage = activePage;
    let minDistance = Infinity;

    for (const el of pageElements) {
      const pageNum = parseInt(el.getAttribute('data-page'), 10);
      const elTop = el.offsetTop - container.offsetTop;
      const dist = Math.abs(elTop - containerTop);
      if (dist < minDistance) {
        minDistance = dist;
        closestPage = pageNum;
      }
    }

    if (closestPage && closestPage !== activePage) {
      setActivePage(closestPage);
      if (onSelectPage) onSelectPage(closestPage);
    }
  };

// Vision Analysis Handlers (Gemini Multimodal)
  const handleAnalyzePageVision = async (pageNum) => {
    if (!activeMaterial) return;
    setAnalyzingPages(prev => ({ ...prev, [pageNum]: true }));
    try {
      const res = await api.analyzePageVision(activeMaterial.id, pageNum);
      if (res.data?.text) {
        setAnalyzedPagesMap(prev => ({ ...prev, [pageNum]: res.data.text }));
        setMatchStatus(`✨ Sayfa ${pageNum} yapay zeka ile görsel olarak incelendi ve zengin ders notu oluşturuldu!`);
        setTimeout(() => setMatchStatus(''), 4500);
      }
    } catch (e) {
      alert("Görsel analiz hatası: " + (e.response?.data?.detail || e.message));
    } finally {
      setAnalyzingPages(prev => ({ ...prev, [pageNum]: false }));
    }
  };

  const handleBatchAnalyzeVision = async () => {
    if (!activeMaterial) return;
    setIsBatchAnalyzing(true);
    setMatchStatus("Görsel ağırlıklı sayfalar yapay zeka (Gemini Vision) ile taranıyor...");
    try {
      const res = await api.analyzeSparsePagesVision(activeMaterial.id);
      if (res.data?.pages && res.data.pages.length > 0) {
        const matRes = await api.getMaterial(activeMaterial.id);
        if (matRes.data?.metadata?.pages) {
          const map = {};
          matRes.data.metadata.pages.forEach(p => {
            if (p.is_vision_analyzed) map[p.page] = p.text;
          });
          setAnalyzedPagesMap(prev => ({ ...prev, ...map }));
        }
        setMatchStatus(`✅ ${res.data.message}`);
      } else {
        setMatchStatus(res.data?.message || "Taranacak sayfa bulunamadı.");
      }
      setTimeout(() => setMatchStatus(''), 6000);
    } catch (e) {
      alert("Görsel tarama hatası: " + (e.response?.data?.detail || e.message));
    } finally {
      setIsBatchAnalyzing(false);
    }
  };

  // Text selection handler
  const handleSelection = () => {
    const sel = window.getSelection();
    if (sel) {
      const text = sel.toString().trim();
      if (text.length >= 3) {
        setSelectedText(text);
      }
    }
  };

  const handleCopy = () => {
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Cross-search across all materials and pages
  const handleQuickSearch = async (term) => {
    const query = (term || quickSearchInput || selectedText || '').trim();
    if (!query) return;

    setMatchStatus(`"${query.slice(0, 30)}" konusu ders notlarında ve videolarda aranıyor...`);

    const qLower = query.toLowerCase();
    let foundMat = null;
    let foundPage = null;

    // 1. Search current material first
    if (pages.length > 0) {
      for (const p of pages) {
        if ((p.text || '').toLowerCase().includes(qLower)) {
          foundMat = activeMaterial;
          foundPage = p.page;
          break;
        }
      }
    }

    // 2. Search all other materials if not found in current
    if (!foundMat) {
      for (const mat of materials) {
        let matPages = [];
        if (mat.metadata_json) {
          try {
            const meta = typeof mat.metadata_json === 'string' ? JSON.parse(mat.metadata_json) : mat.metadata_json;
            matPages = meta.pages || [];
          } catch (e) {}
        }
        for (const p of matPages) {
          if ((p.text || '').toLowerCase().includes(qLower)) {
            foundMat = mat;
            foundPage = p.page;
            break;
          }
        }
        if (foundMat) break;
      }
    }

    // Apply material & page jump if found
    if (foundMat) {
      if (foundMat.id !== activeMaterial?.id) {
        setSelectedMatId(foundMat.id);
        if (onSelectMaterial) onSelectMaterial(foundMat.id);
      }
      if (foundPage) {
        handlePageChange(foundPage);
      }
      setMatchStatus(`✅ "${query.slice(0, 25)}" konusu ${foundMat.title} Sayfa ${foundPage || 1}'de bulundu ve açıldı!`);
    }

    // Also match video
    if (onMatchVideo) {
      await onMatchVideo(query);
    }

    setTimeout(() => setMatchStatus(''), 5000);
  };

  const handleAskTutor = (textToAsk) => {
    const query = textToAsk || quickSearchInput || selectedText;
    if (!query || !query.trim()) return;
    onAskTutorWithText(query);
  };

  if (!materials || materials.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-slate-900/50 rounded-2xl border border-slate-800">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-2 border border-indigo-500/20">
          <BookOpen className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-slate-200 text-xs mb-1">Henüz Ders Notu veya PDF Eklenmedi</h3>
        <p className="text-[11px] text-slate-400 max-w-sm">
          Üst menüdeki "Materyal Yükle" butonunu kullanarak PDF, slayt veya ders notu ekleyin.
        </p>
      </div>
    );
  }

  // MINIMIZED STATE
  if (isMinimized) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 truncate text-xs text-slate-300">
          <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="font-medium truncate">{activeMaterial?.title || 'Ders Notları'}</span>
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

  return (
    <div className="flex flex-col h-full bg-slate-900/70 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
      
      {/* 1. Header Bar: Material Tabs + Controls (Compact) */}
      <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2 shrink-0">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-thin">
          {materials.map(mat => {
            const isSelected = mat.id === (activeMaterial ? activeMaterial.id : null);
            return (
              <div
                key={mat.id}
                className={`group flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0 ${
                  isSelected 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMatId(mat.id);
                    handlePageChange(1);
                    if (onSelectMaterial) onSelectMaterial(mat.id);
                  }}
                  className="flex items-center gap-1.5 text-left"
                  title={mat.title}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[130px]">{mat.title}</span>
                </button>

                {/* Delete Material Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`"${mat.title}" materyalini silmek istediğinize emin misiniz?`)) {
                      onDeleteMaterial(mat.id);
                    }
                  }}
                  title="Notu Sil"
                  className="p-0.5 rounded hover:bg-red-500/30 text-slate-400 hover:text-red-300 transition shrink-0 ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* View Mode Toggle (Metin vs Orijinal PDF) & Window controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {(isPdf || isImage) && (
            <div className="flex items-center bg-slate-800/90 p-0.5 rounded-lg border border-slate-700/80 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('text')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition ${
                  viewMode === 'text' 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'text-slate-400 hover:text-white'
                }`}
                title="İnteraktif Metin ve Bölüm Görünümü"
              >
                <AlignLeft className="w-3 h-3" />
                <span className="hidden sm:inline">Metin Notu</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('pdf')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition ${
                  viewMode === 'pdf' 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Orijinal PDF Belgesi"
              >
                <Eye className="w-3 h-3" />
                <span className="hidden sm:inline">Orijinal PDF</span>
              </button>
            </div>
          )}

          {/* Minimize Button */}
          {onToggleMinimize && (
            <button
              type="button"
              onClick={onToggleMinimize}
              title="Pencereyi Küçült"
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
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
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* 2. Quick Topic & Theorem Finder Strip */}
      <div className="px-3 py-1.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0 text-xs">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Konu, teorem veya tanım ara (örn: Ara Değer Teoremi, Sandviç, Definition 3.1)..."
              value={quickSearchInput}
              onChange={(e) => setQuickSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuickSearch(quickSearchInput);
              }}
              className="w-full bg-slate-900 border border-slate-700/80 text-xs text-white rounded-lg pl-7 pr-2 py-1 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
            />
            <Search className="w-3.5 h-3.5 text-indigo-400 absolute left-2 top-2" />
          </div>

          <button
            type="button"
            onClick={() => handleQuickSearch(quickSearchInput)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-sm shrink-0"
            title="Bu konuyu notlarda aç ve ilgili videoyu başlat"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Bul & Videoya Git</span>
          </button>

          <button
            type="button"
            onClick={() => handleAskTutor(quickSearchInput)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition shadow-sm shrink-0"
            title="Bu konuyu AI hocaya sor"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Hocaya Sor</span>
          </button>

          <button
            type="button"
            disabled={isBatchAnalyzing}
            onClick={handleBatchAnalyzeVision}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm shrink-0 transition"
            title="Bu belgedeki görsel/grafik ağırlıklı sayfaları Gemini Vision ile otomatik tara ve ders notu üret"
          >
            {isBatchAnalyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Görseller Taranıyor...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Görsel Tara</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3. Ultra-compact, space-saving Page Navigation Strip */}
      {totalPages > 1 && (
        <div className="px-3 py-1 bg-slate-900/95 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-none py-0.5">
            <button
              type="button"
              disabled={activePage <= 1}
              onClick={() => handlePageChange(activePage - 1)}
              className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition shrink-0"
              title="Önceki Sayfa"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="text-[11px] font-semibold text-indigo-300 px-1 whitespace-nowrap shrink-0">
              Sayfa {activePage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={activePage >= totalPages}
              onClick={() => handlePageChange(activePage + 1)}
              className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition shrink-0"
              title="Sonraki Sayfa"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Compact mini-pills for direct jumps */}
            <div className="hidden sm:flex items-center gap-1 ml-1 pl-1 border-l border-slate-800 overflow-x-auto">
              {pages.map(p => (
                <button
                  key={p.page}
                  type="button"
                  onClick={() => handlePageChange(p.page)}
                  className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-medium transition shrink-0 ${
                    activePage === p.page 
                      ? 'bg-indigo-600 text-white font-bold shadow-xs' 
                      : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title={`${p.page}. Sayfaya Git`}
                >
                  {p.page}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-slate-400 hidden md:inline">
              (Sayfayı kaydırdıkça gösterge otomatik güncellenir)
            </span>
          </div>
        </div>
      )}

      {/* Floating Action Bar when text is selected */}
      {selectedText && (
        <div className="bg-gradient-to-r from-indigo-950/95 via-purple-950/95 to-slate-900/95 border-b border-indigo-500/40 px-3 py-1.5 flex items-center justify-between gap-2 shadow-md animate-fadeIn shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-semibold shrink-0">
              Seçili
            </span>
            <span className="text-xs text-white truncate max-w-xs italic font-serif">
              "{selectedText}"
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleQuickSearch(selectedText)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Videoda Bul</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAskTutor(selectedText)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Hocaya Sor</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCopy}
              className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
              title="Kopyala"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSelectedText('')}
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition"
              title="Kapat"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Match Notification Alert */}
      {matchStatus && (
        <div className="bg-emerald-950/80 border-b border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 flex items-center justify-between animate-fadeIn shrink-0">
          <span className="truncate">{matchStatus}</span>
          <button type="button" onClick={() => setMatchStatus('')} className="text-emerald-400 hover:text-emerald-200 ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Document Content Area */}
      <div 
        className="relative flex-1 w-full h-full overflow-hidden bg-slate-950 flex flex-col"
      >
        {activeMaterial ? (
          viewMode === 'pdf' && isPdf ? (
            /* Authentic Visual PDF Viewer with Continuous Scroll & Real-Time Page Tracking */
            <div 
              ref={pdfScrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950 space-y-6 flex flex-col items-center"
            >
              {pages.length > 0 ? (
                pages.map((p) => {
                  const isCurrent = activePage === p.page;
                  return (
                    <div
                      key={`pdf-page-${p.page}`}
                      id={`doc-pdf-page-${p.page}`}
                      data-page={p.page}
                      className={`w-full max-w-4xl rounded-2xl border transition-all flex flex-col overflow-hidden shadow-2xl ${
                        isCurrent 
                          ? 'border-indigo-500 ring-2 ring-indigo-500/40 shadow-indigo-500/10' 
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Page Header Bar */}
                      <div className="px-3 sm:px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
                        <span className="flex items-center gap-2 text-indigo-300 font-semibold">
                          <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-indigo-400 ring-4 ring-indigo-500/20' : 'bg-slate-600'}`} />
                          SAYFA {p.page} / {totalPages}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleQuickSearch(p.text.slice(0, 80))}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[11px] font-medium transition border border-indigo-500/30"
                            title="Bu sayfanın konusunu YouTube videosunda aç"
                          >
                            <PlayCircle className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="hidden sm:inline">Sayfayı Videoda Bul</span>
                          </button>

                          <button
                            type="button"
                            disabled={analyzingPages[p.page]}
                            onClick={() => handleAnalyzePageVision(p.page)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition border ${
                              (p.is_vision_analyzed || analyzedPagesMap[p.page])
                                ? 'bg-purple-900/40 text-purple-300 border-purple-500/40 hover:bg-purple-900/60'
                                : 'bg-indigo-950/70 text-purple-200 border-purple-500/40 hover:bg-purple-900/50 hover:text-white'
                            }`}
                            title="Bu sayfadaki görseli, şemaları ve kimyasal modelleri yapay zeka (Gemini Vision) ile ayrıntılı incele ve not çıkar"
                          >
                            {analyzingPages[p.page] ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                                <span className="hidden sm:inline">Görsel İnceleniyor...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                                <span className="hidden sm:inline">{(p.is_vision_analyzed || analyzedPagesMap[p.page]) ? 'Görsel Notu Güncelle' : 'Görsel Not Çıkar'}</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAskTutor((analyzedPagesMap[p.page] || p.text).slice(0, 200))}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[11px] font-medium transition border border-purple-500/30"
                            title="Bu sayfadaki konuyu AI hocaya sor"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                            <span className="hidden sm:inline">Sayfayı Açıkla</span>
                          </button>

                          {fileUrl && (
                            <a
                              href={`${fileUrl}#page=${p.page}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                              title="Orijinal PDF'i Yeni Sekmede Aç"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Crisp, Crystal-Clear Original PDF Page */}
                      <div className="bg-white p-2 sm:p-4 flex items-center justify-center min-h-[500px]">
                        <img 
                          src={`/api/materials/${activeMaterial.id}/page-image/${p.page}`}
                          alt={`Sayfa ${p.page}`}
                          loading="lazy"
                          className="w-full h-auto object-contain shadow-sm rounded-sm"
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                /* Fallback if pages data not yet available */
                <div className="w-full h-full flex flex-col bg-slate-900">
                  <iframe
                    src={`${fileUrl}#toolbar=1&navpanes=0`}
                    title={activeMaterial.title}
                    className="w-full h-full border-0 bg-slate-950"
                  />
                </div>
              )}
            </div>
          ) : viewMode === 'pdf' && isImage && fileUrl ? (
            /* Image viewer for handwritten notes / blackboard photos */
            <div className="w-full h-full overflow-auto flex items-center justify-center p-4 bg-slate-950">
              <img 
                src={fileUrl} 
                alt={activeMaterial.title}
                className="max-w-full max-h-full object-contain rounded-xl shadow-lg border border-slate-800" 
              />
            </div>
          ) : (
            /* Interactive Clean Text & Notes View with Continuous Scroll & Real-Time Page Tracking */
            <div 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 sm:p-5 text-sm text-slate-200 leading-relaxed font-sans select-text bg-slate-950 space-y-5"
              onMouseUp={handleSelection}
              onTouchEnd={handleSelection}
            >
              {pages.length > 0 ? (
                pages.map((p) => {
                  const isCurrent = activePage === p.page;
                  return (
                    <div 
                      key={p.page}
                      id={`doc-page-${p.page}`}
                      data-page={p.page}
                      className={`p-4 sm:p-5 rounded-xl border transition-all ${
                        isCurrent 
                          ? 'bg-slate-900/90 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/30' 
                          : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700/80'
                      }`}
                    >
                      <div className="text-[11px] font-mono text-indigo-400 font-semibold mb-3 flex items-center justify-between pb-2 border-b border-slate-800/60">
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-indigo-400 ring-4 ring-indigo-500/20' : 'bg-slate-600'}`} />
                          SAYFA / BÖLÜM {p.page} (Toplam {totalPages})
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleQuickSearch(p.text.slice(0, 80))}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[11px] font-medium transition border border-indigo-500/30"
                            title="Bu sayfanın konusunu YouTube videosunda aç"
                          >
                            <PlayCircle className="w-3 h-3 text-indigo-400" />
                            <span className="hidden sm:inline">Sayfayı Videoda Bul</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAskTutor(p.text.slice(0, 180))}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[11px] font-medium transition border border-purple-500/30"
                            title="Bu sayfadaki konuyu AI hocaya açıklat"
                          >
                            <Sparkles className="w-3 h-3 text-purple-400" />
                            <span className="hidden sm:inline">Sayfayı Açıkla</span>
                          </button>
                        </div>
                      </div>

                      <div className="whitespace-pre-wrap leading-relaxed text-slate-200 font-normal">
                        {p.text || 'Bu sayfa boş görünüyor.'}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-slate-900/60 p-4 sm:p-5 rounded-xl border border-slate-800/80 shadow-inner">
                  <div className="whitespace-pre-wrap leading-relaxed text-slate-200">
                    {activeMaterial.content || 'Materyal içeriği bulunamadı.'}
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="p-6 text-slate-500 text-xs">Materyal seçilmedi.</div>
        )}
      </div>

    </div>
  );
}
