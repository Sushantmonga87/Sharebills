import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Lock,
  Mail,
  Trash2,
  UserCircle,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  QrCode,
  KeyRound,
  Camera,
  Bell,
  LogOut,
  Edit2,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import {
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateEmail,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../../firebase';
import { Button, Input } from '../common/UI';
import { requestNotificationPermission, triggerPushNotification } from '../../utils/notifications';
import AdminSettingsPanel from './AdminSettingsPanel';
import NotificationSoundSettings from './NotificationSoundSettings';
import ProfileSettingsPanel from './ProfileSettingsPanel';

export default function ProfileTab({
  user,
  onUpdateUser,
  onLogout,
  theme = 'light',
  onThemeChange,
  showToast,
  mobilePreview = false,
  sharedNotificationSounds = [],
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [upiId, setUpiId] = useState(user?.upiId || '');
  const [photoDataUrl, setPhotoDataUrl] = useState(user?.photoDataUrl || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordFeedback, setResetPasswordFeedback] = useState('');
  const [fallbackToast, setFallbackToast] = useState(false);
  const [testPushStatus, setTestPushStatus] = useState('');
  const [testingPush, setTestingPush] = useState(false);
  const [pushSetupStatus, setPushSetupStatus] = useState('');
  const [settingUpPush, setSettingUpPush] = useState(false);
  const [savingNotificationPreference, setSavingNotificationPreference] = useState(false);
  const canViewPushDiagnostics =
    user?.email?.trim().toLowerCase() === 'staranveer178@gmail.com';

  const handleSendPasswordReset = async () => {
    const resetEmail = auth.currentUser?.email || user?.email;
    if (!auth.currentUser || auth.currentUser.isAnonymous || !resetEmail) {
      setResetPasswordFeedback('Link this profile to an email account before resetting its password.');
      return;
    }

    setResetPasswordLoading(true);
    setResetPasswordFeedback('');
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetPasswordFeedback(`If a password login exists for ${resetEmail}, a reset link has been sent.`);
    } catch (error) {
      console.error('Could not send password reset email:', error);
      if (error.code === 'auth/network-request-failed') {
        setResetPasswordFeedback('Network error. Check your connection and try again.');
      } else if (error.code === 'auth/too-many-requests') {
        setResetPasswordFeedback('Too many requests. Wait a little before trying again.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setResetPasswordFeedback('Password reset is unavailable because email/password sign-in is disabled.');
      } else {
        setResetPasswordFeedback('Could not send a password reset link. Please try again.');
      }
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const handleTestPush = async () => {
    if (user?.notificationsPaused) {
      setTestPushStatus('Resume notifications before testing push delivery.');
      return;
    }

    setTestingPush(true);
    setTestPushStatus('Registering FCM Token...');
    try {
      const res = await requestNotificationPermission(user);
      if (!res?.success) {
        setTestPushStatus(`Error: ${res?.error || 'Failed to get permission or token'}`);
        return;
      }
      setTestPushStatus('Device registered. Sending test push...');
      const result = await triggerPushNotification({
        senderId: user.id,
        recipientId: user.id,
        title: 'Test Push Notification',
        message: 'Push notifications are working correctly on Sharebills!',
        groupId: '',
      });
      const deviceCount = result.count === 1 ? '1 registered device' : `${result.count} registered devices`;
      setTestPushStatus(`Success! Test push notification sent to ${deviceCount}.`);
      if (typeof showToast === 'function') showToast('Test push notification sent!');
    } catch (err) {
      console.error('Test push failed:', err);
      setTestPushStatus(`Trigger Error: ${err.message}`);
    } finally {
      setTestingPush(false);
    }
  };

  const handleSendCampaign = async ({ title, message, imageDataUrl, imageUrl }) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || firebaseUser.isAnonymous) {
      throw new Error('Sign in with the verified admin email before sending a campaign.');
    }

    const idToken = await firebaseUser.getIdToken(true);
    const broadcastUrl = Capacitor.isNativePlatform()
      ? 'https://sharebills.in/api/admin/broadcast'
      : '/api/admin/broadcast';
    const response = await fetch(broadcastUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        senderId: user.id,
        title,
        message,
        ...(imageDataUrl ? { imageDataUrl } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Campaign request failed (${response.status}).`);
    }
    return result;
  };

  const handleEnablePush = async () => {
    if (user?.notificationsPaused) {
      setPushSetupStatus('Resume notifications before enabling push on this device.');
      return;
    }

    setSettingUpPush(true);
    setPushSetupStatus('');
    try {
      const result = await requestNotificationPermission(user);
      if (!result?.success) {
        setPushSetupStatus(result?.error || 'Could not enable notifications on this device.');
        return;
      }
      setPushSetupStatus('Notifications are enabled on this device.');
    } catch (error) {
      console.error('Could not enable push notifications:', error);
      setPushSetupStatus(error.message || 'Could not enable notifications on this device.');
    } finally {
      setSettingUpPush(false);
    }
  };

  const handleTogglePausedNotifications = async () => {
    if (!onUpdateUser) {
      setPushSetupStatus('Notification preferences are unavailable right now.');
      return;
    }

    setSavingNotificationPreference(true);
    setPushSetupStatus('');
    try {
      await onUpdateUser(user.id, { notificationsPaused: !user.notificationsPaused });
    } catch (error) {
      console.error('Could not update notification preference:', error);
      setPushSetupStatus(error.message || 'Could not update notification preference.');
    } finally {
      setSavingNotificationPreference(false);
    }
  };

  const handlePhotoChange = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setLocalError('Choose an image file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setLocalError('Choose an image smaller than 8 MB.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const loadedImage = new Image();
        loadedImage.onload = () => resolve(loadedImage);
        loadedImage.onerror = () => reject(new Error('Could not load this image.'));
        loadedImage.src = objectUrl;
      });
      const scale = Math.min(1, 320 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not process this image.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const compressedPhoto = canvas.toDataURL('image/jpeg', 0.75);
      if (compressedPhoto.length > 280_000) {
        throw new Error('This image is too large after compression. Choose another image.');
      }
      setPhotoDataUrl(compressedPhoto);
      setLocalError('');
    } catch (error) {
      setLocalError(error.message || 'Could not process this image.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleUpdateProfile = async (event) => {
    event.preventDefault();
    setLocalError('');
    setLoading(true);

    try {
      let firebaseUser = auth.currentUser;
      if (password.trim() && password.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }

      const firestoreUpdates = {};
      let linkedLegacyAccount = false;
      const nextEmail = email.trim().toLowerCase();
      const emailChanged = nextEmail !== (user.email || '').toLowerCase();
      let emailVerificationSent = false;
      if (emailChanged && (!firebaseUser || firebaseUser.isAnonymous)) {
        if (!firebaseUser) {
          throw new Error('Email changes require a Firebase connection so the new address can be verified.');
        }
        if (!currentPassword.trim() && !password.trim()) {
          throw new Error('Add a password to this profile before changing its email so the new address can be verified.');
        }
      }
      if (firebaseUser?.isAnonymous && nextEmail && (currentPassword.trim() || password.trim())) {
        let linkedUser;
        if (currentPassword.trim()) {
          const existingCredential = await signInWithEmailAndPassword(auth, nextEmail, currentPassword);
          linkedUser = existingCredential.user;
          firebaseUser = linkedUser;
          if (password.trim() && password !== currentPassword) {
            await updatePassword(firebaseUser, password);
          }
        } else {
          try {
            const credential = EmailAuthProvider.credential(nextEmail, password);
            const linkedCredential = await linkWithCredential(firebaseUser, credential);
            linkedUser = linkedCredential.user;
            firebaseUser = linkedUser;
          } catch (error) {
            if (error.code === 'auth/email-already-in-use' || error.code === 'auth/credential-already-in-use') {
              throw new Error(
                'This email already has a Firebase account. Enter its current password above to link it, or use a different email.',
                { cause: error },
              );
            }
            throw error;
          }
        }
        if (!linkedUser.emailVerified) {
          await sendEmailVerification(linkedUser);
          emailVerificationSent = true;
        }
        firestoreUpdates.email = nextEmail;
        firestoreUpdates.password = '';
        linkedLegacyAccount = true;
      }
      if (firebaseUser && !firebaseUser.isAnonymous && !linkedLegacyAccount) {
        const needsReauthentication = Boolean(password.trim() || emailChanged);
        if (needsReauthentication) {
          if (!currentPassword.trim()) {
            throw new Error('Enter your current Firebase password to change your email or password.');
          }
          if (!firebaseUser.email) {
            throw new Error('This Firebase sign-in does not have an email/password credential.');
          }
          await reauthenticateWithCredential(
            firebaseUser,
            EmailAuthProvider.credential(firebaseUser.email, currentPassword),
          );
        }
      }
      if (name.trim() && name.trim() !== user.username) {
        if (firebaseUser) await updateProfile(firebaseUser, { displayName: name.trim() });
        firestoreUpdates.username = name.trim();
      }
      if (upiId.trim() !== (user.upiId || '')) firestoreUpdates.upiId = upiId.trim();
      if (!linkedLegacyAccount && emailChanged) {
        if (firebaseUser && !firebaseUser.isAnonymous) {
          await updateEmail(firebaseUser, nextEmail);
          await sendEmailVerification(firebaseUser);
          emailVerificationSent = true;
        }
        firestoreUpdates.email = nextEmail;
      }
      if (photoDataUrl !== (user.photoDataUrl || '')) firestoreUpdates.photoDataUrl = photoDataUrl;

      if (Object.keys(firestoreUpdates).length > 0) {
        if (typeof onUpdateUser === 'function') {
          await onUpdateUser(user.id, firestoreUpdates);
        } else {
          Object.assign(user, firestoreUpdates);
        }
      }

      if (password.trim() && !linkedLegacyAccount) {
        if (firebaseUser && !firebaseUser.isAnonymous) {
          await updatePassword(firebaseUser, password);
          if (typeof onUpdateUser === 'function') await onUpdateUser(user.id, { password: '' });
        } else if (typeof onUpdateUser === 'function') {
          await onUpdateUser(user.id, { password });
        }
      }
      setCurrentPassword('');
      setPassword('');

      if (typeof showToast === 'function') {
        showToast(linkedLegacyAccount
          ? (auth.currentUser?.emailVerified
            ? 'Profile linked to Firebase. Push notifications are ready.'
            : 'Profile linked. Verify your email to enable push notifications.')
          : emailVerificationSent
            ? `Verification email sent to ${nextEmail}. Confirm it to complete the email change.`
          : 'Profile updated successfully!');
      } else {
        setFallbackToast(true);
        setTimeout(() => setFallbackToast(false), 3000);
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Profile update error:', error);
      if (error.code === 'auth/email-already-in-use' || error.code === 'auth/credential-already-in-use') {
        setLocalError('This email is already linked to Firebase. Enter its current Firebase password to link this Sharebills profile.');
      } else if (
        error.code === 'auth/invalid-credential'
        || error.code === 'auth/wrong-password'
        || error.code === 'auth/user-not-found'
      ) {
        setLocalError('The Firebase password is incorrect. Check it, or reset it from the sign-in screen.');
      } else if (error.code === 'auth/weak-password') {
        setLocalError('Choose a password with at least 6 characters to link this account.');
      } else if (error.code === 'auth/requires-recent-login') {
        setLocalError(
          'For security, please log out and log back in before changing your password or email.'
        );
      } else if (error.code === 'auth/invalid-email') {
        setLocalError('The email address is not valid.');
      } else {
        setLocalError(error.message || 'Failed to update profile.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getInitials = () => (user?.username || 'U').charAt(0).toUpperCase();

  return (
    <div className={`mx-auto w-full max-w-[1360px] p-3 pb-20 ${mobilePreview ? '' : 'sm:px-4 sm:pb-20 sm:pt-2 lg:px-6 lg:pb-20 lg:pt-2'}`}>
      <div className="page-heading-bar mb-5 flex items-center justify-between gap-2.5">
        <div className="page-heading flex min-w-0 items-center gap-2.5 rounded-full p-0 pr-4">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-tr from-blue-600 to-blue-600 text-xs font-bold text-white shadow-sm">
            {photoDataUrl ? (
              <img src={photoDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              getInitials()
            )}
          </span>
          <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-900">
            Profile Settings
          </h1>
        </div>
        <div
          className={`page-heading-controls flex h-11 flex-shrink-0 items-center gap-1 rounded-full p-1.5 ${
            isEditing ? 'invisible' : ''
          }`}
          aria-hidden={isEditing}
        >
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              title="Sign out"
              tabIndex={isEditing ? -1 : 0}
              className="flex h-8 w-8 items-center justify-center rounded-full text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>

      {!isEditing ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs lg:col-span-5 lg:p-7">
            <div className="mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <UserCircle size={17} className="text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Profile ID</h2>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  setLocalError('');
                }}
                aria-label="Edit profile"
                title="Edit profile"
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
              >
                <Edit2 size={16} />
              </button>
            </div>
            <div className="flex flex-col items-center rounded-2xl bg-gradient-to-br from-blue-50 via-white to-emerald-50 px-5 py-7 text-center">
              <div className="relative mb-4">
                {photoDataUrl ? (
                  <img
                    src={photoDataUrl}
                    alt={`${user?.username || 'User'} profile`}
                    className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-md"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-slate-900 text-3xl font-bold text-white shadow-md">
                    {getInitials()}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white">
                  <CheckCircle2 size={12} />
                </span>
              </div>
              <h3 className="max-w-full truncate text-xl font-extrabold text-slate-900">{user?.username || 'Sharebills member'}</h3>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">Sharebills member</p>
            </div>

            <dl className="mt-5 space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                <Mail size={16} className="mt-0.5 flex-shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Email address</dt>
                  <dd className="mt-0.5 break-all text-xs font-semibold text-slate-800">{user?.email || 'No email set'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                <QrCode size={16} className="mt-0.5 flex-shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Settlement UPI ID</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs font-bold text-slate-800">{user?.upiId || 'Not configured'}</dd>
                </div>
              </div>
            </dl>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50/80 px-3.5 py-3 text-[11px] leading-relaxed text-slate-600">
              <ShieldCheck size={15} className="mt-0.5 flex-shrink-0 text-emerald-600" />
              <span>Your UPI handle is only visible to roommates inside your shared spaces.</span>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs lg:col-span-7 lg:p-7">
            <div className="mb-5 border-b border-slate-100 pb-4">
              <h2 className="text-sm font-bold text-slate-900">App settings</h2>
              <p className="mt-1 text-[11px] text-slate-500">Appearance, notifications, and account security for this device.</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
                    {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Appearance</p>
                    <p className="text-[11px] text-slate-500">{theme === 'dark' ? 'Dark theme is on' : 'Light theme is on'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={theme === 'dark'}
                  aria-label="Dark mode"
                  onClick={() => onThemeChange?.(theme === 'dark' ? 'light' : 'dark')}
                  className="ios-theme-switch"
                >
                  <span className="ios-theme-switch__thumb" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
                    <Bell size={17} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Pause notifications</p>
                    <p className="text-[11px] text-slate-500">
                      {user?.notificationsPaused
                        ? 'Push alerts are paused on your devices.'
                        : 'Push alerts are active on your devices.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  {!user?.notificationsPaused && typeof Notification !== 'undefined' && Notification.permission === 'default' && (
                    <button
                      type="button"
                      onClick={handleEnablePush}
                      disabled={settingUpPush}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
                    >
                      {settingUpPush ? 'Setting up…' : 'Enable'}
                    </button>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(user?.notificationsPaused)}
                    aria-label="Pause push notifications"
                    disabled={savingNotificationPreference}
                    onClick={handleTogglePausedNotifications}
                    className={`ios-theme-switch ${savingNotificationPreference ? 'cursor-wait opacity-60' : ''}`}
                  >
                    <span className="ios-theme-switch__thumb" />
                  </button>
                </div>
              </div>
              {pushSetupStatus && (
                <p role="status" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-600">
                  {pushSetupStatus}
                </p>
              )}

              <NotificationSoundSettings
                user={user}
                onUpdateUser={onUpdateUser}
                sharedSounds={sharedNotificationSounds}
              />

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
                    <KeyRound size={17} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Password security</p>
                    <p className="text-[11px] text-slate-500">Send a password reset link to your account email.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSendPasswordReset}
                  disabled={resetPasswordLoading}
                  className="flex-shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-blue-700 hover:border-blue-200 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {resetPasswordLoading ? 'Sending…' : 'Reset password'}
                </button>
              </div>
              {resetPasswordFeedback && (
                <p
                  role="status"
                  className={`rounded-xl border p-3 text-xs ${
                    resetPasswordFeedback.startsWith('If a password')
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  {resetPasswordFeedback}
                </p>
              )}
            </div>

            {canViewPushDiagnostics && (
              <AdminSettingsPanel
                user={user}
                onUpdateUser={onUpdateUser}
                className="mt-4"
                testingPush={testingPush}
                onTestPush={handleTestPush}
                onSendCampaign={handleSendCampaign}
                testPushStatus={testPushStatus}
                pushSetupStatus={pushSetupStatus}
                settingUpPush={settingUpPush}
                onEnablePush={handleEnablePush}
              />
            )}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs lg:col-span-5 lg:p-7">
            <div className="mb-5 flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <UserCircle size={17} className="text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Edit profile</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setLocalError('');
                  setName(user?.username || '');
                  setEmail(user?.email || '');
                  setUpiId(user?.upiId || '');
                  setPhotoDataUrl(user?.photoDataUrl || '');
                  setCurrentPassword('');
                  setPassword('');
                }}
                aria-label="Cancel editing profile"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
          {localError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-600">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <p>{localError}</p>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-5">
            <div className={`flex flex-col items-center gap-4 border-b border-slate-100 pb-5 ${mobilePreview ? '' : 'sm:flex-row'}`}>
              {photoDataUrl ? (
                <img
                  src={photoDataUrl}
                  alt="Profile preview"
                  className="h-16 w-16 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-xl font-bold text-white">
                  {getInitials()}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Camera size={14} />
                  <span>{photoDataUrl ? 'Change Photo' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="sr-only"
                  />
                </label>

                {photoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl('')}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                  >
                    <Trash2 size={14} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>

            <div className={`grid grid-cols-1 gap-4 ${mobilePreview ? '' : 'md:grid-cols-2'}`}>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <UserCircle size={14} />
                  <span>Display Name</span>
                </label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your Name"
                  required
                  style={{ fontSize: '14px' }}
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Mail size={14} />
                  <span>Email Address</span>
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="your@email.com"
                  style={{ fontSize: '14px' }}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <QrCode size={14} />
                <span>UPI ID for Reimbursements</span>
              </label>
              <Input
                value={upiId}
                onChange={(event) => setUpiId(event.target.value)}
                placeholder="e.g. name@bank"
                style={{ fontSize: '14px' }}
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Lock size={14} />
                <span>{auth.currentUser?.isAnonymous ? 'Current Firebase Password' : 'Current Password'}</span>
              </label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder={auth.currentUser?.isAnonymous
                  ? 'Enter current Firebase password'
                  : 'Enter your current password'}
                autoComplete="current-password"
                style={{ fontSize: '14px' }}
              />
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={resetPasswordLoading}
                className="mt-1 text-xs font-semibold text-blue-700 hover:text-blue-800 disabled:cursor-wait disabled:opacity-60"
              >
                {resetPasswordLoading ? 'Sending reset link…' : 'Forgot password?'}
              </button>
              {resetPasswordFeedback && (
                <p role="status" className="mt-1 text-xs text-slate-600">
                  {resetPasswordFeedback}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Lock size={14} />
                <span>{auth.currentUser?.isAnonymous ? 'New Firebase Password' : 'New Password'}</span>
              </label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Leave blank to keep the current password"
                autoComplete="new-password"
                minLength={6}
                style={{ fontSize: '14px' }}
              />
              {auth.currentUser?.isAnonymous && (
                <p className="mt-1.5 text-xs text-slate-500">
                  For an existing Firebase account, enter its current password above. To create a new linked account, enter a new password here.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsEditing(false);
                  setLocalError('');
                  setName(user?.username || '');
                  setEmail(user?.email || '');
                  setUpiId(user?.upiId || '');
                  setPhotoDataUrl(user?.photoDataUrl || '');
                  setCurrentPassword('');
                  setPassword('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
            </form>
          </section>

          <ProfileSettingsPanel
            user={user}
            theme={theme}
            onThemeChange={onThemeChange}
            savingNotificationPreference={savingNotificationPreference}
            onTogglePausedNotifications={handleTogglePausedNotifications}
            pushSetupStatus={pushSetupStatus}
            settingUpPush={settingUpPush}
            onEnablePush={handleEnablePush}
            onSendCampaign={handleSendCampaign}
            resetPasswordLoading={resetPasswordLoading}
            onSendPasswordReset={handleSendPasswordReset}
            resetPasswordFeedback={resetPasswordFeedback}
            canViewPushDiagnostics={canViewPushDiagnostics}
            testingPush={testingPush}
            onTestPush={handleTestPush}
            testPushStatus={testPushStatus}
            onUpdateUser={onUpdateUser}
            sharedSounds={sharedNotificationSounds}
          />
        </div>
      )}

      {fallbackToast && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 z-[60]">
          <div className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
            Profile updated!
          </div>
        </div>
      )}
    </div>
  );
}