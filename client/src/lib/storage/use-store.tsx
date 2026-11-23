'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  Department,
  Employee,
  ReviewCycle,
  OKR,
  FeedbackItem,
  FeedbackRequest,
  SelfReflection,
  ManagerNote,
  PerformanceReview,
  AuditLogItem,
  NotificationItem,
  OrganizationSettings,
  SessionUser,
  UserRole
} from '@/types';
import { DataRepository } from './repository';
import { apiClient } from '@/lib/api-client';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

interface StoreContextValue {
  isHydrated: boolean;
  dbConnected: boolean;
  authUser: SessionUser | null;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  logout: () => Promise<void>;
  departments: Department[];
  employees: Employee[];
  reviewCycles: ReviewCycle[];
  okrs: OKR[];
  feedback: FeedbackItem[];
  feedbackRequests: FeedbackRequest[];
  selfReflections: SelfReflection[];
  managerNotes: ManagerNote[];
  performanceReviews: PerformanceReview[];
  auditLogs: AuditLogItem[];
  notifications: NotificationItem[];
  unreadNotifCount: number;
  settings: OrganizationSettings;
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  removeToast: (id: string) => void;
  refreshData: () => void;
  resetAllDemoData: () => void;
  clearAllReviewData: () => Promise<void>;
  // Mutations
  addEmployee: (employee: Omit<Employee, 'id'>) => Promise<Employee | null> | Employee;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  deleteEmployee: (id: string, permanent?: boolean) => Promise<boolean>;
  addDepartment: (dept: Omit<Department, 'id'>) => Promise<Department | null>;
  updateDepartment: (id: string, updates: Partial<Department>) => Promise<boolean>;
  deleteDepartment: (id: string) => Promise<boolean>;
  addReviewCycle: (cycle: Omit<ReviewCycle, 'id' | 'completedReviewsCount'>) => Promise<ReviewCycle | null> | ReviewCycle;
  updateReviewCycle: (id: string, updates: Partial<ReviewCycle>) => Promise<boolean> | void;
  deleteReviewCycle: (id: string) => Promise<boolean>;
  addOKR: (okr: Omit<OKR, 'id' | 'updatedAt'>) => Promise<OKR | null> | OKR;
  updateOKR: (id: string, updates: Partial<OKR>) => Promise<boolean> | void;
  updateKeyResultProgress: (okrId: string, krId: string, actualValue: number) => Promise<boolean>;
  deleteOKR: (id: string) => Promise<boolean>;
  addFeedback: (fb: Omit<FeedbackItem, 'id' | 'submittedAt'>) => Promise<FeedbackItem | null> | FeedbackItem;
  createFeedbackRequest: (reqData: any) => Promise<FeedbackRequest | null>;
  declineFeedbackRequest: (id: string) => Promise<boolean>;
  refreshFeedback: () => Promise<void>;
  saveSelfReflection: (ref: Omit<SelfReflection, 'id' | 'submittedAt'>) => Promise<SelfReflection | null> | SelfReflection;
  addManagerNote: (note: Omit<ManagerNote, 'id' | 'date'>) => Promise<ManagerNote | null> | ManagerNote;
  updateManagerNote: (id: string, updates: Partial<ManagerNote>) => Promise<boolean>;
  deleteManagerNote: (id: string) => Promise<boolean>;
  savePerformanceReview: (review: PerformanceReview) => Promise<PerformanceReview | null> | void;
  synthesizeReview: (employeeId: string, reviewCycleId: string, regenerateSection?: string) => Promise<{ success: boolean; review?: PerformanceReview; error?: string }>;
  submitReviewForApproval: (id: string, notes?: string) => Promise<boolean>;
  requestReviewChanges: (id: string, notes: string) => Promise<boolean>;
  approveReview: (id: string, notes?: string) => Promise<boolean>;
  publishReview: (id: string) => Promise<boolean>;
  updateReviewSection: (id: string, sectionKey: string, content: string, evidenceRefs?: any[]) => Promise<boolean>;
  markNotificationRead: (id: string) => Promise<boolean>;
  markAllNotificationsRead: () => Promise<boolean>;
  deleteNotification: (id: string) => Promise<boolean>;
  updateSettings: (settings: Partial<OrganizationSettings>) => void;
  getDashboardMetrics: () => Promise<any>;
  getAnalyticsSummary: (params?: { reviewCycleId?: string; departmentId?: string }) => Promise<any>;
  exportAnalytics: (params?: { format?: 'csv' | 'json'; reviewCycleId?: string }) => Promise<any>;
  refreshEmployeeEvidence: (employeeId: string) => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);
  const [authUser, setAuthUser] = useState<SessionUser | null>(() => {
    return typeof window !== 'undefined' ? apiClient.getStoredUser() : null;
  });
  const [activeRole, setActiveRoleState] = useState<UserRole>(() => {
    const storedUser = typeof window !== 'undefined' ? apiClient.getStoredUser() : null;
    return storedUser?.role || DataRepository.getActiveRole();
  });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reviewCycles, setReviewCycles] = useState<ReviewCycle[]>([]);
  const [okrs, setOkrs] = useState<OKR[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [feedbackRequests, setFeedbackRequests] = useState<FeedbackRequest[]>([]);
  const [selfReflections, setSelfReflections] = useState<SelfReflection[]>([]);
  const [managerNotes, setManagerNotes] = useState<ManagerNote[]>([]);
  const [performanceReviews, setPerformanceReviews] = useState<PerformanceReview[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [settings, setSettings] = useState<OrganizationSettings>(DataRepository.getSettings());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dbRawNotesRef = useRef<ManagerNote[]>([]);
  const dbConnectedRef = useRef(false);

  const loadLocalSnapshot = useCallback((overrideRole?: UserRole) => {
    const storedUser = apiClient.getStoredUser();
    const role = overrideRole || storedUser?.role || DataRepository.getActiveRole();
    setActiveRoleState(role);
    setDepartments(DataRepository.getDepartments());
    setEmployees(DataRepository.getEmployees());
    setReviewCycles(DataRepository.getReviewCycles());
    setOkrs(DataRepository.getOKRs());
    setFeedback(DataRepository.getFeedback());
    setSelfReflections(DataRepository.getSelfReflections());
    setManagerNotes(DataRepository.getManagerNotes(role));
    setPerformanceReviews(DataRepository.getPerformanceReviews());
    setAuditLogs(DataRepository.getAuditLogs());
    setSettings(DataRepository.getSettings());
  }, []);

  const syncFromServer = useCallback(async (syncRoleFromSession: boolean = false) => {
    try {
      // 1. Health check to detect live database
      const health = await apiClient.checkHealth();
      if (health.healthy && health.database?.connected) {
        dbConnectedRef.current = true;
        setDbConnected(true);
      } else {
        dbConnectedRef.current = false;
        setDbConnected(false);
      }

      if (!health.healthy || !health.database?.connected) {
        const storedUser = apiClient.getStoredUser();
        if (storedUser) {
          setAuthUser(storedUser);
          if (storedUser.role !== 'hr_admin' || syncRoleFromSession) {
            DataRepository.setActiveRole(storedUser.role);
            setActiveRoleState(storedUser.role);
          }
        } else {
          setAuthUser(null);
        }
        console.warn(
          'ReviewForge backend/database is unavailable; server data sync was skipped.',
          health.error || 'Health check did not confirm a database connection.'
        );
        return;
      }

      // 2. Authenticate session from backend
      const user = apiClient.getAccessToken() ? await apiClient.getCurrentUser() : null;
      if (user) {
        const sessionUser: SessionUser = {
          id: user.id,
          organizationId: user.organizationId,
          name: user.name,
          email: user.email,
          role: user.role,
          employeeId: user.employeeId,
        };
        setAuthUser(sessionUser);
        DataRepository.setActiveRole(user.role);
        setActiveRoleState(user.role);
      } else {
        const storedUser = apiClient.getStoredUser();
        if (storedUser) {
          setAuthUser(storedUser);
          DataRepository.setActiveRole(storedUser.role);
          setActiveRoleState(storedUser.role);
        } else {
          setAuthUser(null);
        }
      }

      // 3. Fetch employee directory if backend DB is connected and authenticated
      if (apiClient.getAccessToken()) {
        try {
          const empRes = await apiClient.getEmployees<Employee[]>({ limit: 100 });
          if (empRes.success && Array.isArray(empRes.data)) {
            setEmployees(empRes.data);
          }
        } catch (e) {
          console.warn('Could not sync employees from server:', e);
        }

        // 4. Fetch department hierarchy with live counts
        try {
          const deptRes = await apiClient.getDepartments<Department[]>();
          if (deptRes.success && Array.isArray(deptRes.data)) {
            setDepartments(deptRes.data);
          }
        } catch (e) {
          console.warn('Could not sync departments from server:', e);
        }

        // 5. Fetch organization settings
        try {
          const orgRes = await apiClient.getOrganization<{ settings: OrganizationSettings }>();
          if (orgRes.success && (orgRes.data as any)?.settings) {
            setSettings((orgRes.data as any).settings);
          }
        } catch (e) {
          console.warn('Could not sync organization settings from server:', e);
        }

        // 6. Fetch review cycles
        try {
          const cyclesRes = await apiClient.getReviewCycles<ReviewCycle[]>();
          if (cyclesRes.success && Array.isArray(cyclesRes.data)) {
            setReviewCycles(cyclesRes.data);
          }
        } catch (e) {
          console.warn('Could not sync review cycles from server:', e);
        }

        // 7. Fetch 360 feedback reviews
        try {
          const fbRes = await apiClient.getFeedback<FeedbackItem[]>();
          if (fbRes.success && Array.isArray(fbRes.data)) {
            setFeedback(fbRes.data);
          }
        } catch (e) {
          console.warn('Could not sync feedback from server:', e);
        }

        // 8. Fetch peer feedback requests
        try {
          const fbrRes = await apiClient.getFeedbackRequests<FeedbackRequest[]>();
          if (fbrRes.success && Array.isArray(fbrRes.data)) {
            setFeedbackRequests(fbrRes.data);
          }
        } catch (e) {
          console.warn('Could not sync feedback requests from server:', e);
        }

        // 9. Fetch quarterly OKRs
        try {
          const okrsRes = await apiClient.getOKRs<OKR[]>();
          if (okrsRes.success && Array.isArray(okrsRes.data)) {
            if (okrsRes.data.length > 0) {
              setOkrs(okrsRes.data);
              okrsRes.data.forEach(o => {
                DataRepository.updateOKR(o.id, o) || DataRepository.addOKR(o);
              });
            } else {
              const localOkrs = DataRepository.getOKRs();
              if (localOkrs.length > 0) {
                setOkrs(localOkrs);
              }
            }
          }
        } catch (e) {
          console.warn('Could not sync OKRs from server:', e);
        }

        // 10. Fetch manager notes (if authorized: manager or hr_admin)
        const currentRole = user?.role || DataRepository.getActiveRole();
        if (currentRole === 'hr_admin' || currentRole === 'manager') {
          try {
            const notesRes = await apiClient.getManagerNotes<ManagerNote[]>();
            if (notesRes.success && Array.isArray(notesRes.data)) {
              dbRawNotesRef.current = notesRes.data;
              setManagerNotes(notesRes.data);
            }
          } catch (e) {
            console.warn('Could not sync manager notes from server:', e);
          }
        } else {
          // Employee or peer reviewer: strictly clear manager notes
          dbRawNotesRef.current = [];
          setManagerNotes([]);
        }

        // 11. Fetch self-reflections
        try {
          const refRes = await apiClient.getSelfReflections<SelfReflection[]>();
          if (refRes.success && Array.isArray(refRes.data)) {
            if (refRes.data.length > 0) {
              setSelfReflections(refRes.data);
              refRes.data.forEach(r => DataRepository.saveSelfReflection(r));
            } else {
              const localRefs = DataRepository.getSelfReflections();
              if (localRefs.length > 0) {
                setSelfReflections(localRefs);
              }
            }
          }
        } catch (e) {
          console.warn('Could not sync self reflections from server:', e);
        }

        // 12. Fetch performance reviews
        try {
          const revRes = await apiClient.getPerformanceReviews<PerformanceReview[]>();
          if (revRes.success && Array.isArray(revRes.data)) {
            setPerformanceReviews(revRes.data);
          }
        } catch (e) {
          console.warn('Could not sync performance reviews from server:', e);
        }

        // 13. Fetch notifications for current user
        try {
          const notifRes = await apiClient.getNotifications();
          if (notifRes.success && Array.isArray(notifRes.data)) {
            setNotifications(notifRes.data);
            setUnreadNotifCount(
              typeof (notifRes as any).unreadCount === 'number'
                ? (notifRes as any).unreadCount
                : notifRes.data.filter((n: any) => !n.isRead).length
            );
          }
        } catch (e) {
          console.warn('Could not sync notifications from server:', e);
        }

        // 14. Fetch audit logs (if hr_admin)
        if (currentRole === 'hr_admin') {
          try {
            const auditRes = await apiClient.getAuditLogs({ limit: 50 });
            if (auditRes.success && Array.isArray(auditRes.data)) {
              setAuditLogs(auditRes.data);
            }
          } catch (e) {
            console.warn('Could not sync audit logs from server:', e);
          }
        }
      }
    } catch (error) {
      console.warn('Backend session sync:', error);
    }
  }, []);

  const loadData = useCallback(() => {
    loadLocalSnapshot();
    void syncFromServer(false);
  }, [loadLocalSnapshot, syncFromServer]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsHydrated(true);
      loadLocalSnapshot();
      void syncFromServer(true);
    }, 0);

    const handleStorageUpdate = () => {
      if (!dbConnectedRef.current) {
        loadLocalSnapshot();
      }
    };

    window.addEventListener('reviewforge_storage_updated', handleStorageUpdate);
    window.addEventListener('storage', handleStorageUpdate);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('reviewforge_storage_updated', handleStorageUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, [loadLocalSnapshot, syncFromServer]);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const persistRemote = useCallback(
    (url: string, method: 'POST' | 'PATCH' | 'DELETE', payload?: unknown) => {
      if (!dbConnectedRef.current) return;
      void fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      })
        .then(async res => {
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            showToast(errJson.error || `Server rejected update (${res.status})`, 'error');
            await syncFromServer(false);
          } else {
            await syncFromServer(false);
          }
        })
        .catch(err => {
          console.error(`Failed remote sync (${method} ${url}):`, err);
        });
    },
    [showToast, syncFromServer]
  );

  const setActiveRole = useCallback((role: UserRole) => {
    const currentUser = apiClient.getStoredUser();
    if (currentUser && currentUser.role !== 'hr_admin' && role !== currentUser.role) {
      showToast('Role switching is restricted for standard user accounts', 'warning');
      return;
    }
    DataRepository.setActiveRole(role);
    setActiveRoleState(role);
    if (dbConnectedRef.current) {
      setManagerNotes(
        role === 'employee' || role === 'peer_reviewer' ? [] : dbRawNotesRef.current
      );
    } else {
      loadLocalSnapshot(role);
    }
    const roleTitles: Record<UserRole, string> = {
      hr_admin: 'HR Administrator',
      manager: 'Manager',
      employee: 'Employee',
      peer_reviewer: 'Peer Reviewer'
    };
    showToast(`Switched perspective to ${roleTitles[role]}`, 'info');
  }, [loadLocalSnapshot, showToast]);

  const resetAllDemoData = useCallback(() => {
    DataRepository.resetAll();
    loadLocalSnapshot();
    if (dbConnectedRef.current) {
      void syncFromServer(false);
    }
    showToast('Demo data restored to initial seed state', 'success');
  }, [loadLocalSnapshot, syncFromServer, showToast]);

  const clearAllReviewData = useCallback(async () => {
    DataRepository.clearReviewData();
    setOkrs([]);
    setFeedback([]);
    setSelfReflections([]);
    setManagerNotes([]);
    setPerformanceReviews([]);
    if (dbConnectedRef.current) {
      try {
        await apiClient.post('/security/clear-data', {});
      } catch (e) {
        console.warn('Backend clear failed:', e);
      }
    }
    showToast('All review data, OKRs, and notes cleared! Ready for a fresh test.', 'success');
  }, [showToast]);

  const addEmployee = useCallback(async (emp: Omit<Employee, 'id'>): Promise<Employee | null> => {
    try {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        const res = await apiClient.createEmployee(emp);
        if (res.success && res.data) {
          const created = res.data as Employee;
          setEmployees(prev => [created, ...prev]);
          showToast(`Added employee ${created.name} (${created.employeeNumber})`, 'success');
          return created;
        }
      }
      const created = DataRepository.addEmployee(emp);
      setEmployees(prev => [created, ...prev]);
      showToast(`Added employee ${created.name} (${created.employeeNumber})`, 'success');
      return created;
    } catch (err: any) {
      showToast(err.message || 'Failed saving employee to server', 'error');
      return null;
    }
  }, [showToast]);

  const updateEmployee = useCallback((id: string, updates: Partial<Employee>) => {
    DataRepository.updateEmployee(id, updates);
    if (dbConnectedRef.current && apiClient.getAccessToken()) {
      setEmployees(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)));
      apiClient.updateEmployee(id, updates)
        .then(res => {
          if (res.success && res.data) {
            setEmployees(prev => prev.map(e => (e.id === id ? (res.data as Employee) : e)));
          }
        })
        .catch(err => {
          showToast(err.message || 'Failed updating employee on server', 'error');
        });
    } else {
      loadLocalSnapshot();
    }
    showToast('Employee details updated', 'success');
  }, [loadLocalSnapshot, showToast]);

  const deleteEmployee = useCallback(async (id: string, permanent: boolean = false): Promise<boolean> => {
    try {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        const res = await apiClient.deleteEmployee(id, permanent);
        if (res.success) {
          setEmployees(prev => prev.filter(e => e.id !== id));
          showToast('Employee removed successfully', 'success');
          return true;
        }
      }
      setEmployees(prev => prev.filter(e => e.id !== id));
      showToast('Employee removed from directory', 'success');
      return true;
    } catch (err: any) {
      showToast(err.message || 'Failed to remove employee', 'error');
      return false;
    }
  }, [showToast]);

  const addDepartment = useCallback(async (dept: Omit<Department, 'id'>): Promise<Department | null> => {
    try {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        const res = await apiClient.createDepartment(dept);
        if (res.success && res.data) {
          const created = res.data as Department;
          setDepartments(prev => [...prev, created]);
          showToast(`Department '${created.name}' created successfully`, 'success');
          return created;
        }
      }
      const localId = `dept-${(dept.code || 'new').toLowerCase()}`;
      const newDept: Department = { ...dept, id: localId, employeeCount: 0, averageOkrCompletion: 0 };
      setDepartments(prev => [...prev, newDept]);
      showToast(`Department '${newDept.name}' created in local store`, 'success');
      return newDept;
    } catch (err: any) {
      showToast(err.message || 'Failed to create department', 'error');
      return null;
    }
  }, [showToast]);

  const updateDepartment = useCallback(async (id: string, updates: Partial<Department>): Promise<boolean> => {
    try {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        const res = await apiClient.updateDepartment(id, updates);
        if (res.success && res.data) {
          setDepartments(prev => prev.map(d => (d.id === id ? (res.data as Department) : d)));
          showToast('Department updated successfully', 'success');
          return true;
        }
      }
      setDepartments(prev => prev.map(d => (d.id === id ? { ...d, ...updates } : d)));
      showToast('Department updated locally', 'success');
      return true;
    } catch (err: any) {
      showToast(err.message || 'Failed to update department', 'error');
      return false;
    }
  }, [showToast]);

  const deleteDepartment = useCallback(async (id: string): Promise<boolean> => {
    try {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        const res = await apiClient.deleteDepartment(id);
        if (res.success) {
          setDepartments(prev => prev.filter(d => d.id !== id));
          showToast('Department deleted successfully', 'success');
          return true;
        }
      }
      setDepartments(prev => prev.filter(d => d.id !== id));
      showToast('Department deleted locally', 'success');
      return true;
    } catch (err: any) {
      showToast(err.message || 'Failed to delete department', 'error');
      return false;
    }
  }, [showToast]);

  const addReviewCycle = useCallback(
    async (cycle: Omit<ReviewCycle, 'id' | 'completedReviewsCount'>): Promise<ReviewCycle | null> => {
      try {
        if (dbConnectedRef.current && apiClient.getAccessToken()) {
          const res = await apiClient.createReviewCycle(cycle);
          if (res.success && res.data) {
            const created = res.data as ReviewCycle;
            setReviewCycles((prev) => [created, ...prev]);
            showToast(`Created review cycle "${created.title}"`, 'success');
            return created;
          }
        }
        const created = DataRepository.addReviewCycle(cycle);
        setReviewCycles((prev) => [created, ...prev]);
        showToast(`Created review cycle "${created.title}"`, 'success');
        return created;
      } catch (err: any) {
        showToast(err.message || 'Failed to create review cycle', 'error');
        return null;
      }
    },
    [showToast]
  );

  const updateReviewCycle = useCallback(
    async (id: string, updates: Partial<ReviewCycle>): Promise<boolean> => {
      try {
        if (dbConnectedRef.current && apiClient.getAccessToken()) {
          const res = await apiClient.updateReviewCycle(id, updates);
          if (res.success && res.data) {
            setReviewCycles((prev) => prev.map((c) => (c.id === id ? (res.data as ReviewCycle) : c)));
            showToast('Review cycle updated', 'success');
            return true;
          }
        }
        DataRepository.updateReviewCycle(id, updates);
        setReviewCycles((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
        showToast('Review cycle updated locally', 'success');
        return true;
      } catch (err: any) {
        showToast(err.message || 'Failed to update review cycle', 'error');
        return false;
      }
    },
    [showToast]
  );

  const deleteReviewCycle = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        if (dbConnectedRef.current && apiClient.getAccessToken()) {
          const res = await apiClient.deleteReviewCycle(id);
          if (res.success) {
            setReviewCycles((prev) => prev.filter((c) => c.id !== id));
            showToast('Review cycle deleted successfully', 'success');
            return true;
          }
        }
        setReviewCycles((prev) => prev.filter((c) => c.id !== id));
        showToast('Review cycle deleted locally', 'success');
        return true;
      } catch (err: any) {
        showToast(err.message || 'Failed to delete review cycle', 'error');
        return false;
      }
    },
    [showToast]
  );

  const addOKR = useCallback(
    async (okr: Omit<OKR, 'id' | 'updatedAt'>) => {
      if (dbConnectedRef.current) {
        try {
          const res = await apiClient.createOKR<OKR>(okr);
          if (res.success && res.data) {
            setOkrs((prev) => [res.data!, ...prev]);
            DataRepository.addOKR(res.data);
            showToast('New OKR objective registered successfully', 'success');
            return res.data;
          } else {
            showToast(res.error || 'Failed to create OKR', 'error');
            return null;
          }
        } catch (err: any) {
          showToast(err.message || 'Error creating OKR', 'error');
          return null;
        }
      }
      const created = DataRepository.addOKR(okr);
      setOkrs((prev) => [created, ...prev]);
      showToast('New OKR objective registered', 'success');
      return created;
    },
    [showToast]
  );

  const updateOKR = useCallback(
    async (id: string, updates: Partial<OKR>) => {
      if (dbConnectedRef.current) {
        try {
          const res = await apiClient.updateOKR<OKR>(id, updates);
          if (res.success && res.data) {
            setOkrs((prev) => prev.map((o) => (o.id === id ? res.data! : o)));
            showToast('OKR updated successfully', 'success');
            return true;
          } else {
            showToast(res.error || 'Failed to update OKR', 'error');
            return false;
          }
        } catch (err: any) {
          showToast(err.message || 'Error updating OKR', 'error');
          return false;
        }
      }
      DataRepository.updateOKR(id, updates);
      setOkrs((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
      showToast('OKR progress updated locally', 'success');
      return true;
    },
    [showToast]
  );

  const updateKeyResultProgress = useCallback(
    async (okrId: string, krId: string, actualValue: number) => {
      if (dbConnectedRef.current) {
        try {
          const res = await apiClient.updateKeyResult<OKR>(okrId, krId, actualValue);
          if (res.success && res.data) {
            setOkrs((prev) => prev.map((o) => (o.id === okrId ? res.data! : o)));
            showToast('Key result progress updated', 'success');
            return true;
          } else {
            showToast(res.error || 'Failed to update progress', 'error');
            return false;
          }
        } catch (err: any) {
          showToast(err.message || 'Error updating progress', 'error');
          return false;
        }
      }
      return false;
    },
    [showToast]
  );

  const deleteOKR = useCallback(
    async (id: string) => {
      if (dbConnectedRef.current) {
        try {
          const res = await apiClient.deleteOKR(id);
          if (res.success) {
            setOkrs((prev) => prev.filter((o) => o.id !== id));
            showToast('OKR deleted successfully', 'success');
            return true;
          } else {
            showToast(res.error || 'Failed to delete OKR', 'error');
            return false;
          }
        } catch (err: any) {
          showToast(err.message || 'Error deleting OKR', 'error');
          return false;
        }
      }
      setOkrs((prev) => prev.filter((o) => o.id !== id));
      showToast('OKR deleted locally', 'success');
      return true;
    },
    [showToast]
  );

  const refreshFeedback = useCallback(async () => {
    if (dbConnectedRef.current) {
      try {
        const [fbRes, fbrRes] = await Promise.all([
          apiClient.getFeedback<FeedbackItem[]>(),
          apiClient.getFeedbackRequests<FeedbackRequest[]>(),
        ]);
        if (fbRes.success && Array.isArray(fbRes.data)) {
          setFeedback(fbRes.data);
        }
        if (fbrRes.success && Array.isArray(fbrRes.data)) {
          setFeedbackRequests(fbrRes.data);
        }
      } catch (e) {
        console.warn('Refresh feedback error:', e);
      }
    }
  }, []);

  const addFeedback = useCallback(async (fb: Omit<FeedbackItem, 'id' | 'submittedAt'>) => {
    if (dbConnectedRef.current) {
      try {
        const res = await apiClient.submitFeedback<FeedbackItem>(fb);
        if (res.success && res.data) {
          const created = res.data;
          setFeedback(prev => [created, ...prev.filter(f => f.id !== created.id)]);
          // Refresh pending requests to reflect auto-completion
          const fbrRes = await apiClient.getFeedbackRequests<FeedbackRequest[]>();
          if (fbrRes.success && Array.isArray(fbrRes.data)) {
            setFeedbackRequests(fbrRes.data);
          }
          showToast('360° feedback submitted successfully', 'success');
          return created;
        } else {
          showToast(res.error || 'Failed to submit feedback', 'error');
          return null;
        }
      } catch (err: any) {
        showToast(err.message || 'Error submitting feedback', 'error');
        return null;
      }
    }
    const created = DataRepository.addFeedback(fb);
    setFeedback(prev => [created, ...prev]);
    showToast('360° feedback submitted successfully', 'success');
    return created;
  }, [showToast]);

  const createFeedbackRequest = useCallback(async (reqData: any) => {
    if (dbConnectedRef.current) {
      try {
        const res = await apiClient.createFeedbackRequest<FeedbackRequest>(reqData);
        if (res.success && res.data) {
          setFeedbackRequests(prev => [res.data!, ...prev]);
          showToast('Peer feedback request created successfully', 'success');
          return res.data;
        } else {
          showToast(res.error || 'Failed to create feedback request', 'error');
          return null;
        }
      } catch (err: any) {
        showToast(err.message || 'Error creating feedback request', 'error');
        return null;
      }
    }
    showToast('Backend offline: cannot create feedback request', 'warning');
    return null;
  }, [showToast]);

  const declineFeedbackRequest = useCallback(async (id: string) => {
    if (dbConnectedRef.current) {
      try {
        const res = await apiClient.declineFeedbackRequest<FeedbackRequest>(id);
        if (res.success && res.data) {
          setFeedbackRequests(prev => prev.map(r => (r.id === id ? { ...r, status: 'Declined' } : r)));
          showToast('Feedback request declined', 'info');
          return true;
        } else {
          showToast(res.error || 'Failed to decline feedback request', 'error');
          return false;
        }
      } catch (err: any) {
        showToast(err.message || 'Error declining feedback request', 'error');
        return false;
      }
    }
    return false;
  }, [showToast]);

  const saveSelfReflection = useCallback(async (ref: Omit<SelfReflection, 'id' | 'submittedAt'>) => {
    if (dbConnectedRef.current && apiClient.getAccessToken()) {
      try {
        const res = await apiClient.saveSelfReflection<SelfReflection>(ref);
        if (res.success && res.data) {
          setSelfReflections(prev => {
            const filtered = prev.filter(r => r.id !== res.data!.id);
            return [res.data!, ...filtered];
          });
          DataRepository.saveSelfReflection(res.data);
          showToast('Self-reflection saved successfully', 'success');
          return res.data;
        } else {
          showToast(res.error || 'Failed to save self-reflection', 'error');
        }
      } catch (err: any) {
        showToast(err.message || 'Error saving self-reflection', 'error');
      }
    }
    const saved = DataRepository.saveSelfReflection(ref);
    setSelfReflections(prev => {
      const filtered = prev.filter(r => r.id !== saved.id);
      return [saved, ...filtered];
    });
    showToast('Self-reflection saved locally', 'success');
    return saved;
  }, [showToast]);

  const addManagerNote = useCallback(
    async (note: Omit<ManagerNote, 'id' | 'date'>) => {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        try {
          const res = await apiClient.createManagerNote<ManagerNote>(note);
          if (res.success && res.data) {
            setManagerNotes((prev) => [res.data!, ...prev]);
            dbRawNotesRef.current = [res.data!, ...dbRawNotesRef.current];
            showToast('Private manager observation recorded successfully', 'success');
            return res.data;
          } else {
            showToast(res.error || 'Failed to record manager note', 'error');
            return null;
          }
        } catch (err: any) {
          showToast(err.message || 'Error recording manager note', 'error');
          return null;
        }
      }
      const created = DataRepository.addManagerNote(note);
      setManagerNotes((prev) => [created, ...prev]);
      showToast('Private manager observation saved locally', 'success');
      return created;
    },
    [showToast]
  );

  const updateManagerNote = useCallback(
    async (id: string, updates: Partial<ManagerNote>) => {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        try {
          const res = await apiClient.updateManagerNote<ManagerNote>(id, updates);
          if (res.success && res.data) {
            setManagerNotes((prev) => prev.map((n) => (n.id === id ? res.data! : n)));
            dbRawNotesRef.current = dbRawNotesRef.current.map((n) => (n.id === id ? res.data! : n));
            showToast('Manager observation updated successfully', 'success');
            return true;
          } else {
            showToast(res.error || 'Failed to update manager note', 'error');
            return false;
          }
        } catch (err: any) {
          showToast(err.message || 'Error updating manager note', 'error');
          return false;
        }
      }
      DataRepository.updateManagerNote(id, updates);
      setManagerNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
      showToast('Manager observation updated locally', 'success');
      return true;
    },
    [showToast]
  );

  const deleteManagerNote = useCallback(
    async (id: string) => {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        try {
          const res = await apiClient.deleteManagerNote(id);
          if (res.success) {
            setManagerNotes((prev) => prev.filter((n) => n.id !== id));
            dbRawNotesRef.current = dbRawNotesRef.current.filter((n) => n.id !== id);
            showToast('Manager observation deleted successfully', 'success');
            return true;
          } else {
            showToast(res.error || 'Failed to delete manager note', 'error');
            return false;
          }
        } catch (err: any) {
          showToast(err.message || 'Error deleting manager note', 'error');
          return false;
        }
      }
      DataRepository.deleteManagerNote(id);
      setManagerNotes((prev) => prev.filter((n) => n.id !== id));
      showToast('Manager observation deleted locally', 'success');
      return true;
    },
    [showToast]
  );

  const savePerformanceReview = useCallback(
    async (review: PerformanceReview) => {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        try {
          const res = await apiClient.savePerformanceReview<PerformanceReview>(review);
          if (res.success && res.data) {
            setPerformanceReviews((prev) => {
              const exists = prev.some((r) => r.id === res.data!.id);
              return exists
                ? prev.map((r) => (r.id === res.data!.id ? res.data! : r))
                : [res.data!, ...prev];
            });
            showToast(`Review for ${review.employeeName} saved (${review.status})`, 'success');
            return res.data;
          } else {
            showToast(res.error || 'Failed saving review to server', 'error');
          }
        } catch (err: any) {
          showToast(err.message || 'Error saving review', 'error');
        }
      }
      DataRepository.savePerformanceReview(review);
      setPerformanceReviews((prev) => {
        const exists = prev.some((r) => r.id === review.id);
        return exists ? prev.map((r) => (r.id === review.id ? review : r)) : [review, ...prev];
      });
      showToast(`Review for ${review.employeeName} saved locally (${review.status})`, 'success');
      return review;
    },
    [showToast]
  );

  const synthesizeReview = useCallback(
    async (employeeId: string, reviewCycleId: string, regenerateSection?: string) => {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        try {
          let res: any;
          try {
            res = await apiClient.synthesizeReview<any>({
              employeeId,
              reviewCycleId,
              regenerateSection,
              forceMock: false,
            });
          } catch (apiErr: any) {
            // If Gemini API is unavailable or unconfigured, seamlessly synthesize with grounded evidence engine
            if (
              apiErr.statusCode === 503 ||
              apiErr.code === 'AI_PROVIDER_UNAVAILABLE' ||
              apiErr.message?.includes('GEMINI_API_KEY') ||
              apiErr.message?.includes('503')
            ) {
              console.warn('Live Gemini AI unavailable, invoking grounded backend evidence synthesizer...');
              res = await apiClient.synthesizeReview<any>({
                employeeId,
                reviewCycleId,
                regenerateSection,
                forceMock: true,
              });
            } else {
              throw apiErr;
            }
          }

          const review: PerformanceReview | undefined =
            (res?.data as any)?.review || (res?.data as any);

          if (res?.success && review && review.sections) {
            setPerformanceReviews((prev) => {
              const exists = prev.some((r) => r.id === review.id);
              return exists ? prev.map((r) => (r.id === review.id ? review : r)) : [review, ...prev];
            });
            showToast(
              regenerateSection
                ? `Section "${regenerateSection}" regenerated successfully`
                : `Synthesized comprehensive review for ${review.employeeName} (backed by live OKRs & evidence)`,
              'success'
            );
            return { success: true, review };
          } else {
            const errorMsg = res?.error || 'AI synthesis failed';
            showToast(errorMsg, 'error');
            return { success: false, error: errorMsg };
          }
        } catch (err: any) {
          const errorMsg = err.message || 'Network error during AI synthesis';
          showToast(errorMsg, 'error');
          return { success: false, error: errorMsg };
        }
      }
      return { success: false, error: 'Live backend session required for AI synthesis' };
    },
    [showToast]
  );

  const submitReviewForApproval = useCallback(
    async (id: string, notes?: string) => {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        try {
          const res = await apiClient.submitReviewForApproval<PerformanceReview>(id, notes);
          if (res.success && res.data) {
            setPerformanceReviews(prev => prev.map(r => (r.id === id ? res.data! : r)));
            showToast('Review submitted for manager/HR approval', 'success');
            return true;
          } else {
            showToast(res.error || 'Failed to submit review for approval', 'error');
            return false;
          }
        } catch (err: any) {
          showToast(err.message || 'Error submitting review', 'error');
          return false;
        }
      }
      const existing = performanceReviews.find(r => r.id === id);
      if (existing) {
        const updated: PerformanceReview = {
          ...existing,
          status: 'Pending Approval',
          lastUpdatedAt: new Date().toISOString(),
        };
        DataRepository.savePerformanceReview(updated);
        setPerformanceReviews(prev => prev.map(r => (r.id === id ? updated : r)));
        showToast('Review submitted for approval locally', 'success');
        return true;
      }
      return false;
    },
    [performanceReviews, showToast]
  );

  const requestReviewChanges = useCallback(
    async (id: string, notes: string) => {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        try {
          const res = await apiClient.requestReviewChanges<PerformanceReview>(id, notes);
          if (res.success && res.data) {
            setPerformanceReviews(prev => prev.map(r => (r.id === id ? res.data! : r)));
            showToast('Revision request sent back to author', 'info');
            return true;
          } else {
            showToast(res.error || 'Failed to request changes', 'error');
            return false;
          }
        } catch (err: any) {
          showToast(err.message || 'Error requesting changes', 'error');
          return false;
        }
      }
      const existing = performanceReviews.find(r => r.id === id);
      if (existing) {
        const updated: PerformanceReview = {
          ...existing,
          status: 'Changes Requested',
          managerFeedbackNotes: notes,
          lastUpdatedAt: new Date().toISOString(),
        };
        DataRepository.savePerformanceReview(updated);
        setPerformanceReviews(prev => prev.map(r => (r.id === id ? updated : r)));
        showToast('Changes requested locally', 'info');
        return true;
      }
      return false;
    },
    [performanceReviews, showToast]
  );

  const approveReview = useCallback(
    async (id: string, notes?: string) => {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        try {
          const res = await apiClient.approveReview<PerformanceReview>(id, notes);
          if (res.success && res.data) {
            setPerformanceReviews(prev => prev.map(r => (r.id === id ? res.data! : r)));
            showToast(`Formally approved review for ${res.data.employeeName}`, 'success');
            return true;
          } else {
            showToast(res.error || 'Failed to approve review', 'error');
            return false;
          }
        } catch (err: any) {
          showToast(err.message || 'Error approving review', 'error');
          return false;
        }
      }
      const existing = performanceReviews.find(r => r.id === id);
      if (existing) {
        const updated: PerformanceReview = {
          ...existing,
          status: 'Approved',
          approverName: authUser?.name || 'Authorized Approver',
          approvedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
        };
        DataRepository.savePerformanceReview(updated);
        setPerformanceReviews(prev => prev.map(r => (r.id === id ? updated : r)));
        showToast(`Approved review locally for ${existing.employeeName}`, 'success');
        return true;
      }
      return false;
    },
    [authUser, performanceReviews, showToast]
  );

  const publishReview = useCallback(
    async (id: string) => {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        try {
          const res = await apiClient.publishReview<PerformanceReview>(id);
          if (res.success && res.data) {
            setPerformanceReviews(prev => prev.map(r => (r.id === id ? res.data! : r)));
            showToast(`Review for ${res.data.employeeName} published and released to employee portal!`, 'success');
            return true;
          } else {
            showToast(res.error || 'Failed to publish review', 'error');
            return false;
          }
        } catch (err: any) {
          showToast(err.message || 'Error publishing review', 'error');
          return false;
        }
      }
      const existing = performanceReviews.find(r => r.id === id);
      if (existing) {
        const updated: PerformanceReview = {
          ...existing,
          status: 'Released',
          releasedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
        };
        DataRepository.savePerformanceReview(updated);
        setPerformanceReviews(prev => prev.map(r => (r.id === id ? updated : r)));
        showToast(`Review published locally to ${existing.employeeName}`, 'success');
        return true;
      }
      return false;
    },
    [performanceReviews, showToast]
  );

  const updateReviewSection = useCallback(
    async (id: string, sectionKey: string, content: string, evidenceRefs?: any[]) => {
      if (dbConnectedRef.current && apiClient.getAccessToken()) {
        try {
          const res = await apiClient.updateReviewSection<PerformanceReview>(id, sectionKey, content, evidenceRefs);
          if (res.success && res.data) {
            setPerformanceReviews(prev => prev.map(r => (r.id === id ? res.data! : r)));
            showToast(`Section "${sectionKey}" updated with citations preserved`, 'success');
            return true;
          } else {
            showToast(res.error || 'Failed to update section', 'error');
            return false;
          }
        } catch (err: any) {
          showToast(err.message || 'Error updating section', 'error');
          return false;
        }
      }
      const existing = performanceReviews.find(r => r.id === id);
      if (existing && existing.sections) {
        const sKey = sectionKey as keyof typeof existing.sections;
        const currentSec = existing.sections[sKey];
        const updated: PerformanceReview = {
          ...existing,
          sections: {
            ...existing.sections,
            [sKey]: {
              ...currentSec,
              content,
              evidenceRefs: evidenceRefs || currentSec.evidenceRefs,
            },
          },
          lastUpdatedAt: new Date().toISOString(),
        };
        DataRepository.savePerformanceReview(updated);
        setPerformanceReviews(prev => prev.map(r => (r.id === id ? updated : r)));
        showToast(`Section updated locally with citations preserved`, 'success');
        return true;
      }
      return false;
    },
    [performanceReviews, showToast]
  );

  const updateSettings = useCallback((newSettings: Partial<OrganizationSettings>) => {
    const updated = DataRepository.updateSettings(newSettings);
    if (dbConnectedRef.current && apiClient.getAccessToken()) {
      setSettings(updated);
      apiClient.updateOrganizationSettings(newSettings).catch(err => {
        showToast(err.message || 'Failed saving settings to server', 'error');
      });
    } else {
      loadLocalSnapshot();
    }
    showToast('Organization settings updated', 'success');
    return updated;
  }, [loadLocalSnapshot, showToast]);

  const getDashboardMetrics = useCallback(async () => {
    if (dbConnectedRef.current && apiClient.getAccessToken()) {
      try {
        const res = await apiClient.getDashboardMetrics();
        if (res.success && res.data) {
          return res.data;
        }
      } catch (err: any) {
        console.warn('Backend dashboard query failed:', err);
      }
    }
    return null;
  }, []);

  const getAnalyticsSummary = useCallback(async (params?: { reviewCycleId?: string; departmentId?: string }) => {
    if (dbConnectedRef.current && apiClient.getAccessToken()) {
      try {
        const res = await apiClient.getAnalyticsSummary(params);
        if (res.success && res.data) {
          return res.data;
        }
      } catch (err: any) {
        console.warn('Backend analytics summary query failed:', err);
      }
    }
    return null;
  }, []);

  const exportAnalytics = useCallback(async (params?: { format?: 'csv' | 'json'; reviewCycleId?: string }) => {
    if (dbConnectedRef.current && apiClient.getAccessToken()) {
      return await apiClient.exportAnalytics(params);
    }
    return null;
  }, []);

  const markNotificationRead = useCallback(async (id: string): Promise<boolean> => {
    if (dbConnectedRef.current && apiClient.getAccessToken()) {
      try {
        const res = await apiClient.markNotificationRead(id);
        if (res.success) {
          setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
          setUnreadNotifCount(prev => Math.max(0, prev - 1));
          return true;
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to mark notification as read', 'error');
        return false;
      }
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadNotifCount(prev => Math.max(0, prev - 1));
    return true;
  }, [showToast]);

  const markAllNotificationsRead = useCallback(async (): Promise<boolean> => {
    if (dbConnectedRef.current && apiClient.getAccessToken()) {
      try {
        const res = await apiClient.markAllNotificationsRead();
        if (res.success) {
          setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
          setUnreadNotifCount(0);
          showToast('All notifications marked as read', 'success');
          return true;
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to mark all as read', 'error');
        return false;
      }
    }
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadNotifCount(0);
    showToast('All notifications marked as read', 'success');
    return true;
  }, [showToast]);

  const deleteNotification = useCallback(async (id: string): Promise<boolean> => {
    if (dbConnectedRef.current && apiClient.getAccessToken()) {
      try {
        const res = await apiClient.deleteNotification(id);
        if (res.success) {
          setNotifications(prev => {
            const target = prev.find(n => n.id === id);
            if (target && !target.isRead) {
              setUnreadNotifCount(c => Math.max(0, c - 1));
            }
            return prev.filter(n => n.id !== id);
          });
          showToast('Notification dismissed', 'info');
          return true;
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to dismiss notification', 'error');
        return false;
      }
    }
    setNotifications(prev => {
      const target = prev.find(n => n.id === id);
      if (target && !target.isRead) {
        setUnreadNotifCount(c => Math.max(0, c - 1));
      }
      return prev.filter(n => n.id !== id);
    });
    return true;
  }, [showToast]);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (e) {
      console.warn('Logout API warning:', e);
    }
    setAuthUser(null);
    DataRepository.setActiveRole('hr_admin');
    if (typeof window !== 'undefined') {
      apiClient.clearSession();
      localStorage.removeItem('reviewforge_active_role');
      localStorage.removeItem('reviewforge_auth_user');
      window.location.href = '/login';
    }
  }, []);

  const refreshEmployeeEvidence = useCallback(async (employeeId: string) => {
    try {
      const [okrRes, refRes] = await Promise.allSettled([
        apiClient.getOKRs<OKR[]>({ employeeId }),
        apiClient.getSelfReflections<SelfReflection[]>({ employeeId }),
      ]);

      if (
        okrRes.status === 'fulfilled' &&
        okrRes.value.success &&
        Array.isArray(okrRes.value.data) &&
        okrRes.value.data.length > 0
      ) {
        const fetchedOkrs = okrRes.value.data;
        setOkrs((prev) => {
          const map = new Map(prev.map((o) => [o.id, o]));
          fetchedOkrs.forEach((o) => map.set(o.id, o));
          return Array.from(map.values());
        });
        fetchedOkrs.forEach((o) => DataRepository.updateOKR(o.id, o) || DataRepository.addOKR(o));
      }

      if (
        refRes.status === 'fulfilled' &&
        refRes.value.success &&
        Array.isArray(refRes.value.data) &&
        refRes.value.data.length > 0
      ) {
        const fetchedRefs = refRes.value.data;
        setSelfReflections((prev) => {
          const map = new Map(prev.map((r) => [r.id, r]));
          fetchedRefs.forEach((r) => map.set(r.id, r));
          return Array.from(map.values());
        });
        fetchedRefs.forEach((r) => DataRepository.saveSelfReflection(r));
      }
    } catch (err) {
      console.warn('Error refreshing employee evidence:', err);
    }
  }, []);

  const value: StoreContextValue = {
    isHydrated,
    dbConnected,
    authUser,
    activeRole,
    setActiveRole,
    logout,
    departments,
    employees,
    reviewCycles,
    okrs,
    feedback,
    feedbackRequests,
    selfReflections,
    managerNotes,
    performanceReviews,
    auditLogs,
    notifications,
    unreadNotifCount,
    settings,
    toasts,
    showToast,
    removeToast,
    refreshData: loadData,
    resetAllDemoData,
    clearAllReviewData,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    addReviewCycle,
    updateReviewCycle,
    deleteReviewCycle,
    addOKR,
    updateOKR,
    updateKeyResultProgress,
    deleteOKR,
    addFeedback,
    createFeedbackRequest,
    declineFeedbackRequest,
    refreshFeedback,
    saveSelfReflection,
    addManagerNote,
    updateManagerNote,
    deleteManagerNote,
    savePerformanceReview,
    synthesizeReview,
    submitReviewForApproval,
    requestReviewChanges,
    approveReview,
    publishReview,
    updateReviewSection,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    updateSettings,
    getDashboardMetrics,
    getAnalyticsSummary,
    exportAnalytics,
    refreshEmployeeEvidence
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}
