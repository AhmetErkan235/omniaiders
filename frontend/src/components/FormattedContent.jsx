import React from 'react';
import katex from 'katex';
import { Play } from 'lucide-react';

function parseSeconds(timestampStr) {
  if (!timestampStr) return 0;
  // If interval like "00:00 - 03:00", take first part
  const firstPart = timestampStr.split('-')[0].trim();
  const parts = firstPart.split(':').map(p => parseInt(p, 10));
  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  } else if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }
  return 0;
}

export default function FormattedContent({ text = '', onTimestampClick, onVideoClick }) {
  if (!text) return null;

  // Pre-process text to standardize math delimiters:
  // Convert \[ ... \] to $$ ... $$ and \( ... \) to $ ... $
  let processed = text
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');

  // Split content by display math $$...$$ (supports multiline)
  const mathBlockRegex = /\$\$([\s\S]*?)\$\$/g;
  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = mathBlockRegex.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: processed.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'display_math', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < processed.length) {
    segments.push({ type: 'text', content: processed.slice(lastIndex) });
  }

  return (
    <div className="space-y-1.5 text-xs text-slate-100 font-normal leading-relaxed">
      {segments.map((seg, sIdx) => {
        if (seg.type === 'display_math') {
          try {
            const html = katex.renderToString(seg.content, {
              displayMode: true,
              throwOnError: false,
              strict: false
            });
            return (
              <div
                key={`dm-${sIdx}`}
                className="my-3 overflow-x-auto text-center p-2.5 rounded-xl bg-slate-950/70 border border-indigo-500/20 shadow-inner"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch (e) {
            return (
              <div key={`dm-${sIdx}`} className="font-mono text-xs text-amber-300 my-1 p-2 bg-black/30 rounded">
                {seg.content}
              </div>
            );
          }
        }

        // Segment is normal text with paragraphs
        const lines = seg.content.split('\n');
        return (
          <React.Fragment key={`text-${sIdx}`}>
            {lines.map((line, lIdx) => renderLine(line, `${sIdx}-${lIdx}`, onTimestampClick, onVideoClick))}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function renderLine(line, key, onTimestampClick, onVideoClick) {
  const trimmed = line.trim();
  if (!trimmed) {
    return <div key={key} className="h-1.5" />;
  }

  // Heading 3: ### ...
  if (trimmed.startsWith('### ')) {
    return (
      <h4 key={key} className="text-xs font-bold text-indigo-300 mt-3 mb-1 flex items-center gap-1.5">
        <span>{trimmed.slice(4)}</span>
      </h4>
    );
  }

  // Heading 2: ## ...
  if (trimmed.startsWith('## ')) {
    return (
      <h3 key={key} className="text-sm font-bold text-white mt-3.5 mb-1.5 border-b border-slate-700/60 pb-1 flex items-center gap-1.5">
        <span>{trimmed.slice(3)}</span>
      </h3>
    );
  }

  // Horizontal divider: ---
  if (trimmed === '---') {
    return <hr key={key} className="my-2.5 border-slate-700/60" />;
  }

  // Bullet or numbered list
  const isBullet = trimmed.startsWith('* ') || trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed);
  const rawContent = isBullet ? trimmed.replace(/^(\*|-|\d+\.)\s/, '') : line;

  const parts = parseInlineContent(rawContent, onTimestampClick, onVideoClick);

  if (isBullet) {
    return (
      <div key={key} className="flex items-start gap-1.5 my-1 ml-1 leading-relaxed">
        <span className="text-indigo-400 font-bold shrink-0 mt-0.5">•</span>
        <div className="flex-1 min-w-0">{parts}</div>
      </div>
    );
  }

  return (
    <div key={key} className="my-1 leading-relaxed">
      {parts}
    </div>
  );
}

function parseInlineContent(str, onTimestampClick, onVideoClick) {
  if (!str) return '';

  // Regex tokens:
  // 1. Inline KaTeX: $...$
  // 2. Bold: **...**
  // 3. Video Link Button: [▶ Videoyu Aç: Title](video://VIDEO_ID)
  // 4. Timestamps
  const regex = /(\$[^$]+\$|\*\*[^*]+\*\*|\[(?:[^\]]+)\]\(video:\/\/[^)]+\)|`?\b(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\s*-\s*(?:\d{1,2}:)?\d{1,2}:\d{2})?`?)/g;
  const tokens = str.split(regex);

  return tokens.map((token, i) => {
    if (!token) return null;

    // Video Link Button: [▶ Videoyu Aç: Title](video://VIDEO_ID)
    const videoMatch = token.match(/^\[(.*?)\]\(video:\/\/([a-zA-Z0-9_\-]+)\)$/);
    if (videoMatch) {
      const label = videoMatch[1];
      const videoId = videoMatch[2];
      return (
        <button
          key={i}
          type="button"
          onClick={() => {
            if (onVideoClick) onVideoClick(videoId);
            else if (onTimestampClick) onTimestampClick(0, videoId);
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 my-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/25 border border-indigo-400/40 transition cursor-pointer group"
          title={`"${label}" videosunu oynatıcıda aç`}
        >
          <Play className="w-3.5 h-3.5 fill-current text-white group-hover:scale-110 transition shrink-0" />
          <span>{label}</span>
        </button>
      );
    }

    // Inline KaTeX: $...$
    if (token.startsWith('$') && token.endsWith('$') && token.length > 2) {
      const math = token.slice(1, -1);
      try {
        const html = katex.renderToString(math, {
          displayMode: false,
          throwOnError: false,
          strict: false
        });
        return (
          <span
            key={i}
            className="inline-math mx-0.5 px-1 py-0.5 rounded bg-indigo-950/50 text-indigo-200 border border-indigo-500/20"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch (e) {
        return <span key={i} className="font-mono text-indigo-300">{token}</span>;
      }
    }

    // Bold text: **...**
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      const inner = token.slice(2, -2);
      // If bold text contains a timestamp like **01:08 - 03:00**, make it clickable!
      if (/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/.test(inner) && onTimestampClick) {
        const sec = parseSeconds(inner);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onTimestampClick(sec)}
            className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-lg bg-red-600/20 hover:bg-red-600/35 text-red-300 hover:text-white border border-red-500/40 text-[11px] font-mono font-bold transition shadow-sm cursor-pointer group"
            title={`Videoyu ${inner} anına sar`}
          >
            <Play className="w-2.5 h-2.5 fill-red-400 group-hover:scale-110 transition" />
            <span>{inner}</span>
          </button>
        );
      }
      return <strong key={i} className="font-semibold text-white">{inner}</strong>;
    }

    // Clickable Timestamp badge: e.g. `01:08` or `00:00 - 03:00` or 01:08
    const cleanToken = token.replace(/`/g, '').trim();
    if (/^(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\s*-\s*(?:\d{1,2}:)?\d{1,2}:\d{2})?$/.test(cleanToken) && onTimestampClick) {
      const sec = parseSeconds(cleanToken);
      return (
        <button
          key={i}
          type="button"
          onClick={() => onTimestampClick(sec)}
          className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-lg bg-red-600/20 hover:bg-red-600/35 text-red-300 hover:text-white border border-red-500/40 text-[11px] font-mono font-bold transition shadow-sm cursor-pointer group"
          title={`Videoyu ${cleanToken} anına sar`}
        >
          <Play className="w-2.5 h-2.5 fill-red-400 group-hover:scale-110 transition" />
          <span>{cleanToken}</span>
        </button>
      );
    }

    return token;
  });
}
