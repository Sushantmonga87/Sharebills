import { useState } from 'react';
import { Check, ChevronDown, Play, Volume2 } from 'lucide-react';
import {
  DEFAULT_NOTIFICATION_SOUND,
  playNotificationSound,
} from '../../utils/notificationSound';

const PRESETS = [
  { id: 'chime', name: 'Chime', description: 'Bright two-note tone' },
  { id: 'soft', name: 'Soft', description: 'Gentle two-note tone' },
  { id: 'bell', name: 'Bell', description: 'Short bell-like tone' },
];

export default function NotificationSoundSettings({
  user,
  onUpdateUser,
  sharedSounds = [],
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sound, setSound] = useState(user?.notificationSound || DEFAULT_NOTIFICATION_SOUND);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const isSelected = (tone) => (
    tone.mode === 'shared'
      ? sound.mode === 'shared' && sound.soundId === tone.soundId
      : sound.mode === tone.mode && sound.preset === tone.preset
  );
  const selectedSoundName = sound.mode === 'off'
    ? 'Off'
    : sound.mode === 'shared'
      ? sharedSounds.find((sharedSound) => sharedSound.id === sound.soundId)?.name || 'Shared tone'
      : PRESETS.find((preset) => preset.id === sound.preset)?.name || PRESETS[0].name;

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
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
          <Volume2 size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-slate-900">Notification tone</span>
          <span className="mt-1 block truncate text-[11px] text-slate-500">
            {selectedSoundName} · alerts while Sharebills is open
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="mt-3">
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            Background push sounds are controlled by your device.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-200/70 p-1">
            {[
              { id: 'preset', label: 'Predefined' },
              { id: 'off', label: 'None' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === 'off'
                  ? sound.mode === 'off'
                  : option.id === 'preset'
                    ? sound.mode !== 'off'
                    : sound.mode === option.id}
                onClick={() => {
                  if (option.id === 'off') {
                    save({ mode: 'off' });
                    return;
                  }
                  setSound((current) => (
                    current.mode === 'off'
                      ? { ...DEFAULT_NOTIFICATION_SOUND }
                      : current
                  ));
                }}
                disabled={saving}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  (sound.mode === option.id || (option.id === 'preset' && sound.mode !== 'off'))
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {sound.mode !== 'off' ? (
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
        </div>
      )}
    </section>
  );
}
