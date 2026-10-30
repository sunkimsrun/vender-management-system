import { HttpError } from "@/lib/http/errors";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// The type is decided by the file's leading bytes, never by the client-supplied MIME type.
function detectType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export async function readImageFile(file: File): Promise<{ type: string; data: Buffer }> {
  if (file.size > MAX_IMAGE_BYTES) throw new HttpError("BAD_REQUEST", "Image must be 2 MB or smaller");
  const data = Buffer.from(await file.arrayBuffer());
  const type = detectType(data);
  if (!type) throw new HttpError("BAD_REQUEST", "Image must be a PNG, JPEG or WebP file");
  return { type, data };
}
