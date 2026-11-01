const SESSION_COOKIE = 'roomsplit_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_RECORD_BYTES = 850 * 1024;
const MAX_LIST_SIZE = 500;
const ROOM_SPLIT_FIREBASE_PROJECT_ID = 'roomsplit-test';
const PUSH_ALLOWED_ORIGINS = new Set([
  'https://split-bills.taranveer.in',
  'https://sharebills.in',
  'https://www.sharebills.in',
  'capacitor://localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const ALLOWED_COLLECTIONS = new Set([
  'users',
  'groups',
  'expenses',
  'notifications',
  'messages',
  'calls',
  'settings',
]);

let tokenCache = null;

function getServiceAccount(env) {
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const account = typeof env.FIREBASE_SERVICE_ACCOUNT === 'string'
        ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
        : env.FIREBASE_SERVICE_ACCOUNT;
      if (account?.project_id && account?.client_email && account?.private_key) {
        return {
          projectId: account.project_id,
          clientEmail: account.client_email,
          privateKey: account.private_key,
        };
      }
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT must contain valid service-account JSON');
    }
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email, or private_key');
  }

  return {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY,
  };
}

function getServiceAccountSource(env) {
  if (env.FIREBASE_SERVICE_ACCOUNT) return 'FIREBASE_SERVICE_ACCOUNT';
  if (env.FIREBASE_PROJECT_ID || env.FIREBASE_CLIENT_EMAIL || env.FIREBASE_PRIVATE_KEY) {
    return 'FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY';
  }
  return 'none';
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function encodeBase64Url(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signNotificationAvatarUrl(userId, expiresAt, privateKey) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(privateKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${userId}:${expiresAt}`),
  );
  return encodeBase64Url(new Uint8Array(signature));
}

async function getNotificationAvatarUrl(request, userId, photoDataUrl, privateKey) {
  if (typeof photoDataUrl !== 'string' || !photoDataUrl) return '';

  if (photoDataUrl.length <= 2048) {
    try {
      const photoUrl = new URL(photoDataUrl);
      if (photoUrl.protocol === 'https:' && !photoUrl.username && !photoUrl.password) {
        return photoUrl.href;
      }
    } catch {
      // Profile photos may be stored as data URLs instead of hosted URLs.
    }
  }

  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(photoDataUrl)) {
    return '';
  }

  const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
  const signature = await signNotificationAvatarUrl(userId, expiresAt, privateKey);
  const avatarUrl = new URL(`/api/notification-avatar/${encodeURIComponent(userId)}`, request.url);
  avatarUrl.searchParams.set('expires', String(expiresAt));
  avatarUrl.searchParams.set('signature', signature);
  return avatarUrl.href;
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function equalStrings(left, right) {
  return equalBytes(new TextEncoder().encode(String(left || '')), new TextEncoder().encode(String(right || '')));
}

function parseCookies(request) {
  return (request.headers.get('Cookie') || '').split(';').reduce((cookies, entry) => {
    const separator = entry.indexOf('=');
    if (separator > 0) cookies.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim());
    return cookies;
  }, new Map());
}

function hasAdminCredentials(env) {
  return Boolean(env.ADMIN_USERNAME && env.ADMIN_PASSWORD && env.ADMIN_SESSION_SECRET?.length >= 32);
}

async function signSession(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

async function getAdminSession(request, env) {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token || !env.ADMIN_SESSION_SECRET) return null;
  const separator = token.lastIndexOf('.');
  if (separator < 1) return null;

  const payload = token.slice(0, separator);
  let providedSignature;
  let session;
  try {
    providedSignature = decodeBase64Url(token.slice(separator + 1));
    session = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
  } catch {
    return null;
  }

  const expectedSignature = await signSession(payload, env.ADMIN_SESSION_SECRET);
  if (!equalBytes(expectedSignature, providedSignature)) return null;
  if (session.sub !== env.ADMIN_USERNAME || session.exp <= Date.now() / 1000) return null;
  return { username: session.sub };
}

function sessionCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}${secure}`;
}

function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])) } };
  }
  throw new Error('Unsupported Firestore field value');
}

