/**
 * Storage-related types
 */

export interface UploadResult {
    key: string;
    signedUrl: string;
    expiresAt: string;
}

export interface FileMetadata {
    key: string;
    size: number;
    uploaded: Date;
    httpMetadata?: R2HTTPMetadata;
    customMetadata?: Record<string, string>;
}
