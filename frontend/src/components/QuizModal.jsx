import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  ArrowRight, 
  RotateCcw,
  Trophy
} from 'lucide-react';

export default function QuizModal({
  isOpen,
  onClose,
  course,
  onGenerateQuiz
}) {
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  if (!isOpen) return null;

  const handleStartQuiz = async () => {
    setIsLoading(true);
    try {
      const res = await onGenerateQuiz(topic);
      if (res && res.questions && res.questions.length > 0) {
        setQuestions(res.questions);
        setCurrentIndex(0);
        setSelectedAnswers({});
        setShowExplanation(false);
        setIsFinished(false);
      }
    } catch (e) {
      alert("Quiz oluşturulurken bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  };

  const currentQ = questions[currentIndex];

  const handleSelectOption = (option) => {
    if (selectedAnswers[currentIndex]) return; // already answered
    setSelectedAnswers(prev => ({ ...prev, [currentIndex]: option }));
    setShowExplanation(true);
  };

  const handleNext = () => {
    setShowExplanation(false);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
    }
  };

  const calculateScore = () => {
    let score = 0;
    questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correct_answer) {
        score++;
      }
    });
    return score;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">
                Sınav & Quiz Modu — {course ? course.name : 'Ders'}
              </h2>
              <p className="text-xs text-slate-400">Notların ve videoların üzerinden akıllı test</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {questions.length === 0 ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/20 shadow-lg">
                <HelpCircle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-200">Konu Testi Başlat</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  Yapay zeka ders notlarını ve YouTube videolarındaki transkriptleri analiz edip, seni sınava hazırlayacak özel sorular üretecektir.
                </p>
              </div>

              <div className="max-w-md mx-auto pt-2">
                <input
                  type="text"
                  placeholder="Özel konu belirt (örn: Euler yöntemi, Deadlock, vb.) veya boş bırak"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 mb-4"
                />

                <button
                  onClick={handleStartQuiz}
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 disabled:opacity-50 text-white font-medium text-xs shadow-lg transition flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Sorular Hazırlanıyor...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Quiz'i Başlat (5 Soru)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : isFinished ? (
            /* Finished Results */
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20 shadow-lg">
                <Trophy className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">Tebrikler! Testi Tamamladın</h3>
              <p className="text-sm text-slate-300">
                Toplam Skor: <span className="text-indigo-400 font-bold text-base">{calculateScore()} / {questions.length}</span> Doğru
              </p>

              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  onClick={handleStartQuiz}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Yeni Quiz Çöz</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Kapat
                </button>
              </div>
            </div>
          ) : (
            /* Question Active */
            <div className="space-y-5">
              {/* Progress */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Soru {currentIndex + 1} / {questions.length}</span>
                <span className="font-semibold text-indigo-400">
                  Skor: {calculateScore()}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
              </div>

              {/* Question Text */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-sm font-medium text-slate-100 leading-relaxed">
                {currentQ.question}
              </div>

              {/* Options */}
              <div className="space-y-2.5">
                {(currentQ.options || []).map((opt, i) => {
                  const isSelected = selectedAnswers[currentIndex] === opt;
                  const isCorrect = opt === currentQ.correct_answer;
                  const hasAnswered = !!selectedAnswers[currentIndex];

                  let btnStyle = "bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700/80";
                  if (hasAnswered) {
                    if (isCorrect) {
                      btnStyle = "bg-emerald-950/50 border-emerald-500/70 text-emerald-200 font-semibold";
                    } else if (isSelected && !isCorrect) {
                      btnStyle = "bg-red-950/50 border-red-500/70 text-red-200";
                    }
                  }

                  return (
                    <button
                      key={i}
                      disabled={hasAnswered}
                      onClick={() => handleSelectOption(opt)}
                      className={`w-full text-left p-3 rounded-xl border text-xs transition flex items-center justify-between ${btnStyle}`}
                    >
                      <span>{opt}</span>
                      {hasAnswered && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                      {hasAnswered && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Explanation & Next */}
              {showExplanation && (
                <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 space-y-1.5 animate-fadeIn">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    Çözüm & Açıklama:
                  </div>
                  <p className="leading-relaxed">{currentQ.explanation}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {questions.length > 0 && !isFinished && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Doğru cevabı seçerek ilerleyin.</span>
            <button
              onClick={handleNext}
              disabled={!selectedAnswers[currentIndex]}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold transition"
            >
              <span>{currentIndex === questions.length - 1 ? 'Sonuçları Gör' : 'Sonraki Soru'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
