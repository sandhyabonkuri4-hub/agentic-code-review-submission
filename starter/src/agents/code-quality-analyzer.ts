import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/index.js';

/**
 * Code Quality Analyzer Subagent
 * Identifies security vulnerabilities, bug risks, performance issues, and best practice violations.
 * Integrates with Claude Skills (.claude/skills) for language and domain-specific checks.
 */
export const codeQualityAnalyzer: AgentDefinition = {
  description:
    'Analyzes code for security vulnerabilities, bugs, performance issues, maintainability, and best practice violations using Claude Skills.',
  prompt: CODE_QUALITY_ANALYZER_PROMPT,
  tools: ['Read', 'Grep', 'Glob']
};
