/**
 * JSON parsing utilities for AI responses
 */

export interface AdCopyResponse {
  headline: string;
  primaryText: string;
}

/**
 * Parses JSON response from AI providers, stripping markdown code fences if present
 * Supports both ```json and ``` code fence formats
 */
export function parseAIResponse(rawText: string): AdCopyResponse {
  let cleanedText = rawText.trim();

  // Strip markdown code fences
  if (cleanedText.startsWith("```json")) {
    cleanedText = cleanedText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  } else if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```\n?/, "").replace(/\n?```$/, "");
  }

  // Parse JSON
  const parsed = JSON.parse(cleanedText) as AdCopyResponse;

  // Validate required fields
  if (!parsed.headline || !parsed.primaryText) {
    throw new Error(
      "Invalid AI response: missing headline or primaryText fields"
    );
  }

  return parsed;
}

/**
 * Formats ad copy response for display
 */
export function formatAdCopyResponse(
  response: AdCopyResponse,
  mediaType: "image" | "video"
): string {
  const emoji = mediaType === "image" ? "📸" : "📱";
  const typeLabel = mediaType.toUpperCase();

  return `${emoji} ${typeLabel} AD COPY GENERATED\n\nHEADLINE:\n${response.headline}\n\nPRIMARY TEXT:\n${response.primaryText}`;
}
