import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/index.js';

/**
 * Test Coverage Analyzer Subagent
 * Evaluates test completeness, identifies untested paths (branches, edge cases, functions),
 * and provides concrete testing recommendations using extended thinking.
 */
export const testCoverageAnalyzer: AgentDefinition = {
  description:
    'Evaluates test completeness and identifies untested code paths, branches, and edge cases with priority-based test recommendations.',
  prompt: TEST_COVERAGE_ANALYZER_PROMPT,
  tools: ['Read', 'Grep', 'Glob']
};
