import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { deleteToken, getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { reload } from 'firebase/auth';
import {
  arrayRemove,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, app, auth } from '../firebase';

const VAPID_KEY = 'BNPn8ktElldgtANhbx-7Ks2kizVEHjj6sdWju7gc0JAgsX6jd8TNBqxcy7Auu6C2lEZbgDV_DHlo2dg3_EbLkko';
const PUSH_API_URL = Capacitor.isNativePlatform()
  ? 'https://sharebills.in/api/send-push'
  : '/api/send-push';
const PUSH_TOKEN_STORAGE_KEY = 'rs_fcm_device_token';
let desiredUserId = null;
let currentPushToken = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
let boundToken = null;
let boundUserId = null;
let nativeTokenVerified = false;
let nativeListenersPromise = null;
let activationPromise = null;
let activationUserId = null;
let tokenMutationQueue = Promise.resolve();
let pushActionHandler = null;
const registrationWaiters = new Set();

function enqueueTokenMutation(operation) {
  const result = tokenMutationQueue.then(operation);
  tokenMutationQueue = result.catch((error) => {
    console.error('Push token ownership update failed:', error);
  });
  return result;
}

async function removeTokenFromAllUsers(token) {
  if (!db) throw new Error('Firebase is unavailable; the push token could not be removed.');

  return enqueueTokenMutation(async () => {
    const usersWithToken = await getDocs(query(
      collection(db, 'users'),
      where('fcmTokens', 'array-contains', token)
    ));
    const userDocs = usersWithToken.docs;

    for (let offset = 0; offset < userDocs.length; offset += 500) {
      const batch = writeBatch(db);
      userDocs.slice(offset, offset + 500).forEach((userDoc) => {
        batch.update(userDoc.ref, { fcmTokens: arrayRemove(token) });
      });
      await batch.commit();
    }

    if (boundToken === token) {
      boundToken = null;
      boundUserId = null;
    }
  });
}

async function bindTokenToUser(token, userId) {
  if (!token || !userId) return false;
  if (!db) throw new Error('Firebase is unavailable; the push token could not be saved.');

  return enqueueTokenMutation(async () => {
    if (desiredUserId !== userId) return false;

    const usersWithToken = await getDocs(query(
      collection(db, 'users'),
      where('fcmTokens', 'array-contains', token)
    ));
    if (desiredUserId !== userId) return false;

    const previousOwners = usersWithToken.docs.filter((userDoc) => userDoc.id !== userId);
    if (previousOwners.length + 1 > 500) {
      throw new Error('The device token is associated with too many accounts to update safely.');
    }

    const ownerRefs = [...previousOwners.map((userDoc) => userDoc.ref), doc(db, 'users', userId)];
    const bound = await runTransaction(db, async (transaction) => {
      const ownerDocs = await Promise.all(ownerRefs.map((ownerRef) => transaction.get(ownerRef)));
      if (desiredUserId !== userId) return false;

      ownerDocs.forEach((ownerDoc) => {
        if (ownerDoc.id === userId) {
          const currentTokens = ownerDoc.exists() && Array.isArray(ownerDoc.data().fcmTokens)
            ? ownerDoc.data().fcmTokens.filter((savedToken) => typeof savedToken === 'string' && savedToken)
            : [];
          transaction.set(ownerDoc.ref, {
            fcmTokens: [...new Set([...currentTokens, token])],
            lastActive: new Date().toISOString(),
          }, { merge: true });
        } else if (ownerDoc.exists()) {
          transaction.update(ownerDoc.ref, { fcmTokens: arrayRemove(token) });
        }
      });

      return true;
    });
    if (!bound) return false;

    if (desiredUserId === userId) {
      boundToken = token;
      boundUserId = userId;
      return true;
    }
    return false;
  });
}

function settleRegistrationWaiters(result) {
  for (const waiter of registrationWaiters) {
    window.clearTimeout(waiter.timeout);
    waiter.resolve(
      waiter.userId === desiredUserId
        ? result
        : { success: false, error: 'The active account changed during push registration.' }
    );
  }
  registrationWaiters.clear();
}

function waitForNativeRegistration(userId) {
  return new Promise((resolve) => {
    const waiter = {
      userId,
      resolve,
      timeout: window.setTimeout(() => {
        registrationWaiters.delete(waiter);
        resolve({ success: false, error: 'Token generation timed out (check Play Services or network).' });
      }, 12000),
    };
    registrationWaiters.add(waiter);
  });
}

async function processNativeToken(token) {
  const previousToken = currentPushToken || localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);

  if (previousToken && previousToken !== token) {
    await removeTokenFromAllUsers(previousToken);
  }

  const ownerId = desiredUserId;
  if (!ownerId) {
    await removeTokenFromAllUsers(token);
    return;
  }

  currentPushToken = token;
  localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  if (boundToken !== token || boundUserId !== ownerId) {
    const bound = await bindTokenToUser(token, ownerId);
    if (!bound) return;
  }
  nativeTokenVerified = true;
  settleRegistrationWaiters({ success: true, token });
}

