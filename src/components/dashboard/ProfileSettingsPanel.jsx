import { Bell, KeyRound, Moon, Sun } from 'lucide-react';
import AdminSettingsPanel from './AdminSettingsPanel';
import NotificationSoundSettings from './NotificationSoundSettings';

export default function ProfileSettingsPanel({
  user,
  theme,
  onThemeChange,
  savingNotificationPreference,
  onTogglePausedNotifications,
  pushSetupStatus,
  settingUpPush,
  onEnablePush,
  onSendCampaign,
  resetPasswordLoading,
  onSendPasswordReset,
  resetPasswordFeedback,
  canViewPushDiagnostics,
  testingPush,
  onTestPush,
  testPushStatus,
  onUpdateUser,
  sharedSounds,
}) {
  return (
    <>
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
                onClick={onEnablePush}
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
              onClick={onTogglePausedNotifications}
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
            onClick={onSendPasswordReset}
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

      <NotificationSoundSettings
        user={user}
        onUpdateUser={onUpdateUser}
        sharedSounds={sharedSounds}
      />
    </section>
    {canViewPushDiagnostics && (
      <AdminSettingsPanel
        user={user}
        onUpdateUser={onUpdateUser}
        testingPush={testingPush}
        onTestPush={onTestPush}
        testPushStatus={testPushStatus}
        pushSetupStatus={pushSetupStatus}
        settingUpPush={settingUpPush}
        onEnablePush={onEnablePush}
        onSendCampaign={onSendCampaign}
      />
    )}
    </>
  );
}
