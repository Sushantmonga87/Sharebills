export const NOTIFICATION_SOUND_ADMIN_EMAIL = 'staranveer178@gmail.com';

const PRESET_TONES = {
  chime: { frequencies: [660, 880], waveform: 'sine', duration: 0.16, gap: 0.045 },
  soft: { frequencies: [523, 659], waveform: 'sine', duration: 0.2, gap: 0.06 },
  bell: { frequencies: [880, 1175], waveform: 'triangle', duration: 0.13, gap: 0.04 },
};

export async function playNotificationSound(settings) {
  if (!settings || settings.mode === 'off') return;

  const audioUrl = settings.dataUrl || settings.url;
  if (audioUrl) {
    const audio = new Audio(audioUrl);
    audio.volume = 0.75;
    await audio.play();
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Audio playback is not supported in this browser.');

  const context = new AudioContextClass();
  try {
    if (context.state === 'suspended') await context.resume();

    const config = settings.mode === 'custom'
      ? {
          frequencies: [Number(settings.frequency) || 660],
          waveform: settings.waveform || 'sine',
          duration: Math.min(1, Math.max(0.1, Number(settings.duration) || 0.3)),
          gap: 0,
        }
      : PRESET_TONES[settings.preset] || PRESET_TONES.chime;

    const startTime = context.currentTime + 0.02;
    config.frequencies.forEach((frequency, index) => {
      const start = startTime + index * (config.duration + config.gap);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = config.waveform;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + config.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + config.duration);
    });

    const totalDuration = config.frequencies.length * config.duration
      + (config.frequencies.length - 1) * config.gap;
    window.setTimeout(() => context.close(), totalDuration * 1000 + 300);
  } catch (error) {
    await context.close();
    throw error;
  }
}