function ensureNativeListeners() {
  if (nativeListenersPromise) return nativeListenersPromise;

  nativeListenersPromise = (async () => {
    const handles = [];
    try {
      handles.push(await PushNotifications.addListener('registration', ({ value }) => {
          if (!value) {
            settleRegistrationWaiters({ success: false, error: 'Native push registration returned an empty token.' });
            return;
          }
          processNativeToken(value).catch((error) => {
          console.error('Could not associate the refreshed push token.', error);
          settleRegistrationWaiters({ success: false, error: error.message });
        });
      }));
      handles.push(await PushNotifications.addListener('registrationError', (error) => {
        console.error('Native push registration failed:', error);
        settleRegistrationWaiters({
          success: false,
          error: error.message || 'Native push registration failed.',
        });
      }));
      handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const notification = action.notification;
        if (
          desiredUserId
          && notification?.data?.recipientId === desiredUserId
          && typeof pushActionHandler === 'function'
        ) {
          pushActionHandler(notification);
        }
      }));
    } catch (error) {
      await Promise.all(handles.map((handle) => handle.remove()));
      nativeListenersPromise = null;
      throw error;
    }
  })();

  return nativeListenersPromise;
}

async function registerNativePush(userId) {
  await ensureNativeListeners();
  if (desiredUserId !== userId) {
    return { success: false, error: 'The active account changed during push registration.' };
  }

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') {
    permission = await PushNotifications.requestPermissions();
  }
  const canDisplayNotifications = permission.receive === 'granted';
  if (desiredUserId !== userId) {
    return { success: false, error: 'The active account changed during push registration.' };
  }

  await PushNotifications.createChannel({
    id: 'default',
    name: 'General Notifications',
    description: 'Sharebills group activities and updates',
    importance: 5,
    visibility: 1,
    sound: 'default',
    vibration: true,
  });

  if (currentPushToken && nativeTokenVerified) {
    const bound = await bindTokenToUser(currentPushToken, userId);
    if (!bound) return { success: false, error: 'The active account changed during push registration.' };
    return canDisplayNotifications
      ? { success: true, token: currentPushToken }
      : { success: false, error: 'Notification permission denied.' };
  }

  const registration = waitForNativeRegistration(userId);
  try {
    await PushNotifications.register();
  } catch (error) {
    settleRegistrationWaiters({ success: false, error: error.message || 'Native push registration failed.' });
  }
  const result = await registration;
  if (result.success) nativeTokenVerified = true;
  return result.success && !canDisplayNotifications
    ? { success: false, error: 'Notification permission denied.' }
    : result;
}

async function registerWebPush(userId) {
  if (!('Notification' in window)
    || !('serviceWorker' in navigator)
    || !('PushManager' in window)) {
    return { success: false, error: 'Web push notifications are not supported on this browser.' };
  }

  const permissionRequest = Notification.permission === 'default'
    ? Notification.requestPermission()
    : Promise.resolve(Notification.permission);
  const supported = await isSupported();
  if (!supported || !('Notification' in window)) {
    return { success: false, error: 'Notifications unsupported on browser.' };
  }

  const permission = await permissionRequest;
  if (permission !== 'granted') {
    return {
      success: false,
      error: permission === 'denied'
        ? 'Notification permission is blocked in browser settings.'
        : 'Notification permission was not granted.',
    };
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), {
    serviceWorkerRegistration: registration,
    vapidKey: VAPID_KEY,
  });

  if (!token) return { success: false, error: 'Failed to generate a push token.' };
  if (desiredUserId !== userId) {
    currentPushToken = token;
    return { success: false, error: 'The active account changed during push registration.' };
  }
  const previousToken = currentPushToken || localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  currentPushToken = token;
  localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  if (previousToken && previousToken !== token) {
    await removeTokenFromAllUsers(previousToken);
  }
  const bound = await bindTokenToUser(token, userId);
  return bound
    ? { success: true, token }
    : { success: false, error: 'The active account changed during push registration.' };
}

