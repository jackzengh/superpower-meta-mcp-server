import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { Anthropic } from "@anthropic-ai/sdk";
import { AD_COPY_PROMPT } from "./prompt";
import "dotenv/config";
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

// Helper function to validate MIME types
function validateMimeType(mimeType: string): {
  valid: boolean;
  type: "image" | "video" | "unknown";
} {
  const imageMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const videoMimes = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
  ];

  if (imageMimes.includes(mimeType)) return { valid: true, type: "image" };
  if (videoMimes.includes(mimeType)) return { valid: true, type: "video" };
  return { valid: false, type: "unknown" };
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "Superpower Ad Copy Generator",
    version: "1.0.0",
  });

  setEnv(env: any) {
    this.env = env as Env;
  }

  async init() {
    if (!this.env) {
      throw new Error("Environment not set. Call setEnv() first.");
    }
    // Ad copy generation tool
    this.server.tool(
      "create_ad_copy",
      "Generate Meta ad copy (headline and primary text) from an image or video. Simply provide the base64-encoded media data along with its MIME type. Users can drag and drop media files directly into Claude.",
      {
        base64Data: z
          .string()
          .describe("Base64-encoded media data (image or video)"),
        mimeType: z
          .string()
          .describe(
            "MIME type of the media file (e.g., 'image/jpeg', 'image/png', 'video/mp4')"
          ),
        text: z
          .string()
          .optional()
          .default("")
          .describe(
            "Optional additional context or specific instructions for ad copy generation"
          ),
      },
      async ({ base64Data, mimeType, text }) => {
        try {
          const env = this.env as Env;

          // Validate MIME type
          const validation = validateMimeType(mimeType);

          if (!validation.valid) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Unsupported media type '${mimeType}'. Supported types:\n- Images: image/jpeg, image/png, image/gif, image/webp\n- Videos: video/mp4, video/quicktime, video/x-msvideo, video/x-matroska, video/webm`,
                },
              ],
              isError: true,
            };
          }

          const fileType = validation.type;

          if (fileType === "image") {
            const anthropic = new Anthropic({
              apiKey: env.ANTHROPIC_API_KEY,
            });

            // Validate image MIME type for Anthropic
            const validImageTypes: (
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp"
            )[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

            if (!validImageTypes.includes(mimeType as any)) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: Image type '${mimeType}' is not supported by Claude vision API.`,
                  },
                ],
                isError: true,
              };
            }

            const mediaType = mimeType as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp";

            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-5-20250929",
              max_tokens: 2048,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "image",
                      source: {
                        type: "base64",
                        media_type: mediaType,
                        data: base64Data,
                      },
                    },
                    {
                      type: "text",
                      text: text
                        ? `${AD_COPY_PROMPT}\n\nFurther specific instructions: ${text}`
                        : AD_COPY_PROMPT,
                    },
                  ],
                },
              ],
            });

            // Extract text from Claude response
            const textContent = response.content.find((c) => c.type === "text");
            if (!textContent || textContent.type !== "text") {
              throw new Error("No text content in Claude response");
            }

            let rawText = textContent.text;

            // Strip markdown code fences and parse JSON
            let cleanedText = rawText.trim();
            if (cleanedText.startsWith("```json")) {
              cleanedText = cleanedText
                .replace(/^```json\n?/, "")
                .replace(/\n?```$/, "");
            } else if (cleanedText.startsWith("```")) {
              cleanedText = cleanedText
                .replace(/^```\n?/, "")
                .replace(/\n?```$/, "");
            }

            const parsed = JSON.parse(cleanedText);

            return {
              content: [
                {
                  type: "text",
                  text: `📸 IMAGE AD COPY GENERATED\n\nHEADLINE:\n${parsed.headline}\n\nPRIMARY TEXT:\n${parsed.primaryText}`,
                },
              ],
            };
          } else if (fileType === "video") {
            // Use Gemini for video processing
            const geminiAI = new GoogleGenAI({
              apiKey: env.GEMINI_API_KEY,
            });

            // For video, we need to upload to Gemini
            // Note: Gemini API requires file upload, not direct base64
            // We'll create a temporary buffer and upload it

            // Decode base64 to buffer
            const videoBuffer = Buffer.from(base64Data, "base64");

            // Create a temporary file-like object
            const blob = new Blob([videoBuffer], { type: mimeType });
            const file = new File([blob], "video", { type: mimeType });

            // Upload file to Gemini
            const uploadResult = await geminiAI.files.upload({
              file: file,
              config: { mimeType: mimeType },
            });

            let uploadedFile = uploadResult;

            // Poll until the file is 'ACTIVE'
            while (uploadedFile.state === "PROCESSING") {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              uploadedFile = await geminiAI.files.get({
                name: uploadedFile.name!,
              });
            }

            if (uploadedFile.state === "FAILED") {
              throw new Error("Video processing failed on Gemini side.");
            }

            // Generate content with video
            const contentParts: any[] = [
              text
                ? `${AD_COPY_PROMPT}\n\nFurther specific instructions: ${text}`
                : AD_COPY_PROMPT,
            ];

            if (uploadedFile.uri && uploadedFile.mimeType) {
              contentParts.push(
                createPartFromUri(uploadedFile.uri, uploadedFile.mimeType)
              );
            }

            const result = await geminiAI.models.generateContent({
              model: "gemini-2.0-flash-exp",
              contents: contentParts,
            });

            const rawText = result.text || "";

            // Strip markdown code fences and parse JSON
            let cleanedText = rawText.trim();
            if (cleanedText.startsWith("```json")) {
              cleanedText = cleanedText
                .replace(/^```json\n?/, "")
                .replace(/\n?```$/, "");
            } else if (cleanedText.startsWith("```")) {
              cleanedText = cleanedText
                .replace(/^```\n?/, "")
                .replace(/\n?```$/, "");
            }

            const parsed = JSON.parse(cleanedText);

            return {
              content: [
                {
                  type: "text",
                  text: `📱 VIDEO AD COPY GENERATED\n\nHEADLINE:\n${parsed.headline}\n\nPRIMARY TEXT:\n${parsed.primaryText}`,
                },
              ],
            };
          }

          // Fallback case (should not reach here due to earlier checks)
          return {
            content: [
              {
                type: "text",
                text: "Error: Unexpected file type.",
              },
            ],
            isError: true,
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Error processing file: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Test endpoint to verify environment variables
    if (url.pathname === "/test-env") {
      return new Response(
        JSON.stringify({
          GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
          has_secret: !!env.GITHUB_CLIENT_SECRET,
          has_anthropic: !!env.ANTHROPIC_API_KEY,
          has_gemini: !!env.GEMINI_API_KEY,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
