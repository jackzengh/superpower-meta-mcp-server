/**
 * MCP Server Durable Object
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Anthropic } from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { createAdCopyTool, createAdCopySchema } from "./tools/create-ad-copy";

interface Env {
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  MEDIA_BUCKET: R2Bucket;
  MCP_OBJECT: DurableObjectNamespace<MyMCP>;
  R2_PUBLIC_URL: string;
  SIGNED_URL_EXPIRATION_SECONDS: string;
}

/**
 * MCP Durable Object for Superpower Ad Copy Generator
 */
export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "Superpower Ad Copy Generator",
    version: "2.0.0", // Updated version for R2 architecture
  });

  private anthropic?: Anthropic;
  private geminiAI?: GoogleGenAI;

  /**
   * Sets the environment variables for the Durable Object
   */
  setEnv(env: any) {
    this.env = env as Env;
  }

  /**
   * Sets the AI provider clients
   */
  setClients(anthropic: Anthropic, geminiAI: GoogleGenAI) {
    this.anthropic = anthropic;
    this.geminiAI = geminiAI;
    return { anthropic, geminiAI };
  }

  /**
   * Called when the Durable Object starts
   * Initializes AI provider clients
   */
  async onStart(props?: any) {
    const env = this.env as Env;

    // Initialize API clients
    this.setClients(
      new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
      }),
      new GoogleGenAI({
        apiKey: env.GEMINI_API_KEY,
      })
    );

    console.log("[MyMCP] Durable Object started, AI clients initialized");

    // Call parent onStart
    return super.onStart(props);
  }

  /**
   * Initializes MCP tools
   */
  async init() {
    if (!this.env) {
      throw new Error("Environment not set. Call setEnv() first.");
    }

    if (!this.anthropic) {
      throw new Error("Anthropic client not initialized.");
    }

    if (!this.geminiAI) {
      throw new Error("Gemini client not initialized.");
    }

    const env = this.env as Env;

    // Register create_ad_copy tool
    this.server.tool(
      createAdCopySchema.name,
      createAdCopySchema.description,
      createAdCopySchema.inputSchema.shape,
      async (params) => {
        return await createAdCopyTool(
          params as any,
          this.anthropic!,
          this.geminiAI!,
          env
        );
      }
    );

    console.log("[MyMCP] MCP tools registered");
  }
}
