# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Development Commands

```bash
# Setup (requires Postgres running)
docker compose up -d          # Start Postgres on port 5434
pnpm install
pnpm prisma:generate
pnpm prisma:migrate

# Development
pnpm dev                      # Next.js with Turbopack
pnpm build                    # Production build
pnpm lint                     # ESLint
pnpm format                   # Prettier formatting
pnpm format:check             # Check formatting

# Database
pnpm prisma:generate          # After schema changes
pnpm prisma:migrate           # Create/apply migrations
pnpm prisma:studio            # Database UI
```

## Architecture Overview

This is a Next.js 15 fullstack AI agent chat application using LangGraph.js with Model Context Protocol (MCP) server integration.

### Core Agent System

- **Agent Builder**: `src/lib/agent/builder.ts` - Creates StateGraph with agent→tool_approval→tools flow
- **MCP Integration**: `src/lib/agent/mcp.ts` - Dynamically loads tools from MCP servers stored in Postgres
- **Persistent Memory**: Uses LangGraph's Postgres checkpointer for conversation history
- **Tool Approval**: Human-in-the-loop pattern with interrupts for tool execution approval

### Data Flow

1. User message → `/api/agent/stream` SSE endpoint → `streamResponse()` in `agentService.ts`
2. Agent processes with tools from enabled MCP servers → streams incremental responses
3. Frontend uses `useChatThread()` hook with React Query for optimistic UI and streaming
4. Thread persistence via Prisma → Postgres (threads + MCP server configs)

### Key Components Structure

- **Context Providers**: `ThreadContext` (active thread), `UISettingsContext` (UI state)
- **Custom Hooks**: `useChatThread`, `useMCPTools`, `useThreads` for data domains
- **Message Components**: Separate components for AI/Human/Tool/Error message types
- **Agent Services**: `src/services/agentService.ts` handles streaming, `src/services/chatService.ts` manages UI state

### Database Schema

- `Thread` model: Minimal metadata (actual history in LangGraph checkpoints)
- `MCPServer` model: Supports stdio/http types with conditional fields (command/args/env for stdio, url/headers for http)
- Uses JSON fields for flexible MCP server configuration

### MCP Server Management

- Add servers via `MCPServerForm` → stored in database → loaded dynamically into agent
- Tool names prefixed with server name to prevent conflicts
- Server configs support environment variables and command arguments

### Tool Approval Workflow

- Agent pauses at tool calls, emits interrupt with tool details
- Frontend shows approval UI, sends `allowTool=allow/deny` parameter
- Uses `Command.resume()` pattern instead of new message input

## Project-Specific Patterns

### Agent Configuration

- `ensureAgent()` ensures Postgres checkpointer is initialized before agent creation
- MCP servers queried from database on each agent creation for dynamic tool loading
- Supports OpenAI/Google models via `AgentConfigOptions`

### API Route Patterns

- Stream endpoints use `dynamic = "force-dynamic"` and `runtime = "nodejs"`
- Query params for streaming: `content`, `threadId`, `model`, `allowTool`, `approveAllTools`
- MCP server CRUD follows REST patterns in `/api/mcp-servers/route.ts`

### Streaming Architecture

- SSE with React Query: `useChatThread` manages optimistic UI + streaming updates
- Message accumulation: Frontend concatenates text chunks by message ID
- Tool approval flow uses Command objects with `resume` action

## Important Notes

- Always run `pnpm prisma:generate` after schema changes
- Restart dev server to pick up new MCP server configurations
- Database runs on port 5434 (not default 5432) to avoid conflicts
- Uses pnpm as package manager (see packageManager in package.json)