function fromFirestoreValue(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function toFirestoreFields(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, toFirestoreValue(value)]));
}

function documentFromFirestore(document) {
  const id = document.name.split('/').pop();
  return { ...fromFirestoreFields(document.fields), id };
}

function sanitizeRecord(collectionName, record) {
  const sanitized = { ...record };
  if (collectionName === 'users') {
    delete sanitized.password;
    delete sanitized.fcmTokens;
    delete sanitized.photoDataUrl;
  }
  return sanitized;
}

function pemToBytes(pem) {
  const normalizedPem = pem.trim().replace(/\\n/g, '\n');
  const match = normalizedPem.match(
    /^-----BEGIN PRIVATE KEY-----\s*([\s\S]+?)\s*-----END PRIVATE KEY-----$/,
  );
  if (!match) {
    throw new Error('Firebase service-account private_key must be a complete PKCS#8 PEM key.');
  }

  const base64 = match[1].replace(/\s/g, '');
  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error(
      'Firebase service-account private_key contains invalid base64. Replace the live key with the complete, unedited private_key from its service-account JSON file.',
    );
  }
}

async function getAccessToken(env) {
  const serviceAccount = getServiceAccount(env);
  const cacheKey = `${serviceAccount.projectId}:${serviceAccount.clientEmail}`;
  if (tokenCache?.key === cacheKey && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error('Firebase Admin credentials are not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const unsignedToken = [
    encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    encodeBase64Url(JSON.stringify({
      iss: serviceAccount.clientEmail,
      scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })),
  ].join('.');
  let privateKey;
  try {
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToBytes(serviceAccount.privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('service-account private_key')) throw error;
    throw new Error(
      'Firebase service-account private_key is not a valid PKCS#8 key. Replace it with the complete private_key from the service-account JSON file.',
      { cause: error },
    );
  }
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsignedToken));
  const assertion = `${unsignedToken}.${encodeBase64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || 'Could not authenticate with Firebase Admin');
  }
  tokenCache = { key: cacheKey, value: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return tokenCache.value;
}

async function firestoreRequest(env, path, options = {}) {
  const { projectId } = getServiceAccount(env);
  const accessToken = await getAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || 'Firestore request failed');
  return payload;
}

async function saveUserPushTokens(env, userId, tokens, updateTime) {
  const precondition = updateTime
    ? `&currentDocument.updateTime=${encodeURIComponent(updateTime)}`
    : '';
  return firestoreRequest(
    env,
    `users/${encodeURIComponent(userId)}?updateMask.fieldPaths=fcmTokens${precondition}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        fields: toFirestoreFields({ fcmTokens: tokens }),
      }),
    },
  );
}

async function parseRequestJson(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_RECORD_BYTES) throw new Error('Record is too large for the admin editor');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('A valid JSON body is required');
  }
}

