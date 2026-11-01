const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function uploadChatMedia(file) {
  if (!file) throw new Error('Please select a file.');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Unsupported image or video type.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Image or video must be 20 MB or smaller.');
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Chat media uploads are not configured.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    { method: 'POST', body: formData },
  );
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || 'Upload failed.');
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format,
    bytes: result.bytes,
  };
}

export async function uploadNotificationSound(file) {
  if (!file) throw new Error('Please select an audio file.');
  if (!file.type.startsWith('audio/')) throw new Error('Unsupported audio type.');
  if (file.size > 200 * 1024) throw new Error('Audio files must be 200 KB or smaller.');
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Audio uploads are not configured.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    { method: 'POST', body: formData },
  );
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || 'Audio upload failed.');
  }
  if (typeof result.secure_url !== 'string') {
    throw new Error('Audio upload did not return a playable URL.');
  }

  return { url: result.secure_url, bytes: result.bytes };
}