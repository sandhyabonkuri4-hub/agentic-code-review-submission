import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';
import { logger } from './utils/logger.js';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev <owner> <repo> <pr-number>
 */
async function main() {
  const [owner, repo, prStr] = process.argv.slice(2);

  // Validate command line arguments
  if (!owner || !repo || !prStr) {
    console.error('Usage: npm run dev <owner> <repo> <pr-number>');
    console.error('Example: npm run dev facebook react 12345');
    process.exit(1);
  }

  const prNumber = parseInt(prStr, 10);
  if (isNaN(prNumber) || prNumber <= 0 || !Number.isInteger(prNumber)) {
    console.error(`Error: Invalid PR number "${prStr}". PR number must be a positive integer.`);
    process.exit(1);
  }

  // Validate authentication (choose ONE method)
  const hasBedrock = Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  );
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  if (hasBedrock) {
    if (!process.env.AWS_REGION) {
      console.error('Error: AWS_REGION environment variable is required when using AWS Bedrock.');
      process.exit(1);
    }
    console.log('🔐 Using AWS Bedrock authentication');
  } else if (hasAnthropic) {
    console.log('🔐 Using Anthropic API authentication');
  } else {
    console.error('Error: Authentication credentials missing.');
    console.error('Please configure either:');
    console.error('  1. Anthropic API: Set ANTHROPIC_API_KEY in your .env file');
    console.error('  2. AWS Bedrock: Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION in .env');
    process.exit(1);
  }

  // Validate ANTHROPIC_MODEL environment variable
  if (!process.env.ANTHROPIC_MODEL) {
    console.error('Error: ANTHROPIC_MODEL environment variable is required.');
    console.error('Examples:');
    console.error('  - Anthropic API: claude-sonnet-4-5-20250929');
    console.error('  - AWS Bedrock: us.anthropic.claude-sonnet-4-5-20250929-v1:0');
    process.exit(1);
  }

  try {
    const orchestrator = new CodeReviewOrchestrator();
    console.log(`🚀 Starting multi-agent code review for ${owner}/${repo} #${prNumber}...`);

    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    // Save reports in 'reports/' directory
    const reportsDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const generator = new ReportGenerator();
    const baseName = `review-${owner}-${repo}-${prNumber}`;

    const mdReport = generator.generateMarkdownReport(report);
    const htmlReport = generator.generateHTMLReport(report);
    const jsonReport = generator.generateJSONReport(report);

    const mdPath = path.join(reportsDir, `${baseName}.md`);
    const htmlPath = path.join(reportsDir, `${baseName}.html`);
    const jsonPath = path.join(reportsDir, `${baseName}.json`);

    fs.writeFileSync(mdPath, mdReport, 'utf-8');
    fs.writeFileSync(htmlPath, htmlReport, 'utf-8');
    fs.writeFileSync(jsonPath, jsonReport, 'utf-8');

    console.log('\n✅ Code Review Completed Successfully!');
    console.log(`📊 Overall Score: ${report.summary.overallScore}/100`);
    console.log(`📁 Files Reviewed: ${report.summary.totalFiles}`);
    console.log(`🚨 Critical Issues: ${report.summary.criticalIssues}`);
    console.log(`⚠️  Tests Needed: ${report.summary.highPriorityTests}`);
    console.log(`💡 Refactorings: ${report.summary.refactoringOpportunities}`);
    console.log('\n📄 Generated Reports:');
    console.log(`   - Markdown: ${mdPath}`);
    console.log(`   - HTML:     ${htmlPath}`);
    console.log(`   - JSON:     ${jsonPath}`);
  } catch (error) {
    logger.error('Review execution error:', { error });
    console.error('\n❌ Code Review Failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
