import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import DashboardBalanceCard from '../common/DashboardBalanceCard';
import {
  Plus,
  UserPlus,
  Download,
  ChevronRight,
  ChevronDown,
  Pin,
  Bell,
  BellOff,
  Search,
  Receipt,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  PieChart,
  CheckCircle2,
  X,
  MessageSquare,
  Users,
  Trash2,
  LogOut,
  Smartphone,
  FileDown,
  Home,
  CircleDollarSign,
  Check,
  LoaderCircle,
} from 'lucide-react';
import sharebillsIcon from '../../assets/sharebills-icon.webp';
import PrimaryNav from '../common/PrimaryNav';
import MonthlyAnalyticsTab from './MonthlyAnalyticsTab';
import ProfileTabView from './ProfileTab';
import DesktopSpacesTab from './DesktopSpacesTab';
import SpaceLongPressActions from './SpaceLongPressActions';
import ExpenseLongPressActions from '../group/ExpenseLongPressActions';
import ActiveDisputesPanel from '../common/ActiveDisputesPanel';
import EmptyState from '../common/EmptyState';
import TransactionsTab from './TransactionsTab';
import RentSettlementsTab from './RentSettlementsTab';
import TransactionExportModal from './TransactionExportModal';
import { calculateSettlements } from '../../utils/settlement';
import { CATEGORIES, PAYMENT_METHODS } from '../../utils/constants';
import { formatCurrency, getCurrencySymbol } from '../../utils/currency';

