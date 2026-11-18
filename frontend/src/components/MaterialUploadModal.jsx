import React, { useState } from 'react';
import { 
  X, 
  UploadCloud, 
  FileText, 
  Link as LinkIcon, 
  Edit3, 
  CheckCircle2, 
  AlertCircle,
  Trash2
} from 'lucide-react';

export default function MaterialUploadModal({
  isOpen,
  onClose,
  courseId,
  onUploadFiles,
  onAddLink,
  onAddText
}) {
  const [activeTab, setActiveTab] = useState('file'); // 'file', 'link', 'text'
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...dropped]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const chosen = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...chosen]);
    }
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (activeTab === 'file') {
        if (!selectedFiles || selectedFiles.length === 0) {
          throw new Error("Lütfen en az bir dosya seçin veya sürükleyin.");
        }
        await onUploadFiles(courseId, selectedFiles);
        setSelectedFiles([]);
      } else if (activeTab === 'link') {
        if (!linkUrl.trim()) throw new Error("Lütfen bir web linki girin.");
        await onAddLink(courseId, linkUrl, linkTitle);
        setLinkUrl('');
        setLinkTitle('');
      } else if (activeTab === 'text') {
        if (!noteTitle.trim() || !noteContent.trim()) throw new Error("Başlık ve not içeriği zorunludur.");
        await onAddText(courseId, noteTitle, noteContent);
        setNoteTitle('');
        setNoteContent('');
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "İşlem sırasında bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold text-slate-100 text-sm">Ders Materyali Ekle</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 p-1">
          <button
            onClick={() => setActiveTab('file')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'file' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF / Slayt / Fotoğraf (Çoklu)</span>
          </button>

          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'link' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Web Linki</span>
          </button>

          <button
            onClick={() => setActiveTab('text')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Yazılı Not</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'file' && (
            <div className="space-y-3">
              {/* Drag and Drop Box */}
              <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition text-center ${
                  isDragging 
                    ? 'border-indigo-400 bg-indigo-950/40 scale-[1.01]' 
                    : 'border-slate-700 hover:border-indigo-500 bg-slate-950/40'
                }`}
                onClick={() => document.getElementById('multi-file-input')?.click()}
              >
                <UploadCloud className={`w-9 h-9 mb-2 transition ${isDragging ? 'text-indigo-300' : 'text-slate-400'}`} />
                <span className="text-xs text-slate-200 font-medium">
                  {isDragging ? 'Dosyaları buraya bırakın!' : 'Dosyaları buraya sürükleyin veya tıklayarak seçin'}
                </span>
                <span className="text-[10px] text-slate-500 mt-1">
                  Aynı anda birden fazla PDF, PPTX, resim ve not seçebilirsiniz
                </span>
                <input
                  id="multi-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400 px-1 pb-1">
                    Yüklenecek Dosyalar ({selectedFiles.length}):
                  </div>
                  {selectedFiles.map((file, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/70 border border-slate-700/50 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="text-slate-200 truncate">{file.name}</span>
                        <span className="text-[10px] text-slate-500 shrink-0">({formatFileSize(file.size)})</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(i);
                        }}
                        className="text-slate-400 hover:text-red-400 p-1 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                ✨ PDF slaytları ve ders notu fotoğrafları sayfa sayfa analiz edilir.
              </p>
            </div>
          )}

          {activeTab === 'link' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Web Sayfası Linki (URL)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Başlık (Opsiyonel)</label>
                <input
                  type="text"
                  placeholder="Örn: Ders Özeti Makalesi"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {activeTab === 'text' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Not Başlığı</label>
                <input
                  type="text"
                  placeholder="Örn: Hafta 1 Notları"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">İçerik</label>
                <textarea
                  rows="6"
                  placeholder="Ders notlarınızı buraya yazın veya yapıştırın..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
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
              disabled={isLoading || (activeTab === 'file' && selectedFiles.length === 0)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow transition flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Dosyalar Yükleniyor...</span>
                </>
              ) : (
                <span>{activeTab === 'file' ? `${selectedFiles.length || ''} Dosyayı Yükle` : 'Kaydet'}</span>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
