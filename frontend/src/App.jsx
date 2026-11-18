import React, { useState, useEffect } from 'react';
import { api } from './api';
import Navbar from './components/Navbar';
import DocumentViewer from './components/DocumentViewer';
import YouTubePlayer from './components/YouTubePlayer';
import AITutorPanel from './components/AITutorPanel';
import QuizModal from './components/QuizModal';
import MaterialUploadModal from './components/MaterialUploadModal';
import YouTubeModal from './components/YouTubeModal';
import CourseModal from './components/CourseModal';
import SettingsModal from './components/SettingsModal';
import { BookOpen, Plus } from 'lucide-react';

export default function App() {
  const [courses, setCourses] = useState([]);
  const [activeCourse, setActiveCourse] = useState(null);
  const [courseDetail, setCourseDetail] = useState({ materials: [], videos: [] });
  const [activeMaterialId, setActiveMaterialId] = useState(null);
  const [activeVideoId, setActiveVideoId] = useState('');
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [matchedSegments, setMatchedSegments] = useState([]);
  const [selectedTextSnippet, setSelectedTextSnippet] = useState('');
  const [promptToAsk, setPromptToAsk] = useState('');

  // Maximize / Focus State: null | 'tutor' | 'video' | 'notes'
  const [maximizedPanel, setMaximizedPanel] = useState(null);

  // Minimize State per panel
  const [minimizedPanels, setMinimizedPanels] = useState({
    tutor: false,
    video: false,
    notes: false
  });

  // Modals state
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [activePageNumber, setActivePageNumber] = useState(1);

  // Load courses on startup
  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      const res = await api.getCourses();
      setCourses(res.data);
      if (res.data.length > 0) {
        if (!activeCourse || !res.data.find(c => c.id === activeCourse.id)) {
          selectCourse(res.data[0]);
        }
      } else {
        setActiveCourse(null);
        setCourseDetail({ materials: [], videos: [] });
      }
    } catch (e) {
      console.error("Error loading courses:", e);
    }
  };

  const selectCourse = async (course) => {
    setActiveCourse(course);
    setMatchedSegments([]);
    setSelectedTextSnippet('');
    try {
      const res = await api.getCourseDetail(course.id);
      setCourseDetail(res.data);
      if (res.data.materials && res.data.materials.length > 0) {
        setActiveMaterialId(res.data.materials[0].id);
      } else {
        setActiveMaterialId(null);
      }
      if (res.data.videos && res.data.videos.length > 0) {
        setActiveVideoId(res.data.videos[0].video_id);
      } else {
        setActiveVideoId('');
      }
    } catch (e) {
      console.error("Error loading course details:", e);
    }
  };

  // Cross-modal matching: Given notes text, find the video timestamps!
  const handleMatchVideo = async (queryText) => {
    if (!activeCourse || !queryText.trim()) return;
    try {
      const res = await api.crossMatch(activeCourse.id, queryText);
      setMatchedSegments(res.data);
      if (res.data.length > 0) {
        const topMatch = res.data[0];
        setActiveVideoId(topMatch.video_id);
        setCurrentTimestamp(topMatch.start_seconds);
      }
    } catch (e) {
      console.error("Error matching video:", e);
    }
  };

  const handleAskTutor = async ({ message, selected_text, context_material_id, history }) => {
    if (!activeCourse) return { answer: "Lütfen bir ders seçin." };
    const res = await api.askTutor({
      course_id: activeCourse.id,
      message,
      selected_text: selected_text || selectedTextSnippet,
      context_material_id: context_material_id || activeMaterialId,
      video_id: activeVideoId,
      timestamp: currentTimestamp,
      history: history || []
    });

    const data = res.data;
    // Auto-switch to referenced material if detected (e.g. 2. PDF or Chapter 3)
    if (data.target_material_id) {
      setActiveMaterialId(data.target_material_id);
    }
    if (data.target_page) {
      setActivePageNumber(data.target_page);
    }
    // Auto-seek video and update matched segments if top match is found
    if (data.top_video_id) {
      setActiveVideoId(data.top_video_id);
      if (data.top_timestamp !== undefined) {
        setCurrentTimestamp(data.top_timestamp);
      }
      if (data.matched_videos && data.matched_videos.length > 0) {
        setMatchedSegments(data.matched_videos);
      }
    }

    return data;
  };

  const handleSeekTimestamp = (seconds, videoId) => {
    if (videoId) setActiveVideoId(videoId);
    setCurrentTimestamp(seconds);
  };

  const handleAskTutorWithText = (text) => {
    setSelectedTextSnippet(text);
    setPromptToAsk(`Bu ders notundaki şu kısmı bana adım adım açıkla ve videodaki anlatımıyla bağdaştır:\n"${text}"`);
  };

  const handleDeleteMaterial = async (materialId) => {
    try {
      await api.deleteMaterial(materialId);
      if (activeCourse) selectCourse(activeCourse);
    } catch (e) {
      alert("Materyal silinirken bir sorun oluştu.");
    }
  };

  const handleDeleteVideo = async (videoId) => {
    try {
      await api.deleteVideo(activeCourse.id, videoId);
      if (activeCourse) selectCourse(activeCourse);
    } catch (e) {
      alert("Video silinirken bir sorun oluştu.");
    }
  };

  const handleDeleteCourse = async (courseId) => {
    try {
      await api.deleteCourse(courseId);
      await loadCourses();
    } catch (e) {
      alert("Ders silinirken bir sorun oluştu.");
    }
  };

  const toggleMaximize = (panelName) => {
    setMaximizedPanel(prev => prev === panelName ? null : panelName);
  };

  const toggleMinimize = (panelName) => {
    setMinimizedPanels(prev => ({ ...prev, [panelName]: !prev[panelName] }));
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      
      {/* Top Navbar */}
      <Navbar
        courses={courses}
        activeCourse={activeCourse}
        onSelectCourse={selectCourse}
        onOpenNewCourse={() => setIsCourseModalOpen(true)}
        onDeleteCourse={handleDeleteCourse}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        onOpenYouTube={() => setIsYouTubeModalOpen(true)}
        onOpenQuiz={() => setIsQuizModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Main Studio View */}
      {courses.length === 0 ? (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-500/20 to-sky-400/20 flex items-center justify-center border border-indigo-500/30 text-indigo-400 mb-4 shadow-xl">
            <BookOpen className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">OmniStudy AI'a Hoş Geldiniz</h2>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            Ders notlarınızı ve YouTube video veya oynatma listelerinizi ekleyin. Seçtiğiniz videonun transkriptinden
            konu, tanım, örnek ve soru çözümü gibi kısa bölümler hazırlayın.
          </p>
          <button
            type="button"
            onClick={() => setIsCourseModalOpen(true)}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white font-semibold text-sm shadow-xl shadow-indigo-600/25 flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>İlk Dersi Oluştur</span>
          </button>
        </div>
      ) : (
        /* Active Study Workspace (Swapped Layout: AI on Left, Video & Notes on Right) */
        <main className="flex-1 overflow-hidden p-2.5 gap-2.5 grid grid-cols-1 lg:grid-cols-12 max-w-[1920px] mx-auto w-full">
          
          {/* LEFT COLUMN: AI Tutor Panel */}
          {(!maximizedPanel || maximizedPanel === 'tutor') && (
            <section className={`${
              maximizedPanel === 'tutor' 
                ? 'lg:col-span-12' 
                : (minimizedPanels.tutor ? 'lg:col-span-2' : 'lg:col-span-5')
            } h-full overflow-hidden flex flex-col min-h-0 transition-all duration-300`}>
              <AITutorPanel
                course={activeCourse}
                onAskTutor={handleAskTutor}
                activeMaterialId={activeMaterialId}
                selectedText={selectedTextSnippet}
                onClearSelectedText={() => setSelectedTextSnippet('')}
                onSeekTimestamp={handleSeekTimestamp}
                onTriggerQuiz={() => setIsQuizModalOpen(true)}
                isMaximized={maximizedPanel === 'tutor'}
                onToggleMaximize={() => toggleMaximize('tutor')}
                isMinimized={minimizedPanels.tutor}
                onToggleMinimize={() => toggleMinimize('tutor')}
                promptToAsk={promptToAsk}
                onClearPromptToAsk={() => setPromptToAsk('')}
              />
            </section>
          )}

          {/* RIGHT COLUMN: Video & Document Viewer */}
          {maximizedPanel !== 'tutor' && (
            <section className={`${
              maximizedPanel 
                ? 'lg:col-span-12' 
                : (minimizedPanels.tutor ? 'lg:col-span-10' : 'lg:col-span-7')
            } h-full overflow-hidden flex flex-col gap-2.5 min-h-0 transition-all duration-300`}>
              
              {/* Top: YouTube Player & Timeline */}
              {(!maximizedPanel || maximizedPanel === 'video') && (
                <div className={`${
                  maximizedPanel === 'video' 
                    ? 'h-full' 
                    : (minimizedPanels.video 
                        ? 'shrink-0' 
                        : (minimizedPanels.notes ? 'flex-1' : 'h-[52%]'))
                } min-h-0 flex flex-col transition-all duration-300`}>
                  <YouTubePlayer
                    videos={courseDetail.videos || []}
                    activeVideoId={activeVideoId}
                    currentTimestamp={currentTimestamp}
                    matchedSegments={matchedSegments}
                    onSelectVideo={(id) => setActiveVideoId(id)}
                    onSeekTimestamp={handleSeekTimestamp}
                    onDeleteVideo={handleDeleteVideo}
                    isMaximized={maximizedPanel === 'video'}
                    onToggleMaximize={() => toggleMaximize('video')}
                    isMinimized={minimizedPanels.video}
                    onToggleMinimize={() => toggleMinimize('video')}
                    courseId={activeCourse?.id}
                    onOpenYouTube={() => setIsYouTubeModalOpen(true)}
                  />
                </div>
              )}

              {/* Bottom: Notes & Document Viewer */}
              {(!maximizedPanel || maximizedPanel === 'notes') && (
                <div className={`${
                  maximizedPanel === 'notes' 
                    ? 'h-full' 
                    : (minimizedPanels.notes 
                        ? 'shrink-0' 
                        : (minimizedPanels.video ? 'flex-1' : 'h-[48%]'))
                } min-h-0 flex flex-col transition-all duration-300`}>
                  <DocumentViewer
                    materials={courseDetail.materials || []}
                    activeMaterialId={activeMaterialId}
                    targetPage={activePageNumber}
                    onSelectMaterial={(id) => {
                      setActiveMaterialId(id);
                      setActivePageNumber(1);
                    }}
                    onSelectPage={(pageNum) => setActivePageNumber(pageNum)}
                    onDeleteMaterial={handleDeleteMaterial}
                    onMatchVideo={handleMatchVideo}
                    onAskTutorWithText={handleAskTutorWithText}
                    isMaximized={maximizedPanel === 'notes'}
                    onToggleMaximize={() => toggleMaximize('notes')}
                    isMinimized={minimizedPanels.notes}
                    onToggleMinimize={() => toggleMinimize('notes')}
                  />
                </div>
              )}

            </section>
          )}

        </main>
      )}

      {/* Modals */}
      <CourseModal
        isOpen={isCourseModalOpen}
        onClose={() => setIsCourseModalOpen(false)}
        onCreateCourse={async (data) => {
          const res = await api.createCourse(data);
          await loadCourses();
          if (res.data) selectCourse(res.data);
        }}
      />

      <MaterialUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        courseId={activeCourse?.id}
        onUploadFiles={async (cId, files) => {
          await api.uploadMultipleFiles(cId, files);
          if (activeCourse) selectCourse(activeCourse);
        }}
        onAddLink={async (cId, url, title) => {
          await api.addLink(cId, url, title);
          if (activeCourse) selectCourse(activeCourse);
        }}
        onAddText={async (cId, title, content) => {
          await api.addTextNote(cId, title, content);
          if (activeCourse) selectCourse(activeCourse);
        }}
      />

      <YouTubeModal
        isOpen={isYouTubeModalOpen}
        onClose={() => setIsYouTubeModalOpen(false)}
        courseId={activeCourse?.id}
        courseName={activeCourse?.name || activeCourse?.title || ''}
        onAddYouTube={async (cId, url) => {
          await api.addYouTubeSource(cId, url);
          if (activeCourse) selectCourse(activeCourse);
        }}
      />

      <QuizModal
        isOpen={isQuizModalOpen}
        onClose={() => setIsQuizModalOpen(false)}
        course={activeCourse}
        onGenerateQuiz={async (topic) => {
          const res = await api.generateQuiz(activeCourse?.id, topic, 5);
          return res.data;
        }}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

    </div>
  );
}
