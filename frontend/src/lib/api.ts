// src/lib/api.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Inject JWT token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('thyro_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('thyro_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: import('../types').User; token: string }>('/auth/login', { email, password }),
  register: (data: { email: string; password: string; name: string; birthDate?: string }) =>
    api.post<{ user: import('../types').User; token: string }>('/auth/register', data),
  me: () => api.get<import('../types').User>('/auth/me'),
};

// ── Daily entries
export const entriesApi = {
  list: (params?: { from?: string; to?: string; limit?: number }) =>
    api.get<{ entries: import('../types').DailyEntry[]; total: number }>('/entries', { params }),
  getByDate: (date: string) =>
    api.get<import('../types').DailyEntry | null>(`/entries/${date}`),
  upsert: (data: Partial<import('../types').DailyEntry> & { date: string }) =>
    api.post<import('../types').DailyEntry>('/entries', data),
  delete: (date: string) => api.delete(`/entries/${date}`),
};

// ── Lab results
export const labApi = {
  list: () => api.get<import('../types').LabResult[]>('/lab-results'),
  create: (data: Partial<import('../types').LabResult> & { date: string }) =>
    api.post<import('../types').LabResult>('/lab-results', data),
  update: (id: string, data: Partial<import('../types').LabResult>) =>
    api.put<import('../types').LabResult>(`/lab-results/${id}`, data),
  delete: (id: string) => api.delete(`/lab-results/${id}`),
};

// ── Medications
export const medApi = {
  list: () => api.get<import('../types').Medication[]>('/medications'),
  create: (data: Partial<import('../types').Medication> & { name: string; dosageMcg: number; startDate: string }) =>
    api.post<import('../types').Medication>('/medications', data),
  update: (id: string, data: Partial<import('../types').Medication>) =>
    api.put<import('../types').Medication>(`/medications/${id}`, data),
  delete: (id: string) => api.delete(`/medications/${id}`),
};

// ── Appointments
export const apptApi = {
  list: () => api.get<import('../types').Appointment[]>('/appointments'),
  create: (data: Partial<import('../types').Appointment> & { date: string; type: import('../types').AppointmentType }) =>
    api.post<import('../types').Appointment>('/appointments', data),
  update: (id: string, data: Partial<import('../types').Appointment>) =>
    api.put<import('../types').Appointment>(`/appointments/${id}`, data),
  delete: (id: string) => api.delete(`/appointments/${id}`),
};

// ── Analytics
export const analyticsApi = {
  overview: (days = 90) =>
    api.get<import('../types').AnalyticsOverview>('/analytics/overview', { params: { days } }),
  report: (from: string, to: string) =>
    api.get<import('../types').ReportData>('/analytics/report', { params: { from, to } }),
  symptoms: (days = 30) =>
    api.get<{ period: object; frequency: Record<string, { count: number; avgSeverity: number }> }>(
      '/analytics/symptoms', { params: { days } }
    ),
};

// ── Profile
export const profileApi = {
  get: () => api.get<import('../types').UserProfile>('/profile'),
  update: (data: Partial<import('../types').UserProfile>) => api.put<import('../types').UserProfile>('/profile', data),
};

// ── Articles & encarts
export const articlesApi = {
  list: (kind?: import('../types').ArticleKind) =>
    api.get<import('../types').ArticleSummary[]>('/articles', { params: kind ? { kind } : undefined }),
  get: (slug: string) => api.get<import('../types').Article>(`/articles/${slug}`),
  adminList: () => api.get<import('../types').Article[]>('/articles/admin/all'),
  create: (data: Partial<import('../types').Article> & { title: string; content: string }) =>
    api.post<import('../types').Article>('/articles/admin', data),
  update: (id: string, data: Partial<import('../types').Article>) =>
    api.put<import('../types').Article>(`/articles/admin/${id}`, data),
  delete: (id: string) => api.delete(`/articles/admin/${id}`),
};
