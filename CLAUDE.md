# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **remote MCP (Model Context Protocol) server** deployed on Cloudflare Workers that generates Meta advertising copy for Superpower's preventive health testing service. The server accepts image or video files and produces compelling ad headlines and primary text optimized for Meta's advertising platform.

### Key Architecture Components

1. **McpAgent-based Server**: Built on the `agents/mcp` framework, extending `McpAgent` class to create a Durable Object-based MCP server
2. **Dual AI Provider Integration**:
   - Uses **Anthropic Claude** (claude-sonnet-4-5-20250929) for image-based ad copy generation
   - Uses **Google Gemini** (gemini-2.0-flash-exp) for video-based ad copy generation
3. **Transport Layer**: Supports both SSE (Server-Sent Events) at `/sse` and standard MCP at `/mcp` endpoints

### Core Tool: `create_ad_copy`

Single MCP tool that:

- Accepts `base64Data` (base64-encoded media data) and `mimeType` (MIME type string)
- Validates media type (images: image/jpeg, image/png, image/gif, image/webp; videos: video/mp4, video/quicktime, etc.)
- Routes to appropriate AI provider (Claude for images, Gemini for videos)
- Applies specialized ad copywriting prompt from `src/prompt.ts`
- Returns structured JSON with `headline` and `primaryText` fields

**User Experience**: Users can simply drag and drop images or videos directly into Claude, and Claude will automatically read the file, encode it as base64, and call the MCP tool with the appropriate parameters.

## Development Commands

### Start Local Development Server

```bash
npm run dev
# or
npm start
```

This starts Wrangler dev server with hot reload. Server runs on `http://localhost:8787`.

### Type Checking

```bash
npm run type-check
```

Runs TypeScript compiler in no-emit mode to verify type correctness.

### Code Formatting

```bash
npm run format
```

Uses Biome to format code according to `.biome.json` rules (100 char line width, 4-space indentation).

### Linting

```bash
npm run lint:fix
```

Automatically fixes linting issues with Biome.

### Generate Cloudflare Types

```bash
npm run cf-typegen
```

Generates TypeScript types for Cloudflare Workers environment bindings.

### Deploy to Cloudflare Workers

```bash
npm run deploy
```

## Environment Variables

Required environment variables (configured in `wrangler.jsonc` under `vars`):

- `ANTHROPIC_API_KEY`: Anthropic API key for Claude image processing
- `GEMINI_API_KEY`: Google Gemini API key for video processing
- `GITHUB_CLIENT_ID`: (present in config but not used in current implementation)
- `GITHUB_CLIENT_SECRET`: (present in config but not used in current implementation)

**Important**: These are set in `wrangler.jsonc` but should be populated via Cloudflare Dashboard secrets or `wrangler secret put` command for production.

## Code Architecture Insights

### Durable Objects Pattern

The `MyMCP` class extends `McpAgent` which is a Durable Object. Key implications:

- **Instance Management**: Each MCP session may spawn a Durable Object instance
- **Environment Injection**: `setEnv(env)` must be called before `init()` to provide environment variables
- **Lifecycle**: The `init()` method is where tools are registered using `this.server.tool(...)`

### File Processing Flow

**Image Processing**:

1. Receive base64-encoded image data and MIME type from MCP client
2. Validate MIME type (must be image/jpeg, image/png, image/gif, or image/webp)
3. Send to Claude with vision model along with `AD_COPY_PROMPT`
4. Parse JSON response (handling markdown code fence stripping)
5. Return formatted ad copy with 📸 emoji prefix

**Video Processing**:

1. Receive base64-encoded video data and MIME type from MCP client
2. Decode base64 to buffer and create File object
3. Upload video to Google Gemini Files API
4. Poll until file state is `ACTIVE` (vs `PROCESSING`)
5. Generate content using `gemini-2.0-flash-exp` model
6. Parse JSON response (handling markdown code fence stripping)
7. Return formatted ad copy with 📱 emoji prefix

**Note**: File reading happens on the **client side** (e.g., Claude Desktop), not on the Cloudflare Workers server. This is because Cloudflare Workers doesn't have access to local file systems. The MCP client reads files and sends base64-encoded data to the server.

### The Ad Copy Prompt System

The `AD_COPY_PROMPT` in `src/prompt.ts` is a comprehensive ~400-line copywriting framework that:

- Implements **Eugene Schwartz's 5 Stages of Awareness** framework
- Defines two distinct ad frameworks:
  - **Framework A**: Problem-Solution structure
  - **Framework B**: Competitor Comparison structure
- Enforces strict formatting rules (sentence length limits, spacing, staccato rhythm)
- Targets specific human desires from a predefined list
- Maintains Meta advertising compliance

**Important**: When modifying the prompt, understand that it enforces single-concept focus, open loop hooks, and specific copy structure ratios. Changes should maintain these structural constraints.

## Common Development Patterns

### Adding a New MCP Tool

Add tool definitions in the `init()` method of `MyMCP` class in `src/index.ts`:

```typescript
this.server.tool(
  "tool_name",
  "Description shown to clients",
  {
    param1: z.string().describe("Parameter description"),
  },
  async ({ param1 }) => {
    // Tool implementation
    return {
      content: [
        {
          type: "text",
          text: "Response text",
        },
      ],
    };
  }
);
```

### Error Handling Pattern

Tools return errors in the same content structure with `isError: true`:

```typescript
return {
  content: [
    {
      type: "text",
      text: `Error: ${error.message}`,
    },
  ],
  isError: true,
};
```

### Testing Endpoints

- `/test-env`: Returns environment variable status (useful for debugging configuration)
- `/sse` or `/sse/message`: SSE transport for MCP protocol
- `/mcp`: Standard MCP transport

## Integration with MCP Clients

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "superpower-ad-copy": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8787/sse"]
    }
  }
}
```

### Cloudflare AI Playground

Use deployed URL directly: `https://<your-worker>.workers.dev/sse`

## Cloudflare Workers Specifics

- **Node.js Compatibility**: Enabled via `compatibility_flags: ["nodejs_compat"]` in `wrangler.jsonc`
- **Durable Objects**: Used for MCP server state management
- **Migration Tag**: Set to "v1" for Durable Objects migration tracking
- **Observability**: Enabled for monitoring and debugging

## Key Dependencies

- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `agents`: MCP agent framework with Durable Object support
- `@anthropic-ai/sdk`: Claude API client
- `@google/genai`: Google Gemini API client
- `zod`: Runtime schema validation for tool parameters
- `wrangler`: Cloudflare Workers CLI and development server
