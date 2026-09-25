import { z } from "zod";

export const maximumAvatarBytes = 96 * 1024;
export const decodeAvatar = (value: string) => {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
    if (bytes.length > maximumAvatarBytes || bytes.length < 12) return null;
    const valid = match[1] === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : match[1] === "png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
      : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    return valid ? { bytes, contentType: `image/${match[1]}` } : null;
  } catch { return null; }
};

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  image: z.string().max(132000).refine(value => decodeAvatar(value) !== null).nullable().optional(),
}).strict();
