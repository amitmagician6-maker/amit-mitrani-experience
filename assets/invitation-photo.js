// Leave headroom below the existing 430,000-character Firestore/server limit.
const MAX_DATA_LENGTH = 420000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_TYPE = /^image\/(jpeg|png|webp)$/;

export function photoErrorMessage(error) {
  if (error?.message === "photo-size") return "יש לבחור תמונה בגודל של עד 20MB.";
  return "לא הצלחנו להכין את התמונה. בחרו קובץ JPG, PNG או WebP תקין.";
}

const readFile = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = reader.onabort = () => reject(new Error("photo-read"));
  reader.onload = () => resolve(reader.result);
  reader.readAsDataURL(file);
});

const decodeImage = source => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("photo-decode"));
  image.src = source;
});

export async function compressPhoto(file) {
  if (!file) return "";
  if (!SUPPORTED_TYPE.test(file.type)) throw new Error("photo-type");
  if (file.size > MAX_FILE_BYTES) throw new Error("photo-size");
  const source = await readFile(file);
  const image = await decodeImage(source);
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!width || !height) throw new Error("photo-decode");
  // Already-small files need no re-encoding, resizing, or loss of transparency.
  if (source.length <= MAX_DATA_LENGTH) return source;

  const longest = Math.max(width, height);
  // First prefer high resolution and high quality. If a detailed image exceeds
  // the inline storage budget, tune compression before reducing its dimensions.
  const attempts = [
    ...[2560, 2240, 1920, 1600, 1400].map(size => ({ size, qualities: [.94, .90, .86] })),
    ...[1600, 1400, 1200, 1024, 900, 768].map(size => ({ size, qualities: [.82, .78, .74, .70, .66, .62] }))
  ];
  const tried = new Set();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("photo-encode");
  let format = "image/webp";
  try {
    for (const { size, qualities } of attempts) {
      const max = Math.min(size, longest);
      const scale = max / longest;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      if (format === "image/jpeg") {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      // Always resize from the original, never from a previously compressed copy.
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of qualities) {
        const key = `${max}:${quality}`;
        if (tried.has(key)) continue;
        tried.add(key);
        let result = canvas.toDataURL(format, quality);
        // Safari can silently return PNG when WebP encoding is unsupported.
        // PNG ignores quality: shrinking it repeatedly caused 360px invitations.
        if (format === "image/webp" && !result.startsWith("data:image/webp;base64,")) {
          format = "image/jpeg";
          context.fillStyle = "#fff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          result = canvas.toDataURL(format, quality);
        }
        if (!result.startsWith(`data:${format};base64,`)) throw new Error("photo-encode");
        if (result.length <= MAX_DATA_LENGTH) return result;
      }
    }
    // A working JPEG/WebP encoder fits even high-entropy images at the final
    // profile. Reaching this point indicates an encoder failure, not a request
    // for the user to manually convert their photo and try again.
    throw new Error("photo-encode");
  } finally {
    canvas.width = canvas.height = 1;
  }
}
