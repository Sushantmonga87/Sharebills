import { useState } from 'react';
import { Check, Play, Upload, Volume2 } from 'lucide-react';
import { playNotificationSound } from '../../utils/notificationSound';

const PRESETS = [
  { id: 'chime', name: 'Chime', description: 'Bright two-note tone' },
  { id: 'soft', name: 'Soft', description: 'Gentle two-note tone' },
  { id: 'bell', name: 'Bell', description: 'Short bell-like tone' },
];

const DEFAULT_SOUND = { mode: 'preset', preset: 'chime' };
const MAX_CUSTOM_AUDIO_SIZE = 200 * 1024;

export default function NotificationSoundSettings({
  user,
  onUpdateUser,
  sharedSounds = [],
}) {
  const [sound, setSound] = useState(user?.notificationSound || DEFAULT_SOUND);
  const [customAudio, setCustomAudio] = useState(
    user?.notificationSound?.mode === 'custom' ? user.notificationSound : null
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const isSelected = (tone) => (
    tone.mode === 'shared'
      ? sound.mode === 'shared' && sound.soundId === tone.soundId
      : sound.mode === tone.mode && sound.preset === tone.preset
  );

  const handleCustomAudio = (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setFeedback('Choose an audio file.');
      return;
    }
    if (file.size > MAX_CUSTOM_AUDIO_SIZE) {
      setFeedback('Choose an audio file smaller than 200 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setFeedback('Could not read this audio file.');
        return;
      }
      setCustomAudio({ mode: 'custom', dataUrl: reader.result, name: file.name });
      setFeedback('');
    };
    reader.onerror = () => setFeedback('Could not read this audio file.');
    reader.readAsDataURL(file);
  };

  const preview = async (tone) => {
    setFeedback('');
    try {
      await playNotificationSound(tone);
    } catch (error) {
      console.error('Could not preview notification sound:', error);
      setFeedback(error.message || 'Could not play this tone.');
    }
  };

  const save = async (tone) => {
    if (!onUpdateUser) {
      setFeedback('Notification sound settings are unavailable right now.');
      return;
    }
    setSaving(true);
    setFeedback('');
    try {
      await onUpdateUser(user.id, { notificationSound: tone });
      setSound(tone);
      setFeedback('Notification sound saved.');
    } catch (error) {
      console.error('Could not save notification sound:', error);
      setFeedback(error.message || 'Could not save notification sound.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
          <Volume2 size={17} />
        </span>
        <div>
          <h3 className="text-xs font-bold text-slate-900">Notification tone</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Custom tones play for alerts while Sharebills is open. Background push sounds are controlled by your device.
          </p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-200/70 p-1">
        {[
          { id: 'preset', label: 'Predefined' },
          { id: 'custom', label: 'Custom' },
          { id: 'off', label: 'None' },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === 'off'
              ? sound.mode === 'off'
              : option.id === 'preset'
                ? sound.mode === 'preset' || sound.mode === 'shared'
                : sound.mode === option.id}
            onClick={() => {
              if (option.id === 'off') {
                save({ mode: 'off' });
                return;
              }
              setSound((current) => ({ ...current, mode: option.id }));
            }}
            disabled={saving}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              (sound.mode === option.id || (option.id === 'preset' && sound.mode === 'shared'))
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {sound.mode === 'preset' || sound.mode === 'shared' ? (
        <div className="space-y-2">
          {[
            ...PRESETS.map((preset) => ({
              id: preset.id,
              name: preset.name,
              description: preset.description,
              tone: { mode: 'preset', preset: preset.id },
              previewTone: { mode: 'preset', preset: preset.id },
            })),
            ...sharedSounds.map((sharedSound) => ({
              id: `shared-${sharedSound.id}`,
              name: sharedSound.name,
              description: 'Shared notification sound',
              tone: { mode: 'shared', soundId: sharedSound.id },
              previewTone: sharedSound,
            })),
          ].map((preset) => {
            const selected = isSelected(preset.tone);
            return (
              <div
                key={preset.id}
                className={`flex items-center gap-2 rounded-xl border p-2.5 ${
                  selected ? 'border-blue-200 bg-blue-50/70' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800">{preset.name}</p>
                  <p className="text-[10px] text-slate-500">{preset.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => preview(preset.previewTone)}
                  aria-label={`Play ${preset.name} notification tone`}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  <Play size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => save(preset.tone)}
                  disabled={saving}
                  aria-label={`Select ${preset.name} notification tone`}
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                    selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-700'
                  } disabled:cursor-wait disabled:opacity-60`}
                >
                  {selected ? <Check size={15} /> : <span className="text-[10px] font-bold">Use</span>}
                </button>
              </div>
            );
          })}
        </div>
      ) : sound.mode === 'custom' ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800">
                {customAudio?.name || 'Choose a custom notification tune'}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">Audio file · up to 200 KB</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
              <Upload size={13} />
              {customAudio ? 'Replace tune' : 'Choose tune'}
              <input
                type="file"
                accept="audio/*"
                onChange={handleCustomAudio}
                className="sr-only"
              />
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => preview(customAudio)}
              disabled={!customAudio?.dataUrl}
              className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Play preview
            </button>
            <button
              type="button"
              onClick={() => save(customAudio)}
              disabled={saving || !customAudio?.dataUrl}
              className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save custom tone'}
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
          Notification sounds are off.
        </p>
      )}

      {feedback && (
        <p role="status" className="mt-3 text-[11px] text-slate-600">
          {feedback}
        </p>
      )}
    </section>
  );
}
