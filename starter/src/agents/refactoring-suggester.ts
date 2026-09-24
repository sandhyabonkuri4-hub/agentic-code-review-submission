import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/index.js';

/**
 * Refactoring Suggester Subagent
 * Identifies modernization opportunities, code simplification, pattern improvements,
 * and provides before/after code transformations with impact assessments.
 */
export const refactoringSuggester: AgentDefinition = {
  description:
    'Recommends code modernization, simplification, and architectural improvements with before/after snippets and impact analysis.',
  prompt: REFACTORING_SUGGESTER_PROMPT,
  tools: ['Read', 'Grep', 'Glob']
};
