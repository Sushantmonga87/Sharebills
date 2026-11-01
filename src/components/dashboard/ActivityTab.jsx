import { useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCheck,
  Receipt,
  ArrowRight,
  Trash2,
  Clock,
} from 'lucide-react';

export default function ActivityTab({
  notifications = [],
  user,
  onOpenGroup,
  onClearNotifications,
  showToast,
}) {
  const [isClearing, setIsClearing] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleClear = async () => {
    if (typeof onClearNotifications !== 'function' || isClearing) return;
    setIsClearing(true);
    try {
      await onClearNotifications(notifications.map((notification) => notification.id));
    } catch {
      showToast?.('Could not clear notifications. Please try again.', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const formatTimestamp = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getNotificationIcon = (message = '') => {
    const lower = message.toLowerCase();
    if (lower.includes('added') || lower.includes('expense') || lower.includes('bill')) {
      return <Receipt size={16} className="text-slate-700" />;
    }
    if (lower.includes('paid') || lower.includes('settle') || lower.includes('confirmed')) {
      return <CheckCheck size={16} className="text-emerald-600" />;
    }
    return <Bell size={16} className="text-slate-600" />;
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-3 pb-20 sm:px-4 sm:pb-20 sm:pt-2 lg:px-6 lg:pb-20 lg:pt-2">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-200/90 pb-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Updates & Ledger Alerts</p>
          <div className="mt-0.5 flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Activity
            </h1>
            {unreadCount > 0 && (
              <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-700">
                {unreadCount} new
              </span>
            )}
          </div>
        </div>

        {notifications.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isClearing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-50"
            title="Clear all notifications"
          >
            <Trash2 size={14} />
            <span>{isClearing ? 'Clearing…' : 'Clear all'}</span>
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-10 text-center shadow-xs">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <BellOff size={22} />
          </div>
          <h3 className="text-sm font-bold text-slate-900">All caught up</h3>
          <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">
            New bills, settlements, and group updates from your flatmates will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
          {notifications
            .slice()
            .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
            .map((notification) => {
              const creatorId =
                notification.createdBy || notification.senderId || notification.userId;
              const isMe = creatorId === user?.id;
              const creatorName = isMe
                ? 'You'
                : notification.createdByName || notification.senderName || 'Someone';

              let displayMessage = notification.message || '';
              if (!isMe && displayMessage.startsWith('You added')) {
                displayMessage = displayMessage.replace('You added', `${creatorName} added`);
              } else if (
                isMe &&
                !displayMessage.startsWith('You added') &&
                displayMessage.includes('added')
              ) {
                displayMessage = displayMessage.replace(`${creatorName} added`, 'You added');
              }

              const isUnread = !notification.read;

              return (
                <div
                  key={notification.id}
                  onClick={() => {
                    if (notification.groupId && typeof onOpenGroup === 'function') {
                      onOpenGroup(notification.groupId);
                    }
                  }}
                  className={`group flex items-start justify-between gap-3.5 p-4 transition-colors cursor-pointer ${
                    isUnread ? 'bg-emerald-50/30 hover:bg-emerald-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                      {getNotificationIcon(displayMessage)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug">
                        {displayMessage}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} />
                          {formatTimestamp(notification.createdAt)}
                        </span>
                        {notification.groupId && (
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700 group-hover:text-emerald-700">
                            <span>Open space</span>
                            <ArrowRight size={11} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isUnread && (
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-600" />
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}