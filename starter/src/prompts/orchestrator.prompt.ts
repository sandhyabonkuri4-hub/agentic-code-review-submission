/**
 * Orchestrator Prompt Builder
 * Generates prompt instructions for the main code review coordinator.
 */

/**
 * Builds the orchestrator coordination prompt
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param files - Optional list of files in the pull request
 * @returns Formatted orchestrator prompt
 */
export function buildOrchestratorPrompt(
  owner: string,
  repo: string,
  prNumber: number,
  files?: string[]
): string {
  const fileContext = files && files.length > 0
    ? `\nFiles to review in this pull request:\n${files.map(f => `- ${f}`).join('\n')}`
    : '\nFetch the list of changed files for this pull request using GitHub tools.';

  return `You are the Lead Code Review Orchestrator coordinating an enterprise multi-agent code review.

Target Pull Request:
- Repository: ${owner}/${repo}
- Pull Request Number: #${prNumber}
${fileContext}

Your Responsibilities:
1. Coordinate the comprehensive review of all changed files in the pull request.
2. Delegate specialized analysis to 3 subagents for each file:
   - Code Quality Analyzer: for security vulnerabilities, bug risks, performance issues, and best practices.
   - Test Coverage Analyzer: for untested code paths, branches, edge cases, and test recommendations.
   - Refactoring Suggester: for code modernization, simplification, and architectural improvements.
3. Consolidate and synthesize findings into a unified ReviewReport:
   - Aggregate all individual file reviews.
   - Calculate summary statistics (overall quality score, file count, critical issue count, high priority tests needed, refactoring opportunities).
   - Formulate prioritized, actionable recommendations categorized by severity.
   - Record review metadata.

Ensure all outputs are rigorous, constructive, and strictly conform to the expected review schema.`;
}
