import { useState } from 'react';
import { Bell, ChevronDown, ShieldCheck } from 'lucide-react';
import NotificationSoundPublisher from './NotificationSoundPublisher';

export default function AdminSettingsPanel({
  user,
  onUpdateUser,
  testingPush,
  onTestPush,
  testPushStatus,
  pushSetupStatus,
  settingUpPush,
  onEnablePush,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={`rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs lg:col-span-12 lg:p-7 ${className}`}>
      <div className={`${isOpen ? 'mb-5 border-b border-slate-100 pb-4' : 'mb-4'}`}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">Admin settings</h2>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Private tools for managing and testing app notifications.</p>
      </div>

      {isOpen && (
        <div className="mb-4 space-y-4">
          {pushSetupStatus && (
            <p role="status" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-600">
              {pushSetupStatus}
            </p>
          )}
          <div className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700">
                  <Bell size={17} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Push notification diagnostics</p>
                  <p className="text-[11px] text-slate-500">Verify delivery and device permissions.</p>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {!user?.notificationsPaused && typeof Notification !== 'undefined' && Notification.permission === 'granted' && (
                  <button
                    type="button"
                    onClick={onEnablePush}
                    disabled={settingUpPush}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    {settingUpPush ? 'Setting up…' : 'Refresh setup'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onTestPush}
                  disabled={testingPush}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {testingPush ? 'Testing…' : 'Test push'}
                </button>
              </div>
            </div>
            {testPushStatus && (
              <p className={`rounded-lg border p-2.5 font-mono text-xs break-all ${
                testPushStatus.startsWith('Success')
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : testPushStatus.startsWith('Error') || testPushStatus.startsWith('Trigger Error')
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'bg-slate-100 text-slate-700'
              }`}>
                {testPushStatus}
              </p>
            )}
          </div>

          <NotificationSoundPublisher user={user} onUpdateUser={onUpdateUser} />
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:text-blue-700"
        >
          {isOpen ? 'Close admin settings' : 'Open admin settings'}
          <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </section>
  );
}
