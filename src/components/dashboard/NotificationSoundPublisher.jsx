import { useState } from 'react';
import { Upload, Volume2 } from 'lucide-react';
import { uploadNotificationSound } from '../../utils/cloudinaryUpload';
import { NOTIFICATION_SOUND_ADMIN_EMAIL } from '../../utils/notificationSound';

const MAX_CUSTOM_AUDIO_SIZE = 200 * 1024;

export default function NotificationSoundPublisher({ user, onUpdateUser }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const isAdmin = user?.email?.trim().toLowerCase() === NOTIFICATION_SOUND_ADMIN_EMAIL;

  if (!isAdmin) return null;

  const handleFileChange = (event) => {
    const selectedFile = event.currentTarget.files?.[0] || null;
    event.currentTarget.value = '';
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith('audio/')) {
      setFeedback('Choose an audio file.');
      return;
    }
    if (selectedFile.size > MAX_CUSTOM_AUDIO_SIZE) {
      setFeedback('Choose an audio file smaller than 200 KB.');
      return;
    }

    setFile(selectedFile);
    setName((currentName) => currentName || selectedFile.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    setFeedback('');
  };

  const publish = async () => {
    if (!file || !name.trim()) {
      setFeedback('Choose an audio file and enter a sound name.');
      return;
    }
    if (!onUpdateUser) {
      setFeedback('Shared sound publishing is unavailable right now.');
      return;
    }

    setSaving(true);
    setFeedback('');
    try {
      const uploadedSound = await uploadNotificationSound(file);
      const existingSounds = Array.isArray(user.notificationSounds) ? user.notificationSounds : [];
      const sound = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        url: uploadedSound.url,
      };
      await onUpdateUser(user.id, { notificationSounds: [...existingSounds, sound] });
      setFile(null);
      setName('');
      setFeedback('Sound published to the predefined list for all users.');
    } catch (error) {
      console.error('Could not publish shared notification sound:', error);
      setFeedback(error.message || 'Could not publish this sound.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-700">
          <Volume2 size={17} />
        </span>
        <div>
          <h3 className="text-xs font-bold text-slate-900">Publish a shared notification sound</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            Upload a tone to add it to the predefined choices for every user. Audio files can be up to 200 KB.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder="Sound name"
          aria-label="Shared sound name"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
            <Upload size={13} />
            {file?.name || 'Choose audio'}
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          <button
            type="button"
            onClick={publish}
            disabled={saving || !file}
            className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? 'Publishing…' : 'Publish for everyone'}
          </button>
        </div>
      </div>

      {feedback && (
        <p role="status" className="mt-3 text-[11px] text-slate-700">
          {feedback}
        </p>
      )}
    </section>
  );
}
