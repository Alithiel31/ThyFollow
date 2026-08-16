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
    api.post<{ message: string }>('/auth/register', data),
  verifyEmail: (token: string) =>
    api.post<{ user: import('../types').User; token: string }>('/auth/verify-email', { token }),
  resendVerification: (email: string) =>
    api.post<{ message: string }>('/auth/resend-verification', { email }),
  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post<{ message: string }>('/auth/reset-password', { token, password }),
  me: () => api.get<import('../types').User>('/auth/me'),
  // Liaison/déliaison de Google à un compte déjà connecté (voir
  // oidc.controller.ts). `linkGoogle` est un POST (pas un simple <a href>)
  // pour que l'intercepteur axios attache le header Authorization — requis
  // par la route, protégée par `authenticate`. Le frontend fait ensuite
  // lui-même la navigation plein-page vers l'URL Google renvoyée.
  linkGoogle: () => api.post<{ url: string }>('/auth/oidc/google/link'),
  unlinkGoogle: () => api.delete<{ message: string }>('/auth/oidc/google/link'),
  // Échange le code opaque à usage unique reçu sur /oauth/callback?code=...
  // contre le JWT de session (voir backend oidc.controller.ts#googleExchange).
  exchangeOidcCode: (code: string) => api.post<{ token: string }>('/auth/oidc/exchange', { code }),
  // Connexion/déconnexion Google Health (poids/FC/sommeil, ex: Pixel Watch)
  // — voir backend googleHealth.controller.ts. Même logique que
  // linkGoogle/unlinkGoogle : POST pour transporter le header Authorization,
  // navigation plein-page ensuite faite par le frontend.
  linkGoogleHealth: () => api.post<{ url: string }>('/integrations/google-health/link'),
  unlinkGoogleHealth: () => api.delete<{ message: string }>('/integrations/google-health/link'),
};

// ── Sécurité du compte
export const securityApi = {
  events: () => api.get<import('../types').AuthEvent[]>('/profile/security/events'),
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
  create: (data: Partial<import('../types').Medication> & { name: string; dosage: number; startDate: string }) =>
    api.post<import('../types').Medication>('/medications', data),
  update: (id: string, data: Partial<import('../types').Medication>) =>
    api.put<import('../types').Medication>(`/medications/${id}`, data),
  delete: (id: string) => api.delete(`/medications/${id}`),
  // ── Checklist des prises quotidiennes
  listIntakes: (date: string) =>
    api.get<import('../types').MedicationIntake[]>('/medications/intakes', { params: { date } }),
  markTaken: (id: string, date: string, time: string) =>
    api.post<import('../types').MedicationIntake>(`/medications/${id}/intake`, { date, time }),
  markUntaken: (id: string, date: string, time: string) =>
    api.delete(`/medications/${id}/intake`, { data: { date, time } }),
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
