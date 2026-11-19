'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/storage/use-store';
import { X, Clock, AlertTriangle, ArrowRight, Check, Trash2, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const router = useRouter();
  const {
    performanceReviews,
    notifications,
    unreadNotifCount,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
  } = useStore();

  if (!isOpen) return null;

  const pendingApprovals = performanceReviews.filter(r => r.status === 'Pending Approval');

  const displayList = notifications.length > 0
    ? notifications
    : [
        {
          id: 'notif-1',
          organizationId: 'org-reviewforge-default',
          userId: 'usr-admin',
          title: 'Review Awaiting Executive Approval',
          message: "Rahul Deshmukh's FY2026 performance review draft is pending sign-off.",
          type: 'approval' as const,
          link: '/approvals',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'notif-2',
          organizationId: 'org-reviewforge-default',
          userId: 'usr-admin',
          title: 'FY2026 Review Cycle Milestone',
          message: 'Annual evaluation calibration closes in 14 days (Nov 30, 2026).',
          type: 'cycle' as const,
          link: '/review-cycles',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#17251F]/30 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-sm bg-[#FFFFFF] h-full shadow-2xl border-l border-[#E6E8E1] z-10 flex flex-col animate-in slide-in-from-right duration-200">
        <div className="px-5 py-4 border-b border-[#E6E8E1] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#17251F]">
              Action Queue & Alerts
            </h3>
            {unreadNotifCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#C8ED78] text-[#17251F]">
                {unreadNotifCount} unread
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-[#F0F2EB] text-[#747D75]">
                {displayList.length} total
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#747D75] hover:text-[#202820] hover:bg-[#F0F2EB] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action item banner for pending reviews */}
        {pendingApprovals.length > 0 && (
          <div className="p-4 bg-[#FEF6E7] border-b border-[#FBDCA8] flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-[#92540D]">
                {pendingApprovals.length} Review(s) Require Approval
              </div>
              <p className="text-[11px] text-[#92540D]/90 mt-0.5">
                Staff backend architect evaluation requires formal manager sign-off.
              </p>
              <Button
                size="sm"
                variant="primary"
                className="mt-2 text-xs"
                onClick={() => {
                  router.push('/approvals');
                  onClose();
                }}
              >
                Open Approval Queue
              </Button>
            </div>
          </div>
        )}

        {/* List of notifications */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[#747D75] uppercase tracking-wider">
              Recent Alerts & Notifications
            </span>
            {unreadNotifCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllNotificationsRead()}
                className="text-[11px] text-[#2C5E1A] hover:underline font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {displayList.map((n) => {
            const isUnread = !n.isRead;
            return (
              <div
                key={n.id}
                className={`p-3 rounded-xl border transition-all ${
                  isUnread
                    ? 'border-[#C8ED78] bg-[#FAFDF4] shadow-xs'
                    : 'border-[#E6E8E1] hover:border-[#D0D4CA] hover:bg-[#FAFBF8]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 font-medium text-[#17251F]">
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" title="Unread" />
                    )}
                    <Clock className="w-3 h-3 text-[#5876D8]" />
                    <span className="font-semibold">{n.title}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isUnread && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void markNotificationRead(n.id);
                        }}
                        className="p-1 text-[#747D75] hover:text-[#2C5E1A] rounded"
                        title="Mark as read"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteNotification(n.id);
                      }}
                      className="p-1 text-[#747D75] hover:text-red-500 rounded"
                      title="Dismiss notification"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-[#747D75] mt-1.5 leading-relaxed">
                  {n.message}
                </p>

                {n.link && (
                  <div
                    onClick={() => {
                      router.push(n.link!);
                      if (isUnread) void markNotificationRead(n.id);
                      onClose();
                    }}
                    className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#17251F] hover:text-[#5876D8] cursor-pointer"
                  >
                    <span>View action</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#FAFBF8] border-t border-[#E6E8E1] flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-[#747D75]">
            <BellRing className="w-3.5 h-3.5" />
            <span>ReviewForge Notifications</span>
          </div>
          {unreadNotifCount > 0 && (
            <button
              onClick={() => {
                void markAllNotificationsRead();
              }}
              className="text-[11px] text-[#5876D8] hover:underline cursor-pointer"
            >
              Clear all unread
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
