/**
 * ReviewForge - Centralized Client API Service
 * Centralizes all HTTP communication with the Express.js backend.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: 'hr_admin' | 'manager' | 'employee' | 'peer_reviewer';
  organizationId: string;
  employeeId?: string;
  departmentId?: string;
  status: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: UserSession;
  [key: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  data?: unknown;
  code?: string;

  constructor(message: string, status: number, data?: unknown, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

class ApiClient {
  private baseUrl: string;
  private isRefreshing: boolean = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  public getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem('reviewforge_token');
    } catch {
      return null;
    }
  }

  public getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem('reviewforge_refresh_token');
    } catch {
      return null;
    }
  }

  public getStoredUser(): UserSession | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('reviewforge_user');
      return raw ? (JSON.parse(raw) as UserSession) : null;
    } catch {
      return null;
    }
  }

  public setTokens(accessToken: string, refreshToken?: string, user?: UserSession): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('reviewforge_token', accessToken);
      if (refreshToken) {
        localStorage.setItem('reviewforge_refresh_token', refreshToken);
      }
      if (user) {
        localStorage.setItem('reviewforge_user', JSON.stringify(user));
        localStorage.setItem('reviewforge_active_role', JSON.stringify(user.role));
      }
    } catch (e) {
      console.warn('Failed saving auth tokens to localStorage:', e);
    }
  }

  public clearSession(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem('reviewforge_token');
      localStorage.removeItem('reviewforge_refresh_token');
      localStorage.removeItem('reviewforge_user');
    } catch (e) {
      console.warn('Failed clearing session:', e);
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry: boolean = false
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const token = this.getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const responseData = await response.json().catch(() => null);

      // Handle 401 token expiry with auto-refresh (if refresh token available and not already retrying)
      if (response.status === 401 && !isRetry && !endpoint.includes('/auth/')) {
        const refreshTokenVal = this.getRefreshToken();
        if (refreshTokenVal && !this.isRefreshing) {
          this.isRefreshing = true;
          try {
            const refreshRes = await this.refreshToken();
            this.isRefreshing = false;
            if (refreshRes.success && refreshRes.accessToken) {
              // Retry original request with new token
              return this.request<T>(endpoint, options, true);
            }
          } catch {
            this.isRefreshing = false;
            this.clearSession();
          }
        }
      }

      if (!response.ok) {
        const errorMessage =
          responseData?.error ||
          responseData?.message ||
          `Request failed with status ${response.status}`;
        throw new ApiError(errorMessage, response.status, responseData, responseData?.code);
      }

      return responseData as ApiResponse<T>;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      const genericMessage =
        error instanceof Error ? error.message : 'Network error connecting to ReviewForge backend';
      throw new ApiError(genericMessage, 0);
    }
  }

  // GET
  public async get<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  // POST
  public async post<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  // PATCH
  public async patch<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  // PUT
  public async put<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  // DELETE
  public async delete<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  // Auth: Login
  public async login(
    email: string,
    password: string
  ): Promise<ApiResponse<{ user: UserSession; accessToken: string; refreshToken: string }>> {
    const res = await this.post<{ user: UserSession; accessToken: string; refreshToken: string }>(
      '/auth/login',
      { email, password }
    );
    if (res.success && res.accessToken) {
      this.setTokens(res.accessToken, res.refreshToken, res.user);
    }
    return res;
  }

  // Auth: Logout
  public async logout(): Promise<void> {
    try {
      const refreshToken = this.getRefreshToken();
      await this.post('/auth/logout', { refreshToken });
    } catch (err) {
      console.warn('Logout API call failed:', err);
    } finally {
      this.clearSession();
    }
  }

  // Auth: Refresh Token
  public async refreshToken(): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> {
    const currentRefresh = this.getRefreshToken();
    if (!currentRefresh) {
      throw new ApiError('No refresh token available', 401);
    }

    const res = await this.post<{ accessToken: string; refreshToken: string }>(
      '/auth/refresh',
      { refreshToken: currentRefresh }
    );

    if (res.success && res.accessToken) {
      this.setTokens(res.accessToken, res.refreshToken);
    }
    return res;
  }

  // Auth: Current User Profile (/auth/me)
  public async getCurrentUser(): Promise<UserSession | null> {
    try {
      const res = await this.get<{ user: UserSession }>('/auth/me');
      if (res.success && res.user) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('reviewforge_user', JSON.stringify(res.user));
          localStorage.setItem('reviewforge_active_role', JSON.stringify(res.user.role));
        }
        return res.user;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Auth: Forgot Password
  public async forgotPassword(email: string): Promise<ApiResponse<{ resetToken?: string }>> {
    return this.post<{ resetToken?: string }>('/auth/forgot-password', { email });
  }

  // Auth: Reset Password
  public async resetPassword(token: string, newPassword: string): Promise<ApiResponse> {
    return this.post('/auth/reset-password', { token, newPassword });
  }

  // Health check
  public async checkHealth(): Promise<{
    healthy: boolean;
    serverTime?: string;
    database?: { status: string; connected: boolean };
    error?: string;
  }> {
    try {
      const res = await this.get<{
        status: string;
        timestamp: string;
        database: { status: string; connected: boolean };
      }>('/health');
      return {
        healthy: res.success || res.status === 'healthy',
        serverTime: (res.timestamp as string) || (res.data as unknown as { timestamp: string })?.timestamp,
        database: (res.database as { status: string; connected: boolean }) || (res.data as unknown as { database: { status: string; connected: boolean } })?.database,
      };
    } catch (err) {
      return {
        healthy: false,
        error: err instanceof Error ? err.message : 'Backend unreachable',
      };
    }
  }

  // Employee Management
  public async getEmployees<T = any>(
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<ApiResponse<T>> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/employees?${queryString}` : '/employees';
    return this.get<T>(endpoint);
  }

  public async getEmployeeById<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.get<T>(`/employees/${encodeURIComponent(id)}`);
  }

  public async createEmployee<T = any>(data: unknown): Promise<ApiResponse<T>> {
    return this.post<T>('/employees', data);
  }

  public async updateEmployee<T = any>(id: string, data: unknown): Promise<ApiResponse<T>> {
    return this.patch<T>(`/employees/${encodeURIComponent(id)}`, data);
  }

  public async deleteEmployee<T = any>(id: string, permanent: boolean = false): Promise<ApiResponse<T>> {
    const query = permanent ? '?permanent=true' : '';
    return this.delete<T>(`/employees/${encodeURIComponent(id)}${query}`);
  }

  // Department Management
  public async getDepartments<T = any>(): Promise<ApiResponse<T>> {
    return this.get<T>('/departments');
  }

  public async getDepartmentById<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.get<T>(`/departments/${encodeURIComponent(id)}`);
  }

  public async createDepartment<T = any>(data: unknown): Promise<ApiResponse<T>> {
    return this.post<T>('/departments', data);
  }

  public async updateDepartment<T = any>(id: string, data: unknown): Promise<ApiResponse<T>> {
    return this.patch<T>(`/departments/${encodeURIComponent(id)}`, data);
  }

  public async deleteDepartment<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.delete<T>(`/departments/${encodeURIComponent(id)}`);
  }

  // Organization & Settings Management
  public async getOrganization<T = any>(): Promise<ApiResponse<T>> {
    return this.get<T>('/organization');
  }

  public async updateOrganizationSettings<T = any>(data: unknown): Promise<ApiResponse<T>> {
    return this.patch<T>('/organization/settings', data);
  }

  // Review Cycle Management
  public async getReviewCycles<T = any>(
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<ApiResponse<T>> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/review-cycles?${queryString}` : '/review-cycles';
    return this.get<T>(endpoint);
  }

  public async getReviewCycleById<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.get<T>(`/review-cycles/${encodeURIComponent(id)}`);
  }

  public async createReviewCycle<T = any>(data: unknown): Promise<ApiResponse<T>> {
    return this.post<T>('/review-cycles', data);
  }

  public async updateReviewCycle<T = any>(id: string, data: unknown): Promise<ApiResponse<T>> {
    return this.patch<T>(`/review-cycles/${encodeURIComponent(id)}`, data);
  }

  public async deleteReviewCycle<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.delete<T>(`/review-cycles/${encodeURIComponent(id)}`);
  }

  // Feedback Endpoints
  public async getFeedback<T = any>(params?: {
    reviewCycleId?: string;
    cycleId?: string;
    targetEmployeeId?: string;
    status?: string;
    type?: string;
  }): Promise<ApiResponse<T>> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/feedback?${queryString}` : '/feedback';
    return this.get<T>(endpoint);
  }

  public async getFeedbackById<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.get<T>(`/feedback/${encodeURIComponent(id)}`);
  }

  public async submitFeedback<T = any>(data: unknown): Promise<ApiResponse<T>> {
    return this.post<T>('/feedback', data);
  }

  public async getFeedbackRequests<T = any>(params?: {
    reviewCycleId?: string;
    cycleId?: string;
    status?: string;
    type?: string;
  }): Promise<ApiResponse<T>> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/feedback/requests?${queryString}` : '/feedback/requests';
    return this.get<T>(endpoint);
  }

  public async createFeedbackRequest<T = any>(data: unknown): Promise<ApiResponse<T>> {
    return this.post<T>('/feedback/requests', data);
  }

  public async declineFeedbackRequest<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.patch<T>(`/feedback/requests/${encodeURIComponent(id)}/decline`, {});
  }

  public async getFeedbackSummary<T = any>(employeeId: string, reviewCycleId?: string): Promise<ApiResponse<T>> {
    const endpoint = reviewCycleId
      ? `/feedback/summary/${encodeURIComponent(employeeId)}?reviewCycleId=${encodeURIComponent(reviewCycleId)}`
      : `/feedback/summary/${encodeURIComponent(employeeId)}`;
    return this.get<T>(endpoint);
  }

  // OKR Endpoints
  public async getOKRs<T = any>(params?: {
    employeeId?: string;
    quarter?: string;
    year?: number;
    departmentId?: string;
    status?: string;
  }): Promise<ApiResponse<T>> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/okrs?${queryString}` : '/okrs';
    return this.get<T>(endpoint);
  }

  public async getOKRById<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.get<T>(`/okrs/${encodeURIComponent(id)}`);
  }

  public async createOKR<T = any>(data: unknown): Promise<ApiResponse<T>> {
    return this.post<T>('/okrs', data);
  }

  public async updateOKR<T = any>(id: string, data: unknown): Promise<ApiResponse<T>> {
    return this.patch<T>(`/okrs/${encodeURIComponent(id)}`, data);
  }

  public async updateKeyResult<T = any>(okrId: string, krId: string, actualValue: number): Promise<ApiResponse<T>> {
    return this.patch<T>(`/okrs/${encodeURIComponent(okrId)}/key-results/${encodeURIComponent(krId)}`, { actualValue });
  }

  public async deleteOKR<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.delete<T>(`/okrs/${encodeURIComponent(id)}`);
  }

  public async getOKRsSummary<T = any>(employeeId: string, year?: number): Promise<ApiResponse<T>> {
    const endpoint = year
      ? `/okrs/summary/${encodeURIComponent(employeeId)}?year=${encodeURIComponent(year)}`
      : `/okrs/summary/${encodeURIComponent(employeeId)}`;
    return this.get<T>(endpoint);
  }

  // Manager Notes Endpoints (Strictly Confidential - Restricted to Manager and HR Admin)
  public async getManagerNotes<T = any>(params?: {
    employeeId?: string;
    category?: string;
    search?: string;
  }): Promise<ApiResponse<T>> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/manager-notes?${queryString}` : '/manager-notes';
    return this.get<T>(endpoint);
  }

  public async getManagerNoteById<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.get<T>(`/manager-notes/${encodeURIComponent(id)}`);
  }

  public async createManagerNote<T = any>(data: unknown): Promise<ApiResponse<T>> {
    return this.post<T>('/manager-notes', data);
  }

  public async updateManagerNote<T = any>(id: string, data: unknown): Promise<ApiResponse<T>> {
    return this.put<T>(`/manager-notes/${encodeURIComponent(id)}`, data);
  }

  public async deleteManagerNote<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.delete<T>(`/manager-notes/${encodeURIComponent(id)}`);
  }

  public async getManagerNotesSummary<T = any>(employeeId: string): Promise<ApiResponse<T>> {
    return this.get<T>(`/manager-notes/summary/${encodeURIComponent(employeeId)}`);
  }

  // AI Synthesis Endpoints
  public async synthesizeReview<T = any>(data: {
    employeeId: string;
    reviewCycleId: string;
    regenerateSection?: string;
    forceMock?: boolean;
  }): Promise<ApiResponse<T>> {
    return this.post<T>('/ai/synthesize', data);
  }

  public async getSynthesisQualityCheck<T = any>(
    employeeId: string,
    reviewCycleId?: string
  ): Promise<ApiResponse<T>> {
    const endpoint = reviewCycleId
      ? `/ai/quality-check/${encodeURIComponent(employeeId)}?reviewCycleId=${encodeURIComponent(reviewCycleId)}`
      : `/ai/quality-check/${encodeURIComponent(employeeId)}`;
    return this.get<T>(endpoint);
  }

  public async getSynthesisLogs<T = any>(employeeId: string): Promise<ApiResponse<T>> {
    return this.get<T>(`/ai/logs/${encodeURIComponent(employeeId)}`);
  }

  // Performance Reviews Endpoints
  public async getPerformanceReviews<T = any>(params?: {
    employeeId?: string;
    reviewCycleId?: string;
    status?: string;
  }): Promise<ApiResponse<T>> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/reviews?${queryString}` : '/reviews';
    return this.get<T>(endpoint);
  }

  public async getPerformanceReviewById<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.get<T>(`/reviews/${encodeURIComponent(id)}`);
  }

  public async savePerformanceReview<T = any>(review: unknown): Promise<ApiResponse<T>> {
    return this.post<T>('/reviews', review);
  }

  public async updatePerformanceReview<T = any>(id: string, updates: unknown): Promise<ApiResponse<T>> {
    return this.patch<T>(`/reviews/${encodeURIComponent(id)}`, updates);
  }

  // Workflow Action Endpoints (Milestone 11)
  public async submitReviewForApproval<T = any>(id: string, notes?: string): Promise<ApiResponse<T>> {
    return this.post<T>(`/reviews/${encodeURIComponent(id)}/submit`, { notes });
  }

  public async requestReviewChanges<T = any>(id: string, notes: string): Promise<ApiResponse<T>> {
    return this.post<T>(`/reviews/${encodeURIComponent(id)}/request-changes`, { notes });
  }

  public async approveReview<T = any>(id: string, notes?: string): Promise<ApiResponse<T>> {
    return this.post<T>(`/reviews/${encodeURIComponent(id)}/approve`, { notes });
  }

  public async publishReview<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.post<T>(`/reviews/${encodeURIComponent(id)}/publish`, {});
  }

  public async updateReviewSection<T = any>(
    id: string,
    sectionKey: string,
    content: string,
    evidenceRefs?: unknown[]
  ): Promise<ApiResponse<T>> {
    return this.patch<T>(`/reviews/${encodeURIComponent(id)}/sections/${encodeURIComponent(sectionKey)}`, {
      content,
      evidenceRefs,
    });
  }

  public async exportReview<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.get<T>(`/reviews/${encodeURIComponent(id)}/export`);
  }

  // Self-Reflection Endpoints
  public async getSelfReflections<T = any>(params?: {
    employeeId?: string;
    reviewCycleId?: string;
  }): Promise<ApiResponse<T>> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/self-reflections?${queryString}` : '/self-reflections';
    return this.get<T>(endpoint);
  }

  public async saveSelfReflection<T = any>(data: unknown): Promise<ApiResponse<T>> {
    return this.post<T>('/self-reflections', data);
  }

  // Analytics Endpoints
  public async getDashboardMetrics<T = any>(): Promise<ApiResponse<T>> {
    return this.get<T>('/analytics/dashboard');
  }

  public async getAnalyticsSummary<T = any>(params?: {
    reviewCycleId?: string;
    departmentId?: string;
  }): Promise<ApiResponse<T>> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/analytics/summary?${queryString}` : '/analytics/summary';
    return this.get<T>(endpoint);
  }

  public async exportAnalytics(params?: {
    format?: 'csv' | 'json';
    reviewCycleId?: string;
  }): Promise<any> {
    const format = params?.format || 'json';
    const query = new URLSearchParams();
    query.append('format', format);
    if (params?.reviewCycleId) {
      query.append('reviewCycleId', params.reviewCycleId);
    }
    const endpoint = `/analytics/export?${query.toString()}`;
    if (format === 'csv') {
      const token = this.getAccessToken();
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error(`Export failed with HTTP ${response.status}`);
      }
      return await response.blob();
    }
    return this.get(endpoint);
  }

  // Notifications Endpoints
  public async getNotifications<T = any>(unreadOnly?: boolean): Promise<ApiResponse<T>> {
    const endpoint = unreadOnly ? '/notifications?unreadOnly=true' : '/notifications';
    return this.get<T>(endpoint);
  }

  public async createNotification<T = any>(data: {
    userId: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
  }): Promise<ApiResponse<T>> {
    return this.post<T>('/notifications', data);
  }

  public async markNotificationRead<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.patch<T>(`/notifications/${id}/read`, {});
  }

  public async markAllNotificationsRead<T = any>(): Promise<ApiResponse<T>> {
    return this.post<T>('/notifications/mark-all-read', {});
  }

  public async deleteNotification<T = any>(id: string): Promise<ApiResponse<T>> {
    return this.delete<T>(`/notifications/${id}`);
  }

  public async getNotificationPreferences<T = any>(): Promise<ApiResponse<T>> {
    return this.get<T>('/notifications/preferences');
  }

  public async updateNotificationPreferences<T = any>(prefs: Record<string, any>): Promise<ApiResponse<T>> {
    return this.put<T>('/notifications/preferences', prefs);
  }

  // Audit Log Endpoints
  public async getAuditLogs<T = any>(params?: {
    action?: string;
    actorRole?: string;
    target?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<T>> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    const endpoint = queryString ? `/audit-logs?${queryString}` : '/audit-logs';
    return this.get<T>(endpoint);
  }

  public async createAuditLog<T = any>(data: {
    action: string;
    target: string;
    details: string;
  }): Promise<ApiResponse<T>> {
    return this.post<T>('/audit-logs', data);
  }
}

export const apiClient = new ApiClient(BASE_URL);