async function handleDataRequest(request, env, collectionName) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const collectionPath = encodeURIComponent(collectionName);

  if (request.method === 'GET') {
    if (id) {
      const document = await firestoreRequest(env, `${collectionPath}/${encodeURIComponent(id)}`);
      return jsonResponse({ record: sanitizeRecord(collectionName, documentFromFirestore(document)) });
    }

    const result = await firestoreRequest(env, `${collectionPath}?pageSize=${MAX_LIST_SIZE + 1}`);
    const documents = result.documents || [];
    return jsonResponse({
      records: documents.slice(0, MAX_LIST_SIZE).map(documentFromFirestore).map((record) => sanitizeRecord(collectionName, record)),
      truncated: documents.length > MAX_LIST_SIZE || Boolean(result.nextPageToken),
    });
  }

  if (request.method === 'POST') {
    const payload = await parseRequestJson(request);
    if (!payload.record || typeof payload.record !== 'object' || Array.isArray(payload.record)) {
      return jsonResponse({ error: 'A JSON record is required' }, 400);
    }
    const id = typeof payload.record.id === 'string' && payload.record.id.trim()
      ? payload.record.id.trim()
      : crypto.randomUUID();
    const record = { ...payload.record, id };
    const document = await firestoreRequest(env, `${collectionPath}?documentId=${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ fields: toFirestoreFields(record) }),
    });
    return jsonResponse({ record: sanitizeRecord(collectionName, documentFromFirestore(document)) }, 201);
  }

  if (!id) return jsonResponse({ error: 'A record id is required' }, 400);
  const documentPath = `${collectionPath}/${encodeURIComponent(id)}`;
  if (request.method === 'DELETE') {
    await firestoreRequest(env, documentPath, { method: 'DELETE' });
    return jsonResponse({ deleted: true, id });
  }

  const existing = await firestoreRequest(env, documentPath);
  const payload = await parseRequestJson(request);
  if (!payload.record || typeof payload.record !== 'object' || Array.isArray(payload.record)) {
    return jsonResponse({ error: 'A JSON record is required' }, 400);
  }
  const record = { ...documentFromFirestore(existing), ...payload.record, id };
  const updated = await firestoreRequest(env, documentPath, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFirestoreFields(record) }),
  });
  return jsonResponse({ record: sanitizeRecord(collectionName, documentFromFirestore(updated)) });
}

async function handlePushRequest(request, env) {
  const origin = request.headers.get('Origin');
  const appOrigin = env.APP_ORIGIN || 'https://split-bills.taranveer.in';
  const allowedOrigins = new Set([...PUSH_ALLOWED_ORIGINS, appOrigin]);
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403);
  }

  const corsHeaders = {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    Vary: 'Origin',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { ...corsHeaders, Allow: 'OPTIONS, POST' });
  }

  let payload;
  try {
    payload = await parseRequestJson(request);
  } catch (error) {
    return jsonResponse({ error: error.message }, 400, corsHeaders);
  }

  const recipientId = typeof payload?.recipientId === 'string' ? payload.recipientId.trim() : '';
  const senderId = typeof payload?.senderId === 'string' ? payload.senderId.trim() : '';
  const title = typeof payload?.title === 'string' ? payload.title.slice(0, 120) : 'RoomSplit';
  const message = typeof payload?.message === 'string' ? payload.message.slice(0, 500) : 'New activity';
  const groupId = typeof payload?.groupId === 'string' ? payload.groupId.trim() : '';
  const avatarUserId = typeof payload?.avatarUserId === 'string' && payload.avatarUserId.trim()
    ? payload.avatarUserId.trim()
    : senderId;
  if (!recipientId) return jsonResponse({ error: 'recipientId is required' }, 400, corsHeaders);
  if (!senderId) return jsonResponse({ error: 'senderId is required' }, 400, corsHeaders);
  if (avatarUserId.length > 128) return jsonResponse({ error: 'avatarUserId is invalid' }, 400, corsHeaders);

  const credentialSource = getServiceAccountSource(env);
  let serviceAccount;
  try {
    serviceAccount = getServiceAccount(env);
  } catch (error) {
    console.error('Push credentials are invalid:', error.message);
    return jsonResponse({
      error: 'Push credentials are invalid',
      details: error.message,
      credentialSource,
    }, 503, corsHeaders);
  }

  const missingFields = Object.entries({
    projectId: serviceAccount.projectId,
    clientEmail: serviceAccount.clientEmail,
    privateKey: serviceAccount.privateKey,
  }).filter(([, value]) => !value).map(([name]) => name);
  if (missingFields.length) {
    console.error('Push credentials are incomplete:', { credentialSource, missingFields });
    return jsonResponse({
      error: 'Push credentials are incomplete',
      details: `Missing required fields: ${missingFields.join(', ')}`,
      credentialSource,
      missingFields,
    }, 503, corsHeaders);
  }

  if (serviceAccount.projectId !== ROOM_SPLIT_FIREBASE_PROJECT_ID) {
    console.error('Push service Firebase project mismatch:', {
      expectedProjectId: ROOM_SPLIT_FIREBASE_PROJECT_ID,
      configuredProjectId: serviceAccount.projectId,
      credentialSource,
    });
    return jsonResponse({
      error: 'Firebase project mismatch',
      details: 'The configured service account project does not match the Firebase project used by the app.',
      expectedProjectId: ROOM_SPLIT_FIREBASE_PROJECT_ID,
      configuredProjectId: serviceAccount.projectId,
      credentialSource,
    }, 503, corsHeaders);
  }

  let stage = 'verify Firebase sign-in';
  try {
    const authorization = request.headers.get('Authorization') || '';
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!idToken || !env.FIREBASE_WEB_API_KEY) {
      return jsonResponse({ error: 'Firebase authentication is required' }, 401, corsHeaders);
    }
    const authResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    const authResult = await authResponse.json();
    const authenticatedUser = authResult.users?.[0];
    if (!authResponse.ok || !authenticatedUser) {
      return jsonResponse({ error: 'Authenticated user does not match the sender' }, 403, corsHeaders);
    }

    if (authenticatedUser.localId !== senderId) {
      stage = 'authenticate Firebase Admin and load sender account';
      const senderDocument = await firestoreRequest(env, `users/${encodeURIComponent(senderId)}`);
      const sender = documentFromFirestore(senderDocument);
      const verifiedEmailMatches = authenticatedUser.emailVerified === true
        && typeof authenticatedUser.email === 'string'
        && typeof sender.email === 'string'
        && authenticatedUser.email.toLowerCase() === sender.email.toLowerCase();
      if (!verifiedEmailMatches) {
        return jsonResponse({
          error: 'Authenticated user does not match the sender',
          details: 'Sign in with the Firebase account linked to this RoomSplit account. Legacy accounts must have a verified matching email.',
        }, 403, corsHeaders);
      }
    }

    if (senderId !== recipientId && !groupId) {
      return jsonResponse({ error: 'A group is required when sending a notification to another user' }, 400, corsHeaders);
    }

    stage = 'authenticate Firebase Admin and load recipient account/push tokens';
    const userDocument = await firestoreRequest(env, `users/${encodeURIComponent(recipientId)}`);
    const user = documentFromFirestore(userDocument);
    if (groupId) {
      stage = 'authenticate Firebase Admin and verify group membership';
      const groupDocument = await firestoreRequest(env, `groups/${encodeURIComponent(groupId)}`);
      const group = documentFromFirestore(groupDocument);
      if (!Array.isArray(group.members)
        || !group.members.includes(senderId)
        || !group.members.includes(recipientId)
        || !group.members.includes(avatarUserId)) {
        return jsonResponse({ error: 'Sender, recipient, and avatar user must all be members of the group' }, 403, corsHeaders);
      }
      if (Array.isArray(user.mutedGroupIds) && user.mutedGroupIds.includes(groupId)) {
        return jsonResponse({ success: true, muted: true, count: 0 }, 200, corsHeaders);
      }
    } else if (avatarUserId !== senderId) {
      return jsonResponse({ error: 'A different avatar user requires a group' }, 400, corsHeaders);
    }

    stage = 'load notification sender profile photo';
    const avatarUserDocument = await firestoreRequest(env, `users/${encodeURIComponent(avatarUserId)}`);
    const avatarUser = documentFromFirestore(avatarUserDocument);
    const avatarUrl = await getNotificationAvatarUrl(
      request,
      avatarUserId,
      avatarUser.photoDataUrl,
      serviceAccount.privateKey,
    );
    const fallbackIcon = new URL('/sharebills-notification-icon.png', request.url).href;
    const notificationImage = avatarUrl || fallbackIcon;

    const storedTokens = Array.isArray(user.fcmTokens) ? user.fcmTokens : [];
    const tokens = [...new Set(storedTokens
      .filter((token) => typeof token === 'string' && token.length > 0))];
    if (!tokens.length) {
      if (storedTokens.length) {
        await saveUserPushTokens(env, recipientId, [], userDocument.updateTime);
      }
      return jsonResponse({ success: false, message: 'No registered device tokens found', count: 0 }, 200, corsHeaders);
    }

    stage = 'get Firebase Cloud Messaging access token';
    const accessToken = await getAccessToken(env);
    stage = 'send message through Firebase Cloud Messaging';
    const results = await Promise.all(tokens.map(async (token) => {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.projectId)}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body: message },
              data: { groupId, recipientId, url: '/' },
              android: {
                priority: 'HIGH',
                notification: {
                  channel_id: 'default',
                  sound: 'default',
                  icon: 'ic_stat_sharebills',
                  color: '#3E7754',
                  image: notificationImage,
                },
              },
              webpush: {
                headers: { Urgency: 'high' },
                fcm_options: {
                  link: new URL('/', request.url).href,
                },
                notification: {
                  icon: notificationImage,
                  badge: new URL('/sharebills-notification-badge.png', request.url).href,
                },
              },
              apns: {
                headers: { 'apns-priority': '10' },
                payload: { aps: { sound: 'default' } },
              },
            },
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      const errorStatus = payload.error?.status;
      const unregistered = errorStatus === 'UNREGISTERED'
        || payload.error?.details?.some((detail) => detail.errorCode === 'UNREGISTERED');
      return { ok: response.ok, status: response.status, token, unregistered };
    }));
    const count = results.filter((result) => result.ok).length;
    const staleTokens = results
      .filter((result) => result.unregistered)
      .map((result) => result.token);
    const retainedTokens = tokens.filter((token) => !staleTokens.includes(token));
    const hasDuplicateOrInvalidEntries = tokens.length !== storedTokens.length;
    let tokenCleanupWarning = '';
    if (hasDuplicateOrInvalidEntries || staleTokens.length) {
      try {
        await saveUserPushTokens(env, recipientId, retainedTokens, userDocument.updateTime);
      } catch (error) {
        tokenCleanupWarning = 'Push tokens could not be fully cleaned up.';
        console.error('Could not remove stale push tokens:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    if (!count) {
      console.error('FCM delivery failed:', results.map(({ status }) => status));
      return jsonResponse({ success: false, error: 'FCM rejected all registered device tokens', count: 0 }, 502, corsHeaders);
    }
    return jsonResponse({
      success: true,
      count,
      ...(tokenCleanupWarning ? { tokenCleanupWarning } : {}),
    }, 200, corsHeaders);
  } catch (error) {
    const rawDetails = error instanceof Error ? error.message : 'Unknown error';
    const details = rawDetails
      .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, '[redacted private key]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .slice(0, 500);
    console.error('Push dispatch failed:', { stage, details });
    const status = rawDetails.includes('NOT_FOUND') || rawDetails.includes('Not found') ? 404 : 500;
    return jsonResponse({
      error: status === 404 ? 'Recipient not found' : 'Push delivery failed',
      stage,
      details,
    }, status, corsHeaders);
  }
}

async function handleAdminRequest(request, env) {
  const url = new URL(request.url);
  const route = url.pathname;
  const method = request.method;

  if (method !== 'GET' && !isSameOrigin(request)) return jsonResponse({ error: 'Origin not allowed' }, 403);
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

  if (route === '/api/admin/login' && method === 'POST') {
    if (!hasAdminCredentials(env)) return jsonResponse({ error: 'Admin login is not configured' }, 503);
    let payload;
    try {
      payload = await parseRequestJson(request);
    } catch (error) {
      return jsonResponse({ error: error.message }, 400);
    }
    if (!payload || typeof payload !== 'object'
      || !equalStrings(payload.username, env.ADMIN_USERNAME)
      || !equalStrings(payload.password, env.ADMIN_PASSWORD)) {
      return jsonResponse({ error: 'Invalid admin credentials' }, 401);
    }
    const sessionPayload = encodeBase64Url(JSON.stringify({ sub: env.ADMIN_USERNAME, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
    const signature = encodeBase64Url(await signSession(sessionPayload, env.ADMIN_SESSION_SECRET));
    return jsonResponse(
      { authenticated: true, username: env.ADMIN_USERNAME },
      200,
      { 'Set-Cookie': sessionCookie(request, `${sessionPayload}.${signature}`, SESSION_SECONDS) },
    );
  }

  if (route === '/api/admin/session' && method === 'GET') {
    if (!hasAdminCredentials(env)) return jsonResponse({ error: 'Admin login is not configured' }, 503);
    const session = await getAdminSession(request, env);
    return jsonResponse(session ? { authenticated: true, ...session } : { authenticated: false });
  }

  if (route === '/api/admin/logout' && method === 'POST') {
    return jsonResponse(
      { authenticated: false },
      200,
      { 'Set-Cookie': sessionCookie(request, '', 0) },
    );
  }

  if (route === '/api/admin/data') {
    const session = await getAdminSession(request, env);
    if (!session) return jsonResponse({ error: 'Admin authentication required' }, 401);
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
      return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST, PATCH, DELETE, OPTIONS' });
    }
    const collectionName = url.searchParams.get('collection');
    if (!ALLOWED_COLLECTIONS.has(collectionName)) return jsonResponse({ error: 'Unsupported collection' }, 400);
    try {
      return await handleDataRequest(request, env, collectionName);
    } catch (error) {
      console.error('Admin data request failed:', error);
      const status = error.message.includes('NOT_FOUND') || error.message.includes('Not found') ? 404 : 500;
      return jsonResponse({ error: status === 404 ? 'Record not found' : 'Could not complete the admin data request' }, status);
    }
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

async function handleNotificationAvatarRequest(request, env) {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  }

  const url = new URL(request.url);
  let userId;
  try {
    userId = decodeURIComponent(url.pathname.slice('/api/notification-avatar/'.length));
  } catch {
    return new Response('Invalid avatar link', { status: 403 });
  }
  const expiresAt = Number(url.searchParams.get('expires'));
  const signature = url.searchParams.get('signature') || '';
  const serviceAccount = getServiceAccount(env);
  if (
    !/^[A-Za-z0-9._:@-]{1,128}$/.test(userId)
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= Math.floor(Date.now() / 1000)
    || expiresAt > Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    || !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    return new Response('Invalid avatar link', { status: 403 });
  }

  const expectedSignature = await signNotificationAvatarUrl(userId, expiresAt, serviceAccount.privateKey);
  if (!equalBytes(decodeBase64Url(signature), decodeBase64Url(expectedSignature))) {
    return new Response('Invalid avatar link', { status: 403 });
  }

  const document = await firestoreRequest(env, `users/${encodeURIComponent(userId)}`);
  const photoDataUrl = documentFromFirestore(document).photoDataUrl;
  const match = typeof photoDataUrl === 'string'
    && photoDataUrl.length <= 380_000
    ? photoDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i)
    : null;
  if (!match) return new Response('Avatar not found', { status: 404 });

  let bytes;
  try {
    const binary = atob(match[2]);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return new Response('Avatar is invalid', { status: 404 });
  }
  if (!bytes.length || bytes.length > 280_000) {
    return new Response('Avatar is invalid', { status: 404 });
  }

  return new Response(bytes, {
    headers: {
      'Content-Type': match[1].toLowerCase(),
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/send-push') {
      return handlePushRequest(request, env);
    }
    if (pathname.startsWith('/api/notification-avatar/')) {
      return handleNotificationAvatarRequest(request, env);
    }
    if (pathname.startsWith('/api/admin/')) {
      return handleAdminRequest(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};