export default function Dashboard({
  user,
  users = [],
  groups = [],
  notifications = [],
  expenses = [],
  onLogout,
  onOpenGroup,
  onCreateGroup,
  onJoinGroup,
  onSaveExpense,
  onDeleteExpense,
  onRaiseExpenseDispute,
  onCancelExpenseDispute,
  rentRecords = [],
  onMarkRentPaid,
  onSendNotification,
  onUpdateUser,
  onMarkNotificationsRead,
  onClearNotifications,
  onTabChange,
  initialTab = 'groups',
  mobilePreview = false,
  deferredPromptAvailable = false,
  onInstallApp,
  isAppInstalled = false,
  theme = 'light',
  onThemeChange,
  showToast,
}) {
  const [activeTab, setActiveTab] = useState(initialTab === 'dues' ? 'transactions' : initialTab);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [spaceFilter, setSpaceFilter] = useState('active'); // 'active' | 'pinned' | 'archived'
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState(initialTab === 'dues' ? 'dues' : 'all');
  const [transactionExportOpen, setTransactionExportOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState('spaces');
  const [copiedCodeId, setCopiedCodeId] = useState(null);
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [dailyRentReminderRecords, setDailyRentReminderRecords] = useState([]);
  const dashboardRootRef = useRef(null);
  const overviewLedgerBodyRef = useRef(null);
  const [overviewLedgerBodyHeight, setOverviewLedgerBodyHeight] = useState(0);

  // Activity Drawer / Notification Center Popup State
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const newMenuRef = useRef(null);
  const [optimisticallyReadNotificationIds, setOptimisticallyReadNotificationIds] = useState(() => new Set());
  const [activityContextNotification, setActivityContextNotification] = useState(null);
  const [selectedActivityIds, setSelectedActivityIds] = useState(new Set());
  const [activityDeleteIds, setActivityDeleteIds] = useState(null);
  const [isDeletingActivity, setIsDeletingActivity] = useState(false);
  const activityPressTimerRef = useRef(null);
  const activityLongPressRef = useRef(false);

  useEffect(() => () => {
    if (activityPressTimerRef.current) clearTimeout(activityPressTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    const body = overviewLedgerBodyRef.current;
    if (activeTab !== 'groups' || mobilePreview || !body) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      setOverviewLedgerBodyHeight(entry.contentRect.height);
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [activeTab, mobilePreview, ledgerFilter]);

  useEffect(() => {
    if (!isNewMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!newMenuRef.current?.contains(event.target)) setIsNewMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsNewMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNewMenuOpen]);

  // Quick Expense Modal State
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [quickGroupId, setQuickGroupId] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickCategory, setQuickCategory] = useState('Food');
  const [quickMethod, setQuickMethod] = useState('UPI');
  const [savingQuick, setSavingQuick] = useState(false);

  useEffect(() => {
    if (!showLogoutConfirmation) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSigningOut) {
        setShowLogoutConfirmation(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLogoutConfirmation, isSigningOut]);

  useEffect(() => {
    if (!installDialogOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setInstallDialogOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [installDialogOpen]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const now = new Date();
    const localDateKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const storageKey = `rs_rent_reminders:${user.id}:${localDateKey}`;
    const seenRentIds = (() => {
      try {
        return JSON.parse(localStorage.getItem(storageKey) || '[]');
      } catch {
        return [];
      }
    })();

    const seenRentIdSet = new Set(seenRentIds);
    if (activeTab !== 'groups') {
      const timeout = window.setTimeout(() => setDailyRentReminderRecords([]), 0);
      return () => window.clearTimeout(timeout);
    }

    const pendingRents = rentRecords.filter((rent) => (
      Number(rent.shares?.[user.id]) > 0 && !rent.payments?.[user.id]?.paid
    ));
    const unseenRents = pendingRents.filter((rent) => !seenRentIdSet.has(rent.id));
    if (!unseenRents.length) return undefined;

    const nextSeenRentIds = [...seenRentIdSet, ...unseenRents.map((rent) => rent.id)];
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextSeenRentIds));
      } catch (error) {
        console.warn('Could not save the daily rent reminder state:', error);
      }
      setDailyRentReminderRecords(unseenRents);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeTab, rentRecords, user?.id]);

  useLayoutEffect(() => {
    if (!mobilePreview) return undefined;

    const root = dashboardRootRef.current;
    const main = root?.querySelector('main');
    const content = main?.firstElementChild;
    if (!root || !main || !content) return undefined;

    const fitContent = () => {
      const nav = root.querySelector('nav[aria-label="Mobile navigation"]');
      const availableHeight = Math.max(0, main.clientHeight - (nav?.offsetHeight || 0) - 8);
      const contentHeight = content.scrollHeight;
      const scale = contentHeight > 0
        ? Math.min(1, availableHeight / contentHeight)
        : 1;
      const verticalOnly = ['groups', 'monthly', 'profile'].includes(activeTab);
      const width = verticalOnly ? '100%' : `${100 / scale}%`;
      const transform = verticalOnly ? 'none' : `scale(${scale})`;

      if (content.style.width !== width) content.style.width = width;
      if (content.style.transformOrigin !== 'top center') {
        content.style.transformOrigin = 'top center';
      }
      if (content.style.transform !== transform) content.style.transform = transform;
    };

    fitContent();
    const resizeObserver = new ResizeObserver(fitContent);
    resizeObserver.observe(main);
    return () => resizeObserver.disconnect();
  }, [activeTab, initialTab, mobilePreview]);

  const confirmLogout = async () => {
    if (!onLogout || isSigningOut) return;
    setIsSigningOut(true);
    try {
      await onLogout();
      setShowLogoutConfirmation(false);
    } finally {
      setIsSigningOut(false);
    }
  };

  const pinnedGroupIds = user?.pinnedGroupIds || [];
  const archivedGroupIds = user?.archivedGroupIds || [];
  const mutedGroupIds = user?.mutedGroupIds || [];

  // Scoped notifications for this user
  const userNotifications = useMemo(
    () =>
      notifications.filter(
        (n) => !n.recipientId || n.recipientId === user?.id
      ),
    [notifications, user?.id]
  );
  const unreadNotifications = useMemo(
    () => userNotifications.filter((n) => !n.read && !optimisticallyReadNotificationIds.has(n.id)),
    [optimisticallyReadNotificationIds, userNotifications]
  );

  const getUserName = (userId) => {
    if (userId === user?.id) return 'You';
    return users.find((u) => u.id === userId)?.username || 'Roommate';
  };

  const myGroups = useMemo(
    () => groups.filter((group) => group.members && group.members.includes(user?.id)),
    [groups, user?.id]
  );
  const activeDisputes = useMemo(() => {
    const groupIds = new Set(myGroups.map((group) => group.id));
    return expenses
      .filter((expense) => expense.activeDisputeId && groupIds.has(expense.groupId))
      .sort((first, second) => (
        Date.parse(second.activeDisputeCreatedAt || second.createdAt || 0)
        - Date.parse(first.activeDisputeCreatedAt || first.createdAt || 0)
      ));
  }, [expenses, myGroups]);
  // Unread message & transaction count per space
  const unreadCountsByGroup = useMemo(() => {
    const map = {};
    myGroups.forEach((group) => {
      let chatCount = 0;

      if (typeof group.unreadCount === 'number') {
        chatCount = group.unreadCount;
      } else if (typeof group.unreadMessages === 'number') {
        chatCount = group.unreadMessages;
      } else if (
        group.unreadCount &&
        typeof group.unreadCount === 'object' &&
        typeof group.unreadCount[user?.id] === 'number'
      ) {
        chatCount = group.unreadCount[user?.id];
      } else if (
        group.unreadBy &&
        typeof group.unreadBy === 'object' &&
        typeof group.unreadBy[user?.id] === 'number'
      ) {
        chatCount = group.unreadBy[user?.id];
      } else if (Array.isArray(group.messages)) {
        const lastReadTime =
          group.lastReadBy?.[user?.id] || user?.lastReadGroupChat?.[group.id] || 0;
        chatCount = group.messages.filter(
          (m) =>
            m.senderId &&
            m.senderId !== user?.id &&
            (!m.readBy || !m.readBy.includes(user?.id)) &&
            (!lastReadTime || new Date(m.createdAt || 0) > new Date(lastReadTime))
        ).length;
      }

      const groupUnreadNotifs = notifications.filter(
        (n) =>
          !n.read &&
          n.groupId === group.id &&
          (!n.recipientId || n.recipientId === user?.id)
      );

      const chatNotifs = groupUnreadNotifs.filter(
        (n) =>
          n.type === 'CHAT_MESSAGE' ||
          n.type === 'NEW_MESSAGE' ||
          n.type === 'MESSAGE' ||
          n.category === 'chat' ||
          /message|chat|dispute/i.test(n.type || '')
      ).length;

      const transactionNotifs = groupUnreadNotifs.filter(
        (n) =>
          n.type === 'EXPENSE_ADDED' ||
          n.type === 'BILL_ADDED' ||
          n.type === 'TRANSACTION' ||
          n.type === 'SETTLEMENT' ||
          n.category === 'expense' ||
          (!/dispute/i.test(n.type || '') &&
            /expense|bill|transaction|settle/i.test(n.type || ''))
      ).length;

      const effectiveChatCount = Math.max(chatCount, chatNotifs);
      map[group.id] = {
        chat: effectiveChatCount,
        total: effectiveChatCount + transactionNotifs,
      };
    });
    return map;
  }, [myGroups, notifications, user?.id, user?.lastReadGroupChat]);

  const unreadMessagesByGroup = useMemo(
    () => Object.fromEntries(
      Object.entries(unreadCountsByGroup).map(([groupId, counts]) => [groupId, counts.total])
    ),
    [unreadCountsByGroup]
  );
  const unreadChatByGroup = useMemo(
    () => Object.fromEntries(
      Object.entries(unreadCountsByGroup).map(([groupId, counts]) => [groupId, counts.chat])
    ),
    [unreadCountsByGroup]
  );

  const totalUnreadSpacesCount = useMemo(
    () => Object.values(unreadMessagesByGroup).reduce((sum, c) => sum + (c || 0), 0),
    [unreadMessagesByGroup]
  );

  const handleOpenGroup = (groupId, subTab, expenseDraft = null) => {
    if (onMarkNotificationsRead) {
      const groupUnread = notifications.filter(
        (n) =>
          !n.read &&
          n.groupId === groupId &&
          (!n.recipientId || n.recipientId === user?.id) &&
          (
            subTab === 'chat'
              ? (
                  n.type === 'CHAT_MESSAGE' ||
                  n.type === 'NEW_MESSAGE' ||
                  n.type === 'MESSAGE' ||
                  n.category === 'chat' ||
                  (
                    !n.type?.startsWith('EXPENSE_DISPUTE') &&
                    /message|chat|dispute/i.test(n.type || '')
                  )
                )
              : !(
                  n.type === 'CHAT_MESSAGE' ||
                  n.type === 'NEW_MESSAGE' ||
                  n.type === 'MESSAGE' ||
                  n.category === 'chat' ||
                  /message|chat|dispute/i.test(n.type || '')
                )
          )
      );
      if (groupUnread.length > 0) {
        onMarkNotificationsRead(groupUnread.map((n) => n.id));
      }
    }
    onOpenGroup?.(groupId, subTab, unreadChatByGroup[groupId] || 0, expenseDraft);
  };

  const handleClearAllActivity = async () => {
    if (!onClearNotifications) return;
    try {
      await onClearNotifications(userNotifications.map((notification) => notification.id));
      showToast?.('All activity notifications cleared');
    } catch (error) {
      console.error('Could not clear activity notifications:', error);
      showToast?.('Could not clear activity. Please try again.', 'error');
    }
  };

  const markActivityNotificationsRead = (notificationIds) => {
    if (!onMarkNotificationsRead || notificationIds.length === 0) return;

    const idsToMark = notificationIds.filter((id) => !optimisticallyReadNotificationIds.has(id));
    if (!idsToMark.length) return;

    setOptimisticallyReadNotificationIds((previous) => new Set([...previous, ...idsToMark]));
    Promise.resolve(onMarkNotificationsRead(idsToMark)).catch((error) => {
      console.error('Could not mark activity notifications as read:', error);
      setOptimisticallyReadNotificationIds((previous) => (
        new Set([...previous].filter((id) => !idsToMark.includes(id)))
      ));
      showToast?.('Could not update activity notifications. Please try again.', 'error');
    });
  };

  const handleActivityToggle = () => {
    if (isActivityOpen) {
      setIsActivityOpen(false);
      return;
    }

    setIsActivityOpen(true);
    markActivityNotificationsRead(unreadNotifications.map((notification) => notification.id));
  };

  const startActivityLongPress = (event, notification) => {
    if (event.type === 'mousedown' && event.button !== 0) return;
    if (activityPressTimerRef.current) clearTimeout(activityPressTimerRef.current);
    activityLongPressRef.current = false;
    activityPressTimerRef.current = setTimeout(() => {
      activityLongPressRef.current = true;
      setActivityContextNotification(notification);
    }, 450);
  };

  const stopActivityLongPress = () => {
    if (activityPressTimerRef.current) {
      clearTimeout(activityPressTimerRef.current);
      activityPressTimerRef.current = null;
    }
  };

  const toggleActivitySelection = (notificationId) => {
    setSelectedActivityIds((previous) => {
      const next = new Set(previous);
      if (next.has(notificationId)) next.delete(notificationId);
      else next.add(notificationId);
      return next;
    });
  };

  const confirmActivityDeletion = async () => {
    if (!activityDeleteIds?.length || !onClearNotifications || isDeletingActivity) return;
    setIsDeletingActivity(true);
    try {
      await onClearNotifications(activityDeleteIds);
      setSelectedActivityIds((previous) => (
        new Set([...previous].filter((id) => !activityDeleteIds.includes(id)))
      ));
      setActivityDeleteIds(null);
      showToast?.('Activity deleted');
    } catch (error) {
      console.error('Could not delete activity:', error);
      showToast?.('Could not delete activity. Please try again.', 'error');
    } finally {
      setIsDeletingActivity(false);
    }
  };

  const groupMetrics = useMemo(() => {
    const map = {};
    let totalNetBalance = 0;
    let totalOwedToYou = 0;
    let totalYouOwe = 0;
    const allMySettlements = [];
    const myUnpaidRents = rentRecords
      .filter((rent) => (
        Number(rent.shares?.[user?.id]) > 0 && !rent.payments?.[user?.id]?.paid
      ))
      .map((rent) => ({
        ...rent,
        groupName: myGroups.find((group) => group.id === rent.groupId)?.name || 'Space',
      }))
      .sort((first, second) => second.month.localeCompare(first.month));

    myGroups.forEach((group) => {
      const grpExpenses = expenses.filter((e) => e.groupId === group.id);
      const nonSettlements = grpExpenses.filter(
        (e) => !e.isSettlement && e.category !== 'Settlement'
      );
      const roomSpend = nonSettlements.reduce(
        (sum, e) => sum + (parseFloat(e.totalAmount) || 0),
        0
      );
      const { balances, settlements } = calculateSettlements(grpExpenses, group.members || []);
      const myNet = balances[user?.id] || 0;

      if (!archivedGroupIds.includes(group.id)) {
        totalNetBalance += myNet;
        if (myNet > 0.01) totalOwedToYou += myNet;
        if (myNet < -0.01) totalYouOwe += Math.abs(myNet);
      }

      settlements.forEach((s) => {
        if (s.from === user?.id || s.to === user?.id) {
          allMySettlements.push({
            ...s,
            groupId: group.id,
            groupName: group.name,
          });
        }
      });

      const latestExpense = grpExpenses
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0)
        )[0];

      map[group.id] = {
        myNet,
        roomSpend,
        billCount: nonSettlements.length,
        latestExpense,
        settlements,
        unreadCount: unreadMessagesByGroup[group.id] || 0,
      };
    });

    return {
      byGroup: map,
      totalNetBalance: Math.round(totalNetBalance * 100) / 100,
      totalOwedToYou: Math.round(totalOwedToYou * 100) / 100,
      totalYouOwe: Math.round(totalYouOwe * 100) / 100,
      allMySettlements,
      myUnpaidRents,
    };
  }, [myGroups, expenses, rentRecords, user?.id, archivedGroupIds, unreadMessagesByGroup]);

  const monthlySummary = useMemo(() => {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const myGroupIds = new Set(myGroups.map((g) => g.id));
    const monthExpenses = expenses.filter(
      (e) =>
        myGroupIds.has(e.groupId) &&
        !e.isSettlement &&
        e.category !== 'Settlement' &&
        (e.date?.startsWith(monthPrefix) || !e.date)
    );

    let myShare = 0;
    let iPaid = 0;
    const byCat = {};

    monthExpenses.forEach((e) => {
      const total = parseFloat(e.totalAmount) || 0;
      if (e.paidBy === user?.id) iPaid += total;
      const share = parseFloat(e.splits?.[user?.id]) || 0;
      if (share > 0) {
        myShare += share;
        const cat = e.category || 'Other';
        byCat[cat] = (byCat[cat] || 0) + share;
      }
    });

    const categories = Object.entries(byCat)
      .map(([name, amount]) => ({
        name,
        amount,
        pct: myShare > 0 ? Math.round((amount / myShare) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      monthLabel: now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      myShare,
      iPaid,
      billCount: monthExpenses.length,
      categories,
    };
  }, [expenses, myGroups, user?.id]);

  const activeGroups = useMemo(
    () =>
      myGroups
        .filter((group) => !archivedGroupIds.includes(group.id))
        .sort(
          (first, second) =>
            Number(pinnedGroupIds.includes(second.id)) -
            Number(pinnedGroupIds.includes(first.id))
        ),
    [myGroups, archivedGroupIds, pinnedGroupIds]
  );

  const archivedGroups = useMemo(
    () => myGroups.filter((group) => archivedGroupIds.includes(group.id)),
    [myGroups, archivedGroupIds]
  );

  const pinnedGroups = useMemo(
    () => activeGroups.filter((group) => pinnedGroupIds.includes(group.id)),
    [activeGroups, pinnedGroupIds]
  );

  const visibleGroups = useMemo(() => {
    const base =
      spaceFilter === 'archived'
        ? archivedGroups
        : spaceFilter === 'pinned'
          ? pinnedGroups
          : activeGroups;
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(
      (g) =>
        g.name?.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q) ||
        g.inviteCode?.toLowerCase().includes(q)
    );
  }, [spaceFilter, archivedGroups, pinnedGroups, activeGroups, searchQuery]);

  const recentTransactions = useMemo(() => {
    const myGroupIds = new Set(myGroups.map((g) => g.id));
    let list = expenses
      .filter((e) => myGroupIds.has(e.groupId))
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0)
      );

    if (ledgerFilter === 'mine') {
      list = list.filter((e) => e.paidBy === user?.id);
    } else if (ledgerFilter === 'settlements') {
      list = list.filter((e) => e.isSettlement || e.category === 'Settlement');
    } else if (ledgerFilter === 'dues') {
      list = [];
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.title?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [expenses, myGroups, ledgerFilter, user?.id, searchQuery]);

  const exportTransactions = useMemo(() => {
    const myGroupIds = new Set(myGroups.map((group) => group.id));
    return expenses.filter((expense) => myGroupIds.has(expense.groupId));
  }, [expenses, myGroups]);

  const updateGroupPreference = async (groupId, preference, enabled) => {
    const currentIds = user?.[preference] || [];
    const nextIds = enabled
      ? [...new Set([...currentIds, groupId])]
      : currentIds.filter((id) => id !== groupId);

    try {
      await onUpdateUser(user?.id, { [preference]: nextIds });
    } catch {
      showToast?.('Could not update this group. Please try again.', 'error');
    }
  };

  useEffect(() => {
    if (activeTab === 'notifications' && unreadNotifications.length) {
      onMarkNotificationsRead(unreadNotifications.map((notification) => notification.id));
    }
  }, [activeTab, unreadNotifications, onMarkNotificationsRead]);

  const handleInstallClick = async () => {
    if (!deferredPromptAvailable) {
      setInstallDialogOpen(true);
      return;
    }
    const wasInstalled = await onInstallApp?.();
    if (wasInstalled) {
      setInstallDialogOpen(false);
    }
  };

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    onTabChange(tab);
  };

  const handleCopyInvite = (event, group) => {
    event.stopPropagation();
    if (!group.inviteCode) return;
    try {
      navigator.clipboard?.writeText(group.inviteCode);
      setCopiedCodeId(group.id);
      showToast?.(`Invite code ${group.inviteCode} copied`);
      setTimeout(() => setCopiedCodeId(null), 1800);
    } catch {
      showToast?.('Could not copy code', 'error');
    }
  };

  const openQuickExpenseModal = (defaultGroupId = '') => {
    const targetId = defaultGroupId || activeGroups[0]?.id || myGroups[0]?.id || '';
    if (!targetId) {
      onCreateGroup();
      return;
    }
    setQuickGroupId(targetId);
    setQuickTitle('');
    setQuickAmount('');
    setQuickCategory('Food');
    setQuickMethod('UPI');
    setQuickExpenseOpen(true);
  };

  const handleSaveQuickExpense = async (event) => {
    event.preventDefault();
    const targetGroup = myGroups.find((g) => g.id === quickGroupId);
    const numAmount = parseFloat(quickAmount);
    if (!targetGroup || !quickTitle.trim() || Number.isNaN(numAmount) || numAmount <= 0) {
      showToast?.('Enter a valid description and amount.', 'error');
      return;
    }

    if (!onSaveExpense) {
      setQuickExpenseOpen(false);
      handleOpenGroup(targetGroup.id, 'add');
      return;
    }

    setSavingQuick(true);
    try {
      const members = targetGroup.members?.length ? targetGroup.members : [user?.id];
      const share = (numAmount / members.length).toFixed(2);
      const splits = {};
      members.forEach((mId) => {
        splits[mId] = share;
      });

      const now = new Date();
      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0];

      const newExpense = {
        id: `exp_${Date.now()}`,
        groupId: targetGroup.id,
        title: quickTitle.trim(),
        totalAmount: numAmount.toFixed(2),
        paidBy: user?.id,
        createdBy: user?.id,
        paymentMethod: quickMethod,
        category: quickCategory,
        date: today,
        splits,
        createdAt: new Date().toISOString(),
      };

      await onSaveExpense(newExpense);

      if (onSendNotification) {
        const others = members.filter((id) => id !== user?.id);
        const notifs = others.map((memberId) => ({
          id: `notif_${Date.now()}_${memberId}`,
          recipientId: memberId,
          senderId: user?.id,
          createdBy: user?.id,
          createdByName: user?.username || 'Roommate',
          groupId: targetGroup.id,
          type: 'EXPENSE_ADDED',
          message: `${user?.username} added "${newExpense.title}" for ${formatCurrency(newExpense.totalAmount, targetGroup.currency)} (Your share: ${formatCurrency(share, targetGroup.currency)}).`,
          expenseId: newExpense.id,
          createdAt: new Date().toISOString(),
          read: false,
        }));
        if (notifs.length) onSendNotification(notifs).catch(() => {});
      }

      showToast?.(`Added "${newExpense.title}" to ${targetGroup.name}`);
      setQuickExpenseOpen(false);
    } catch {
      showToast?.('Could not save expense. Please try again.', 'error');
    } finally {
      setSavingQuick(false);
    }
  };

  return (
    <div ref={dashboardRootRef} className={`relative flex h-full min-h-0 flex-col overflow-hidden bg-white font-sans ${mobilePreview ? '' : 'md:flex-row'}`}>

      {/* --- NATIVE MOBILE APP TOP BAR (< md) --- */}
      <header
        className={`relative z-30 flex h-14 flex-shrink-0 items-center justify-between gap-2 bg-transparent px-3.5 ${
          mobilePreview ? '' : 'md:hidden'
        } ${
          ['profile', 'transactions', 'monthly'].includes(activeTab) ? 'hidden' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => handleTabSwitch('profile')}
          aria-label="Open profile"
          className="flex min-w-0 items-center gap-2 border-0 bg-transparent py-1 text-left shadow-none focus-visible:outline-none"
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/90 bg-white shadow-sm">
            <img
              src={user?.photoDataUrl || sharebillsIcon}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          </span>
          <div className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight text-slate-900">
              Hi, <span className="font-extrabold text-slate-900">{user?.username || 'there'}</span>
            </span>
            <span className="block truncate text-sm font-semibold leading-tight text-blue-600">
              {new Date().getHours() < 12
                ? 'Good Morning'
                : new Date().getHours() < 18
                  ? 'Good Afternoon'
                  : 'Good Evening'}
            </span>
          </div>
        </button>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleActivityToggle}
            title="Activity notifications"
            aria-label="Activity notifications"
            aria-expanded={isActivityOpen}
            className={`relative flex h-10 w-10 items-center justify-center rounded-full border shadow-[0_2px_8px_rgba(15,23,42,0.12)] ring-1 transition-all active:scale-95 ${
              isActivityOpen
                ? 'border-blue-500 bg-blue-50 text-blue-600 ring-blue-200'
                : 'border-slate-300 bg-white text-slate-400 ring-slate-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            <Bell
              size={15}
              className={
                isActivityOpen
                  ? 'fill-blue-600/20 text-blue-600'
                  : unreadNotifications.length > 0
                    ? 'text-blue-600'
                    : 'text-slate-400'
              }
            />
            {unreadNotifications.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-extrabold leading-none text-white shadow-sm">
                {unreadNotifications.length > 99 ? '99+' : unreadNotifications.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* --- MAIN CONTENT AREA --- */}
      <main className={`relative z-10 min-w-0 flex-1 scrollbar-hide ${mobilePreview ? 'overflow-hidden pb-0' : 'overscroll-y-contain overflow-y-auto pb-24 md:order-2 md:pb-8'}`}>
        {(activeTab === 'groups' || activeTab === 'spaces' || activeTab === 'transactions') && (
          <div
            className={`mx-auto max-w-[1360px] ${mobilePreview ? 'p-3.5' : 'p-3.5 sm:p-5 md:px-6 md:pb-6 lg:px-8 lg:pb-8'} ${
              activeTab === 'spaces' || activeTab === 'transactions'
                ? mobilePreview ? '' : 'md:pt-0 lg:pt-0'
                : mobilePreview ? '' : 'md:pt-6 lg:pt-8'
            }`}
          >
            {/* ===================================================================== */}
            {/* NATIVE MOBILE APP DASHBOARD (< md)                                    */}
            {/* ===================================================================== */}
            <div
              className={`space-y-4 ${mobilePreview ? '' : 'md:hidden'} ${
                activeTab !== 'groups' ? 'hidden' : ''
              }`}
            >
              {/* 1. Native Wallet Hero Card */}
              <DashboardBalanceCard
                netBalance={groupMetrics.totalNetBalance}
                totalOwedToYou={groupMetrics.totalOwedToYou}
                totalYouOwe={groupMetrics.totalYouOwe}
                monthLabel={monthlySummary.monthLabel.split(' ')[0]}
                monthlyShare={monthlySummary.myShare}
                onAddBill={() => openQuickExpenseModal()}
                onMonthlyShareClick={() => handleTabSwitch('monthly')}
              />

              {/* 2. Native iOS Segmented Glass Control with Active / Archived Toggle */}
              <div className="liquid-glass grid grid-cols-3 gap-1 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => {
                    setSpaceFilter('active');
                    setMobileSection('spaces');
                  }}
                  aria-pressed={mobileSection === 'spaces' && spaceFilter === 'active'}
                  className={`flex h-8 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition-all duration-200 ${
                    mobileSection === 'spaces' && spaceFilter === 'active'
                      ? 'bg-gradient-to-b from-blue-600 to-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">Active</span>
                  <span>({activeGroups.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpaceFilter('archived');
                    setMobileSection('spaces');
                  }}
                  aria-pressed={mobileSection === 'spaces' && spaceFilter === 'archived'}
                  className={`flex h-8 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition-all duration-200 ${
                    mobileSection === 'spaces' && spaceFilter === 'archived'
                      ? 'bg-gradient-to-b from-blue-600 to-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">Archived</span>
                  <span>({archivedGroups.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileSection('dues')}
                  aria-pressed={mobileSection === 'dues'}
                  className={`flex h-8 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition-all duration-200 ${
                    mobileSection === 'dues'
                      ? 'bg-gradient-to-b from-blue-600 to-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">Dues</span>
                  <span>({groupMetrics.allMySettlements.length + groupMetrics.myUnpaidRents.length})</span>
                </button>
              </div>

              {/* 3A. Mobile Section: Spaces */}
              {mobileSection === 'spaces' && (
                <div className="flex flex-col gap-3.5">
                  {spaceFilter === 'active' && activeDisputes.length > 0 && (
                    <ActiveDisputesPanel
                      disputes={activeDisputes}
                      groups={myGroups}
                      onOpenDispute={(expense) => handleOpenGroup(expense.groupId, 'chat')}
                      carousel
                    />
                  )}
                  {visibleGroups.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      compact
                      title={
                        spaceFilter === 'archived'
                          ? 'No archived spaces'
                          : spaceFilter === 'pinned'
                            ? 'No pinned spaces'
                            : 'No spaces yet'
                      }
                      description={
                        spaceFilter === 'archived'
                          ? 'Archive spaces anytime to organize your dashboard.'
                          : spaceFilter === 'pinned'
                            ? 'Pin an active space to keep it close at hand.'
                            : 'Create a shared room or join an existing flat with a code.'
                      }
                    />
                  ) : (
                    <div className="flex flex-col gap-3.5">
                      {visibleGroups.map((group) => {
                        const metrics = groupMetrics.byGroup[group.id] || {
                          myNet: 0,
                          roomSpend: 0,
                          unreadCount: 0,
                        };
                        const unreadCount = unreadMessagesByGroup[group.id] || 0;
                        const isPinned = pinnedGroupIds.includes(group.id);
                        const isMuted = mutedGroupIds.includes(group.id);
                        const isArchived = archivedGroupIds.includes(group.id);

                        return (
                          <div key={group.id} className="block">
                            <SpaceLongPressActions
                              groupName={group.name}
                              isPinned={isPinned}
                              isArchived={isArchived}
                              onTogglePin={() => updateGroupPreference(group.id, 'pinnedGroupIds', !isPinned)}
                              onToggleArchive={() => {
                                updateGroupPreference(group.id, 'archivedGroupIds', !isArchived);
                                showToast?.(isArchived ? `Restored "${group.name}"` : `Archived "${group.name}"`);
                              }}
                            >
                              <div
                                onClick={() => handleOpenGroup(group.id)}
                                className="liquid-glass-interactive flex items-center justify-between gap-2.5 rounded-2xl px-3.5 py-3 cursor-pointer shadow-sm"
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-blue-600 to-blue-600 text-xs font-bold text-white shadow-sm">
                                    {group.imageDataUrl ? (
                                      <img
                                        src={group.imageDataUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      group.name.charAt(0).toUpperCase()
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <h3 className="truncate text-sm font-semibold text-slate-900">
                                        {group.name}
                                      </h3>
                                      {isPinned && (
                                        <Pin size={11} aria-label="Pinned" title="Pinned" className="flex-shrink-0 text-blue-600" />
                                      )}
                                      {groupMetrics.myUnpaidRents.some((rent) => rent.groupId === group.id) && (
                                        <button
                                          type="button"
                                          title="Rent is due · Open rent details"
                                          aria-label={`Rent is due in ${group.name}. Open rent details.`}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleOpenGroup(group.id, 'members');
                                          }}
                                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 transition-colors hover:bg-amber-200"
                                        >
                                          <CircleDollarSign size={15} />
                                        </button>
                                      )}
                                      {isMuted && (
                                        <BellOff size={10} className="flex-shrink-0 text-amber-500" />
                                      )}
                                      {isArchived && (
                                        <span className="rounded bg-slate-200 px-1 py-0.2 text-[9px] font-bold text-slate-600">
                                          Archived
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                      <span>{group.members.length} members</span>
                                      <span>·</span>
                                      <span>{formatCurrency(metrics.roomSpend, group.currency, 0)}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-shrink-0 items-center gap-1.5">
                                  {unreadCount > 0 && !isArchived && (
                                    <span className="flex h-5 min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold text-white leading-none">
                                      {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                  )}

                                  <span
                                    className={`rounded-xl px-2 py-0.5 font-mono text-[11px] font-semibold border ${
                                      metrics.myNet > 0.01
                                        ? 'bg-emerald-50/90 text-emerald-700 border-emerald-200/80'
                                        : metrics.myNet < -0.01
                                          ? 'bg-rose-50/90 text-rose-600 border-rose-200/80'
                                          : 'bg-slate-100/80 text-slate-600 border-slate-200/60'
                                    }`}
                                  >
                                    {metrics.myNet > 0.01
                                      ? `+${formatCurrency(metrics.myNet, group.currency, 0)}`
                                      : metrics.myNet < -0.01
                                        ? `-${formatCurrency(Math.abs(metrics.myNet), group.currency, 0)}`
                                        : 'Settled'}
                                  </span>
                                </div>
                              </div>
                            </SpaceLongPressActions>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 3B. Mobile Section: Dues */}
              {mobileSection === 'dues' && (
                <div className="flex flex-col gap-3">
                  {groupMetrics.allMySettlements.length === 0 && groupMetrics.myUnpaidRents.length === 0 ? (
                    <div className="liquid-glass rounded-2xl px-4 py-8 text-center">
                      <CheckCircle2 size={24} className="mx-auto mb-1.5 text-emerald-600" />
                      <p className="text-xs font-bold text-slate-900">All balances settled</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        No pending rent or dues across any of your spaces.
                      </p>
                    </div>
                  ) : (
                    <>
                    {groupMetrics.myUnpaidRents.slice(0, 5).map((rent) => (
                      <div
                        key={`mobile-rent-${rent.id}`}
                        onClick={() => handleOpenGroup(rent.groupId, 'members')}
                        className="liquid-glass-interactive flex cursor-pointer items-center justify-between gap-3 rounded-2xl p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {rent.groupName} · {new Date(`${rent.month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} rent
                          </p>
                          <p className="truncate text-[11px] text-slate-500">Unpaid rent share</p>
                        </div>
                        <span className="flex-shrink-0 font-mono text-xs font-extrabold text-amber-700">
                          {formatCurrency(rent.shares?.[user?.id], rent.currency)}
                        </span>
                      </div>
                    ))}
                    {groupMetrics.allMySettlements.slice(0, 5).map((item, idx) => {
                      const iOwe = item.from === user?.id;
                      const otherName = getUserName(iOwe ? item.to : item.from);
                      return (
                        <div
                          key={`${item.groupId}-${idx}`}
                          onClick={() => handleOpenGroup(item.groupId, 'balances')}
                          className="liquid-glass-interactive flex items-center justify-between gap-3 rounded-2xl p-3 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-900">
                              {iOwe ? `To pay ${otherName}` : `To receive from ${otherName}`}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">{item.groupName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono text-xs font-extrabold ${
                                iOwe ? 'text-rose-600' : 'text-emerald-600'
                              }`}
                            >
                              {iOwe ? '-' : '+'}{formatCurrency(
                                item.amount,
                                myGroups.find((group) => group.id === item.groupId)?.currency,
                                0
                              )}
                            </span>
                            <span className="rounded-xl bg-gradient-to-b from-blue-600 to-blue-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                              Settle
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    </>
                  )}
                </div>
              )}

            </div>

            {/* Mobile View: Render Transactions Tab */}
            {activeTab === 'transactions' && (
              <div className={mobilePreview ? '' : 'md:hidden'}>
                <TransactionsTab
                  transactions={recentTransactions}
                  groups={myGroups}
                  user={user}
                  users={users}
                  getUserName={getUserName}
                  onOpenGroup={handleOpenGroup}
                  ledgerFilter={ledgerFilter}
                  onLedgerFilterChange={setLedgerFilter}
                  onOpenExport={() => setTransactionExportOpen(true)}
                  onDeleteExpense={onDeleteExpense}
                  onRaiseExpenseDispute={onRaiseExpenseDispute}
                  onCancelExpenseDispute={onCancelExpenseDispute}
                  showToast={showToast}
                  mobilePreview={mobilePreview}
                  disputes={activeDisputes}
                  onOpenDispute={(expense) => handleOpenGroup(expense.groupId, 'chat')}
                />
              </div>
            )}

            {/* Mobile View: Render Spaces Tab */}
            {activeTab === 'spaces' && (
              <div className={mobilePreview ? '' : 'md:hidden'}>
                <DesktopSpacesTab
                  groups={visibleGroups}
                  activeCount={activeGroups.length}
                  pinnedCount={pinnedGroups.length}
                  archivedCount={archivedGroups.length}
                  spaceFilter={spaceFilter}
                  onSpaceFilterChange={setSpaceFilter}
                  groupMetrics={groupMetrics}
                  rentRecords={rentRecords}
                  unreadMessagesByGroup={unreadMessagesByGroup}
                  unreadChatByGroup={unreadChatByGroup}
                  users={users}
                  user={user}
                  pinnedGroupIds={pinnedGroupIds}
                  archivedGroupIds={archivedGroupIds}
                  mutedGroupIds={mutedGroupIds}
                  mobilePreview={mobilePreview}
                  onOpenGroup={handleOpenGroup}
                  onUpdateGroupPreference={updateGroupPreference}
                  onQuickAdd={openQuickExpenseModal}
                  onCopyInvite={handleCopyInvite}
                  copiedCodeId={copiedCodeId}
                />
              </div>
            )}

            {/* ===================================================================== */}
            {/* DESKTOP LIQUID GLASS COMMAND CENTER (md+)                             */}
            {/* ===================================================================== */}
            <div className={mobilePreview ? 'hidden space-y-6' : 'hidden md:block space-y-6'}>
              {/* 1. Desktop Top Command Bar with Activity on Top Right */}
              <div
                className={`liquid-glass relative flex flex-col gap-3 rounded-3xl p-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:px-5 ${
                  isNewMenuOpen ? 'z-[60]' : 'z-10'
                } ${
                  activeTab === 'groups' ? '' : 'hidden'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600">
                    <span>
                      {new Date().toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <h1 className="mt-0.5 truncate text-xl font-extrabold tracking-tight text-slate-900 xl:text-2xl">
                    {new Date().getHours() < 12
                      ? 'Good Morning'
                      : new Date().getHours() < 18
                        ? 'Good Afternoon'
                        : 'Good Evening'}
                    {user?.username ? `, ${user.username}` : ''}
                  </h1>
                </div>

                <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 lg:w-full xl:w-auto xl:flex-nowrap">
                  <div className="group relative w-56 min-w-[12rem] flex-1">
                    <span className="pointer-events-none absolute left-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 transition-colors group-focus-within:bg-emerald-100">
                      <Search size={14} strokeWidth={2.25} />
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search spaces..."
                      aria-label="Search spaces"
                      className="relative z-0 h-10 w-full rounded-full border border-emerald-700/70 bg-white/70 pl-11 pr-9 text-xs font-semibold text-slate-800 shadow-[0_4px_16px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all placeholder:text-slate-400 hover:border-emerald-700 hover:bg-white/90 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-700/10"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800"
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>

                  {myGroups.length > 0 && (
                    <button
                      type="button"
                      onClick={() => openQuickExpenseModal()}
                      className="inline-flex h-10 w-40 flex-shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-3 text-xs font-bold leading-none text-white shadow-sm shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-emerald-700 active:scale-95"
                    >
                      <Receipt size={15} strokeWidth={2.25} />
                      <span>Quick Expense</span>
                    </button>
                  )}

                  {(onJoinGroup || onCreateGroup) && (
                    <div className="relative flex-shrink-0" ref={newMenuRef}>
                      <button
                        type="button"
                        onClick={() => setIsNewMenuOpen((open) => !open)}
                        aria-haspopup="menu"
                        aria-expanded={isNewMenuOpen}
                        aria-controls="overview-new-menu"
                        className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-bold text-white shadow-sm shadow-blue-600/25 transition-colors active:scale-95 ${
                          isNewMenuOpen ? 'bg-blue-800' : 'bg-blue-700 hover:bg-blue-800'
                        }`}
                      >
                        <Plus size={15} strokeWidth={2.5} />
                        <span>New</span>
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${isNewMenuOpen ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {isNewMenuOpen && (
                        <div
                          id="overview-new-menu"
                          role="menu"
                          aria-label="Create or join a space"
                          className="absolute right-0 top-full z-[70] mt-2 w-56 origin-top-right rounded-2xl border border-white/80 bg-white/90 p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/5 backdrop-blur-2xl"
                        >
                          {onCreateGroup && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setIsNewMenuOpen(false);
                                onCreateGroup();
                              }}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:bg-blue-50 focus-visible:outline-none"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100/80 text-blue-600">
                                <Plus size={16} strokeWidth={2.5} />
                              </span>
                              <span>
                                <span className="block">Create a space</span>
                                <span className="mt-0.5 block text-[11px] font-medium text-slate-500">Start tracking expenses</span>
                              </span>
                            </button>
                          )}
                          {onJoinGroup && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setIsNewMenuOpen(false);
                                onJoinGroup();
                              }}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:bg-blue-50 focus-visible:outline-none"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                                <UserPlus size={16} />
                              </span>
                              <span>
                                <span className="block">Join with code</span>
                                <span className="mt-0.5 block text-[11px] font-medium text-slate-500">Enter an invite code</span>
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Desktop Top-Right Activity Popover Button */}
                  <button
                    type="button"
                    onClick={handleActivityToggle}
                    title="Activity & Notifications"
                    aria-label="Activity & Notifications"
                    className={`relative inline-flex h-9 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold shadow-sm transition-all active:scale-95 ${
                      isActivityOpen
                        ? 'border-blue-400 bg-blue-50 text-blue-600'
                        : 'border-slate-200/90 bg-white/90 text-slate-700 hover:bg-white hover:text-blue-600'
                    }`}
                  >
                    <Bell
                      size={14}
                      className={
                        isActivityOpen
                          ? 'fill-blue-600/20 text-blue-600'
                          : unreadNotifications.length > 0
                            ? 'text-blue-600'
                            : 'text-slate-500'
                      }
                    />
                    <span>Activity</span>
                    {unreadNotifications.length > 0 && (
                      <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-extrabold text-white leading-none shadow-sm">
                        {unreadNotifications.length > 99 ? '99+' : unreadNotifications.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* 2. Desktop overview summary cards */}
              <div
                className={`grid grid-cols-2 gap-4 lg:grid-cols-4 ${
                  activeTab === 'groups' ? '' : 'hidden'
                }`}
              >
                <div className="liquid-glass rounded-3xl p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Net Position</span>
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${
                        groupMetrics.totalNetBalance >= 0
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60'
                          : 'bg-rose-50 text-rose-600 border border-rose-200/60'
                      }`}
                    >
                      {groupMetrics.totalNetBalance >= 0 ? (
                        <ArrowDownLeft size={16} />
                      ) : (
                        <ArrowUpRight size={16} />
                      )}
                    </span>
                  </div>
                  <p
                    className={`mt-2 font-mono text-2xl font-extrabold tracking-tight ${
                      groupMetrics.totalNetBalance > 0.01
                        ? 'text-emerald-600'
                        : groupMetrics.totalNetBalance < -0.01
                          ? 'text-rose-600'
                          : 'text-slate-900'
                    }`}
                  >
                    {groupMetrics.totalNetBalance > 0.01
                      ? `+₹${groupMetrics.totalNetBalance.toFixed(2)}`
                      : groupMetrics.totalNetBalance < -0.01
                        ? `-₹${Math.abs(groupMetrics.totalNetBalance).toFixed(2)}`
                        : '₹0.00'}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <span className="text-emerald-600">
                      +₹{groupMetrics.totalOwedToYou.toFixed(0)} to receive
                    </span>
                    <span>·</span>
                    <span className="text-rose-600">
                      -₹{groupMetrics.totalYouOwe.toFixed(0)} to pay
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleTabSwitch('monthly')}
                  className="liquid-glass-interactive w-full cursor-pointer rounded-3xl p-5 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">
                      {monthlySummary.monthLabel} Share
                    </span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                      <PieChart size={16} />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-slate-900">
                    {formatCurrency(monthlySummary.myShare, 'INR')}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">
                    Your share across {monthlySummary.billCount} bill{monthlySummary.billCount === 1 ? '' : 's'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLedgerFilter('mine');
                    handleTabSwitch('transactions');
                  }}
                  className="liquid-glass-interactive w-full cursor-pointer rounded-3xl p-5 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">You Paid Out</span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                      <Wallet size={16} />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-slate-900">
                    ₹{monthlySummary.iPaid.toFixed(2)}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">
                    {activeGroups.length} active space{activeGroups.length === 1 ? '' : 's'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabSwitch('transactions')}
                  className="liquid-glass-interactive w-full cursor-pointer rounded-3xl p-5 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Bills This Month</span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-700">
                      <Receipt size={16} />
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-slate-900">
                    {monthlySummary.billCount}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">
                    Across {activeGroups.length} active space{activeGroups.length === 1 ? '' : 's'}
                  </p>
                </button>

              </div>

              {/* 3. Main 12-Column Desktop Bento Grid */}
              <div className={`grid grid-cols-12 items-stretch gap-6 ${
                activeTab === 'groups' && !mobilePreview ? 'xl:h-[min(70vh,720px)]' : ''
              }`}>
                {/* LEFT 8 COLUMNS: Recent Ledger (and Spaces Tab on Desktop) */}
                <div
                  className={
                    activeTab === 'spaces' || activeTab === 'transactions'
                      ? 'col-span-12'
                      : 'col-span-12 flex flex-col space-y-6 xl:col-span-8 xl:min-h-0'
                  }
                >
                  {activeTab === 'spaces' && (
                    <DesktopSpacesTab
                      groups={visibleGroups}
                      activeCount={activeGroups.length}
                      pinnedCount={pinnedGroups.length}
                      archivedCount={archivedGroups.length}
                      spaceFilter={spaceFilter}
                      onSpaceFilterChange={setSpaceFilter}
                      groupMetrics={groupMetrics}
                      rentRecords={rentRecords}
                      unreadMessagesByGroup={unreadMessagesByGroup}
                      unreadChatByGroup={unreadChatByGroup}
                      showUnreadIndicators
                      users={users}
                      user={user}
                      pinnedGroupIds={pinnedGroupIds}
                      archivedGroupIds={archivedGroupIds}
                      mutedGroupIds={mutedGroupIds}
                      mobilePreview={mobilePreview}
                      onOpenGroup={handleOpenGroup}
                      onUpdateGroupPreference={updateGroupPreference}
                      onQuickAdd={openQuickExpenseModal}
                      onCopyInvite={handleCopyInvite}
                      copiedCodeId={copiedCodeId}
                    />
                  )}

                  {/* RECENT TRANSACTIONS LEDGER PANEL */}
                  <section
                    className={`rounded-3xl backdrop-blur-md ${
                      activeTab === 'groups' ? 'liquid-glass p-5' : ''
                    } ${
                      activeTab === 'groups' || activeTab === 'transactions' ? '' : 'hidden'
                    } ${
                      activeTab === 'groups' && !mobilePreview
                          ? 'xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-hidden'
                          : ''
                    }`}
                  >
                    {activeTab !== 'transactions' && <>
                    <div className={`mb-4 flex flex-wrap items-center justify-between gap-2.5 ${
                      activeTab === 'transactions' ? '' : 'border-b border-slate-200/60 pb-3.5'
                    }`}>
                      {activeTab === 'transactions' ? (
                        <>
                          <div className="page-heading flex min-w-0 items-center gap-2.5 rounded-full p-0 pr-4">
                            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-tr from-blue-600 to-blue-600 text-xs font-bold text-white shadow-sm">
                              {user?.photoDataUrl ? (
                                <img src={user.photoDataUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                (user?.username || 'U').charAt(0).toUpperCase()
                              )}
                            </span>
                            <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-900">
                              Transactions
                            </h1>
                          </div>
                          <div className="flex items-center gap-2">
                          <div className={`page-heading-controls hidden items-center gap-0.5 rounded-full p-1 ${mobilePreview ? '' : 'md:flex'}`}>
                            {[
                              { id: 'all', label: 'All' },
                              { id: 'mine', label: 'Paid by Me' },
                              { id: 'settlements', label: 'Settlements' },
                              { id: 'dues', label: 'Rent & Dues' },
                            ].map((filter) => (
                              <button
                                key={filter.id}
                                type="button"
                                onClick={() => setLedgerFilter(filter.id)}
                                aria-pressed={ledgerFilter === filter.id}
                                className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                                  ledgerFilter === filter.id
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                {filter.label}
                              </button>
                            ))}
                          </div>
                          <label className={`page-heading-controls relative flex h-10 flex-shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold text-slate-700 ${mobilePreview ? '' : 'md:hidden'}`}>
                            <span className="pointer-events-none">{ledgerFilter === 'mine' ? 'Paid by Me' : ledgerFilter === 'settlements' ? 'Settlements' : ledgerFilter === 'dues' ? 'Rent & Dues' : 'All'}</span>
                            <ChevronDown size={14} className="pointer-events-none text-slate-400" />
                            <select
                              aria-label="Filter transactions"
                              value={ledgerFilter}
                              onChange={(event) => setLedgerFilter(event.target.value)}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            >
                              <option value="all">All</option>
                              <option value="mine">Paid by Me</option>
                              <option value="settlements">Settlements</option>
                              <option value="dues">Rent &amp; Dues</option>
                            </select>
                          </label>
                          <button type="button" onClick={() => setTransactionExportOpen(true)} aria-label="Export transactions" title="Export transactions" className="page-heading-controls flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-blue-600">
                            <FileDown size={16} />
                          </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <h2 className="text-base font-extrabold tracking-tight text-slate-900">
                              Recent Ledger Activity
                            </h2>
                            <p className="text-xs text-slate-500">
                              Bills, rent, and settlements across your spaces
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {activeTab === 'groups' && (
                              <button
                                type="button"
                                onClick={() => handleTabSwitch('transactions')}
                                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50"
                              >
                                See all activity
                                <span aria-hidden="true"> →</span>
                              </button>
                            )}
                            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-slate-200/60 p-1">
                              {[
                                { id: 'all', label: 'All' },
                                { id: 'mine', label: 'Paid by Me' },
                                { id: 'settlements', label: 'Settlements' },
                                { id: 'dues', label: 'Rent & Dues' },
                              ].map((tab) => (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => setLedgerFilter(tab.id)}
                                  className={`rounded-xl px-3 py-1 text-xs font-semibold transition-all ${
                                    ledgerFilter === tab.id
                                      ? 'bg-white text-blue-600 shadow-sm'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div
                      ref={overviewLedgerBodyRef}
                      className={activeTab === 'groups' && !mobilePreview ? 'xl:min-h-0 xl:flex-1 xl:overflow-hidden' : ''}
                    >
                    {ledgerFilter === 'dues' ? (
                      <RentSettlementsTab
                        rents={groupMetrics.myUnpaidRents}
                        settlements={[]}
                        disputes={[]}
                        groups={myGroups}
                        user={user}
                        getUserName={getUserName}
                        onOpenGroup={handleOpenGroup}
                        preview
                        showSettlements={false}
                        showDisputes={false}
                        maxRents={Math.max(0, Math.floor((overviewLedgerBodyHeight - 96) / 68))}
                      />
                    ) : recentTransactions.length === 0 ? (
                      activeTab === 'groups' && !mobilePreview ? (
                        <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200/80 bg-gradient-to-br from-blue-50/70 via-white/80 to-emerald-50/60 px-6 py-8 text-center">
                          <div className="relative mb-4 flex h-28 w-36 items-center justify-center">
                            <span className="absolute left-3 top-5 h-16 w-12 rotate-[-14deg] rounded-xl border border-emerald-100 bg-emerald-50 shadow-sm" />
                            <span className="absolute right-3 top-3 h-16 w-12 rotate-[12deg] rounded-xl border border-blue-100 bg-blue-50 shadow-sm" />
                            <span className="relative flex h-20 w-16 rotate-[-3deg] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-blue-600 shadow-md">
                              <Receipt size={26} strokeWidth={1.7} />
                              <span className="mt-2 h-1 w-7 rounded-full bg-blue-100" />
                              <span className="mt-1 h-1 w-5 rounded-full bg-slate-100" />
                            </span>
                            <span className="absolute bottom-1 right-5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-emerald-100 text-emerald-700 shadow-sm">
                              <Plus size={16} />
                            </span>
                            <span className="absolute left-5 top-1 h-2 w-2 rounded-full bg-amber-300" />
                            <span className="absolute bottom-4 left-2 h-1.5 w-1.5 rounded-full bg-blue-300" />
                          </div>
                          <h3 className="text-sm font-extrabold text-slate-900">Your transactions will show here</h3>
                          <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
                            Shared bills and payments will appear here as soon as your group adds them.
                          </p>
                          <button
                            type="button"
                            onClick={openQuickExpenseModal}
                            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
                          >
                            <Plus size={14} />
                            Add your first bill
                          </button>
                        </div>
                      ) : (
                        <EmptyState
                          icon={Receipt}
                          title="No transactions yet"
                          description="Bills and payments will appear here when your group records them."
                        />
                      )
                    ) : (
                      <div className={`flex flex-col gap-2 ${activeTab === 'groups' && !mobilePreview ? 'h-full overflow-hidden' : ''}`}>
                        {(activeTab === 'groups' && !mobilePreview
                          ? recentTransactions.slice(0, Math.max(1, Math.floor((overviewLedgerBodyHeight + 8) / 96)))
                          : activeTab === 'groups'
                            ? recentTransactions.slice(0, 4)
                            : recentTransactions
                        ).map((exp) => {
                          const grp = myGroups.find((g) => g.id === exp.groupId);
                          const iPaid = exp.paidBy === user?.id;
                          const myShare = parseFloat(exp.splits?.[user?.id]) || 0;
                          const total = parseFloat(exp.totalAmount) || 0;
                          const myImpact = iPaid ? total - myShare : -myShare;
                          const splitNames = Object.entries(exp.splits || {})
                            .filter(([, amount]) => parseFloat(amount) > 0)
                            .map(([memberId]) => (
                              users.find((member) => member.id === memberId)?.username ||
                              (memberId === user?.id ? user?.username : getUserName(memberId)) ||
                              'Roommate'
                            ));

                          return (
                            <ExpenseLongPressActions
                              key={exp.id}
                              expenseTitle={exp.title}
                              canDelete={!exp.activeDisputeId && (exp.createdBy === user?.id || exp.paidBy === user?.id)}
                              canDispute={Boolean(
                                grp
                                && grp.members?.includes(user?.id)
                                && !exp.isSettlement
                                && exp.category !== 'Settlement'
                                && !exp.activeDisputeId
                              )}
                              hasActiveDispute={Boolean(exp.activeDisputeId)}
                              canCancelDispute={Boolean(
                                exp.activeDisputeId
                                && exp.activeDisputeBy === user?.id
                              )}
                              onDelete={() => onDeleteExpense?.(exp.id)}
                              onRaiseDispute={(message) => onRaiseExpenseDispute?.(exp, message)}
                              onCancelDispute={() => onCancelExpenseDispute?.(exp)}
                              onViewDispute={() => handleOpenGroup(exp.groupId, 'chat')}
                              showToast={showToast}
                            >
                            <div
                              onClick={() => handleOpenGroup(exp.groupId, 'expenses')}
                              className={`flex items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-3 hover:bg-white/95 transition-all cursor-pointer ${
                                activeTab === 'groups' && !mobilePreview ? 'xl:h-[88px] xl:overflow-hidden' : ''
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                                  <Receipt size={16} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-sm font-bold text-slate-900">
                                      {exp.title}
                                    </p>
                                    <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                      {grp?.name || 'Room'}
                                    </span>
                                    {exp.activeDisputeId && (
                                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                        <AlertTriangle size={11} />
                                        Dispute open
                                      </span>
                                    )}
                                    {exp.wasEdited && (
                                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                        Edited
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    <span className="font-semibold text-slate-700">
                                      {iPaid ? 'You' : getUserName(exp.paidBy)}
                                    </span>{' '}
                                    paid {formatCurrency(total, grp?.currency)} via {exp.paymentMethod || 'UPI'} ·{' '}
                                    {exp.date}
                                  </p>
                                  <p className="mt-0.5 max-w-[min(65vw,28rem)] truncate text-[11px] text-slate-500">
                                    <span className="font-semibold text-slate-600">Split: </span>
                                    {splitNames.join(', ')}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-shrink-0 items-center gap-3 text-right">
                                <div>
                                  <span
                                    className={`block font-mono text-xs font-extrabold ${
                                      myImpact > 0.01
                                        ? 'text-emerald-600'
                                        : myImpact < -0.01
                                          ? 'text-rose-600'
                                          : 'text-slate-500'
                                    }`}
                                  >
                                    {myImpact > 0.01
                                      ? `+${formatCurrency(myImpact, grp?.currency)}`
                                      : myImpact < -0.01
                                        ? `-${formatCurrency(Math.abs(myImpact), grp?.currency)}`
                                        : formatCurrency(total, grp?.currency)}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {myImpact > 0.01
                                      ? 'you lent'
                                      : myImpact < -0.01
                                        ? 'your share'
                                        : 'settled'}
                                  </span>
                                </div>
                                <ChevronRight size={15} className="text-slate-300" />
                              </div>
                            </div>
                            </ExpenseLongPressActions>
                          );
                        })}
                        {activeTab === 'groups'
                          && !mobilePreview
                          && recentTransactions.length <= Math.floor((overviewLedgerBodyHeight + 8) / 96)
                          && recentTransactions.length <= 3 && (
                            <div className="flex min-h-[120px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/80 bg-gradient-to-br from-slate-50/80 to-blue-50/40 px-5 py-4 text-center">
                              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl border border-white bg-white/90 text-blue-600 shadow-sm">
                                <CircleDollarSign size={22} />
                              </div>
                              <p className="text-xs font-bold text-slate-700">You&apos;re all caught up</p>
                              <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-slate-500">
                                New shared activity will appear here. Add a bill whenever your group splits a cost.
                              </p>
                              <button
                                type="button"
                                onClick={openQuickExpenseModal}
                                className="mt-2 rounded-lg px-2.5 py-1 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100/70"
                              >
                                Add a bill
                              </button>
                            </div>
                          )}
                      </div>
                    )}
                    </div>
                    </>}
                    <div className={activeTab === 'transactions' && !mobilePreview ? 'hidden md:block' : 'hidden'}>
                      <TransactionsTab
                        transactions={recentTransactions}
                        groups={myGroups}
                        user={user}
                        users={users}
                        getUserName={getUserName}
                        ledgerFilter={ledgerFilter}
                        onLedgerFilterChange={setLedgerFilter}
                        onOpenExport={() => setTransactionExportOpen(true)}
                        onDeleteExpense={onDeleteExpense}
                        onRaiseExpenseDispute={onRaiseExpenseDispute}
                        onCancelExpenseDispute={onCancelExpenseDispute}
                        showToast={showToast}
                        rents={groupMetrics.myUnpaidRents}
                        settlements={groupMetrics.allMySettlements}
                        disputes={activeDisputes}
                        onOpenGroup={handleOpenGroup}
                        onOpenDispute={(expense) => handleOpenGroup(expense.groupId, 'chat')}
                      />
                    </div>
                  </section>
                </div>

                {/* RIGHT 4 COLUMNS: Pinned Spaces + Live Settlements */}
                <div
                  className={`col-span-12 flex flex-col space-y-6 xl:col-span-4 ${
                    activeTab === 'groups' ? '' : 'hidden'
                  } ${
                    activeTab === 'groups' && !mobilePreview
                      ? 'xl:h-full xl:min-h-0'
                      : ''
                  }`}
                >
                  <section className="liquid-glass flex-shrink-0 rounded-3xl p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900">
                          {monthlySummary.monthLabel} share
                        </h3>
                        <p className="mt-1 text-[11px] text-slate-500">Your monthly spending by category</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTabSwitch('monthly')}
                        className="text-[11px] font-bold text-blue-600 hover:underline"
                      >
                        Analytics
                      </button>
                    </div>
                    {monthlySummary.myShare > 0 ? (
                      <div className="flex items-center justify-center gap-5">
                        <div
                          className="chart-donut-rotate relative h-32 w-32 flex-shrink-0 rounded-full"
                          style={{
                            background: `conic-gradient(${(() => {
                              const colors = ['#203b27', '#a5e8b3', '#5a9f58', '#7b9585', '#cbd5e1'];
                              let start = 0;
                              return monthlySummary.categories.map((category, index) => {
                                const end = start + (category.amount / monthlySummary.myShare) * 100;
                                const segment = `${colors[index % colors.length]} ${start}% ${end}%`;
                                start = end;
                                return segment;
                              }).join(', ') || '#e2e8f0 0% 100%';
                            })()})`,
                          }}
                          role="img"
                          aria-label={`Monthly share ${formatCurrency(monthlySummary.myShare)}. ${monthlySummary.categories.map((category) => `${category.name} ${category.pct}%`).join(', ')}`}
                        >
                          <div className="absolute inset-[19%] flex flex-col items-center justify-center rounded-full bg-white text-center">
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Your share</span>
                            <span className="mt-0.5 max-w-full truncate px-1 font-mono text-sm font-extrabold text-slate-900">
                              {formatCurrency(monthlySummary.myShare, 'INR', 0)}
                            </span>
                          </div>
                        </div>
                        <ul className="min-w-0 space-y-2">
                          {monthlySummary.categories.slice(0, 4).map((category, index) => {
                            const colors = ['#203b27', '#a5e8b3', '#5a9f58', '#7b9585'];
                            return (
                              <li key={category.name} className="flex min-w-0 items-center gap-2 text-[10px]">
                                <span className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: colors[index] }} />
                                <span className="min-w-0 flex-1 truncate text-slate-600">{category.name}</span>
                                <span className="font-semibold text-slate-800">{category.pct}%</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleTabSwitch('monthly')}
                        className="flex w-full flex-col items-center justify-center rounded-2xl bg-white/40 px-3 py-4 text-xs text-slate-500 transition-colors hover:bg-white/70"
                      >
                        <div
                          className="relative mb-2 flex h-24 w-24 items-center justify-center rounded-full"
                          style={{
                            background: 'conic-gradient(#dbeafe 0deg 90deg, #e2e8f0 90deg 270deg, #d1fae5 270deg 360deg)',
                          }}
                          role="img"
                          aria-label="No monthly spending data yet"
                        >
                          <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full bg-white text-center">
                            <PieChart size={17} className="text-slate-300" />
                            <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">No spend</span>
                          </div>
                          <span className="absolute -right-1 top-2 h-3 w-3 rounded-full border-2 border-white bg-blue-300" />
                          <span className="absolute -bottom-0.5 left-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-300" />
                        </div>
                        <span className="font-bold text-slate-700">Your monthly share starts here</span>
                        <span className="mt-0.5 text-[10px] text-slate-500">Add a bill to see your spending breakdown.</span>
                      </button>
                    )}
                  </section>

                  {/* PINNED SPACES WIDGET (Desktop Right Column) */}
                  <section className="liquid-glass flex min-w-0 flex-col overflow-hidden rounded-3xl p-5 xl:min-h-0 xl:flex-1">
                    <div className="mb-3.5 flex items-center justify-between border-b border-slate-200/60 pb-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900">
                          Pinned Spaces
                        </h3>
                        <p className="text-[11px] text-slate-500">Quick access to your rooms</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {totalUnreadSpacesCount > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
                            {totalUnreadSpacesCount > 99 ? '99+' : totalUnreadSpacesCount} unread
                          </span>
                        )}
                        <span className="rounded-lg bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-blue-700">
                          {pinnedGroups.length}
                        </span>
                      </div>
                    </div>

                    {pinnedGroups.length === 0 ? (
                      <EmptyState
                        icon={Pin}
                        compact
                        title="No pinned spaces"
                        description="Pin a space from the directory for quick access."
                        className="min-h-0 flex-1 overflow-hidden px-3"
                      />
                    ) : (
                      <div
                        className="grid grid-cols-1 gap-2.5 overflow-hidden rounded-2xl xl:min-h-0 xl:flex-1 xl:pr-1"
                      >
                        {pinnedGroups.map((group) => {
                          const unreadCount = unreadMessagesByGroup[group.id] || 0;

                          return (
                            <div
                              key={group.id}
                              onClick={() => handleOpenGroup(group.id)}
                              className="liquid-glass-interactive group flex items-center justify-between gap-3 rounded-2xl cursor-pointer px-3.5 py-3 shadow-sm"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-blue-600 to-blue-600 text-sm font-extrabold text-white shadow-sm">
                                  {group.imageDataUrl ? (
                                    <img
                                      src={group.imageDataUrl}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    group.name.charAt(0).toUpperCase()
                                  )}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                                      {group.name}
                                    </h3>
                                    {unreadCount > 0 && (
                                      <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-extrabold text-white leading-none">
                                        {unreadCount > 99 ? '99+' : unreadCount} new
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenGroup(group.id, 'chat');
                                }}
                                title="Open group chat"
                                className={`relative flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                                  unreadCount > 0
                                    ? 'bg-rose-50 text-rose-600'
                                    : 'text-slate-400 hover:bg-white hover:text-blue-600'
                                }`}
                              >
                                <MessageSquare size={16} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {activeDisputes.length > 0 && (
                    <section className="liquid-glass flex-shrink-0 rounded-3xl p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-900">Active disputes</h3>
                          <p className="text-[11px] text-slate-500">Swipe to browse · tap to open chat</p>
                        </div>
                        <span className="rounded-lg bg-amber-50 px-2 py-0.5 font-mono text-xs font-bold text-amber-800">
                          {activeDisputes.length}
                        </span>
                      </div>
                      <ActiveDisputesPanel
                        disputes={activeDisputes}
                        groups={myGroups}
                        onOpenDispute={(expense) => handleOpenGroup(expense.groupId, 'chat')}
                        carousel
                        compact
                      />
                    </section>
                  )}

                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* OTHER TABS                     */}
        {/* ============================== */}
        {activeTab !== 'groups' &&
          activeTab !== 'spaces' &&
          activeTab !== 'transactions' && (
            <div className="h-full">
              {activeTab === 'monthly' && (
                <MonthlyAnalyticsTab
                  user={user}
                  expenses={expenses}
                  groups={groups}
                  rentRecords={rentRecords}
                  mobilePreview={mobilePreview}
                />
              )}
              {activeTab === 'profile' && (
                <ProfileTabView
                  key={[user?.id, user?.username, user?.email, user?.upiId, user?.photoDataUrl].join(':')}
                  user={user}
                  onUpdateUser={onUpdateUser}
                  onLogout={() => setShowLogoutConfirmation(true)}
                  theme={theme}
                  onThemeChange={onThemeChange}
                  showToast={showToast}
                  mobilePreview={mobilePreview}
                />
              )}
            </div>
          )}
      </main>

      {/* --- NOTIFICATION CENTER / ACTIVITY RIGHT POPUP FLYOUT DRAWER (Full Width on Mobile) --- */}
      {isActivityOpen && (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-slate-900/30 backdrop-blur-sm transition-opacity"
          onClick={() => setIsActivityOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full sm:max-w-md flex-col border-l border-white/80 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl transition-transform animate-in slide-in-from-right"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <Bell size={18} />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                    Activity & Alerts
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    {userNotifications.length} notification{userNotifications.length === 1 ? '' : 's'}
                    {unreadNotifications.length > 0 && ` · ${unreadNotifications.length} unread`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedActivityIds.size > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActivityDeleteIds([...selectedActivityIds])}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors shadow-sm"
                    >
                      <Trash2 size={12} />
                      <span>Delete ({selectedActivityIds.size})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedActivityIds(new Set())}
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : userNotifications.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllActivity}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors shadow-sm"
                  >
                    <Trash2 size={12} />
                    <span>Clear all</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsActivityOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Notification Stream */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2.5 scrollbar-hide">
              {userNotifications.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 shadow-sm shadow-blue-900/10">
                    <CheckCircle2 size={26} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">You're all caught up!</h3>
                  <p className="mt-1 max-w-[220px] text-xs text-slate-500">
                    No new activity or dues notifications right now.
                  </p>
                </div>
              ) : (
                userNotifications.map((n) => {
                  const grp = myGroups.find((g) => g.id === n.groupId);
                  const isDispute = /dispute/i.test(n.type || n.category || '');
                  const isChat = /chat|message|dispute/i.test(n.type || n.category || '');
                  const isSelected = selectedActivityIds.has(n.id);
                  const isRent = /rent/i.test(n.type || n.category || '');
                  const isUnread = !n.read && !optimisticallyReadNotificationIds.has(n.id);
                  return (
                    <div
                      key={n.id}
                      onTouchStart={(event) => startActivityLongPress(event, n)}
                      onTouchEnd={stopActivityLongPress}
                      onTouchCancel={stopActivityLongPress}
                      onMouseDown={(event) => startActivityLongPress(event, n)}
                      onMouseUp={stopActivityLongPress}
                      onMouseLeave={stopActivityLongPress}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        stopActivityLongPress();
                        activityLongPressRef.current = true;
                        setActivityContextNotification(n);
                      }}
                      onClick={() => {
                        if (activityLongPressRef.current) {
                          activityLongPressRef.current = false;
                          return;
                        }
                        if (selectedActivityIds.size > 0) {
                          toggleActivitySelection(n.id);
                          return;
                        }
                        if (isUnread) {
                          markActivityNotificationsRead([n.id]);
                        }
                        if (n.groupId) {
                          handleOpenGroup(n.groupId, isChat ? 'chat' : 'expenses');
                          setIsActivityOpen(false);
                        }
                      }}
                      className={`liquid-glass-interactive group relative flex items-start justify-between gap-3 rounded-2xl p-3 cursor-pointer border ${
                        isSelected
                          ? 'border-blue-400 bg-blue-50/70 ring-1 ring-blue-300'
                          : isUnread
                            ? 'border-blue-200/90 bg-blue-50/40'
                            : 'border-slate-200/60 bg-white/80'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border shadow-sm ${
                          isSelected
                            ? 'border-blue-700 bg-blue-600 text-white shadow-blue-900/20'
                            : isChat
                              ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-blue-900/10'
                              : isRent
                                ? 'border-amber-200 bg-amber-50 text-amber-700 shadow-amber-900/10'
                                : isDispute
                                  ? 'border-rose-200 bg-rose-50 text-rose-700 shadow-rose-900/10'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-emerald-900/10'
                        }`}>
                          {isSelected ? <Check size={14} /> : isDispute ? <AlertTriangle size={13} /> : isChat ? <MessageSquare size={13} /> : isRent ? <Home size={13} /> : <Receipt size={13} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 leading-snug">
                            {n.message || 'New activity in your space'}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                            {grp && <span className="font-semibold text-blue-600">{grp.name}</span>}
                            {grp && <span>·</span>}
                            <span>
                              {n.createdAt
                                ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : 'Just now'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isUnread && (
                        <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-600 ring-2 ring-white" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {activityContextNotification && (
              <div
                className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/35 p-3 backdrop-blur-sm sm:items-center"
                onClick={() => {
                  setActivityContextNotification(null);
                  activityLongPressRef.current = false;
                }}
              >
                <div
                  className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/80 bg-white/95 p-2 shadow-2xl backdrop-blur-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <p className="line-clamp-2 px-3 py-2 text-xs font-medium text-slate-500">
                    {activityContextNotification.message || 'Activity'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedActivityIds((previous) => new Set([
                        ...previous,
                        activityContextNotification.id,
                      ]));
                      setActivityContextNotification(null);
                      activityLongPressRef.current = false;
                    }}
                    className="flex w-full items-center justify-between border-t border-slate-100 px-3 py-3 text-sm font-semibold text-slate-800"
                  >
                    <span>Select</span>
                    <Check size={16} className="text-slate-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActivityDeleteIds([activityContextNotification.id]);
                      setActivityContextNotification(null);
                      activityLongPressRef.current = false;
                    }}
                    className="flex w-full items-center justify-between border-t border-slate-100 px-3 py-3 text-sm font-semibold text-rose-600"
                  >
                    <span>Delete…</span>
                    <Trash2 size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActivityContextNotification(null);
                      activityLongPressRef.current = false;
                    }}
                    className="mt-1 w-full rounded-2xl bg-slate-100 px-3 py-3 text-sm font-bold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {activityDeleteIds && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
                <div className="w-full max-w-xs rounded-3xl border border-white/80 bg-white/95 p-5 text-center shadow-2xl backdrop-blur-2xl">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Delete {activityDeleteIds.length === 1 ? 'this activity' : `${activityDeleteIds.length} activities`}?
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">This only removes the selected activity from your feed.</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActivityDeleteIds(null)}
                      disabled={isDeletingActivity}
                      className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmActivityDeletion}
                      disabled={isDeletingActivity}
                      className="flex-1 rounded-xl bg-rose-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {isDeletingActivity ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- QUICK EXPENSE MODAL --- */}
      {quickExpenseOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md"
          onClick={() => !savingQuick && setQuickExpenseOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/80 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl sm:p-6"
          >
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3.5">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Quick Log Expense</h3>
                <p className="text-xs text-slate-500">
                  Split equally across all members of the selected space
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickExpenseOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveQuickExpense} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Space</label>
                <select
                  value={quickGroupId}
                  onChange={(e) => setQuickGroupId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200/90 bg-white/80 px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  {myGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.members?.length || 1} members)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Total Amount ({getCurrencySymbol(myGroups.find((group) => group.id === quickGroupId)?.currency)})
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-blue-600">
                      {getCurrencySymbol(myGroups.find((group) => group.id === quickGroupId)?.currency)}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="0.00"
                      value={quickAmount}
                      onChange={(e) => setQuickAmount(e.target.value)}
                      required
                      className="w-full rounded-2xl border border-slate-200/90 bg-white/80 py-2.5 pl-8 pr-3 font-mono text-sm font-extrabold text-slate-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Category</label>
                  <select
                    value={quickCategory}
                    onChange={(e) => setQuickCategory(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200/90 bg-white/80 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Groceries, Electricity, Dinner"
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    required
                    className="w-full rounded-2xl border border-slate-200/90 bg-white/80 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">Method</label>
                  <select
                    value={quickMethod}
                    onChange={(e) => setQuickMethod(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200/90 bg-white/80 px-2.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const gId = quickGroupId;
                    setQuickExpenseOpen(false);
                    if (gId) {
                      handleOpenGroup(gId, 'add', {
                        title: quickTitle,
                        amount: quickAmount,
                        category: quickCategory,
                        paymentMethod: quickMethod,
                      });
                    }
                  }}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Custom split →
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickExpenseOpen(false)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingQuick}
                    className="rounded-2xl bg-gradient-to-b from-blue-600 to-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/25 disabled:opacity-50"
                  >
                    {savingQuick ? (
                      <span className="inline-flex items-center gap-1.5">
                        <LoaderCircle size={14} className="animate-spin" />
                        Please wait…
                      </span>
                    ) : 'Save Bill'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- LIQUID GLASS NAVIGATION (Mobile Floating Dock + Desktop Left Sidebar) --- */}
      <PrimaryNav
        activeItem={activeTab}
        mobilePreview={mobilePreview}
        onNavigate={handleTabSwitch}
        onQuickAction={() => openQuickExpenseModal()}
        onCreateGroup={onCreateGroup}
        onJoinGroup={onJoinGroup}
        unreadSpacesCount={totalUnreadSpacesCount}
        onLogout={() => setShowLogoutConfirmation(true)}
        onInstallApp={handleInstallClick}
        isAppInstalled={isAppInstalled}
        user={user}
      />

      {transactionExportOpen && (
        <TransactionExportModal
          transactions={exportTransactions}
          groups={myGroups}
          users={users}
          user={user}
          getUserName={getUserName}
          onClose={() => setTransactionExportOpen(false)}
        />
      )}

      {dailyRentReminderRecords.length > 0 &&
        createPortal(
          <div
            className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md"
            onClick={() => setDailyRentReminderRecords([])}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="daily-rent-reminder-title"
              className="app-modal-surface max-h-[min(88dvh,42rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/80 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <Home size={19} />
                  </span>
                  <div>
                    <h2 id="daily-rent-reminder-title" className="text-base font-bold text-slate-900">
                      Rent payment reminder
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">Your unpaid shares for today</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDailyRentReminderRecords([])}
                  aria-label="Dismiss rent reminders for today"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X size={17} />
                </button>
              </header>
              <div className="space-y-3">
                {dailyRentReminderRecords.map((rent) => {
                  const group = myGroups.find((item) => item.id === rent.groupId);
                  const monthLabel = new Date(`${rent.month}-01T00:00:00`).toLocaleDateString(
                    'en-US',
                    { month: 'long', year: 'numeric' }
                  );
                  const share = Number(rent.shares?.[user.id]) || 0;

                  return (
                    <article key={rent.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {group?.name || 'Shared space'} · {monthLabel}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">Your rent share</p>
                        </div>
                        <span className="flex-shrink-0 font-mono text-sm font-bold text-slate-900">
                          {formatCurrency(share, rent.currency)}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await onMarkRentPaid?.(rent.id, user.id);
                              setDailyRentReminderRecords((previous) => previous.filter((item) => item.id !== rent.id));
                              showToast?.('Your rent share was marked as paid.');
                            } catch (error) {
                              showToast?.(error.message || 'Could not update rent payment.', 'error');
                            }
                          }}
                          className="h-9 rounded-lg bg-emerald-600 px-2 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          Mark paid
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDailyRentReminderRecords([]);
                            onOpenGroup?.(rent.groupId, 'members');
                          }}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          View rent
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setDailyRentReminderRecords([])}
                className="mt-4 h-10 w-full rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                Remind me tomorrow
              </button>
            </section>
          </div>,
          document.body
        )}

      {installDialogOpen && !isAppInstalled && (
        <div
          className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-md sm:items-center sm:p-4"
          onClick={() => setInstallDialogOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-app-title"
            className="w-full max-w-sm rounded-t-[32px] border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.24)] backdrop-blur-2xl sm:rounded-[32px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-[20px] border border-blue-100 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 shadow-sm">
              <img src={sharebillsIcon} alt="" className="h-full w-full scale-110 object-cover" />
            </div>
            <h2
              id="install-app-title"
              className="mt-4 text-center text-lg font-extrabold tracking-tight text-slate-900"
            >
              Take Sharebills with you
            </h2>
            <p className="mt-1.5 text-center text-sm leading-relaxed text-slate-500">
              Install the app for quick access and a full-screen experience.
            </p>
            {!deferredPromptAvailable && (
              <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5">
                <div className="flex items-start gap-2.5">
                  <Smartphone size={17} className="mt-0.5 flex-shrink-0 text-blue-600" />
                  <p className="text-xs leading-relaxed text-slate-600">
                    {/iphone|ipad|ipod/i.test(navigator.userAgent)
                      ? 'To install, tap Share in your browser, then choose “Add to Home Screen”.'
                      : 'If your browser does not show an install prompt, open its menu and choose “Install app” or “Add to Home screen”.'}
                  </p>
                </div>
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setInstallDialogOpen(false)}
                className="h-11 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={deferredPromptAvailable ? handleInstallClick : () => setInstallDialogOpen(false)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-600 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition-transform hover:brightness-105 active:scale-[0.98]"
              >
                <Download size={16} />
                {deferredPromptAvailable ? 'Install app' : 'Got it'}
              </button>
            </div>
          </section>
        </div>
      )}

      {showLogoutConfirmation && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 p-5 backdrop-blur-sm"
          onClick={() => !isSigningOut && setShowLogoutConfirmation(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirmation-title"
            aria-describedby="logout-confirmation-description"
            className="logout-confirmation-dialog relative z-[151] w-full max-w-[340px] rounded-[28px] border border-white/70 bg-white/95 p-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.24)] backdrop-blur-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-600">
              <LogOut size={21} />
            </div>
            <h2
              id="logout-confirmation-title"
              className="mt-4 text-base font-bold tracking-tight text-slate-900"
            >
              Sign out of Sharebills?
            </h2>
            <p
              id="logout-confirmation-description"
              className="mt-1.5 text-sm leading-relaxed text-slate-500"
            >
              You can sign back in anytime to manage your shared spaces.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isSigningOut}
                onClick={() => setShowLogoutConfirmation(false)}
                className="h-11 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSigningOut}
                onClick={confirmLogout}
                className="h-11 rounded-2xl bg-rose-600 text-sm font-semibold text-white shadow-md shadow-rose-600/20 transition-colors hover:bg-rose-700 disabled:opacity-60"
              >
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}