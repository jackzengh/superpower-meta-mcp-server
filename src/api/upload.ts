/**
 * File upload endpoint handler
 */

import { uploadToR2, generateSignedUrl } from "../storage/r2";
import {
  validateMimeType,
  isImageMimeType,
  isVideoMimeType,
} from "../utils/mime-types";

const MAX_IMAGE_SIZE_MB = 10;
const MAX_VIDEO_SIZE_MB = 50;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

interface UploadResponse {
  success: boolean;
  url?: string;
  key?: string;
  expiresAt?: string;
  error?: string;
}

interface Env {
  MEDIA_BUCKET: R2Bucket;
  SIGNED_URL_EXPIRATION_SECONDS: string;
  R2_PUBLIC_URL: string;
}

/**
 * Handles file upload requests
 * POST /upload with multipart/form-data containing a 'file' field
 */
export async function handleUpload(
  request: Request,
  env: Env
): Promise<Response> {
  // Only allow POST requests
  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed. Use POST.",
      },
      405
    );
  }

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return jsonResponse(
        {
          success: false,
          error:
            "No file provided. Please include a 'file' field in the form data.",
        },
        400
      );
    }

    // Validate MIME type
    const mimeType = file.type;
    const validation = validateMimeType(mimeType);

    if (!validation.valid) {
      return jsonResponse(
        {
          success: false,
          error: `Unsupported file type: ${mimeType}. Supported types: JPEG, PNG, GIF, WebP for images; MP4, MOV, AVI, MKV, WebM for videos.`,
        },
        400
      );
    }

    // Validate file size based on type
    const fileSize = file.size;
    const maxSize = isImageMimeType(mimeType)
      ? MAX_IMAGE_SIZE_BYTES
      : MAX_VIDEO_SIZE_BYTES;
    const maxSizeMB = isImageMimeType(mimeType)
      ? MAX_IMAGE_SIZE_MB
      : MAX_VIDEO_SIZE_MB;

    if (fileSize > maxSize) {
      return jsonResponse(
        {
          success: false,
          error: `File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of ${maxSizeMB}MB for ${validation.type}s.`,
        },
        400
      );
    }

    // Convert file to ArrayBuffer
    const fileBuffer = await file.arrayBuffer();

    console.log(
      `[Upload] Uploading ${validation.type} (${(fileSize / 1024 / 1024).toFixed(2)}MB) to R2...`
    );

    // Upload to R2
    const key = await uploadToR2(fileBuffer, mimeType, env.MEDIA_BUCKET);

    // Generate signed URL
    const expirationSeconds =
      parseInt(env.SIGNED_URL_EXPIRATION_SECONDS, 10) || 86400; // Default 24 hours
    const signedUrl = await generateSignedUrl(
      key,
      env.MEDIA_BUCKET,
      expirationSeconds,
      env.R2_PUBLIC_URL
    );

    // Calculate expiration timestamp
    const expiresAt = new Date(
      Date.now() + expirationSeconds * 1000
    ).toISOString();

    console.log(`[Upload] File uploaded successfully: ${key}`);

    return jsonResponse({
      success: true,
      url: signedUrl,
      key: key,
      expiresAt: expiresAt,
    });
  } catch (error: any) {
    console.error("[Upload] Error:", error);

    return jsonResponse(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      500
    );
  }
}

/**
 * Helper function to create JSON responses
 */
function jsonResponse(data: UploadResponse, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// /**
//  * Handles OPTIONS requests for CORS preflight
//  */
// export function handleUploadOptions(): Response {
//   return new Response(null, {
//     status: 204,
//     headers: {
//       "Access-Control-Allow-Origin": "*",
//       "Access-Control-Allow-Methods": "POST, OPTIONS",
//       "Access-Control-Allow-Headers": "Content-Type",
//     },
//   });
// }
