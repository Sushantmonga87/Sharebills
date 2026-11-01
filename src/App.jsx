import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Bell } from 'lucide-react';
import {
  FieldPath,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { calculateSettlements, GROUP_DELETE_BALANCE_TOLERANCE } from './utils/settlement';
import { formatCurrency } from './utils/currency';
import { auth, db, hasFirebase, signInAnonymously } from './firebase';
import { INITIAL_EXPENSES } from './utils/constants';
import AuthScreen from './components/auth/AuthScreen';
import LandingPage from './components/LandingPage';
import Dashboard from './components/dashboard/Dashboard';
import CreateGroupModal from './components/dashboard/CreateGroupModal';
import JoinGroupModal from './components/dashboard/JoinGroupModal';
import Toast from './components/common/Toast';
import IncomingChatAlert from './components/common/IncomingChatAlert';
import {
  listenToForegroundMessages,
  requestWebNotificationPermission,
  requestNotificationPermission,
  setPushNotificationActionHandler,
  triggerPushNotification,
  unregisterPushNotifications,
} from './utils/notifications';
import {
  DEFAULT_NOTIFICATION_SOUND,
  NOTIFICATION_SOUND_ADMIN_EMAIL,
  playNotificationSound,
  unlockNotificationAudio,
} from './utils/notificationSound';

const GroupView = lazy(() => import('./components/group/GroupView'));
const AdminPanel = lazy(() => import('./components/admin/AdminPanel'));

const getGroupSlug = (name, fallback = 'group') => {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
};

const getRouteFromLocation = () => {
  const url = new URL(window.location.href);
  const inviteCode = url.searchParams.get('join') || url.searchParams.get('invite') || '';
  const groupRoute = url.pathname.match(/^\/groups\/([^/]+)$/);

  if (url.pathname === '/groups/create') return { view: 'create_group' };
  if (url.pathname === '/groups/join' || inviteCode) {
    return { view: 'join_group', inviteCode };
  }
  if (groupRoute) {
    return {
      view: 'group',
      groupSlug: decodeURIComponent(groupRoute[1]),
      initialTab: 'expenses',
      drawerOpen: false,
    };
  }
  return {
    view: 'dashboard',
    dashboardTab: url.searchParams.get('tab') || 'groups',
  };
};

const getRouteUrl = (route) => {
  if (route.view === 'group' && (route.groupName || route.groupSlug || route.groupId)) {
    const slug = route.groupName
      ? getGroupSlug(route.groupName, route.groupId)
      : route.groupSlug || route.groupId;
    return `/groups/${encodeURIComponent(slug)}`;
  }
  if (route.view === 'create_group') return '/groups/create';
  if (route.view === 'join_group') {
    const params = new URLSearchParams();
    if (route.inviteCode) params.set('join', route.inviteCode);
    const search = params.toString();
    return `/groups/join${search ? `?${search}` : ''}`;
  }
  return route.dashboardTab && route.dashboardTab !== 'groups'
    ? `/?tab=${encodeURIComponent(route.dashboardTab)}`
    : '/';
};

const getNotificationTimestamp = (value) => {
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return value;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const removeDemoExpenses = (items) => (
  items.filter((expense) => !(expense.id === 'exp_1' && expense.title === 'Pizza Dinner'))
);

const legacyDemoUserIds = new Set(['usr_taran', 'usr_sushant', 'usr_tushar']);
const legacyDemoGroupId = 'grp_room302';

const removeLegacyDemoUsers = (items) => (
  items.filter((user) => !legacyDemoUserIds.has(user.id))
);

const removeLegacyDemoGroups = (items) => (
  items.filter((group) => group.id !== legacyDemoGroupId)
);

function LaunchScreen() {
  return (
    <main className="launch-screen" role="status" aria-label="Loading Sharebills">
      <div className="launch-screen__logo-frame">
        <img className="launch-screen__logo" src="/sharebills-icon-192.webp" alt="" />
      </div>
      <h1 className="launch-screen__title">Sharebills</h1>
      <p className="launch-screen__subtitle">Shared expenses, simplified.</p>
      <span className="launch-screen__spinner" aria-hidden="true" />
    </main>
  );
}

function GroupLoadingSkeleton() {
  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white" role="status" aria-label="Opening group">
      <span className="sr-only">Loading group</span>
      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-lg bg-slate-200" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 p-1">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-8 w-16 animate-pulse rounded-lg bg-slate-200/80" />
          ))}
        </div>
      </header>
      <section className="mx-auto w-full max-w-6xl flex-1 space-y-4 overflow-hidden p-4 md:p-6" aria-hidden="true">
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="h-10 w-10 flex-shrink-0 animate-pulse rounded-lg bg-slate-200/80" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-2/5 animate-pulse rounded bg-slate-200" />
                <div className="h-2.5 w-3/5 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-4 w-16 flex-shrink-0 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('Service Worker registered successfully:', registration.scope);
      })
      .catch((err) => {
        console.log('Service Worker registration failed:', err);
      });
  });
}

