/**
 * MIME type validation and utilities
 */

export interface MimeTypeValidation {
    valid: boolean;
    type: "image" | "video" | "unknown";
}

const IMAGE_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
] as const;

const VIDEO_MIME_TYPES = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
] as const;

/**
 * Validates MIME type and determines media type (image or video)
 */
export function validateMimeType(mimeType: string): MimeTypeValidation {
    if (IMAGE_MIME_TYPES.includes(mimeType as any)) {
        return { valid: true, type: "image" };
    }
    if (VIDEO_MIME_TYPES.includes(mimeType as any)) {
        return { valid: true, type: "video" };
    }
    return { valid: false, type: "unknown" };
}

/**
 * Gets file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "video/mp4": "mp4",
        "video/quicktime": "mov",
        "video/x-msvideo": "avi",
        "video/x-matroska": "mkv",
        "video/webm": "webm",
    };

    return mimeToExt[mimeType] || "bin";
}

/**
 * Checks if MIME type is an image
 */
export function isImageMimeType(mimeType: string): boolean {
    return IMAGE_MIME_TYPES.includes(mimeType as any);
}

/**
 * Checks if MIME type is a video
 */
export function isVideoMimeType(mimeType: string): boolean {
    return VIDEO_MIME_TYPES.includes(mimeType as any);
}

/**
 * Gets list of supported image MIME types
 */
export function getSupportedImageMimeTypes(): readonly string[] {
    return IMAGE_MIME_TYPES;
}

/**
 * Gets list of supported video MIME types
 */
export function getSupportedVideoMimeTypes(): readonly string[] {
    return VIDEO_MIME_TYPES;
}
