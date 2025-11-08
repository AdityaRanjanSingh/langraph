Plan: Local Branch Documentation Generator Agent

Overview

Create a simple agent that runs locally via chat,
analyzes git branch changes, and generates Docsify
documentation with human approval.

Phase 1: Add Git MCP Server

Enable git operations via MCP

1.  Configure filesystem MCP server (if not already
    enabled)

- Provides file reading capabilities for changed
  files
- Add via Settings UI or database entry

2.  Add basic git tools (src/lib/agent/tools/git.ts)

- getBranchDiff(): Execute git diff main...HEAD
- getChangedFiles(): Execute git diff --name-only
  main...HEAD
- getBranchName(): Execute git branch
  --show-current
- Register these tools with the agent

Phase 2: Documentation Agent Workflow

Create specialized StateGraph for doc generation

1.  Create DocAgentBuilder class
    (src/lib/agent/docBuilder.ts)

- 4-node workflow: analyze_changes → generate_docs
  → review_approval → save_docs
- analyze_changes: Get git diff, read changed
  files, summarize modifications
- generate_docs: LLM creates markdown documentation
  based on changes
- review_approval: Human-in-the-loop interrupt with
  doc preview
- save_docs: Write approved docs to docs/ folder

2.  State interface (DocAgentState)
    interface DocAgentState extends MessagesAnnotation {
    branchName: string
    changedFiles: string[]
    gitDiff: string
    generatedDocs: { filename: string; content: string
    }[]
    approved: boolean
    }

Phase 3: Docsify Setup

Initialize Docsify documentation structure

1.  Install docsify-cli

- Add to package.json: "docsify-cli": "^4.4.4"
- Run pnpm install

2.  Initialize docs folder

- Run docsify init ./docs
- Creates docs/index.html, docs/README.md,
  docs/\_sidebar.md
- Add script: "docs:serve": "docsify serve ./docs"

3.  Create doc utilities (src/lib/docsify/utils.ts)

- updateSidebar(): Add new doc links to \_sidebar.md
- formatMarkdown(): Format with Docsify conventions
  (headers, alerts, code blocks)

Phase 4: Integration

Connect doc agent to existing system

1.  Register doc agent (src/lib/agent/index.ts)

- Export createDocAgent() function
- Make it available alongside main agent

2.  Add command detection
    (src/services/agentService.ts)

- Detect messages like "generate docs", "update
  documentation"
- Route to doc agent instead of main agent
- Or add simple toggle in UI to switch agent type

3.  Frontend changes (optional)

- Add "Generate Docs" button in chat interface
- Or just use natural language: "Please generate
  documentation for this branch"

Phase 5: Testing

Validate the workflow

1.  Manual test flow

- Create test branch with some changes
- Send message: "Generate documentation for my
  branch changes"
- Agent analyzes diff, generates docs, shows
  preview
- User approves
- Docs written to docs/ folder

2.  Update ARCHITECTURE.md

- Document the doc agent workflow
- Add usage instructions

Implementation Steps (Simplified)

Step 1: Add Git Tools

- File: src/lib/agent/tools/git.ts
- 3 simple functions wrapping git commands
- Register with DynamicStructuredTool

Step 2: Create Doc Agent Builder

- File: src/lib/agent/docBuilder.ts
- Copy structure from AgentBuilder
- Modify nodes for doc workflow
- Keep tool approval pattern

Step 3: Install & Init Docsify

- pnpm add docsify-cli
- pnpm docsify init ./docs
- Add utilities in src/lib/docsify/utils.ts

Step 4: Wire It Up

- Export from src/lib/agent/index.ts
- Add routing logic in agent service
- Test via chat interface

Files to Create

1.  src/lib/agent/tools/git.ts - Git command tools
2.  src/lib/agent/docBuilder.ts - Doc agent StateGraph
3.  src/lib/docsify/utils.ts - Docsify helpers
4.  docs/index.html, docs/README.md, docs/\_sidebar.md

- Docsify init

Files to Modify

1.  package.json - Add docsify-cli
2.  src/lib/agent/index.ts - Export doc agent
3.  src/services/agentService.ts - Route to doc agent
4.  ARCHITECTURE.md - Document new agent

Usage Flow

User: "Generate documentation for my branch changes"
↓
Agent: [Runs git diff, analyzes changes]
↓
Agent: "I found changes in 5 files. Generating
documentation..."
↓
Agent: [Shows markdown preview] "Should I save this
to docs/?"
↓
User: "Yes, approve"
↓
Agent: [Writes files] "Documentation saved to
docs/features/new-feature.md"
