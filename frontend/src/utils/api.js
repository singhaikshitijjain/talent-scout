import axios from 'axios';

const API = axios.create({ baseURL: 'http://localhost:8000' });

export const api = {
  // Health
  health: () => API.get('/health'),

  // JD
  submitJD: (data) => API.post('/api/jd/submit', data),
  listJDs: () => API.get('/api/jd/list'),
  getJD: (id) => API.get(`/api/jd/${id}`),

  // Candidate
  uploadResume: (file, jdId) => {
    const form = new FormData();
    form.append('file', file);
    form.append('jd_id', jdId);
    return API.post('/api/candidate/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  updateCandidateProfile: (candidateId, username, highlightDetails) =>
    API.post('/api/candidate/profile', { 
      candidate_id: candidateId, 
      username, 
      highlight_details: highlightDetails 
    }),
  chat: (candidateId, message) =>
    API.post('/api/candidate/chat', { candidate_id: candidateId, message }),
  getConversation: (candidateId) =>
    API.get(`/api/candidate/${candidateId}/conversation`),
  submitCandidate: (candidateId) =>
    API.post('/api/candidate/submit', { candidate_id: candidateId }),

  // Recruiter
  getCandidates: (jdId) =>
    API.get('/api/recruiter/candidates', { params: jdId ? { jd_id: jdId } : {} }),
  getFullReport: (candidateId) =>
    API.get(`/api/recruiter/candidate/${candidateId}/full`),
};

export default api;
