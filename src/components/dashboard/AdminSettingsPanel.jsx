import { useRef, useState } from 'react';
import { Bell, ChevronDown, ImagePlus, Link2, Megaphone, Send, ShieldCheck, X } from 'lucide-react';
import NotificationSoundPublisher from './NotificationSoundPublisher';

const MAX_CAMPAIGN_IMAGE_BYTES = 500 * 1024;

function compressCampaignImage(file) {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Choose an image file.'));
  }
  if (file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error('Choose an image smaller than 8 MB.'));
  }

  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not process this image.'));
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (let quality = 0.84; quality >= 0.5; quality -= 0.08) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64Size = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
        if (base64Size <= MAX_CAMPAIGN_IMAGE_BYTES) {
          resolve(dataUrl);
          return;
        }
      }
      reject(new Error('This image is too large to compress. Choose a smaller image.'));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load this image.'));
    };
    image.src = objectUrl;
  });
}

export default function AdminSettingsPanel({
  user,
  onUpdateUser,
  testingPush,
  onTestPush,
  testPushStatus,
  pushSetupStatus,
  settingUpPush,
  onEnablePush,
  onSendCampaign,
  className = '',
}) {
  const imageInputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignImageMode, setCampaignImageMode] = useState('upload');
  const [campaignImageDataUrl, setCampaignImageDataUrl] = useState('');
  const [campaignImageUrl, setCampaignImageUrl] = useState('');
  const [processingCampaignImage, setProcessingCampaignImage] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState(null);

  const handleCampaignImageChange = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setProcessingCampaignImage(true);
    setCampaignStatus(null);
    try {
      const dataUrl = await compressCampaignImage(file);
      setCampaignImageDataUrl(dataUrl);
      setCampaignImageUrl('');
    } catch (error) {
      setCampaignStatus({ type: 'error', message: error.message || 'Could not process this image.' });
    } finally {
      setProcessingCampaignImage(false);
    }
  };

  const clearCampaignImage = () => {
    setCampaignImageDataUrl('');
    setCampaignImageUrl('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleCampaignSubmit = async (event) => {
    event.preventDefault();
    const title = campaignTitle.trim();
    const message = campaignMessage.trim();
    if (!title || !message) return;
    if (!window.confirm('Send this campaign to all Sharebills users? This cannot be undone.')) return;

    setSendingCampaign(true);
    setCampaignStatus(null);
    try {
      const result = await onSendCampaign({
        title,
        message,
        imageDataUrl: campaignImageMode === 'upload' ? campaignImageDataUrl : '',
        imageUrl: campaignImageMode === 'url' ? campaignImageUrl.trim() : '',
      });
      const deliverySummary = [
        `Campaign saved for ${result.savedNotifications} of ${result.recipients} users.`,
        `Push sent to ${result.pushSent} device${result.pushSent === 1 ? '' : 's'}.`,
      ];
      if (result.pushSkippedUsers) {
        deliverySummary.push(`Push skipped for ${result.pushSkippedUsers} user${result.pushSkippedUsers === 1 ? '' : 's'} with paused notifications or no registered devices.`);
      }
      if (result.pushFailures) {
        deliverySummary.push(`${result.pushFailures} push delivery${result.pushFailures === 1 ? ' failed' : 's failed'}.`);
      }
      if (result.failedUsers) {
        deliverySummary.push(`${result.failedUsers} user${result.failedUsers === 1 ? ' could' : 's could'} not be notified.`);
      }
      setCampaignStatus({
        type: 'success',
        message: deliverySummary.join(' '),
      });
      setCampaignTitle('');
      setCampaignMessage('');
      clearCampaignImage();
    } catch (error) {
      setCampaignStatus({ type: 'error', message: error.message || 'Could not send this campaign.' });
    } finally {
      setSendingCampaign(false);
    }
  };

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700">
                  <Bell size={17} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Push notification diagnostics</p>
                  <p className="text-[11px] text-slate-500">Verify delivery and device permissions.</p>
                </div>
              </div>
              <div className="flex w-full gap-2 sm:w-auto sm:flex-shrink-0">
                {!user?.notificationsPaused && typeof Notification !== 'undefined' && Notification.permission === 'granted' && (
                  <button
                    type="button"
                    onClick={onEnablePush}
                    disabled={settingUpPush}
                    className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60 sm:flex-initial"
                  >
                    {settingUpPush ? 'Setting up…' : 'Refresh setup'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onTestPush}
                  disabled={testingPush}
                  className="min-h-10 flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 sm:flex-initial"
                >
                  {testingPush ? 'Testing…' : 'Test push'}
                </button>
              </div>
            </div>
            {testPushStatus && (
              <p className={`rounded-lg border p-2.5 text-xs leading-relaxed break-words ${
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

          <form
            onSubmit={handleCampaignSubmit}
            className="space-y-3 rounded-2xl border border-blue-200/80 bg-blue-50/50 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white text-blue-700">
                <Megaphone size={17} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Broadcast notification</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                  Send a custom push and in-app notification to every user. Paused push preferences are respected.
                </p>
              </div>
            </div>
            <label className="block text-xs font-semibold text-slate-700">
              Notification title
              <input
                value={campaignTitle}
                onChange={(event) => setCampaignTitle(event.target.value)}
                maxLength={120}
                required
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="e.g. New Sharebills update"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Message
              <textarea
                value={campaignMessage}
                onChange={(event) => setCampaignMessage(event.target.value)}
                maxLength={500}
                required
                rows={3}
                className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Write the announcement for your users"
              />
            </label>
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-700">Campaign image (optional)</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCampaignImageMode('upload');
                    setCampaignImageUrl('');
                    setCampaignStatus(null);
                  }}
                  aria-pressed={campaignImageMode === 'upload'}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    campaignImageMode === 'upload'
                      ? 'border-blue-300 bg-white text-blue-700'
                      : 'border-slate-200 bg-white/70 text-slate-600'
                  }`}
                >
                  <ImagePlus size={14} /> Upload image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCampaignImageMode('url');
                    setCampaignImageDataUrl('');
                    if (imageInputRef.current) imageInputRef.current.value = '';
                    setCampaignStatus(null);
                  }}
                  aria-pressed={campaignImageMode === 'url'}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    campaignImageMode === 'url'
                      ? 'border-blue-300 bg-white text-blue-700'
                      : 'border-slate-200 bg-white/70 text-slate-600'
                  }`}
                >
                  <Link2 size={14} /> Paste image URL
                </button>
              </div>
              {campaignImageMode === 'upload' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCampaignImageChange}
                    disabled={processingCampaignImage || sendingCampaign}
                    className="sr-only"
                    id="campaign-image-upload"
                  />
                  <label
                    htmlFor="campaign-image-upload"
                    className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700"
                  >
                    <ImagePlus size={14} />
                    {processingCampaignImage
                      ? 'Preparing image…'
                      : campaignImageDataUrl
                        ? 'Choose another'
                        : 'Choose image'}
                  </label>
                  {campaignImageDataUrl && (
                    <span className="text-[11px] text-slate-600">Image ready (compressed to 500 KB or less).</span>
                  )}
                </div>
              ) : (
                <input
                  type="url"
                  value={campaignImageUrl}
                  onChange={(event) => setCampaignImageUrl(event.target.value)}
                  maxLength={2048}
                  placeholder="https://example.com/image.jpg"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              )}
              {((campaignImageMode === 'upload' && campaignImageDataUrl)
                || (campaignImageMode === 'url' && campaignImageUrl.trim())) && (
                <div className="relative w-fit">
                  <img
                    src={campaignImageMode === 'upload' ? campaignImageDataUrl : campaignImageUrl}
                    alt="Campaign preview"
                    className="max-h-40 max-w-full rounded-lg border border-slate-200 object-contain"
                  />
                  <button
                    type="button"
                    onClick={clearCampaignImage}
                    aria-label="Remove campaign image"
                    className="absolute right-1 top-1 rounded-full bg-slate-900/75 p-1 text-white hover:bg-slate-900"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] text-slate-500">Title up to 120 characters; message up to 500. Images are optional.</p>
              <button
                type="submit"
                disabled={sendingCampaign || processingCampaignImage || !campaignTitle.trim() || !campaignMessage.trim()}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-50"
              >
                <Send size={14} />
                {sendingCampaign ? 'Sending campaign…' : 'Send to all users'}
              </button>
            </div>
            {campaignStatus && (
              <p
                role={campaignStatus.type === 'error' ? 'alert' : 'status'}
                className={`rounded-lg border p-2.5 text-xs leading-relaxed ${
                  campaignStatus.type === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {campaignStatus.message}
              </p>
            )}
          </form>

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
