# AI Agent Instructions

This is a Next.js 15 fullstack application that implements an AI agent chat interface using LangGraph.js with Model Context Protocol (MCP) server integration and streaming responses.

## Architecture Overview

### Core Agent System

- **LangGraph Agent**: Built with `AgentBuilder` class in `src/lib/agent/builder.ts` - creates a StateGraph with agent→tool_approval→tools flow
- **MCP Integration**: Dynamically loads tools from MCP servers stored in Postgres (`src/lib/agent/mcp.ts`)
- **Persistent Memory**: Uses LangGraph's Postgres checkpointer for conversation history across sessions
- **Tool Approval**: Implements human-in-the-loop pattern with interrupts for tool execution approval

### Data Flow

1. User message → `/api/agent/stream` SSE endpoint → `streamResponse()` in `agentService.ts`
2. Agent processes with tools from enabled MCP servers → streams incremental responses
3. Frontend uses `useChatThread()` hook with React Query for optimistic UI and streaming
4. Thread persistence via Prisma → Postgres (threads + MCP server configs)

## Essential Development Commands

```bash
# Setup (requires Postgres running on port 5434)
docker compose up -d
pnpm install
pnpm prisma:generate
pnpm prisma:migrate

# Development
pnpm dev  # Next.js with Turbopack
pnpm prisma:studio  # Database UI

# Database operations
pnpm prisma:generate  # After schema changes
pnpm prisma:migrate   # Create new migrations
```

## Project-Specific Patterns

### Agent Configuration

- **One-time setup**: `ensureAgent()` ensures Postgres checkpointer is initialized before agent creation
- **Dynamic tool loading**: MCP servers are queried from database on each agent creation
- **Model flexibility**: Supports switching between OpenAI/Google models via `AgentConfigOptions`

### Streaming Architecture

- **SSE with React Query**: `useChatThread` manages optimistic UI + streaming updates
- **Message accumulation**: Frontend concatenates text chunks by message ID for smooth UX
- **Tool approval flow**: Uses Command objects with `resume` action instead of regular inputs

### Database Schema Specifics

- `MCPServer` model supports both stdio and http MCP server types with conditional fields
- `Thread` model is minimal - actual conversation history stored in LangGraph checkpoints
- Use JSON fields (`args`, `env`, `headers`) for flexible MCP server configuration

### Component Structure

- **Context providers**: `ThreadContext` manages active thread, `UISettingsContext` for UI state
- **Custom hooks**: `useChatThread`, `useMCPTools`, `useThreads` handle specific data domains
- **Message components**: Separate components for AI/Human/Tool/Error message types with tool call displays

### API Route Patterns

- Stream endpoints use `dynamic = "force-dynamic"` and `runtime = "nodejs"`
- Query params for streaming: `content`, `threadId`, `model`, `allowTool`, `approveAllTools`
- MCP server CRUD follows REST patterns in `/api/mcp-servers/route.ts`

## Key Integration Points

### MCP Server Management

- Add servers via `MCPServerForm` component → stored in database → loaded dynamically into agent
- Server configs support environment variables and command arguments for stdio type
- Tool names are prefixed with server name to prevent conflicts

### Tool Approval Workflow

- Agent pauses at tool calls, emits interrupt with tool details
- Frontend shows approval UI, sends allowTool=allow/deny parameter
- Uses Command.resume() pattern instead of new message input

### Memory System

- Thread history retrieved via `getHistory(threadId)` from LangGraph checkpoints
- Frontend optimistically updates React Query cache during streaming
- Postgres checkpointer handles concurrent access and persistence

When modifying the agent system, always run database migrations after schema changes and restart the dev server to pick up new MCP server configurations.
