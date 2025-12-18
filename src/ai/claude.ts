/**
 * Claude (Anthropic) integration for image-based ad copy generation
 */

import type { Anthropic } from "@anthropic-ai/sdk";
import { parseAIResponse } from "../utils/json-parser";
import type { AdCopyResult, GenerateAdCopyOptions } from "./types";

const MAX_TOKENS = 2048;

type ClaudeImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

/**
 * Validates if MIME type is supported by Claude vision API
 */
function isValidClaudeImageType(
  mimeType: string
): mimeType is ClaudeImageMimeType {
  const validTypes: ClaudeImageMimeType[] = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  return validTypes.includes(mimeType as ClaudeImageMimeType);
}

/**
 * Converts ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Generates ad copy from an image using Claude's vision API
 */
export async function generateAdCopyFromImage(
  anthropic: Anthropic,
  imageBuffer: ArrayBuffer,
  mimeType: string,
  options: GenerateAdCopyOptions
): Promise<AdCopyResult> {
  // Validate MIME type
  if (!isValidClaudeImageType(mimeType)) {
    throw new Error(
      `Image type '${mimeType}' is not supported by Claude vision API. ` +
        `Supported types: image/jpeg, image/png, image/gif, image/webp`
    );
  }

  // Convert ArrayBuffer to base64
  const base64Data = arrayBufferToBase64(imageBuffer);

  // Prepare prompt with optional additional context
  const promptText = options.additionalContext
    ? `${options.prompt}\n\nFurther specific instructions: ${options.additionalContext}`
    : options.prompt;

  console.log("[Claude] Generating ad copy from image...");

  const response = await anthropic.beta.messages.parse({
    model: "claude-sonnet-4-5",
    betas: ["structured-outputs-2025-11-13"],
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: base64Data,
            },
          },
          {
            type: "text",
            text: promptText,
          },
        ],
      },
    ],
    output_format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          headline: {
            type: "string",
            description: "The compelling ad headline that captures attention",
          },
          primaryText: {
            type: "string",
            description:
              "The primary ad text that provides context and call-to-action",
          },
        },
        required: ["headline", "primaryText"],
        additionalProperties: false,
      },
    },
  });

  // Extract text from response - guaranteed to be valid JSON with structured outputs
  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  // Parse JSON response - with structured outputs, this is guaranteed to match schema
  const result = parseAIResponse(textContent.text);

  console.log("[Claude] Ad copy generated successfully");

  return result;
}
