# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **remote MCP (Model Context Protocol) server** deployed on Cloudflare Workers that generates Meta advertising copy for Superpower's preventive health testing service. The server accepts image or video files via R2 storage and produces compelling ad headlines and primary text optimized for Meta's advertising platform.

**Version**: 2.0.0 (R2-based URL architecture)

### Key Architecture Components

1. **McpAgent-based Server**: Built on the `agents/mcp` framework, extending `McpAgent` class to create a Durable Object-based MCP server
2. **Cloudflare R2 Storage**: Media files are uploaded to R2 bucket and accessed via signed URLs, eliminating base64 encoding overhead
3. **Dual AI Provider Integration**:
   - Uses **Anthropic Claude** (claude-sonnet-4-5-20250929) for image-based ad copy generation
   - Uses **Google Gemini** (gemini-2.0-flash-exp) for video-based ad copy generation
4. **Modular Folder Structure**: Organized codebase with separated concerns (storage, AI, API, MCP, utilities)
5. **Transport Layer**: Supports both SSE (Server-Sent Events) at `/sse` and standard MCP at `/mcp` endpoints

### Core Workflow (v2.0)

**New Two-Step Process**:

1. **Upload Media**: Client uploads file to `/upload` endpoint → Receives R2 signed URL
2. **Generate Ad Copy**: Client calls `create_ad_copy` MCP tool with `mediaUrl` → Receives ad copy

**Benefits**:
- ~33% reduction in payload size (no base64 encoding)
- Persistent storage in R2 for reprocessing
- Signed URLs with 24-hour expiration for security
- Cleaner separation of upload and processing concerns

### Core Tool: `create_ad_copy`

Single MCP tool that:

- Accepts `mediaUrl` (R2 signed URL) instead of base64 data
- Extracts R2 key from URL and fetches media from bucket
- Validates media type (images: image/jpeg, image/png, image/gif, image/webp; videos: video/mp4, video/quicktime, etc.)
- Routes to appropriate AI provider (Claude for images, Gemini for videos)
- Applies specialized ad copywriting prompt from `src/prompt.ts`
- Returns structured response with `headline` and `primaryText` fields

## Project Structure

```
src/
├── index.ts                    # Main worker entry point (routing)
├── mcp/
│   ├── server.ts              # MCP Durable Object class
│   └── tools/
│       └── create-ad-copy.ts  # create_ad_copy tool implementation
├── storage/
│   ├── r2.ts                  # R2 upload/download/signed URL utilities
│   └── types.ts               # Storage-related types
├── ai/
│   ├── claude.ts              # Claude (Anthropic) integration
│   ├── gemini.ts              # Gemini (Google) integration
│   └── types.ts               # AI provider types
├── api/
│   └── upload.ts              # File upload endpoint handler
├── utils/
│   ├── mime-types.ts          # MIME type validation utilities
│   └── json-parser.ts         # JSON response parsing utility
└── prompt.ts                   # Ad copy prompt (unchanged)
```

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

Generates TypeScript types for Cloudflare Workers environment bindings including R2.

### Deploy to Cloudflare Workers

```bash
npm run deploy
```

**Important**: Before deploying, create the R2 bucket:

```bash
wrangler r2 bucket create superpower-ad-media
```

## Environment Variables

Required environment variables:

### Secrets (set via Cloudflare Dashboard or `wrangler secret put`):
- `ANTHROPIC_API_KEY`: Anthropic API key for Claude image processing
- `GEMINI_API_KEY`: Google Gemini API key for video processing

### Public Variables (in `wrangler.jsonc` under `vars`):
- `R2_PUBLIC_URL`: Base URL for R2 bucket (e.g., `https://superpower-ad-media.r2.dev`)
- `SIGNED_URL_EXPIRATION_SECONDS`: Signed URL expiration time (default: `86400` = 24 hours)

### R2 Bucket Binding (in `wrangler.jsonc` under `r2_buckets`):
- `MEDIA_BUCKET`: R2 bucket binding for media storage

