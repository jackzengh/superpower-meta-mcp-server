/**
 * Main Cloudflare Workers entry point
 * Routes requests to appropriate handlers (upload, MCP endpoints, etc.)
 */

import { MyMCP } from "./mcp/server";
import { handleUpload } from "./api/upload";

interface Env {
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  MEDIA_BUCKET: R2Bucket;
  MCP_OBJECT: DurableObjectNamespace<MyMCP>;
  R2_PUBLIC_URL: string;
  SIGNED_URL_EXPIRATION_SECONDS: string;
}

export { MyMCP };

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Test endpoint to verify environment variables
    // SECURITY: Always use Boolean() to convert to boolean. Never expose actual API key values.
    // Removing Boolean() conversion would expose sensitive credentials in HTTP responses.
    if (url.pathname === "/test-env") {
      return new Response(
        JSON.stringify(
          {
            has_anthropic: Boolean(env.ANTHROPIC_API_KEY),
            has_gemini: Boolean(env.GEMINI_API_KEY),
            has_r2_bucket: Boolean(env.MEDIA_BUCKET),
            r2_public_url: env.R2_PUBLIC_URL,
          },
          null,
          2
        ),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // File upload endpoint
    if (url.pathname === "/upload") {
      // if (request.method === "OPTIONS") {
      //   return handleUploadOptions();
      // }
      return handleUpload(request, env);
    }

    // SSE transport for MCP
    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    // Standard MCP transport
    if (url.pathname === "/mcp") {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    // Root endpoint - show available endpoints
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify(
          {
            service: "Superpower Ad Copy Generator",
            version: "2.0.0",
            endpoints: {
              "/upload": "POST - Upload media file to R2 and get signed URL",
              "/sse": "MCP Server-Sent Events transport",
              "/mcp": "MCP standard transport",
              "/test-env": "GET - Test environment configuration",
            },
            architecture: "R2-based URL architecture (v2.0)",
          },
          null,
          2
        ),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
