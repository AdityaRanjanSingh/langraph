import { postgresCheckpointer } from "./memory";
import type { DynamicTool, StructuredToolInterface } from "@langchain/core/tools";
import {
  AgentConfigOptions,
  createChatModel,
  DEFAULT_MODEL_NAME,
  DEFAULT_MODEL_PROVIDER,
} from "./util";
import { getMCPTools } from "./mcp";
import { DataAnalysisAgentBuilder } from "./data-analysis-agent-builder";
import { dataAnalysisTools } from "./tools/data-analysis-tools";

let setupPromise: Promise<void> | null = null;

/**
 * One-time initialization for the Postgres checkpointer.
 * Ensures the underlying table/extension are ready before any agent runs.
 * This is called automatically when creating an agent via `createDataAnalysisAgent`.
 */
async function setupOnce() {
  if (!setupPromise) {
    setupPromise = postgresCheckpointer.setup().catch((err) => {
      // Reset so a future call can retry if initial setup failed.
      setupPromise = null;
      console.error("Failed to setup postgres checkpointer:", err);
      throw err;
    });
  }
  await setupPromise;
}

/**
 * Create a new data analysis agent instance with the given configuration.
 * @param cfg Configuration options for the agent
 * @returns Compiled LangGraph agent
 */
async function createAgent(cfg?: AgentConfigOptions) {
  // Resolve model/provider from cfg or defaults.
  const provider = cfg?.provider || DEFAULT_MODEL_PROVIDER;
  const modelName = cfg?.model || DEFAULT_MODEL_NAME;
  const llm = createChatModel({ provider, model: modelName, temperature: 1 });

  // Load MCP tools (optional - for extensibility)
  const mcpTools = await getMCPTools();
  const configTools = (cfg?.tools || []) as StructuredToolInterface[];

  // Combine data analysis tools with any additional tools
  const allTools = [...dataAnalysisTools, ...configTools, ...mcpTools] as DynamicTool[];

  const agent = new DataAnalysisAgentBuilder({
    llm,
    tools: allTools,
    checkpointer: postgresCheckpointer,
    approveAllTools: cfg?.approveAllTools || false,
  }).build();

  return agent;
}

/**
 * Create a data analysis agent instance, ensuring the checkpointer is ready.
 * @param cfg Configuration options for the agent
 * @returns Compiled LangGraph agent
 */
export async function createDataAnalysisAgent(cfg?: AgentConfigOptions) {
  // Ensure checkpointer is ready before returning an agent instance.
  await setupOnce();
  return createAgent(cfg);
}