export default function App() {
  const [initialRoute] = useState(getRouteFromLocation);
  const isNativeApp = Capacitor.isNativePlatform();
  const isStandalonePwa = !isNativeApp && (
    window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone === true
  );
  const isAppWelcomeScreen = isNativeApp || isStandalonePwa;
  const isIosBrowser = /iPhone|iPad|iPod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  const needsIosHomeScreenInstall = isIosBrowser && !isStandalonePwa;
  const [webNotificationPromptOpen, setWebNotificationPromptOpen] = useState(
    () => !isNativeApp
      && (
        (typeof Notification !== 'undefined' && Notification.permission === 'default')
        || needsIosHomeScreenInstall
      )
  );
  const [webNotificationPromptMessage, setWebNotificationPromptMessage] = useState(
    () => needsIosHomeScreenInstall
      ? 'To receive notifications on iPhone or iPad, add Sharebills to your Home Screen from Safari, then open it from its icon.'
      : ''
  );
  const [pushPermissionRefresh, setPushPermissionRefresh] = useState(0);
  const [activeUserId, setActiveUserId] = useState(
    () => {
      const storedUserId = localStorage.getItem('rs_active_user_id');
      if (legacyDemoUserIds.has(storedUserId)) {
        localStorage.removeItem('rs_active_user_id');
        return null;
      }
      return storedUserId;
    }
  );
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(
    () => Capacitor.isNativePlatform()
      || window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone === true
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem('rs_theme') === 'dark' ? 'dark' : 'light'
  );
  const hasInitialLocalSession = Boolean(activeUserId && !(hasFirebase && db && auth));
  const readStoredData = (key, fallback) => {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  };
  const [users, setUsers] = useState(
    () => hasInitialLocalSession
      ? removeLegacyDemoUsers(readStoredData('rs_users', []))
      : []
  );
  const [usersLoaded, setUsersLoaded] = useState(hasInitialLocalSession);
  const [groups, setGroups] = useState(
    () => hasInitialLocalSession
      ? removeLegacyDemoGroups(readStoredData('rs_groups', []))
      : []
  );
  const [expenses, setExpenses] = useState(
    () => hasInitialLocalSession
      ? removeDemoExpenses(readStoredData('rs_expenses', INITIAL_EXPENSES))
      : []
  );
  const [monthlyRents, setMonthlyRents] = useState(
    () => hasInitialLocalSession ? readStoredData('rs_monthly_rents', []) : []
  );
  const [notifications, setNotifications] = useState(
    () => hasInitialLocalSession ? readStoredData('rs_notifications', []) : []
  );
  const [loading, setLoading] = useState(
    () => Boolean(localStorage.getItem('rs_active_user_id') && hasFirebase && db && auth)
  );
  const [dataLoadStarted, setDataLoadStarted] = useState(
    () => Boolean(localStorage.getItem('rs_active_user_id'))
  );
  const [currentView, setCurrentView] = useState(initialRoute.view);
  const [authMode, setAuthMode] = useState(null);
  const [dashboardTab, setDashboardTab] = useState(initialRoute.dashboardTab || 'groups');
  const [returnDashboardTab, setReturnDashboardTab] = useState(
    initialRoute.dashboardTab || 'groups'
  );
  const [currentGroupRoute, setCurrentGroupRoute] = useState(
    initialRoute.groupId || initialRoute.groupSlug || null
  );
  const [currentGroupInitialTab, setCurrentGroupInitialTab] = useState('expenses');
  const [currentGroupExpenseDraft, setCurrentGroupExpenseDraft] = useState(null);
  const [currentGroupUnreadChatCount, setCurrentGroupUnreadChatCount] = useState(0);
  const [currentGroupDrawerOpen, setCurrentGroupDrawerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [incomingChat, setIncomingChat] = useState(null);
  const [activeChatGroupId, setActiveChatGroupId] = useState(null);
  const [notificationCutoff, setNotificationCutoff] = useState(
    () => Date.now() - 7 * 24 * 60 * 60 * 1000
  );
  const historyInitializedRef = useRef(false);
  const currentRouteRef = useRef(initialRoute);
  const authModeRef = useRef(null);
  const navigateToRef = useRef(null);
  const lastExitedGroupIdRef = useRef(null);
  const notificationSoundSettingsRef = useRef(null);
  const lastNotificationSoundRef = useRef({ groupId: null, timestamp: 0 });
  const activeUser = users.find((user) => user.id === activeUserId);
  const sharedNotificationSounds = users.find(
    (user) => user.email?.trim().toLowerCase() === NOTIFICATION_SOUND_ADMIN_EMAIL
  )?.notificationSounds;
  const isLandingPageVisible = !activeUser && !authMode && !isAppWelcomeScreen;
  const isLightWelcomeVisible = !activeUser && (isLandingPageVisible || isAppWelcomeScreen);

  useLayoutEffect(() => {
    notificationSoundSettingsRef.current = { activeUser, sharedNotificationSounds };
  }, [activeUser, sharedNotificationSounds]);

  const playIncomingNotificationSound = useCallback((groupId) => {
    const now = Date.now();
    const lastPlayed = lastNotificationSoundRef.current;
    if (groupId && lastPlayed.groupId === groupId && now - lastPlayed.timestamp < 2000) return;

    const { activeUser: currentUser, sharedNotificationSounds: currentSharedSounds } =
      notificationSoundSettingsRef.current || {};
    if (currentUser?.notificationsPaused) return;

    const selectedSound = currentUser?.notificationSound || DEFAULT_NOTIFICATION_SOUND;
    const soundToPlay = selectedSound.mode === 'shared'
      ? currentSharedSounds?.find((sound) => sound.id === selectedSound.soundId)
      : selectedSound;
    if (!soundToPlay) return;

    lastNotificationSoundRef.current = { groupId: groupId || null, timestamp: now };
    playNotificationSound(soundToPlay).catch((error) => {
      console.warn('Could not play the selected notification sound:', error);
    });
  }, []);

  useEffect(() => {
    const handleFirstInteraction = () => {
      window.removeEventListener('pointerdown', handleFirstInteraction, true);
      window.removeEventListener('touchstart', handleFirstInteraction, true);
      window.removeEventListener('keydown', handleFirstInteraction, true);
      unlockNotificationAudio().catch((error) => {
        console.warn('Could not prepare notification audio:', error);
      });
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { capture: true, passive: true });
    window.addEventListener('touchstart', handleFirstInteraction, { capture: true, passive: true });
    window.addEventListener('keydown', handleFirstInteraction, true);
    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction, true);
      window.removeEventListener('touchstart', handleFirstInteraction, true);
      window.removeEventListener('keydown', handleFirstInteraction, true);
    };
  }, []);

  useLayoutEffect(() => {
    const isDarkMode = theme === 'dark' && !isLightWelcomeVisible;
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('rs_theme', theme);
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDarkMode ? '#000000' : '#3E7754');
  }, [isLightWelcomeVisible, theme]);

  const mutedGroupIds = useMemo(
    () => (Array.isArray(activeUser?.mutedGroupIds) ? activeUser.mutedGroupIds : []),
    [activeUser]
  );
  const joinedGroupIds = groups
    .filter((group) => activeUserId && group.members?.includes(activeUserId))
    .map((group) => group.id)
    .sort()
    .join(',');

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredInstallPrompt) return false;

    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    setDeferredInstallPrompt(null);
    if (outcome === 'accepted') setIsAppInstalled(true);
    return outcome === 'accepted';
  };

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateAppHeight = () => {
      const height = viewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${height}px`);
      document.documentElement.style.setProperty('--app-top', `${viewport?.offsetTop || 0}px`);
    };

    updateAppHeight();
    viewport?.addEventListener('resize', updateAppHeight);
    viewport?.addEventListener('scroll', updateAppHeight);
    window.addEventListener('resize', updateAppHeight);
    return () => {
      viewport?.removeEventListener('resize', updateAppHeight);
      viewport?.removeEventListener('scroll', updateAppHeight);
      window.removeEventListener('resize', updateAppHeight);
      document.documentElement.style.removeProperty('--app-height');
      document.documentElement.style.removeProperty('--app-top');
    };
  }, []);

  useEffect(() => {
    const refreshCutoff = () => setNotificationCutoff(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const interval = window.setInterval(refreshCutoff, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!dataLoadStarted) return undefined;

    let isActive = true;
    let unsubscribe;
    listenToForegroundMessages((payload) => {
      if (!isActive) return;
      playIncomingNotificationSound(payload.data?.groupId);
    }).then((stopListening) => {
      if (isActive) unsubscribe = stopListening;
      else stopListening?.();
    }).catch((error) => console.warn('Foreground push listener could not start:', error));

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, [
    dataLoadStarted,
    playIncomingNotificationSound,
  ]);

  const applyRoute = (route) => {
    currentRouteRef.current = route;
    setCurrentView(route.view);
    setCurrentGroupRoute(route.groupId || route.groupSlug || null);
    if (route.view === 'group') {
      setCurrentGroupInitialTab(route.initialTab || 'expenses');
      setCurrentGroupExpenseDraft(route.expenseDraft || null);
      setCurrentGroupDrawerOpen(Boolean(route.drawerOpen));
    } else {
      setCurrentGroupExpenseDraft(null);
      setCurrentGroupDrawerOpen(false);
    }
    if (route.view === 'dashboard') {
      setDashboardTab(route.dashboardTab || 'groups');
      setReturnDashboardTab(route.dashboardTab || 'groups');
    }
  };

  const navigateTo = (route, { replace = false } = {}) => {
    const previousRoute = currentRouteRef.current;
    if (previousRoute.view === 'group' && route.view === 'dashboard') {
      lastExitedGroupIdRef.current = previousRoute.groupId;
    }

    const returningToExitedGroup = route.view === 'group'
      && previousRoute.view !== 'group'
      && lastExitedGroupIdRef.current === route.groupId
      && route.initialTab !== 'chat'
      && route.initialTab !== 'add';
    const normalizedRoute = route.view === 'group'
      ? {
          initialTab: 'expenses',
          drawerOpen: false,
          ...route,
          ...(returningToExitedGroup ? { initialTab: 'expenses' } : {}),
        }
      : route;
    if (returningToExitedGroup) lastExitedGroupIdRef.current = null;
    const state = { roomSplitRoute: normalizedRoute };
    const url = getRouteUrl(normalizedRoute);
    if (replace) window.history.replaceState(state, '', url);
    else window.history.pushState(state, '', url);
    applyRoute(normalizedRoute);
  };

  const openAuth = (mode) => {
    window.history.pushState(
      { ...window.history.state, roomSplitAuth: mode },
      '',
      window.location.href
    );
    authModeRef.current = mode;
    setAuthMode(mode);
  };

  useEffect(() => {
    navigateToRef.current = navigateTo;
  });

  const goBack = () => {
    window.history.back();
  };

  useEffect(() => {
    if (window.location.pathname === '/admin') return undefined;

    const sentinelState = { roomSplitSentinel: true };
    if (!historyInitializedRef.current) {
      window.history.replaceState(sentinelState, '', '/');
      window.history.pushState({ roomSplitRoute: initialRoute }, '', getRouteUrl(initialRoute));
      historyInitializedRef.current = true;
    }

    const handlePopState = (event) => {
      if (event.state?.roomSplitAuth) {
        authModeRef.current = event.state.roomSplitAuth;
        setAuthMode(event.state.roomSplitAuth);
        return;
      }

      if (authModeRef.current) {
        authModeRef.current = null;
        setAuthMode(null);
      }

      const previousRoute = currentRouteRef.current;
      const destinationRoute = event.state?.roomSplitRoute;
      if (previousRoute.view === 'group' && (!destinationRoute || destinationRoute.view === 'dashboard')) {
        lastExitedGroupIdRef.current = previousRoute.groupId;
      }
      if (
        (!destinationRoute || destinationRoute.view === 'dashboard')
        && previousRoute.view === 'group'
        && (previousRoute.initialTab !== 'expenses' || previousRoute.drawerOpen)
      ) {
        const expensesRoute = {
          ...previousRoute,
          initialTab: 'expenses',
          drawerOpen: false,
        };
        window.history.pushState({ roomSplitRoute: expensesRoute }, '', getRouteUrl(expensesRoute));
        applyRoute(expensesRoute);
        return;
      }

      if (destinationRoute) {
        applyRoute(destinationRoute);
        return;
      }

      const dashboardRoute = { view: 'dashboard', dashboardTab: 'groups' };
      applyRoute(dashboardRoute);
      window.history.pushState(sentinelState, '', '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [initialRoute]);

  useEffect(() => {
    if (window.location.pathname === '/admin' || !dataLoadStarted) return undefined;

    const unsubscribers = [];
    let isCancelled = false;
    const setupAuthAndSync = async () => {
      try {
        await auth.authStateReady();
        if (isCancelled) return;
        if (!auth.currentUser) await signInAnonymously(auth);
        if (isCancelled) return;
        unsubscribers.push(onSnapshot(collection(db, 'users'), (snapshot) => {
          const loadedUsers = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
          setUsers(loadedUsers);
          if (activeUserId && !loadedUsers.some((user) => user.id === activeUserId)) {
            localStorage.removeItem('rs_active_user_id');
            setActiveUserId(null);
            setDataLoadStarted(false);
            setLoading(false);
          }
          setUsersLoaded(true);
        }, (error) => console.error('Users listener error:', error)));

        unsubscribers.push(onSnapshot(collection(db, 'groups'), (snapshot) => {
          if (!snapshot.empty) {
            setGroups(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
          } else {
            setGroups([]);
          }
        }, (error) => console.error('Groups listener error:', error)));

        unsubscribers.push(onSnapshot(collection(db, 'expenses'), (snapshot) => {
          const loadedExpenses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
          const demoExpenses = loadedExpenses.filter(
            (expense) => expense.id === 'exp_1' && expense.title === 'Pizza Dinner'
          );
          setExpenses(removeDemoExpenses(loadedExpenses));
          demoExpenses.forEach((expense) => {
            deleteDoc(doc(db, 'expenses', expense.id)).catch((error) => {
              console.error('Could not remove the seeded demo expense:', error);
            });
          });
          setLoading(false);
        }, (error) => {
          console.error('Expenses listener error:', error);
          setLoading(false);
        }));

        unsubscribers.push(onSnapshot(collection(db, 'monthlyRents'), (snapshot) => {
          setMonthlyRents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        }, (error) => console.error('Monthly rent listener error:', error)));

        unsubscribers.push(onSnapshot(collection(db, 'notifications'), (snapshot) => {
          setNotifications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        }, (error) => console.error('Notifications listener error:', error)));
      } catch (error) {
        console.error('Firestore auth setup failed:', error);
        if (!isCancelled) setLoading(false);
      }
    };

    setupAuthAndSync();
    return () => {
      isCancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [activeUserId, dataLoadStarted]);

  useEffect(() => {
    if (!hasInitialLocalSession || !usersLoaded || activeUser) return;
    localStorage.removeItem('rs_active_user_id');
  }, [activeUser, hasInitialLocalSession, usersLoaded]);

  useEffect(() => {
    if (!activeUserId) return undefined;
    const expiredIds = new Set(notifications
      .filter((notification) => {
        const timestamp = getNotificationTimestamp(notification.createdAt);
        return notification.recipientId === activeUserId
          && timestamp !== null
          && timestamp < notificationCutoff;
      })
      .map((notification) => notification.id));
    if (!expiredIds.size) return undefined;

    if (db) {
      expiredIds.forEach((notificationId) => {
        deleteDoc(doc(db, 'notifications', notificationId)).catch((error) => {
          console.error('Could not remove expired notification:', error);
        });
      });
      return undefined;
    }

    const retained = notifications.filter((notification) => !expiredIds.has(notification.id));
    localStorage.setItem('rs_notifications', JSON.stringify(retained));
    return undefined;
  }, [activeUserId, notificationCutoff, notifications]);

  useEffect(() => {
    if (!db || !activeUserId || !joinedGroupIds) return undefined;

    const mutedGroupIdSet = new Set(mutedGroupIds);
    const unsubscribers = joinedGroupIds.split(',').filter((groupId) => !mutedGroupIdSet.has(groupId)).map((groupId) => {
      let hasBaselineSnapshot = false;
      return onSnapshot(
        query(collection(db, 'messages'), where('groupId', '==', groupId)),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!hasBaselineSnapshot) {
            if (!snapshot.metadata.fromCache) hasBaselineSnapshot = true;
            return;
          }
          if (document.visibilityState !== 'visible') return;

          const newMessage = snapshot.docChanges()
            .filter((change) => change.type === 'added')
            .map((change) => ({ id: change.doc.id, ...change.doc.data() }))
            .filter((message) => (
              message.type !== 'typing'
              && message.senderId !== activeUserId
              && activeChatGroupId !== groupId
              && !message.isDeletedForEveryone
              && !message.deletedFor?.includes(activeUserId)
            ))
            .sort((first, second) => (second.timestamp || 0) - (first.timestamp || 0))[0];

          if (newMessage) {
            setIncomingChat(newMessage);
            playIncomingNotificationSound(groupId);
          }
        },
        (error) => console.error('Incoming chat listener error:', error)
      );
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activeChatGroupId, activeUserId, joinedGroupIds, mutedGroupIds, playIncomingNotificationSound]);

  const loadUsersForAuth = async () => {
    if (!hasFirebase || !db || !auth) {
      const savedUsers = localStorage.getItem('rs_users');
      const loadedUsers = removeLegacyDemoUsers(savedUsers ? JSON.parse(savedUsers) : []);
      localStorage.setItem('rs_users', JSON.stringify(loadedUsers));
      setUsers(loadedUsers);
      setUsersLoaded(true);
      return loadedUsers;
    }

    await auth.authStateReady();
    if (!auth.currentUser) await signInAnonymously(auth);
    const snapshot = await getDocs(collection(db, 'users'));
    const loadedUsers = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    setUsers(loadedUsers);
    setUsersLoaded(true);
    return loadedUsers;
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogin = (userId) => {
    authModeRef.current = null;
    setAuthMode(null);
    setIncomingChat(null);
    setActiveChatGroupId(null);
    if (hasFirebase && db && auth) {
      setLoading(true);
      setDataLoadStarted(true);
    } else {
      const savedGroups = localStorage.getItem('rs_groups');
      const savedExpenses = localStorage.getItem('rs_expenses');
      const savedMonthlyRents = localStorage.getItem('rs_monthly_rents');
      const savedNotifications = localStorage.getItem('rs_notifications');
      const loadedGroups = removeLegacyDemoGroups(savedGroups ? JSON.parse(savedGroups) : []);
      localStorage.setItem('rs_groups', JSON.stringify(loadedGroups));
      setGroups(loadedGroups);
      setExpenses(removeDemoExpenses(savedExpenses ? JSON.parse(savedExpenses) : INITIAL_EXPENSES));
      setMonthlyRents(savedMonthlyRents ? JSON.parse(savedMonthlyRents) : []);
      setNotifications(savedNotifications ? JSON.parse(savedNotifications) : []);
      setLoading(false);
    }
    setActiveUserId(userId);
    localStorage.setItem('rs_active_user_id', userId);
    navigateTo(initialRoute.view === 'join_group'
      ? { view: 'join_group', inviteCode: initialRoute.inviteCode }
      : { view: 'dashboard', dashboardTab: 'groups' }, { replace: true });
  };

  const handleLogout = async () => {
    try {
      await unregisterPushNotifications(activeUserId);
    } catch (error) {
      console.error('Could not safely unregister this device from push notifications.', error);
      showToast('Could not finish signing out safely. Please try again.', 'error');
      return;
    }
    setIncomingChat(null);
    setActiveChatGroupId(null);
    setDataLoadStarted(false);
    setLoading(false);
    setActiveUserId(null);
    const shouldShowDesktopLogin = window.matchMedia('(min-width: 768px)').matches;
    authModeRef.current = shouldShowDesktopLogin ? 'login' : null;
    setAuthMode(shouldShowDesktopLogin ? 'login' : null);
    localStorage.removeItem('rs_active_user_id');
    navigateTo({ view: 'dashboard', dashboardTab: 'groups' }, { replace: true });
  };

  const upsertItemsById = (items, replacements) => {
    const next = new Map(items.map((item) => [item.id, item]));
    replacements.forEach((item) => {
      next.set(item.id, item);
    });
    return [...next.values()];
  };

  const saveUser = async (newUser) => {
    if (db) {
      await setDoc(doc(db, 'users', newUser.id), newUser, { merge: true });
      return;
    }
    setUsers((previous) => {
      const next = upsertItemsById(previous, [newUser]);
      localStorage.setItem('rs_users', JSON.stringify(next));
      return next;
    });
  };

  const updateUser = async (userId, updates) => {
    if (db) {
      await setDoc(doc(db, 'users', userId), updates, { merge: true });
      if (incomingChat && updates.mutedGroupIds?.includes(incomingChat.groupId)) setIncomingChat(null);
      return;
    }
    setUsers((previous) => {
      const next = previous.map((user) => (user.id === userId ? { ...user, ...updates } : user));
      localStorage.setItem('rs_users', JSON.stringify(next));
      return next;
    });
    if (incomingChat && updates.mutedGroupIds?.includes(incomingChat.groupId)) setIncomingChat(null);
  };

  const saveNotifications = async (newNotifications) => {
    const deliverableNotifications = newNotifications.filter((notification) => {
      const recipient = users.find((user) => user.id === notification.recipientId);
      return !notification.groupId || !recipient?.mutedGroupIds?.includes(notification.groupId);
    });
    if (!deliverableNotifications.length) return;
    if (db) {
      await Promise.all(deliverableNotifications.map((notification) => (
        setDoc(doc(db, 'notifications', notification.id), notification)
      )));
      return;
    }
    setNotifications((previous) => {
      const next = upsertItemsById(previous, deliverableNotifications);
      localStorage.setItem('rs_notifications', JSON.stringify(next));
      return next;
    });
  };

  const markNotificationsRead = useCallback(async (notificationIds) => {
    if (!notificationIds.length) return;
    if (db) {
      await Promise.all(notificationIds.map((notificationId) => (
        setDoc(doc(db, 'notifications', notificationId), { read: true }, { merge: true })
      )));
      return;
    }
    setNotifications((previous) => {
      const next = previous.map((notification) => (
        notificationIds.includes(notification.id) ? { ...notification, read: true } : notification
      ));
      localStorage.setItem('rs_notifications', JSON.stringify(next));
      return next;
    });
  }, []);

  const markGroupChatNotificationsRead = useCallback(async (groupId) => {
    const chatNotificationIds = notifications
      .filter((notification) => (
        !notification.read &&
        notification.groupId === groupId &&
        (!notification.recipientId || notification.recipientId === activeUserId) &&
        (
          notification.type === 'CHAT_MESSAGE' ||
          notification.type === 'NEW_MESSAGE' ||
          notification.type === 'MESSAGE' ||
          notification.category === 'chat' ||
          (
            !notification.type?.startsWith('EXPENSE_DISPUTE') &&
            /message|chat|dispute/i.test(notification.type || '')
          )
        )
      ))
      .map((notification) => notification.id);

    try {
      if (chatNotificationIds.length) await markNotificationsRead(chatNotificationIds);
      setCurrentGroupUnreadChatCount(0);
    } catch (error) {
      console.error('Could not mark chat notifications as read:', error);
      setToast({ message: 'Could not update chat notifications. Please try again.', type: 'error' });
    }
  }, [activeUserId, markNotificationsRead, notifications]);

  const clearNotifications = async (notificationIds) => {
    const requestedIds = new Set(notificationIds);
    const ownedNotifications = notifications.filter((notification) => (
      requestedIds.has(notification.id) && notification.recipientId === activeUserId
    ));
    if (!ownedNotifications.length) return;

    const deletedIds = new Set(ownedNotifications.map((notification) => notification.id));
    if (db) {
      await Promise.all(ownedNotifications.map((notification) => (
        deleteDoc(doc(db, 'notifications', notification.id))
      )));
    } else {
      localStorage.setItem('rs_notifications', JSON.stringify(
        notifications.filter((notification) => !deletedIds.has(notification.id))
      ));
    }
    setNotifications((previous) => previous.filter((notification) => !deletedIds.has(notification.id)));
  };

  const saveGroup = async (newGroup) => {
    if (db) {
      await setDoc(doc(db, 'groups', newGroup.id), newGroup);
      return;
    }
    setGroups((previous) => {
      const next = upsertItemsById(previous, [newGroup]);
      localStorage.setItem('rs_groups', JSON.stringify(next));
      return next;
    });
  };

  const updateGroup = async (updatedGroup) => {
    if (db) {
      await setDoc(doc(db, 'groups', updatedGroup.id), updatedGroup, { merge: true });
      return;
    }
    setGroups((previous) => {
      const next = previous.map((group) => (group.id === updatedGroup.id ? updatedGroup : group));
      localStorage.setItem('rs_groups', JSON.stringify(next));
      return next;
    });
  };

  const saveExpense = async (newExpense) => {
    const expense = { ...newExpense, createdBy: newExpense.createdBy || activeUserId };
    if (db) {
      await setDoc(doc(db, 'expenses', expense.id), expense);
      return;
    }
    setExpenses((previous) => {
      const next = [...previous.filter((item) => item.id !== expense.id), expense];
      localStorage.setItem('rs_expenses', JSON.stringify(next));
      return next;
    });
  };

  const raiseExpenseDispute = async (expense, disputeMessage = '') => {
    if (!db) throw new Error('Expense disputes require an active connection.');
    if (!activeUserId || !activeUser) throw new Error('Sign in before raising a dispute.');
    if (!expense?.id || !expense.groupId) throw new Error('This expense is missing its group details.');

    const expenseRef = doc(db, 'expenses', expense.id);
    const groupRef = doc(db, 'groups', expense.groupId);
    const disputeRef = doc(collection(db, 'messages'));
    const createdAt = new Date().toISOString();
    const senderName = activeUser.username || 'A member';
    const notificationDocs = [];

    await runTransaction(db, async (transaction) => {
      notificationDocs.length = 0;
      const [expenseSnapshot, groupSnapshot] = await Promise.all([
        transaction.get(expenseRef),
        transaction.get(groupRef),
      ]);
      if (!expenseSnapshot.exists() || !groupSnapshot.exists()) {
        throw new Error('This expense or group no longer exists.');
      }

      const currentExpense = expenseSnapshot.data();
      const group = groupSnapshot.data();
      if (!group.members?.includes(activeUserId)) {
        throw new Error('You must be a group member to raise a dispute.');
      }
      if (currentExpense.groupId !== expense.groupId) {
        throw new Error('This expense no longer belongs to the selected group.');
      }
      if (currentExpense.activeDisputeId) {
        throw new Error('This expense already has an open dispute.');
      }

      const message = {
        groupId: expense.groupId,
        senderId: activeUserId,
        senderName,
        type: 'expense_dispute',
        text: disputeMessage
          ? `${senderName} raised a dispute about "${currentExpense.title || 'an expense'}": ${disputeMessage}`
          : `${senderName} raised a dispute about "${currentExpense.title || 'an expense'}".`,
        disputeMessage,
        expenseId: expense.id,
        expenseTitle: currentExpense.title || 'Expense',
        expenseAmount: currentExpense.totalAmount,
        status: 'open',
        disputedBy: activeUserId,
        disputedByName: senderName,
        timestamp: Date.now(),
        createdAt,
      };
      transaction.set(disputeRef, message);
      transaction.update(expenseRef, {
        activeDisputeId: disputeRef.id,
        activeDisputeBy: activeUserId,
        activeDisputeByName: senderName,
        activeDisputeCreatedAt: createdAt,
      });

      const recipients = (group.members || []).filter((recipientId) => (
        recipientId !== activeUserId
        && !users.find((member) => member.id === recipientId)?.mutedGroupIds?.includes(expense.groupId)
      ));
      recipients.forEach((recipientId) => {
        const notification = {
          id: `expense_dispute_${disputeRef.id}_${recipientId}`,
          recipientId,
          senderId: activeUserId,
          createdBy: activeUserId,
          createdByName: senderName,
          groupId: expense.groupId,
          type: 'EXPENSE_DISPUTE',
          message: `${senderName} raised a dispute about "${message.expenseTitle}" in ${group.name || 'your group'}.`,
          createdAt,
          read: false,
        };
        notificationDocs.push(notification);
        transaction.set(doc(db, 'notifications', notification.id), notification);
      });
    });

    notificationDocs.forEach((notification) => {
      triggerPushNotification({
        senderId: activeUserId,
        recipientId: notification.recipientId,
        title: 'Expense dispute raised',
        message: notification.message,
        groupId: expense.groupId,
      }).catch((error) => console.warn('Expense dispute push notification failed:', error));
    });

    const expenseGroup = groups.find((group) => group.id === expense.groupId);
    setCurrentGroupUnreadChatCount(0);
    navigateTo({
      view: 'group',
      groupId: expense.groupId,
      groupName: expenseGroup?.name || currentRouteRef.current.groupName,
      initialTab: 'chat',
      returnDashboardTab: currentRouteRef.current.returnDashboardTab || returnDashboardTab,
    });
  };

  const resolveExpenseDispute = async (message, { action = 'solved', updates } = {}) => {
    if (!db) throw new Error('Resolving expense disputes requires an active connection.');
    if (!activeUserId || !message?.id || !message.expenseId || !message.groupId) {
      throw new Error('This dispute is missing required details.');
    }
    if (!['solved', 'delete', 'update'].includes(action)) {
      throw new Error('Choose a valid dispute resolution.');
    }

    const disputeRef = doc(db, 'messages', message.id);
    const expenseRef = doc(db, 'expenses', message.expenseId);
    const groupRef = doc(db, 'groups', message.groupId);
    const resolvedAt = new Date().toISOString();
    const notificationDocs = [];
    const resolverName = activeUser?.username || 'A member';

    await runTransaction(db, async (transaction) => {
      notificationDocs.length = 0;
      const [disputeSnapshot, expenseSnapshot, groupSnapshot] = await Promise.all([
        transaction.get(disputeRef),
        transaction.get(expenseRef),
        transaction.get(groupRef),
      ]);
      if (!disputeSnapshot.exists() || !expenseSnapshot.exists() || !groupSnapshot.exists()) {
        throw new Error('This dispute or its expense no longer exists.');
      }

      const dispute = disputeSnapshot.data();
      const group = groupSnapshot.data();
      const currentExpense = expenseSnapshot.data();
      if (!group.members?.includes(activeUserId)) {
        throw new Error('You must be a group member to resolve a dispute.');
      }
      if (dispute.type !== 'expense_dispute' || dispute.status !== 'open') {
        throw new Error('This dispute has already been resolved.');
      }
      if (currentExpense.activeDisputeId !== message.id) {
        throw new Error('This expense is no longer linked to this dispute.');
      }

      const canModifyExpense = (
        currentExpense.createdBy === activeUserId || currentExpense.paidBy === activeUserId
      );
      if (action !== 'solved' && !canModifyExpense) {
        throw new Error('Only the expense creator or payer can update or delete it.');
      }
      if (
        action === 'solved' &&
        currentExpense.createdBy !== activeUserId &&
        dispute.disputedBy !== activeUserId
      ) {
        throw new Error('Only the expense creator or dispute raiser can mark it as solved.');
      }

      let updatedExpense = null;
      if (action === 'update') {
        const title = updates?.title?.trim();
        const totalAmount = Number(updates?.totalAmount);
        const validDate = typeof updates?.date === 'string'
          && /^\d{4}-\d{2}-\d{2}$/.test(updates.date)
          && !Number.isNaN(new Date(`${updates.date}T00:00:00`).getTime());
        const payerIsMember = group.members.includes(updates?.paidBy);
        const splitEntries = Object.entries(updates?.splits || {});
        const splits = {};
        let splitTotal = 0;
        splitEntries.forEach(([memberId, rawAmount]) => {
          const share = Number(rawAmount);
          if (!group.members.includes(memberId) || !Number.isFinite(share) || share < 0) {
            throw new Error('Enter valid non-negative shares for group members.');
          }
          if (share > 0) {
            splits[memberId] = share.toFixed(2);
            splitTotal += share;
          }
        });
        if (!title || !Number.isFinite(totalAmount) || totalAmount <= 0) {
          throw new Error('Enter a valid expense title and amount.');
        }
        if (!validDate || !payerIsMember) {
          throw new Error('Choose a valid date and payer from this group.');
        }
        if (!Object.keys(splits).length || Math.abs(splitTotal - totalAmount) > 0.05) {
          throw new Error('Member shares must add up to the expense total.');
        }

        updatedExpense = {
          ...currentExpense,
          title,
          totalAmount: totalAmount.toFixed(2),
          date: updates.date,
          paidBy: updates.paidBy,
          category: updates.category || currentExpense.category || 'Other',
          paymentMethod: updates.paymentMethod || currentExpense.paymentMethod || 'Other',
          splits,
          activeDisputeId: null,
          activeDisputeBy: null,
          activeDisputeByName: null,
          activeDisputeCreatedAt: null,
          wasEdited: true,
          editedAt: resolvedAt,
          editedBy: activeUserId,
          editedByName: resolverName,
        };
        transaction.set(expenseRef, updatedExpense);
      } else if (action === 'delete') {
        transaction.delete(expenseRef);
      } else {
        transaction.update(expenseRef, {
          activeDisputeId: null,
          activeDisputeBy: null,
          activeDisputeByName: null,
          activeDisputeCreatedAt: null,
        });
      }

      transaction.update(disputeRef, {
        status: 'resolved',
        resolvedBy: activeUserId,
        resolvedByName: resolverName,
        resolvedAt,
        resolutionAction: action,
        ...(updatedExpense ? {
          expenseTitle: updatedExpense.title,
          expenseAmount: updatedExpense.totalAmount,
        } : {}),
      });

      const recipients = (group.members || []).filter((recipientId) => (
        recipientId !== activeUserId
        && !users.find((member) => member.id === recipientId)?.mutedGroupIds?.includes(message.groupId)
      ));
      recipients.forEach((recipientId) => {
        const notification = {
          id: `expense_dispute_resolved_${message.id}_${recipientId}`,
          recipientId,
          senderId: activeUserId,
          createdBy: activeUserId,
          createdByName: resolverName,
          groupId: message.groupId,
          type: action === 'delete' ? 'EXPENSE_DISPUTE_DELETED' : 'EXPENSE_DISPUTE_RESOLVED',
          message: action === 'delete'
            ? `${resolverName} deleted "${dispute.expenseTitle || 'the disputed expense'}" and resolved the dispute.`
            : action === 'update'
              ? `${resolverName} updated "${updatedExpense.title}" and resolved the dispute.`
              : `${resolverName} marked the dispute about "${dispute.expenseTitle || 'an expense'}" as resolved.`,
          createdAt: resolvedAt,
          read: false,
        };
        notificationDocs.push(notification);
        transaction.set(doc(db, 'notifications', notification.id), notification);
      });
    });

    notificationDocs.forEach((notification) => {
      triggerPushNotification({
        senderId: activeUserId,
        recipientId: notification.recipientId,
        title: action === 'delete'
          ? 'Disputed expense deleted'
          : action === 'update'
            ? 'Disputed expense updated'
            : 'Expense dispute resolved',
        message: notification.message,
        groupId: message.groupId,
      }).catch((error) => console.warn('Expense dispute resolution push failed:', error));
    });
  };

  const cancelExpenseDispute = async (expense) => {
    if (!db) throw new Error('Cancelling expense disputes requires an active connection.');
    if (!activeUserId || !expense?.id || !expense.activeDisputeId || !expense.groupId) {
      throw new Error('This expense does not have an active dispute.');
    }

    const expenseRef = doc(db, 'expenses', expense.id);
    const disputeRef = doc(db, 'messages', expense.activeDisputeId);
    const groupRef = doc(db, 'groups', expense.groupId);
    const cancelledAt = new Date().toISOString();
    const cancellerName = activeUser?.username || 'A member';
    const notificationDocs = [];

    await runTransaction(db, async (transaction) => {
      notificationDocs.length = 0;
      const [expenseSnapshot, disputeSnapshot, groupSnapshot] = await Promise.all([
        transaction.get(expenseRef),
        transaction.get(disputeRef),
        transaction.get(groupRef),
      ]);
      if (!expenseSnapshot.exists() || !disputeSnapshot.exists() || !groupSnapshot.exists()) {
        throw new Error('This dispute or expense no longer exists.');
      }
      const dispute = disputeSnapshot.data();
      const group = groupSnapshot.data();
      if (!group.members?.includes(activeUserId)) {
        throw new Error('You must be a group member to cancel a dispute.');
      }
      if (dispute.type !== 'expense_dispute' || dispute.status !== 'open') {
        throw new Error('This dispute is no longer open.');
      }
      if (dispute.disputedBy !== activeUserId) {
        throw new Error('Only the member who raised this dispute can cancel it.');
      }
      if (expenseSnapshot.data().activeDisputeId !== disputeRef.id) {
        throw new Error('This expense is no longer linked to this dispute.');
      }

      transaction.update(disputeRef, {
        status: 'cancelled',
        cancelledBy: activeUserId,
        cancelledByName: cancellerName,
        cancelledAt,
      });
      transaction.update(expenseRef, {
        activeDisputeId: null,
        activeDisputeBy: null,
        activeDisputeByName: null,
        activeDisputeCreatedAt: null,
      });

      (group.members || []).filter((recipientId) => (
        recipientId !== activeUserId
        && !users.find((member) => member.id === recipientId)?.mutedGroupIds?.includes(expense.groupId)
      )).forEach((recipientId) => {
        const notification = {
          id: `expense_dispute_cancelled_${disputeRef.id}_${recipientId}`,
          recipientId,
          senderId: activeUserId,
          createdBy: activeUserId,
          createdByName: cancellerName,
          groupId: expense.groupId,
          type: 'EXPENSE_DISPUTE_CANCELLED',
          message: `${cancellerName} cancelled the dispute about "${dispute.expenseTitle || 'an expense'}".`,
          createdAt: cancelledAt,
          read: false,
        };
        notificationDocs.push(notification);
        transaction.set(doc(db, 'notifications', notification.id), notification);
      });
    });

    notificationDocs.forEach((notification) => {
      triggerPushNotification({
        senderId: activeUserId,
        recipientId: notification.recipientId,
        title: 'Expense dispute cancelled',
        message: notification.message,
        groupId: expense.groupId,
      }).catch((error) => console.warn('Expense dispute cancellation push failed:', error));
    });
  };

  const saveMonthlyRent = async (newRent) => {
    if (db) {
      const rentRef = doc(db, 'monthlyRents', newRent.id);
      await runTransaction(db, async (transaction) => {
        const existingRent = await transaction.get(rentRef);
        if (existingRent.exists()) {
          throw new Error('Rent has already been added for this month.');
        }
        transaction.set(rentRef, newRent);
      });
    } else {
      if (monthlyRents.some((rent) => rent.id === newRent.id)) {
        throw new Error('Rent has already been added for this month.');
      }
      setMonthlyRents((previous) => {
        const next = [...previous, newRent];
        localStorage.setItem('rs_monthly_rents', JSON.stringify(next));
        return next;
      });
    }

    const group = groups.find((item) => item.id === newRent.groupId);
    if (!group) return;

    const createdAt = new Date().toISOString();
    const senderName = activeUser?.username || 'A roommate';
    const monthLabel = new Date(`${newRent.month}-01T00:00:00`).toLocaleDateString(
      'en-US',
      { month: 'long', year: 'numeric' }
    );
    const rentNotifications = group.members
      .map((recipientId) => ({
        id: `rent_added_${newRent.id}_${recipientId}`,
        recipientId,
        senderId: activeUserId,
        createdBy: activeUserId,
        createdByName: senderName,
        groupId: group.id,
        type: 'RENT_ADDED',
        message: `${senderName} added ${monthLabel} rent in ${group.name}. Your share is ${formatCurrency(newRent.shares?.[recipientId], newRent.currency)}.`,
        createdAt,
        read: recipientId === activeUserId,
      }));

    try {
      await saveNotifications(rentNotifications);
    } catch (error) {
      console.warn('Rent activity notification failed:', error);
    }
    rentNotifications.forEach((notification) => {
      if (notification.recipientId === activeUserId) return;
      const recipient = users.find((item) => item.id === notification.recipientId);
      if (recipient?.mutedGroupIds?.includes(group.id)) return;
      triggerPushNotification({
        senderId: activeUserId,
        recipientId: notification.recipientId,
        title: `${group.name}: rent added`,
        message: notification.message,
        groupId: group.id,
      }).catch((error) => console.warn('Rent push notification failed:', error));
    });
  };

  const markMonthlyRentPaid = async (rentId, memberId) => {
    const payment = { paid: true, paidAt: new Date().toISOString() };
    if (db) {
      await updateDoc(
        doc(db, 'monthlyRents', rentId),
        new FieldPath('payments', memberId),
        payment
      );
      return;
    }

    setMonthlyRents((previous) => {
      const next = previous.map((rent) => rent.id === rentId
        ? { ...rent, payments: { ...rent.payments, [memberId]: payment }, updatedAt: payment.paidAt }
        : rent
      );
      localStorage.setItem('rs_monthly_rents', JSON.stringify(next));
      return next;
    });
  };

  const deleteMonthlyRent = async (rentId) => {
    const rent = monthlyRents.find((item) => item.id === rentId);
    const group = groups.find((item) => item.id === rent?.groupId);
    if (!rent || !group) throw new Error('Rent record no longer exists.');
    if (group.createdBy !== activeUserId) {
      throw new Error('Only the group admin can delete rent.');
    }

    if (db) {
      await deleteDoc(doc(db, 'monthlyRents', rentId));
      return;
    }

    setMonthlyRents((previous) => {
      const next = previous.filter((item) => item.id !== rentId);
      localStorage.setItem('rs_monthly_rents', JSON.stringify(next));
      return next;
    });
  };

  const deleteExpense = async (expenseId) => {
    if (db) {
      const expenseRef = doc(db, 'expenses', expenseId);
      const notificationDocs = [];
      const deletedAt = new Date().toISOString();
      const deleterName = activeUser?.username || 'A member';
      await runTransaction(db, async (transaction) => {
        notificationDocs.length = 0;
        const expenseSnapshot = await transaction.get(expenseRef);
        if (!expenseSnapshot.exists()) throw new Error('This expense no longer exists.');
        const expense = expenseSnapshot.data();
        if (!activeUserId || (expense.createdBy !== activeUserId && expense.paidBy !== activeUserId)) {
          throw new Error('Only the expense creator or payer can delete it.');
        }

        if (expense.activeDisputeId) {
          const disputeRef = doc(db, 'messages', expense.activeDisputeId);
          const groupRef = doc(db, 'groups', expense.groupId);
          const [disputeSnapshot, groupSnapshot] = await Promise.all([
            transaction.get(disputeRef),
            transaction.get(groupRef),
          ]);
          if (!disputeSnapshot.exists() || !groupSnapshot.exists()) {
            throw new Error('This dispute or its group no longer exists.');
          }

          const dispute = disputeSnapshot.data();
          const group = groupSnapshot.data();
          if (
            dispute.type !== 'expense_dispute' ||
            dispute.status !== 'open' ||
            dispute.expenseId !== expenseId
          ) {
            throw new Error('This expense is no longer linked to an open dispute.');
          }
          if (!group.members?.includes(activeUserId)) {
            throw new Error('You must be a group member to delete this expense.');
          }

          transaction.update(disputeRef, {
            status: 'resolved',
            resolvedBy: activeUserId,
            resolvedByName: deleterName,
            resolvedAt: deletedAt,
            resolutionAction: 'delete',
          });

          (group.members || []).filter((recipientId) => (
            recipientId !== activeUserId
            && !users.find((member) => member.id === recipientId)?.mutedGroupIds?.includes(expense.groupId)
          )).forEach((recipientId) => {
            const notification = {
              id: `expense_dispute_deleted_${dispute.id}_${recipientId}`,
              recipientId,
              senderId: activeUserId,
              createdBy: activeUserId,
              createdByName: deleterName,
              groupId: expense.groupId,
              type: 'EXPENSE_DISPUTE_DELETED',
              message: `${deleterName} deleted "${dispute.expenseTitle || expense.title || 'the disputed expense'}" and resolved the dispute.`,
              createdAt: deletedAt,
              read: false,
            };
            notificationDocs.push(notification);
            transaction.set(doc(db, 'notifications', notification.id), notification);
          });
        }

        transaction.delete(expenseRef);
      });

      notificationDocs.forEach((notification) => {
        triggerPushNotification({
          senderId: activeUserId,
          recipientId: notification.recipientId,
          title: 'Disputed expense deleted',
          message: notification.message,
          groupId: notification.groupId,
        }).catch((error) => console.warn('Expense dispute deletion push failed:', error));
      });
      return;
    }
    const expense = expenses.find((item) => item.id === expenseId);
    if (!expense) throw new Error('This expense no longer exists.');
    if (!activeUserId || (expense.createdBy !== activeUserId && expense.paidBy !== activeUserId)) {
      throw new Error('Only the expense creator or payer can delete it.');
    }
    setExpenses((previous) => {
      const next = previous.filter((expense) => expense.id !== expenseId);
      localStorage.setItem('rs_expenses', JSON.stringify(next));
      return next;
    });
  };

  const deleteGroup = async (group) => {
    if (group.createdBy !== activeUserId) {
      throw new Error('Only the group admin can delete this group.');
    }

    const groupExpenses = expenses.filter((expense) => expense.groupId === group.id);
    const groupRents = monthlyRents.filter((rent) => rent.groupId === group.id);
    const { balances } = calculateSettlements(groupExpenses, group.members);
    if (Object.values(balances).some((balance) => Math.abs(balance) >= GROUP_DELETE_BALANCE_TOLERANCE)) {
      throw new Error('Settle all group balances of ₹1 or more before deleting this group.');
    }

    navigateTo({ view: 'dashboard', dashboardTab: 'groups' }, { replace: true });

    if (db) {
      await Promise.all([
        ...groupExpenses.map((expense) => deleteDoc(doc(db, 'expenses', expense.id))),
        ...groupRents.map((rent) => deleteDoc(doc(db, 'monthlyRents', rent.id))),
      ]);
      await deleteDoc(doc(db, 'groups', group.id));
    } else {
      setExpenses((previous) => {
        const next = previous.filter((expense) => expense.groupId !== group.id);
        localStorage.setItem('rs_expenses', JSON.stringify(next));
        return next;
      });
      setGroups((previous) => {
        const next = previous.filter((item) => item.id !== group.id);
        localStorage.setItem('rs_groups', JSON.stringify(next));
        return next;
      });
      setMonthlyRents((previous) => {
        const next = previous.filter((rent) => rent.groupId !== group.id);
        localStorage.setItem('rs_monthly_rents', JSON.stringify(next));
        return next;
      });
    }
  };

  const activeGroup = groups.find((group) => (
    group.id === currentGroupRoute
    || getGroupSlug(group.name, group.id) === currentGroupRoute
  ));
  const pushUserId = activeUser?.id;
  const pushNotificationsPaused = Boolean(activeUser?.notificationsPaused);
  const handleEnableWebNotifications = async () => {
    setWebNotificationPromptMessage('');
    try {
      const result = await requestWebNotificationPermission();
      if (!result.success) {
        setWebNotificationPromptMessage(result.error);
        return;
      }

      setWebNotificationPromptOpen(false);
      setPushPermissionRefresh((version) => version + 1);
    } catch (error) {
      console.error('Could not request web notification permission:', error);
      setWebNotificationPromptMessage(
        error instanceof Error ? error.message : 'Could not request notification permission.'
      );
    }
  };

  useEffect(() => {
    if (!pushUserId) return;
    if (pushNotificationsPaused) {
      unregisterPushNotifications(pushUserId).catch((error) => {
        console.error('Could not pause push notifications for this device.', error);
      });
      return;
    }
    if (!Capacitor.isNativePlatform()
      && (typeof Notification === 'undefined' || Notification.permission !== 'granted')) {
      return;
    }
    requestNotificationPermission({ id: pushUserId }).then((result) => {
      if (!result.success) console.warn('Push notifications are unavailable:', result.error);
    });
  }, [pushUserId, pushNotificationsPaused, pushPermissionRefresh]);

  useEffect(() => {
    const handleNotificationAction = (notification) => {
      if (!activeUserId || notification.data?.recipientId !== activeUserId) return;
      const notificationGroup = groups.find((group) => group.id === notification.data?.groupId);
      if (notificationGroup && navigateToRef.current) {
        navigateToRef.current({
          view: 'group',
          groupId: notificationGroup.id,
          groupName: notificationGroup.name,
          initialTab: 'expenses',
        });
      }
    };
    const removePushActionHandler = setPushNotificationActionHandler(handleNotificationAction);
    const handleServiceWorkerMessage = (event) => {
      if (event.data?.type === 'PUSH_NOTIFICATION_CLICK') {
        handleNotificationAction({ data: event.data.data || {} });
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);

    return () => {
      removePushActionHandler();
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [activeUserId, groups]);

  const visibleNotifications = notifications.filter((notification) => {
    const timestamp = getNotificationTimestamp(notification.createdAt);
    return notification.recipientId === activeUserId
      && (!notification.groupId || !mutedGroupIds.includes(notification.groupId))
      && (timestamp === null || timestamp >= notificationCutoff);
  });

  if (window.location.pathname === '/admin') {
    return (
      <Suspense fallback={<LaunchScreen />}>
        <AdminPanel />
      </Suspense>
    );
  }

  if (loading) {
    return <LaunchScreen />;
  }
  if (activeUserId && !usersLoaded) {
    return <LaunchScreen />;
  }

  return (
    <div
      className="fixed inset-x-0 top-[var(--app-top,0px)] z-0 flex h-[var(--app-height,100dvh)] w-full flex-col overflow-hidden bg-white font-sans text-slate-900"
    >
      <Toast toast={toast} />
      {webNotificationPromptOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="web-notification-prompt-title"
            className="w-full max-w-sm rounded-3xl border border-white/80 bg-white p-6 text-slate-900 shadow-2xl"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF4EF] text-[#356447]">
              <Bell size={23} />
            </div>
            <h2 id="web-notification-prompt-title" className="text-lg font-extrabold">
              Stay in the loop
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Allow notifications so you can get updates about group expenses, messages, and settlements on this device.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Your browser will ask for permission when you tap Enable. On iPhone or iPad, open Sharebills from its Home Screen icon to receive web notifications.
            </p>
            {webNotificationPromptMessage && (
              <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                {webNotificationPromptMessage}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
                <button
                  type="button"
                  onClick={handleEnableWebNotifications}
                  className="min-h-11 rounded-xl bg-[#356447] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#2C503A]"
                >
                  Enable notifications
                </button>
              )}
              <button
                type="button"
                onClick={() => setWebNotificationPromptOpen(false)}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                {typeof Notification !== 'undefined' && Notification.permission === 'denied'
                  ? 'Continue'
                  : 'Not now'}
              </button>
            </div>
          </section>
        </div>
      )}
      {incomingChat && (
        <IncomingChatAlert
          key={incomingChat.id}
          message={incomingChat}
          sender={users.find((user) => user.id === incomingChat.senderId)}
          group={groups.find((group) => group.id === incomingChat.groupId)}
          hidden={currentView === 'group' && activeGroup?.id === incomingChat.groupId}
          onClose={() => setIncomingChat(null)}
          onOpen={() => {
            const incomingGroup = groups.find((group) => group.id === incomingChat.groupId);
            setIncomingChat(null);
            if (incomingGroup) {
              navigateTo({
                view: 'group',
                groupId: incomingGroup.id,
                groupName: incomingGroup.name,
                initialTab: 'chat',
              });
            }
          }}
        />
      )}
      {!activeUser && (authMode || isAppWelcomeScreen) ? (
        <AuthScreen
          key={authMode}
          users={users}
          onLoadUsers={loadUsersForAuth}
          onSaveUser={saveUser}
          onLogin={handleLogin}
          initialMode={authMode || 'signup'}
          isStandaloneApp={isAppWelcomeScreen}
          onBackToLanding={isAppWelcomeScreen ? undefined : () => window.history.back()}
          theme={theme}
          onThemeChange={setTheme}
        />
      ) : !activeUser ? (
        <LandingPage
          onLogin={() => openAuth('login')}
          onCreateAccount={() => openAuth('signup')}
          deferredPromptAvailable={Boolean(deferredInstallPrompt)}
          onInstallApp={handleInstallApp}
          isAppInstalled={isAppInstalled}
          isStandaloneWebApp={isStandalonePwa}
        />
      ) : currentView === 'dashboard' ? (
        <Dashboard
          key={dashboardTab}
          deferredPromptAvailable={Boolean(deferredInstallPrompt)}
          onInstallApp={handleInstallApp}
          isAppInstalled={isAppInstalled}
          theme={theme}
          onThemeChange={setTheme}
          user={activeUser}
          users={users}
          initialTab={dashboardTab}
          groups={groups}
          expenses={expenses}
          rentRecords={monthlyRents}
          monthlyRents={monthlyRents}
          onMarkRentPaid={markMonthlyRentPaid}
          onLogout={handleLogout}
          onOpenGroup={(id, initialTab = 'expenses', unreadChatCount = 0, expenseDraft = null) => {
            const group = groups.find((item) => item.id === id);
            if (group) {
              setCurrentGroupUnreadChatCount(initialTab === 'chat' ? 0 : unreadChatCount);
              const tabToReturnTo = currentRouteRef.current.dashboardTab || dashboardTab;
              setReturnDashboardTab(tabToReturnTo);
              navigateTo({
                view: 'group',
                groupId: group.id,
                groupName: group.name,
                initialTab,
                ...(expenseDraft ? { expenseDraft } : {}),
                returnDashboardTab: tabToReturnTo,
              });
            }
          }}
          onCreateGroup={() => navigateTo({ view: 'create_group' })}
          onJoinGroup={() => navigateTo({ view: 'join_group' })}
          onSaveExpense={saveExpense}
          onDeleteExpense={deleteExpense}
          onRaiseExpenseDispute={raiseExpenseDispute}
          onCancelExpenseDispute={cancelExpenseDispute}
          onSendNotification={saveNotifications}
          onUpdateUser={updateUser}
          notifications={visibleNotifications}
          onMarkNotificationsRead={markNotificationsRead}
          onClearNotifications={clearNotifications}
          onTabChange={(tab) => navigateTo({ view: 'dashboard', dashboardTab: tab })}
          showToast={showToast}
        />
      ) : currentView === 'create_group' ? (
        <CreateGroupModal user={activeUser} onSaveGroup={saveGroup} onBack={goBack} showToast={showToast} />
      ) : currentView === 'join_group' ? (
        <JoinGroupModal
          user={activeUser}
          groups={groups}
          onUpdateGroup={updateGroup}
          initialCode={new URLSearchParams(window.location.search).get('join') || new URLSearchParams(window.location.search).get('invite') || ''}
          onBack={goBack}
          showToast={showToast}
        />
      ) : currentView === 'group' && activeGroup ? (
        <Suspense fallback={<GroupLoadingSkeleton />}>
          <GroupView
            key={activeGroup.id}
            group={activeGroup}
            initialTab={currentGroupInitialTab}
            expenseDraft={currentGroupExpenseDraft}
            initialDrawerOpen={currentGroupDrawerOpen}
            onGroupTabChange={(tab, { replace = false } = {}) => {
              navigateTo({
                view: 'group',
                groupId: activeGroup.id,
                groupName: activeGroup.name,
                initialTab: tab,
                drawerOpen: false,
                returnDashboardTab,
              }, { replace });
            }}
            onOpenRoomOptions={() => {
              navigateTo({
                view: 'group',
                groupId: activeGroup.id,
                groupName: activeGroup.name,
                initialTab: 'expenses',
                drawerOpen: true,
                returnDashboardTab,
              }, { replace: currentGroupInitialTab !== 'expenses' });
            }}
            onCloseRoomOptions={() => {
              navigateTo({
                view: 'group',
                groupId: activeGroup.id,
                groupName: activeGroup.name,
                initialTab: currentGroupInitialTab,
                drawerOpen: false,
                returnDashboardTab,
              }, { replace: true });
            }}
            onActiveChatChange={setActiveChatGroupId}
            unreadChatCount={currentGroupUnreadChatCount}
            incomingChatMessage={incomingChat?.groupId === activeGroup.id ? incomingChat : null}
            onDismissIncomingChat={() => setIncomingChat(null)}
            onMarkChatNotificationsRead={markGroupChatNotificationsRead}
            groups={groups}
            expenses={expenses.filter((expense) => expense.groupId === activeGroup.id)}
            monthlyRents={monthlyRents.filter((rent) => rent.groupId === activeGroup.id)}
            onCreateRent={saveMonthlyRent}
            onMarkRentPaid={markMonthlyRentPaid}
            onDeleteRent={deleteMonthlyRent}
            onSaveExpense={saveExpense}
            onDeleteExpense={deleteExpense}
            onRaiseExpenseDispute={raiseExpenseDispute}
            onCancelExpenseDispute={cancelExpenseDispute}
            onResolveExpenseDispute={resolveExpenseDispute}
            onDeleteGroup={deleteGroup}
            onUpdateGroup={updateGroup}
            onSendNotification={saveNotifications}
            users={users}
            currentUser={activeUser}
            dashboardTab={returnDashboardTab}
            onBack={() => navigateTo(
              {
                view: 'dashboard',
                dashboardTab: returnDashboardTab,
              },
              { replace: true }
            )}
            onNavigateDashboard={(tab) => {
              navigateTo({ view: 'dashboard', dashboardTab: tab });
            }}
            showToast={showToast}
          />
        </Suspense>
      ) : null}
    </div>
  );
}