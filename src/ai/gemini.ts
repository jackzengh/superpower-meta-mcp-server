/**
 * Google Gemini integration for video-based ad copy generation
 */

import type { GoogleGenAI } from "@google/genai";
import { createPartFromUri } from "@google/genai";
import { parseAIResponse } from "../utils/json-parser";
import type { AdCopyResult, GenerateAdCopyOptions } from "./types";

const GEMINI_MODEL = "gemini-2.0-flash-exp";
const POLL_INTERVAL_MS = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 60; // 2 minutes max wait time

/**
 * Generates ad copy from a video using Google Gemini's API
 */
export async function generateAdCopyFromVideo(
  geminiAI: GoogleGenAI,
  videoBuffer: ArrayBuffer,
  mimeType: string,
  options: GenerateAdCopyOptions
): Promise<AdCopyResult> {
  console.log("[Gemini] Uploading video to Gemini Files API...");

  // Convert ArrayBuffer to File object
  const blob = new Blob([videoBuffer], { type: mimeType });
  const file = new File([blob], "video", { type: mimeType });

  // Upload file to Gemini Files API
  const uploadResult = await geminiAI.files.upload({
    file: file,
    config: { mimeType: mimeType },
  });

  let uploadedFile = uploadResult;
  let pollAttempts = 0;

  // Poll until the file is 'ACTIVE'
  console.log("[Gemini] Waiting for video processing to complete...");

  while (
    uploadedFile.state === "PROCESSING" &&
    pollAttempts < MAX_POLL_ATTEMPTS
  ) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    uploadedFile = await geminiAI.files.get({
      name: uploadedFile.name!,
    });

    pollAttempts++;
  }

  if (uploadedFile.state === "FAILED") {
    throw new Error("Video processing failed on Gemini side.");
  }

  if (uploadedFile.state === "PROCESSING") {
    throw new Error(
      "Video processing timed out. The video may be too large or complex."
    );
  }

  if (!uploadedFile.uri || !uploadedFile.mimeType) {
    throw new Error("Uploaded file is missing URI or MIME type.");
  }

  console.log(
    "[Gemini] Video processed successfully at , generating ad copy..."
  );

  // Prepare prompt with optional additional context
  const promptText = options.additionalContext
    ? `${options.prompt}\n\nFurther specific instructions: ${options.additionalContext}`
    : options.prompt;

  // Generate content with video
  const contentParts: any[] = [
    promptText,
    createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
  ];

  const result = await geminiAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: contentParts,
  });

  const rawText = result.text || "";

  if (!rawText) {
    throw new Error("Empty response from Gemini API");
  }

  // Parse JSON response
  const adCopyResult = parseAIResponse(rawText);

  console.log("[Gemini] Ad copy generated successfully");

  return adCopyResult;
}
