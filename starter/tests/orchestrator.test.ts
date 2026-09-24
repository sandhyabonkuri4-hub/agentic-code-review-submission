import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodeReviewOrchestrator } from '../src/orchestrator.js';
import { ReviewReportSchema } from '../src/types/report-types.js';
import {
  CodeQualityResult,
  TestCoverageResult,
  RefactoringSuggestion
} from '../src/types/analysis-results.js';
import {
  RateLimiter,
  ReviewError,
  ErrorCodes,
  withRetry,
  withTimeout
} from '../src/utils/index.js';

describe('CodeReviewOrchestrator', () => {
  describe('Configuration', () => {
    it('should initialize with default options', () => {
      const orchestrator = new CodeReviewOrchestrator();
      expect(orchestrator).toBeDefined();
      expect(orchestrator.model).toBeDefined();
      expect(orchestrator.maxRetries).toBe(3);
      expect(orchestrator.timeoutMs).toBe(60000);
      expect(orchestrator.rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should accept custom rate limit configuration', () => {
      const orchestrator = new CodeReviewOrchestrator({
        rateLimits: {
          maxRequestsPerMinute: 20,
          maxTokensPerMinute: 50000,
          maxConcurrent: 2
        },
        maxRetries: 5,
        timeoutMs: 30000
      });

      expect(orchestrator.maxRetries).toBe(5);
      expect(orchestrator.timeoutMs).toBe(30000);

      const status = orchestrator.rateLimiter.getStatus();
      expect(status.availableRequests).toBe(20);
      expect(status.availableTokens).toBe(50000);
    });
  });

  describe('reviewPullRequest', () => {
    let orchestrator: CodeReviewOrchestrator;

    const mockCodeQuality: CodeQualityResult = {
      file: 'src/auth.ts',
      issues: [
        {
          line: 15,
          severity: 'critical',
          category: 'security',
          description: 'Hardcoded secret detected',
          suggestion: 'Use environment variables'
        },
        {
          line: 42,
          severity: 'medium',
          category: 'performance',
          description: 'Expensive regex inside loop',
          suggestion: 'Pre-compile regex outside loop'
        }
      ],
      overallScore: 78,
      summary: 'Authentication module with critical security vulnerability.'
    };

    const mockTestCoverage: TestCoverageResult = {
      file: 'src/auth.ts',
      hasTests: true,
      testFiles: ['tests/auth.test.ts'],
      untestedPaths: [
        {
          type: 'branch',
          location: 'verifyToken error condition',
          priority: 'critical',
          reasoning: 'Unhandled expired token state',
          suggestedTest: 'it("should reject expired tokens")'
        }
      ],
      coverageEstimate: 65,
      summary: 'Core token verification branches untested.'
    };

    const mockRefactorings: RefactoringSuggestion = {
      file: 'src/auth.ts',
      suggestions: [
        {
          type: 'modernize',
          location: 'parseHeaders',
          impact: 'high',
          description: 'Use optional chaining',
          before: 'headers && headers.auth',
          after: 'headers?.auth',
          benefits: 'Reduces boilerplate and prevents null reference'
        }
      ],
      summary: 'Modernize header parsing.'
    };

    beforeEach(() => {
      orchestrator = new CodeReviewOrchestrator({
        rateLimits: {
          maxRequestsPerMinute: 100,
          maxTokensPerMinute: 200000,
          maxConcurrent: 10
        }
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should fetch PR files from GitHub MCP / API', async () => {
      const mockFiles = [
        { filename: 'src/auth.ts', patch: '+ export const auth = true;' }
      ];

      vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(mockFiles);
      vi.spyOn(orchestrator, 'runCodeQualityAgent').mockResolvedValue(mockCodeQuality);
      vi.spyOn(orchestrator, 'runTestCoverageAgent').mockResolvedValue(mockTestCoverage);
      vi.spyOn(orchestrator, 'runRefactoringAgent').mockResolvedValue(mockRefactorings);

      const report = await orchestrator.reviewPullRequest('test-org', 'test-repo', 42);

      expect(orchestrator.fetchPRFiles).toHaveBeenCalledWith('test-org', 'test-repo', 42);
      expect(report.pullRequest).toEqual({
        owner: 'test-org',
        repo: 'test-repo',
        number: 42
      });
      expect(report.fileReviews).toHaveLength(1);
      expect(report.fileReviews[0]?.file).toBe('src/auth.ts');
    });

    it('should spawn all 3 subagents in parallel', async () => {
      const mockFiles = [
        { filename: 'src/auth.ts' },
        { filename: 'src/utils.ts' }
      ];

      const codeQualitySpy = vi
        .spyOn(orchestrator, 'runCodeQualityAgent')
        .mockResolvedValue(mockCodeQuality);
      const testCoverageSpy = vi
        .spyOn(orchestrator, 'runTestCoverageAgent')
        .mockResolvedValue(mockTestCoverage);
      const refactoringSpy = vi
        .spyOn(orchestrator, 'runRefactoringAgent')
        .mockResolvedValue(mockRefactorings);

      vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(mockFiles);

      await orchestrator.reviewPullRequest('test-org', 'test-repo', 101);

      // Verify each subagent was called for each file
      expect(codeQualitySpy).toHaveBeenCalledTimes(2);
      expect(testCoverageSpy).toHaveBeenCalledTimes(2);
      expect(refactoringSpy).toHaveBeenCalledTimes(2);

      expect(codeQualitySpy).toHaveBeenCalledWith('src/auth.ts', '');
      expect(codeQualitySpy).toHaveBeenCalledWith('src/utils.ts', '');
    });

    it('should aggregate results into ReviewReport', async () => {
      const mockFiles = [{ filename: 'src/auth.ts' }];

      vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(mockFiles);
      vi.spyOn(orchestrator, 'runCodeQualityAgent').mockResolvedValue(mockCodeQuality);
      vi.spyOn(orchestrator, 'runTestCoverageAgent').mockResolvedValue(mockTestCoverage);
      vi.spyOn(orchestrator, 'runRefactoringAgent').mockResolvedValue(mockRefactorings);

      const report = await orchestrator.reviewPullRequest('test-org', 'test-repo', 77);

      expect(report.summary.totalFiles).toBe(1);
      expect(report.summary.overallScore).toBe(78);
      expect(report.summary.criticalIssues).toBe(1);
      expect(report.summary.highPriorityTests).toBe(1);
      expect(report.summary.refactoringOpportunities).toBe(1);

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations[0]?.priority).toBe('critical');

      expect(report.metadata.duration).toBeGreaterThanOrEqual(0);
      expect(report.metadata.agentVersions).toHaveProperty('orchestrator');
      expect(report.metadata.agentVersions).toHaveProperty('code-quality-analyzer');
    });

    it('should validate output with Zod schema', async () => {
      const mockFiles = [{ filename: 'src/auth.ts' }];

      vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(mockFiles);
      vi.spyOn(orchestrator, 'runCodeQualityAgent').mockResolvedValue(mockCodeQuality);
      vi.spyOn(orchestrator, 'runTestCoverageAgent').mockResolvedValue(mockTestCoverage);
      vi.spyOn(orchestrator, 'runRefactoringAgent').mockResolvedValue(mockRefactorings);

      const report = await orchestrator.reviewPullRequest('test-org', 'test-repo', 99);

      // Runtime validation via Zod
      const parseResult = ReviewReportSchema.safeParse(report);
      expect(parseResult.success).toBe(true);
    });

    it('should handle subagent failures gracefully without crashing the review', async () => {
      const mockFiles = [{ filename: 'src/broken.ts' }];
      vi.spyOn(orchestrator, 'fetchPRFiles').mockResolvedValue(mockFiles);

      // Force executeSubagent to throw an error
      vi.spyOn(orchestrator, 'executeSubagent').mockRejectedValue(
        new Error('API quota exceeded')
      );

      const report = await orchestrator.reviewPullRequest('test-org', 'test-repo', 1);

      expect(report).toBeDefined();
      expect(report.summary.totalFiles).toBe(1);
      // Fallback quality score should be applied
      expect(report.fileReviews[0]?.codeQuality.overallScore).toBeDefined();
      expect(report.fileReviews[0]?.testCoverage.hasTests).toBe(false);
      expect(report.fileReviews[0]?.refactorings.suggestions).toEqual([]);
    });
  });

  describe('Error Handling Utilities', () => {
    it('withRetry should retry on failure and succeed if subsequent attempt passes', async () => {
      let attempts = 0;
      const fn = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary glitch');
        }
        return 'success';
      });

      const result = await withRetry(fn, 3, 10);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('withRetry should throw ReviewError RETRY_EXHAUSTED when all attempts fail', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Persistent error'));

      await expect(withRetry(fn, 2, 10)).rejects.toThrow(ReviewError);
      await expect(withRetry(fn, 2, 10)).rejects.toMatchObject({
        code: ErrorCodes.RETRY_EXHAUSTED
      });
    });

    it('withTimeout should return result if completed in time', async () => {
      const fn = async () => 'completed in time';
      const result = await withTimeout(fn, 100);
      expect(result).toBe('completed in time');
    });

    it('withTimeout should reject with AGENT_TIMEOUT when exceeding timeoutMs', async () => {
      const fn = () => new Promise(resolve => setTimeout(resolve, 200));

      await expect(withTimeout(fn, 50, 'Timeout triggered')).rejects.toMatchObject({
        code: ErrorCodes.AGENT_TIMEOUT,
        message: 'Timeout triggered'
      });
    });
  });

  describe('Rate Limiter Utilities', () => {
    it('should track concurrency and respect maxConcurrent limit', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerMinute: 100,
        maxTokensPerMinute: 100000,
        maxConcurrent: 2
      });

      expect(limiter.canProceed(1000)).toBe(true);

      await limiter.acquire(1000);
      expect(limiter.getStatus().activeRequests).toBe(1);

      await limiter.acquire(1000);
      expect(limiter.getStatus().activeRequests).toBe(2);

      // Now at maxConcurrent (2), canProceed should be false
      expect(limiter.canProceed(1000)).toBe(false);

      limiter.release();
      expect(limiter.getStatus().activeRequests).toBe(1);
      expect(limiter.canProceed(1000)).toBe(true);

      limiter.release();
      expect(limiter.getStatus().activeRequests).toBe(0);
    });

    it('should track token budget in sliding window', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerMinute: 10,
        maxTokensPerMinute: 5000,
        maxConcurrent: 5
      });

      await limiter.acquire(3000);
      limiter.release();

      const status = limiter.getStatus();
      expect(status.tokensInWindow).toBe(3000);
      expect(status.availableTokens).toBe(2000);

      // Attempting 3000 tokens when 2000 available should return false
      expect(limiter.canProceed(3000)).toBe(false);
      // Attempting 1500 tokens should return true
      expect(limiter.canProceed(1500)).toBe(true);
    });
  });

  describe('Integration', () => {
    // These tests require actual API keys and should be skipped in CI
    it.skip('should review a real small PR', async () => {
      // NOTE: Only run manually with valid API keys
      const orchestrator = new CodeReviewOrchestrator();
      const report = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);
      expect(report).toBeDefined();
    });
  });
});