export function requestNotificationPermission(currentUser) {
  const userId = currentUser?.id;
  if (!userId) return Promise.resolve({ success: false, error: 'No user ID logged in.' });

  desiredUserId = userId;
  if (activationPromise && activationUserId === userId) return activationPromise;

  activationUserId = userId;
  const activation = (Capacitor.isNativePlatform()
    ? registerNativePush(userId)
    : registerWebPush(userId)
  ).catch((error) => {
    console.error('Failed to register push notifications.', error);
    return { success: false, error: error.message || 'Push registration failed.' };
  });

  const trackedActivation = activation.finally(() => {
    if (activationPromise === trackedActivation) {
      activationPromise = null;
      activationUserId = null;
    }
  });
  activationPromise = trackedActivation;
  return trackedActivation;
}

export async function unregisterPushNotifications(userId) {
  if (userId && desiredUserId && userId !== desiredUserId) return;

  const pendingActivation = activationPromise;
  desiredUserId = null;
  activationPromise = null;
  activationUserId = null;
  settleRegistrationWaiters({
    success: false,
    error: 'Push registration cancelled because the account was signed out.',
  });

  await pendingActivation;
  await tokenMutationQueue;
  const token = currentPushToken || localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (token) {
    await removeTokenFromAllUsers(token);
  }

  if (Capacitor.isNativePlatform()) {
    await PushNotifications.unregister();
  } else if (await isSupported()) {
    await deleteToken(getMessaging(app));
  }

  currentPushToken = null;
  localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  boundToken = null;
  boundUserId = null;
  nativeTokenVerified = false;
  if (Capacitor.isNativePlatform()) {
    await PushNotifications.removeAllDeliveredNotifications();
  }
}

export function setPushNotificationActionHandler(handler) {
  pushActionHandler = handler;
  return () => {
    if (pushActionHandler === handler) pushActionHandler = null;
  };
}

export async function listenToForegroundMessages(onMessageReceived) {
  if (Capacitor.isNativePlatform()) {
    const listener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      onMessageReceived?.({
        notification: { title: notification.title, body: notification.body },
        data: notification.data || {},
      });
    });
    return () => listener.remove();
  }

  const supported = await isSupported();
  if (!supported) return undefined;

  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    if (onMessageReceived) onMessageReceived(payload);
  });
}

export async function triggerPushNotification({
  senderId,
  recipientId,
  title,
  message,
  groupId,
  avatarUserId,
}) {
  if (!senderId) throw new Error('A sender account is required to send push notifications.');
  const currentUser = auth?.currentUser;
  if (!currentUser) throw new Error('Sign in to Sharebills before sending a test notification.');
  if (currentUser.isAnonymous) {
    throw new Error('This legacy account is not linked to Firebase Auth. Add an email and a password of at least 6 characters in Profile, save, then try again.');
  }
  await reload(currentUser);
  if (currentUser.uid !== senderId && !currentUser.emailVerified) {
    throw new Error('Verify your account email, then try the notification again.');
  }
  const idToken = await currentUser.getIdToken(true);
  if (!idToken) throw new Error('Sign in to Sharebills before sending a test notification.');

  const response = await fetch(PUSH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      senderId,
      recipientId,
      title: title || 'Sharebills',
      message: message || 'You have a new update in your group.',
      groupId: groupId || '',
      ...(avatarUserId ? { avatarUserId } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Push delivery failed (${response.status}): ${detail}`);
  }

  const result = await response.json();
  if (!result.success || result.count < 1) {
    throw new Error(result.message || 'Push API accepted the request but delivered no notifications.');
  }

  return result;
}
