import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Sparkles, 
  Bot, 
  User, 
  RotateCcw, 
  Play, 
  Maximize2, 
  Minimize2, 
  Minus,
  Plus
} from 'lucide-react';
import FormattedContent from './FormattedContent';

export default function AITutorPanel({
  course,
  onAskTutor,
  activeMaterialId,
  selectedText,
  onClearSelectedText,
  onSeekTimestamp,
  onTriggerQuiz,
  isMaximized = false,
  onToggleMaximize,
  isMinimized = false,
  onToggleMinimize,
  promptToAsk,
  onClearPromptToAsk
}) {
  const courseId = course?.id || 'default';
  const courseTitle = course?.title || 'Ders';
  const storageKey = `omnistudy_chat_v5_${courseId}`;

  const defaultWelcome = {
    role: 'assistant',
    text: `Merhaba! Ben senin yapay zeka **${courseTitle} Çalışma Koçun (OmniStudy AI)**. 📚\n\nNotlarındaki kavramları ve formülleri derinlemesine açıklayabilir, konuların anlatıldığı ilgili videoları pedagojik bir sırayla tavsiye edebilir ve sorularını adım adım çözebilirim. Hangi konuyu veya tanımı çalışmak istersin?`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  const [messages, setMessages] = useState(() => {
    try {
      // Purge any legacy zombie storage keys
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('omnistudy_chat_v2_') || key.startsWith('omnistudy_chat_v3_') || key.startsWith('omnistudy_chat_default'))) {
          localStorage.removeItem(key);
        }
      }
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [defaultWelcome];
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Sync with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (e) {}
  }, [messages, storageKey]);

  // If course changed, switch history cleanly
  useEffect(() => {
    try {
      localStorage.removeItem(`omnistudy_chat_v2_${courseId}`);
      localStorage.removeItem(`omnistudy_chat_v3_${courseId}`);
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setMessages(JSON.parse(saved));
      } else {
        setMessages([defaultWelcome]);
      }
    } catch (e) {
      setMessages([defaultWelcome]);
    }
  }, [courseId, storageKey]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // When external prompt is passed (e.g. "Hocaya Sor" from Document Viewer)
  useEffect(() => {
    if (promptToAsk) {
      handleSend(promptToAsk);
      if (onClearPromptToAsk) onClearPromptToAsk();
    }
  }, [promptToAsk]);

  const handleSend = async (messageText) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || isLoading) return;

    // Use selected snippet for THIS message only
    const attachedSnippet = selectedText || null;

    const userMsg = {
      role: 'user',
      text: textToSend,
      selectedSnippet: attachedSnippet,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Immediately clear selected snippet so subsequent messages do NOT keep it stuck!
    if (onClearSelectedText) {
      onClearSelectedText();
    }

    try {
      const historyToSend = messages
        .filter(m => m.text && !m.isError)
        .slice(-8)
        .map(m => ({
          role: m.role,
          text: m.text
        }));

      const response = await onAskTutor({
        message: textToSend,
        selected_text: attachedSnippet,
        context_material_id: activeMaterialId || null,
        history: historyToSend
      });

      const assistantMsg = {
        role: 'assistant',
        text: response.answer || 'Konu incelendi.',
        matched_videos: response.matched_videos || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: 'Yapay zeka yanıt verirken bir sorun oluştu. Lütfen tekrar deneyin.',
          isError: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleResetChat = () => {
    if (window.confirm("Sohbet geçmişini temizlemek istediğinize emin misiniz?")) {
      const resetList = [defaultWelcome];
      setMessages(resetList);
      try {
        localStorage.setItem(storageKey, JSON.stringify(resetList));
        localStorage.removeItem(`omnistudy_chat_${courseId}`);
        localStorage.removeItem(`omnistudy_chat_v2_${courseId}`);
        localStorage.removeItem(`omnistudy_chat_v3_${courseId}`);
      } catch (e) {}
    }
  };

  const quickPrompts = [
    { label: "💡 2. PDF İlk Konu", prompt: "2. PDF'teki ilk konuyu notlardan bul, nerede olduğunu söyle, ilgili videoları göster ve konuyu anlat." },
    { label: "🎬 Videodaki Püf Noktalar", prompt: "Şu anki konunun video anlatımındaki en kritik formül ve sınav ipuçlarını çıkar." },
    { label: "🧠 Beni Sına (Quiz)", isAction: true, action: onTriggerQuiz },
  ];

  // MINIMIZED STATE
  if (isMinimized) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 truncate text-xs text-slate-300">
          <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="font-medium truncate">AI Ders Koçu ({messages.length} mesaj)</span>
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
      
      {/* 1. Header */}
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-100">AI Ders Koçu & Soru-Cevap</h3>
            <p className="text-[10px] text-slate-400">Notlarda bul · ilgili videoyu aç</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleResetChat}
            title="Sohbeti Temizle"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

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

      {/* 2. Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {messages.map((m, idx) => (
          <div 
            key={idx} 
            className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-300 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}

            <div className={`max-w-[90%] rounded-2xl p-3.5 ${
              m.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none shadow-md' 
                : 'bg-slate-800/95 text-slate-100 border border-slate-700/70 rounded-tl-none shadow-md'
            }`}>
              {m.selectedSnippet && (
                <div className="mb-2 p-2 rounded-lg bg-black/30 text-[11px] text-indigo-200 border-l-2 border-indigo-400">
                  <span className="font-semibold">İncelenen Not Kesiti:</span> "{m.selectedSnippet.slice(0, 120)}..."
                </div>
              )}

              {/* Formatted Content with KaTeX Math rendering and inline interactive video buttons */}
              <FormattedContent 
                text={m.text} 
                onTimestampClick={(sec, vid) => onSeekTimestamp(sec, vid)} 
                onVideoClick={(vid) => onSeekTimestamp(0, vid)}
              />

              <div className="text-[10px] text-slate-400 mt-2 text-right">
                {m.timestamp}
              </div>
            </div>

            {m.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2.5 items-center text-slate-400 text-xs">
            <div className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-300 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
              <span>Notlarda ilgili sayfa ve video başlıkları aranıyor...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. Quick Prompt Suggestions */}
      <div className="px-3 py-1.5 bg-slate-900/90 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto shrink-0">
        {quickPrompts.map((qp, i) => (
          <button
            key={i}
            type="button"
            onClick={() => qp.isAction ? qp.action() : handleSend(qp.prompt)}
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] whitespace-nowrap border border-slate-700 transition"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* 4. Input Form */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-900/90 shrink-0">
        {selectedText && (
          <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-indigo-950/80 border border-indigo-500/40 flex items-center justify-between text-[11px] text-indigo-300 animate-fadeIn">
            <span className="truncate max-w-[85%]">
              <span className="font-semibold text-indigo-200">İncelenecek Not Kesiti:</span> "{selectedText.slice(0, 70)}..."
            </span>
            <button
              type="button"
              onClick={onClearSelectedText}
              className="p-1 hover:text-white text-indigo-400 transition"
              title="Kesiti Kaldır"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="relative flex items-center">
          <textarea
            rows="2"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Bir konu sor; nottaki yerini bulup ilgili videoları göstereyim..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-3 pr-10 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="absolute right-2.5 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
}