**Setting Secrets**:

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GEMINI_API_KEY
```

## API Endpoints

### `POST /upload`

Uploads media file to R2 and returns signed URL.

**Request**: `multipart/form-data` with `file` field

**Response**:
```json
{
  "success": true,
  "url": "https://superpower-ad-media.r2.dev/media/1234567890-abc-def.jpg",
  "key": "media/1234567890-abc-def.jpg",
  "expiresAt": "2025-12-18T12:00:00.000Z"
}
```

**Limits**:
- Images: 10MB max
- Videos: 50MB max

### `GET /` (Root)

Returns service information and available endpoints.

### `GET /test-env`

Returns environment configuration status (for debugging).

### `POST /sse` or `POST /sse/message`

Server-Sent Events transport for MCP protocol.

### `POST /mcp`

Standard MCP transport.

## Code Architecture Insights

### Durable Objects Pattern

The `MyMCP` class in `src/mcp/server.ts` extends `McpAgent` which is a Durable Object:

- **Instance Management**: Each MCP session may spawn a Durable Object instance
- **Environment Injection**: `setEnv(env)` must be called before `init()` to provide environment variables
- **Lifecycle**: The `init()` method registers tools using `this.server.tool(...)`
- **AI Client Initialization**: Clients are initialized in `onStart()` method

### File Processing Flow (v2.0)

**Upload Flow** (`src/api/upload.ts`):

1. Client sends `multipart/form-data` with file to `/upload`
2. Server validates MIME type and file size
3. Server generates unique R2 key: `media/{timestamp}-{uuid}.{ext}`
4. Server uploads file to R2 bucket with metadata
5. Server generates signed URL with 24-hour expiration
6. Server returns JSON with URL, key, and expiration

**Image Processing** (`src/ai/claude.ts`):

1. MCP tool receives `mediaUrl` from client
2. Extract R2 key from URL
3. Fetch file metadata to get MIME type
4. Fetch image buffer from R2
5. Convert buffer to base64 (internal only, not exposed to client)
6. Send to Claude vision API with `AD_COPY_PROMPT`
7. Parse JSON response (handling markdown code fence stripping)
8. Return formatted ad copy with 📸 emoji prefix

**Video Processing** (`src/ai/gemini.ts`):

1. MCP tool receives `mediaUrl` from client
2. Extract R2 key from URL
3. Fetch file metadata to get MIME type
4. Fetch video buffer from R2
5. Convert buffer to File object
6. Upload to Google Gemini Files API
7. Poll until file state is `ACTIVE` (vs `PROCESSING`) - max 2 minutes
8. Generate content using `gemini-2.0-flash-exp` model
9. Parse JSON response (handling markdown code fence stripping)
10. Return formatted ad copy with 📱 emoji prefix

### R2 Storage Layer (`src/storage/r2.ts`)

Key functions:

- `uploadToR2(file, mimeType, bucket)`: Uploads file and returns storage key
- `generateSignedUrl(key, bucket, expiresIn)`: Generates time-limited signed URL
- `fetchFromR2(key, bucket)`: Retrieves file as ArrayBuffer
- `getFileMetadata(key, bucket)`: Gets file info including MIME type
- `extractKeyFromUrl(url)`: Extracts R2 key from signed URL

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

1. Create tool implementation in `src/mcp/tools/{tool-name}.ts`
2. Export tool schema and handler function
3. Register in `src/mcp/server.ts` in the `init()` method:

```typescript
import { myToolSchema, myToolHandler } from "./tools/my-tool";

// In init() method:
this.server.tool(
  myToolSchema.name,
  myToolSchema.description,
  myToolSchema.inputSchema,
  async (params) => {
    return await myToolHandler(params, this.env);
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

### Adding New AI Providers

1. Create integration module in `src/ai/{provider}.ts`
2. Implement `generateAdCopyFrom{Type}` function
3. Use shared utilities from `src/utils/json-parser.ts`
4. Update tool logic in `src/mcp/tools/create-ad-copy.ts` to route to new provider

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
- **R2 Storage**: Cloudflare's S3-compatible object storage for media files
- **Migration Tag**: Set to "v1" for Durable Objects migration tracking
- **Observability**: Enabled for monitoring and debugging

## Key Dependencies

- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `agents`: MCP agent framework with Durable Object support
- `@anthropic-ai/sdk`: Claude API client
- `@google/genai`: Google Gemini API client
- `zod`: Runtime schema validation for tool parameters
- `wrangler`: Cloudflare Workers CLI and development server

## Breaking Changes (v1.0 → v2.0)

### `create_ad_copy` Tool Signature Change

**Before (v1.0)**:
```typescript
{
  base64Data: string;  // Base64-encoded media
  mimeType: string;    // MIME type
  text?: string;       // Optional context
}
```

**After (v2.0)**:
```typescript
{
  mediaUrl: string;    // R2 signed URL
  text?: string;       // Optional context
}
```

### Migration Guide for Clients

1. Upload file to `POST /upload` endpoint first:
   ```bash
   curl -X POST http://localhost:8787/upload \
     -F "file=@image.jpg"
   ```

2. Use returned `url` in `create_ad_copy` tool:
   ```json
   {
     "mediaUrl": "https://superpower-ad-media.r2.dev/media/123-abc.jpg",
     "text": "Focus on health benefits"
   }
   ```

### Benefits of Migration

- **~33% smaller payloads**: No base64 encoding overhead
- **Persistent storage**: Files remain in R2 for reprocessing
- **Security**: Time-limited signed URLs (24-hour expiration)
- **Scalability**: R2 handles large files more efficiently
- **Cleaner architecture**: Separation of upload and processing concerns
