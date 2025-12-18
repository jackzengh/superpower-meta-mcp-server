/**
 * R2 storage utilities for handling file uploads and signed URLs
 */

import { getExtensionFromMimeType } from "../utils/mime-types";
import type { UploadResult, FileMetadata } from "./types";

/**
 * Generates a unique key for R2 storage
 * Format: media/{timestamp}-{uuid}.{ext}
 */
export function generateStorageKey(mimeType: string): string {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  const extension = getExtensionFromMimeType(mimeType);

  return `media/${timestamp}-${uuid}.${extension}`;
}

/**
 * Uploads a file to R2 bucket and returns the storage key
 */
export async function uploadToR2(
  file: ArrayBuffer,
  mimeType: string,
  bucket: R2Bucket
): Promise<string> {
  const key = generateStorageKey(mimeType);

  await bucket.put(key, file, {
    httpMetadata: {
      contentType: mimeType,
    },
    customMetadata: {
      uploadedAt: new Date().toISOString(),
    },
  });

  return key;
}

/**
 * Generates a signed URL for secure access to an R2 object
 * @param key - R2 object key
 * @param bucket - R2 bucket instance
 * @param expiresIn - Expiration time in seconds (default: 24 hours)
 * @param publicUrl - Base public URL for the R2 bucket
 */
export async function generateSignedUrl(
  key: string,
  bucket: R2Bucket,
  expiresIn: number = 86400, // 24 hours default
  publicUrl?: string
): Promise<string> {
  const object = await bucket.get(key);

  if (!object) {
    throw new Error(`File not found in R2: ${key}`);
  }

  // Note: Cloudflare R2 signed URLs require a custom domain or R2.dev public URL
  // For production, configure a custom domain with R2 and use signed URLs
  // For now, we return the public R2 URL (assumes bucket is publicly accessible)

  // Use provided public URL or construct default R2.dev URL
  const baseUrl = publicUrl || "https://superpower-ad-media.r2.dev";

  // Encode the key for URL safety (handles spaces, special characters, etc.)
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${baseUrl}/${encodedKey}`;
}

/**
 * Fetches a file from R2 and returns its content as ArrayBuffer
 */
export async function fetchFromR2(
  key: string,
  bucket: R2Bucket
): Promise<ArrayBuffer> {
  const object = await bucket.get(key);

  if (!object) {
    throw new Error(`File not found in R2: ${key}`);
  }

  return await object.arrayBuffer();
}

/**
 * Gets metadata for a file in R2
 */
export async function getFileMetadata(
  key: string,
  bucket: R2Bucket
): Promise<FileMetadata> {
  const object = await bucket.head(key);

  if (!object) {
    throw new Error(`File not found in R2: ${key}`);
  }

  return {
    key: object.key,
    size: object.size,
    uploaded: object.uploaded,
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata,
  };
}

/**
 * Deletes a file from R2
 */
export async function deleteFromR2(
  key: string,
  bucket: R2Bucket
): Promise<void> {
  await bucket.delete(key);
}

/**
 * Extracts R2 key from a signed URL
 * Assumes URL format: https://{domain}/media/{key}
 */
export function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Extract key from pathname (starts with /) and decode URL encoding
    const encodedKey = pathname.startsWith("/") ? pathname.slice(1) : pathname;
    return decodeURIComponent(encodedKey);
  } catch {
    return null;
  }
}
