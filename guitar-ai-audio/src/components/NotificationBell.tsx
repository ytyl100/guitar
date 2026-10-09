import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  Check, 
  Trash2, 
  X, 
  ExternalLink, 
  ChevronRight, 
  BookOpen, 
  Music, 
  Award, 
  Info,
  Sparkles
} from 'lucide-react';
import { AppNotification, INITIAL_NOTIFICATIONS } from '../types/notification';
import { backendService } from '../utils/backendService';

interface NotificationBellProps {
  onOpenCourse?: (courseId?: string) => void;
  onOpenScore?: (scoreId?: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onOpenCourse,
  onOpenScore,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // 通知数据源：后端（`/api/notifications`）。`main.tsx` 已经等 hydrate 完成才首次渲染，
  // 所以这里同步拿到的就是库里的数据；未 hydrate 时退回源码里的演示通知（首屏不空白）。
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    backendService.getNotifications(),
  );

  const [filterType, setFilterType] = useState<'all' | 'unread'>('all');
  const [selectedNotifId, setSelectedNotifId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // 写穿透：状态一变就同步到后端（只推变化的那几条）
  useEffect(() => {
    backendService.saveNotifications(notifications);
  }, [notifications]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleClearAll = () => {
    /**
     * ⚠️ 必须走 `backendService.clearNotifications()`，不能只 `setNotifications([])`。
     * 写穿透只推「变化的记录」——把数组清空表达不出「这些记录要删掉」，
     * 结果就是界面上清空了、刷新一下又全回来了（这类"删不掉"的 bug 很难查）。
     */
    setNotifications(backendService.clearNotifications());
  };

  const handleToggleRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: !n.isRead } : n))
    );
  };

  const handleItemClick = (notif: AppNotification) => {
    // Mark as read
    if (!notif.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
    }
    // Toggle expand
    setSelectedNotifId((prev) => (prev === notif.id ? null : notif.id));
  };

  const handleAction = (notif: AppNotification, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (notif.scoreId && onOpenScore) {
      onOpenScore(notif.scoreId);
    } else if (notif.courseId && onOpenCourse) {
      onOpenCourse(notif.courseId);
    }
  };

  const filteredNotifs = notifications.filter((n) => {
    if (filterType === 'unread') return !n.isRead;
    return true;
  });

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
          isOpen
            ? 'bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }`}
        title="即时消息与通知中心"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />

        {/* Unread badge count */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-xs animate-in zoom-in-50">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Menu (白天白色模式) */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-gray-200 shadow-2xl z-50 overflow-hidden select-none animate-in fade-in-50 zoom-in-95 duration-150">
          
          {/* Header */}
          <div className="p-3.5 bg-gray-50/90 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <h4 className="text-xs font-bold text-gray-900">
                即时消息与通知
              </h4>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded-full">
                  {unreadCount} 未读
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                >
                  全部已读
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded cursor-pointer"
                  title="清空全部通知"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-3.5 py-2 bg-white border-b border-gray-100 flex items-center space-x-2 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterType === 'all'
                  ? 'bg-emerald-50 text-emerald-800 font-bold'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              全部 ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('unread')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterType === 'unread'
                  ? 'bg-emerald-50 text-emerald-800 font-bold'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              未读 ({unreadCount})
            </button>
          </div>

          {/* Notification List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-100">
            {filteredNotifs.length === 0 ? (
              <div className="py-10 text-center text-gray-400 space-y-2">
                <Bell className="w-6 h-6 mx-auto text-gray-300 opacity-60" />
                <p className="text-xs">暂无新的通知消息</p>
              </div>
            ) : (
              filteredNotifs.map((item) => {
                const isSelected = selectedNotifId === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`p-3.5 transition-colors cursor-pointer text-xs ${
                      !item.isRead ? 'bg-emerald-50/30 hover:bg-emerald-50/60' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start space-x-2.5 min-w-0">
                        {/* Type Icon */}
                        <div className="mt-0.5 shrink-0">
                          {item.type === 'feedback' && (
                            <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                              <Award className="w-3.5 h-3.5" />
                            </div>
                          )}
                          {item.type === 'score_update' && (
                            <div className="w-6 h-6 rounded-md bg-teal-100 text-teal-700 flex items-center justify-center">
                              <Music className="w-3.5 h-3.5" />
                            </div>
                          )}
                          {item.type === 'drill_award' && (
                            <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
                              <Sparkles className="w-3.5 h-3.5" />
                            </div>
                          )}
                          {item.type === 'system' && (
                            <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
                              <BookOpen className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <span className={`font-bold truncate ${!item.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                              {item.title}
                            </span>
                            {!item.isRead && (
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                            )}
                          </div>

                          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                            {item.summary}
                          </p>
                        </div>
                      </div>

                      <span className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">
                        {item.timeAgo}
                      </span>
                    </div>

                    {/* Expanded Detail Box */}
                    {isSelected && (
                      <div className="mt-2.5 pt-2 border-t border-gray-100 space-y-2 text-gray-600 text-[11px] leading-relaxed">
                        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                          {item.content}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          {item.tag && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                              {item.tag}
                            </span>
                          )}

                          <div className="flex items-center space-x-2 ml-auto">
                            {(item.scoreId || item.courseId) && (
                              <button
                                type="button"
                                onClick={(e) => handleAction(item, e)}
                                className="inline-flex items-center space-x-1 text-emerald-800 hover:text-emerald-950 font-bold hover:underline cursor-pointer"
                              >
                                <span>{item.scoreId ? '前往试奏此谱' : '查看相关课程'}</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => handleToggleRead(item.id, e)}
                              className="text-gray-400 hover:text-gray-600 cursor-pointer"
                              title={item.isRead ? '标记未读' : '标记已读'}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-gray-50 border-t border-gray-200 text-center text-[10px] text-gray-400">
            GuitarMate AI 即时教学通知体系 · 实时同步导师批改与曲谱更新
          </div>

        </div>
      )}
    </div>
  );
};
