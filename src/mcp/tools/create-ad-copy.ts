/**
 * create_ad_copy MCP tool implementation
 * Generates Meta ad copy from R2-hosted media URLs
 */

import type { Anthropic } from "@anthropic-ai/sdk";
import type { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  fetchFromR2,
  extractKeyFromUrl,
  getFileMetadata,
} from "../../storage/r2";
import { validateMimeType } from "../../utils/mime-types";
import { formatAdCopyResponse } from "../../utils/json-parser";
import { generateAdCopyFromImage } from "../../ai/claude";
import { generateAdCopyFromVideo } from "../../ai/gemini";
import { AD_COPY_PROMPT } from "../../prompts/prompt";

interface CreateAdCopyParams {
  mediaUrl: string;
  text?: string;
}

interface Env {
  MEDIA_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
}

/**
 * Validates that the URL is from the expected R2 domain
 */
function validateMediaUrl(url: string, expectedDomain: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.origin.includes(expectedDomain) || urlObj.origin.includes("r2.dev")
    );
  } catch {
    return false;
  }
}

/**
 * Tool handler for create_ad_copy
 */
export async function createAdCopyTool(
  params: CreateAdCopyParams,
  anthropic: Anthropic,
  geminiAI: GoogleGenAI,
  env: Env
) {
  try {
    const { mediaUrl, text } = params;

    console.log(`[create_ad_copy] Processing media URL: ${mediaUrl}`);

    // Validate URL format (optional but recommended for security)
    if (!validateMediaUrl(mediaUrl, env.R2_PUBLIC_URL)) {
      console.warn(
        `[create_ad_copy] Warning: URL ${mediaUrl} may not be from expected R2 domain`
      );
    }

    // Extract R2 key from URL
    const key = extractKeyFromUrl(mediaUrl);
    if (!key) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Invalid media URL format. Could not extract R2 key.",
          },
        ],
        isError: true,
      };
    }

    console.log(`[create_ad_copy] Extracted R2 key: ${key}`);

    // Get file metadata to determine MIME type
    const metadata = await getFileMetadata(key, env.MEDIA_BUCKET);
    const mimeType = metadata.httpMetadata?.contentType;

    if (!mimeType) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Could not determine file MIME type from R2 metadata.",
          },
        ],
        isError: true,
      };
    }

    console.log(`[create_ad_copy] File MIME type: ${mimeType}`);

    // Validate MIME type
    const validation = validateMimeType(mimeType);
    if (!validation.valid) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Unsupported file type '${mimeType}'. Please use JPEG, PNG, GIF, or WebP for images, or MP4, MOV, AVI, MKV, WebM for videos.`,
          },
        ],
        isError: true,
      };
    }

    // Fetch file from R2
    console.log(`[create_ad_copy] Fetching file from R2...`);
    const fileBuffer = await fetchFromR2(key, env.MEDIA_BUCKET);

    // Route to appropriate AI provider based on media type
    const options = {
      prompt: AD_COPY_PROMPT,
      additionalContext: text,
    };

    let result;

    if (validation.type === "image") {
      console.log(
        `[create_ad_copy] Generating ad copy from image using Claude...`
      );
      result = await generateAdCopyFromImage(
        anthropic,
        fileBuffer,
        mimeType,
        options
      );
    } else if (validation.type === "video") {
      console.log(
        `[create_ad_copy] Generating ad copy from video using Gemini...`
      );
      result = await generateAdCopyFromVideo(
        geminiAI,
        fileBuffer,
        mimeType,
        options
      );
    } else {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Unknown media type: ${validation.type}`,
          },
        ],
        isError: true,
      };
    }

    // Format and return response
    const formattedResponse = formatAdCopyResponse(result, validation.type);

    console.log(`[create_ad_copy] Ad copy generated successfully`);

    return {
      content: [
        {
          type: "text" as const,
          text: formattedResponse,
        },
      ],
    };
  } catch (error: any) {
    console.error("[create_ad_copy] Error:", error);

    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${error.message || "Failed to generate ad copy"}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Tool schema for MCP server registration
 */
export const createAdCopySchema = {
  name: "create_ad_copy",
  description:
    "Generate Meta ad copy (headline and primary text) from an image or video URL. " +
    "The media file must first be uploaded to R2 using the /upload endpoint. " +
    "Supports images (JPEG, PNG, GIF, WebP) and videos (MP4, MOV, AVI, MKV, WebM).",
  inputSchema: z.object({
    mediaUrl: z
      .string()
      .describe(
        "URL of the media file (image or video) hosted on R2. " +
          "Obtain this URL by uploading the file to the /upload endpoint first."
      ),
    text: z
      .string()
      .optional()
      .default("")
      .describe(
        "Optional additional context or specific instructions for ad copy generation"
      ),
  }),
};
