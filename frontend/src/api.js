import axios from 'axios';

// Use relative /api path so it works seamlessly on localhost, 127.0.0.1, or network ports
const API_BASE = '/api';

export const api = {
  // Courses
  getCourses: () => axios.get(`${API_BASE}/courses`),
  getCourseDetail: (courseId) => axios.get(`${API_BASE}/courses/${courseId}`),
  createCourse: (data) => axios.post(`${API_BASE}/courses`, data),
  deleteCourse: (courseId) => axios.delete(`${API_BASE}/courses/${courseId}`),

  // Materials
  uploadFile: (courseId, file) => {
    const formData = new FormData();
    formData.append('course_id', courseId);
    formData.append('file', file);
    return axios.post(`${API_BASE}/materials/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  uploadMultipleFiles: (courseId, files) => {
    const formData = new FormData();
    formData.append('course_id', courseId);
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    return axios.post(`${API_BASE}/materials/upload-multiple`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  addLink: (courseId, url, title) => axios.post(`${API_BASE}/materials/link`, { course_id: courseId, url, title }),
  addTextNote: (courseId, title, content) => axios.post(`${API_BASE}/materials/text`, { course_id: courseId, title, content }),
  getMaterial: (materialId) => axios.get(`${API_BASE}/materials/${materialId}`),
  deleteMaterial: (materialId) => axios.delete(`${API_BASE}/materials/${materialId}`),

  // YouTube
  addYouTubeSource: (courseId, url) => axios.post(`${API_BASE}/youtube/add`, { course_id: courseId, url }),
  getVideoTranscripts: (courseId, videoId) => axios.get(`${API_BASE}/youtube/${courseId}/transcripts/${videoId}`),
  getVideoChapters: (courseId, videoId) => axios.get(`${API_BASE}/youtube/${courseId}/chapters/${videoId}`),
  deleteVideo: (courseId, videoId) => axios.delete(`${API_BASE}/youtube/${courseId}/${videoId}`),

  // Study & AI
  crossMatch: (courseId, queryText, topK = 5) => axios.post(`${API_BASE}/study/match`, {
    course_id: courseId,
    query_text: queryText,
    top_k: topK
  }),
  askTutor: (data) => axios.post(`${API_BASE}/study/ask-tutor`, data),
  generateQuiz: (courseId, topic = '', count = 5) => axios.post(`${API_BASE}/study/quiz`, {
    course_id: courseId,
    topic,
    count
  }),
  getFlashcards: (courseId) => axios.get(`${API_BASE}/study/flashcards/${courseId}`),

  // Settings
  getSettings: () => axios.get(`${API_BASE}/settings`),
  updateSettings: (data) => axios.post(`${API_BASE}/settings`, data),
};
