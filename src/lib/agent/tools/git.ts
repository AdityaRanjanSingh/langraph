import { DynamicStructuredTool } from "@langchain/core/tools";
import { execSync } from "child_process";
import { z } from "zod";

/**
 * Execute a git command and return the output as a string.
 * Handles errors gracefully.
 */
function executeGitCommand(command: string): string {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim();
  } catch (error) {
    if (error instanceof Error) {
      return `Error executing git command: ${error.message}`;
    }
    return "Unknown error executing git command";
  }
}

/**
 * Tool to get the diff between main branch and current HEAD.
 * Shows all committed changes on the current branch.
 */
export const getBranchDiffTool = new DynamicStructuredTool({
  name: "get_branch_diff",
  description:
    "Get the git diff between main branch and current HEAD. Shows all committed changes on the current branch compared to main. Useful for analyzing what code has changed.",
  schema: z.object({}),
  func: async () => {
    const result = executeGitCommand("git diff main...HEAD");
    if (result.startsWith("Error")) {
      return result;
    }
    if (!result) {
      return "No differences found between main and current branch. You may be on the main branch or have no commits yet.";
    }
    return result;
  },
});

/**
 * Tool to get the list of files that changed between main and HEAD.
 * Returns just the file names, not the actual diff content.
 */
export const getChangedFilesTool = new DynamicStructuredTool({
  name: "get_changed_files",
  description:
    "Get the list of files that changed between main branch and current HEAD. Returns only file paths, not the diff content. Useful for getting an overview of what files were modified.",
  schema: z.object({}),
  func: async () => {
    const result = executeGitCommand("git diff --name-only main...HEAD");
    if (result.startsWith("Error")) {
      return result;
    }
    if (!result) {
      return "No files changed between main and current branch.";
    }
    const files = result.split("\n");
    return `Changed files (${files.length}):\n${files.map((f) => `- ${f}`).join("\n")}`;
  },
});

/**
 * Tool to get the current branch name.
 */
export const getBranchNameTool = new DynamicStructuredTool({
  name: "get_branch_name",
  description:
    "Get the name of the current git branch. Useful for identifying which branch you're working on.",
  schema: z.object({}),
  func: async () => {
    const result = executeGitCommand("git branch --show-current");
    if (result.startsWith("Error")) {
      return result;
    }
    if (!result) {
      return "Unable to determine current branch. You may be in detached HEAD state.";
    }
    return `Current branch: ${result}`;
  },
});

/**
 * Array of all git tools for easy registration with the agent.
 */
export const gitTools = [getBranchDiffTool, getChangedFilesTool, getBranchNameTool];
