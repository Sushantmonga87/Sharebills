export const NOTIFICATION_SOUND_ADMIN_EMAIL = 'staranveer178@gmail.com';
export const DEFAULT_NOTIFICATION_SOUND = { mode: 'preset', preset: 'chime' };

const PRESET_TONES = {
  chime: { frequencies: [660, 880], waveform: 'sine', duration: 0.16, gap: 0.045 },
  soft: { frequencies: [523, 659], waveform: 'sine', duration: 0.2, gap: 0.06 },
  bell: { frequencies: [880, 1175], waveform: 'triangle', duration: 0.13, gap: 0.04 },
};

let audioContext;
let audioPlayer;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

function createSilentAudioUrl() {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);
  const writeText = (offset, text) => {
    [...text].forEach((character, index) => {
      bytes[offset + index] = character.charCodeAt(0);
    });
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 38, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeText(36, 'data');
  view.setUint32(40, 2, true);
  bytes[44] = 128;
  bytes[45] = 128;
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

export async function unlockNotificationAudio() {
  const context = getAudioContext();
  const resumePromise = context?.state === 'suspended'
    ? context.resume()
    : Promise.resolve();

  if (!audioPlayer) {
    audioPlayer = new Audio(createSilentAudioUrl());
    audioPlayer.preload = 'auto';
  }
  audioPlayer.muted = true;
  const playPromise = audioPlayer.play();
  try {
    await Promise.all([resumePromise, playPromise]);
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  } finally {
    audioPlayer.muted = false;
  }
}

export async function playNotificationSound(settings) {
  if (!settings || settings.mode === 'off') return;

  const audioUrl = settings.dataUrl || settings.url;
  if (audioUrl) {
    if (!audioPlayer) audioPlayer = new Audio();
    audioPlayer.pause();
    audioPlayer.src = audioUrl;
    audioPlayer.currentTime = 0;
    audioPlayer.muted = false;
    audioPlayer.volume = 0.75;
    await audioPlayer.play();
    return;
  }

  const context = getAudioContext();
  if (!context) throw new Error('Audio playback is not supported in this browser.');

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
  await new Promise((resolve) => window.setTimeout(resolve, totalDuration * 1000 + 50));
}
