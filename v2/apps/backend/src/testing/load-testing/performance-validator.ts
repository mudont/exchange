import { LoadTestStats } from './load-test-runner';
import { structuredLogger } from '../../services/monitoring/structured-logger';

export interface PerformanceThreshold {
  metric: keyof LoadTestStats;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';
  value: number;
  description: string;
  severity: 'error' | 'warning' | 'info';
}

export interface PerformanceValidationResult {
  passed: boolean;
  score: number; // 0-100
  violations: PerformanceViolation[];
  summary: string;
}

export interface PerformanceViolation {
  threshold: PerformanceThreshold;
  actualValue: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export class PerformanceValidator {
  private thresholds: PerformanceThreshold[] = [];

  constructor() {
    this.initializeDefaultThresholds();
  }

  // Add a performance threshold
  addThreshold(threshold: PerformanceThreshold): void {
    this.thresholds.push(threshold);
  }

  // Remove all thresholds
  clearThresholds(): void {
    this.thresholds = [];
  }

  // Validate performance against thresholds
  validate(stats: LoadTestStats): PerformanceValidationResult {
    const violations: PerformanceViolation[] = [];
    let errorCount = 0;
    let warningCount = 0;

    for (const threshold of this.thresholds) {
      const actualValue = stats[threshold.metric] as number;
      const violation = this.checkThreshold(threshold, actualValue);
      
      if (violation) {
        violations.push(violation);
        
        if (violation.severity === 'error') {
          errorCount++;
        } else if (violation.severity === 'warning') {
          warningCount++;
        }
      }
    }

    const passed = errorCount === 0;
    const score = this.calculateScore(violations, this.thresholds.length);
    const summary = this.generateSummary(stats, violations, errorCount, warningCount);

    const result: PerformanceValidationResult = {
      passed,
      score,
      violations,
      summary,
    };

    structuredLogger.info('Performance validation completed', {
      passed,
      score,
      errorCount,
      warningCount,
      totalThresholds: this.thresholds.length,
    });

    return result;
  }

  // Generate a detailed performance report
  generateReport(stats: LoadTestStats, validationResult: PerformanceValidationResult): string {
    const report = [];
    
    report.push('='.repeat(80));
    report.push('PERFORMANCE TEST REPORT');
    report.push('='.repeat(80));
    report.push('');
    
    // Test Summary
    report.push('TEST SUMMARY:');
    report.push(`  Total Requests: ${stats.totalRequests.toLocaleString()}`);
    report.push(`  Successful Requests: ${stats.successfulRequests.toLocaleString()}`);
    report.push(`  Failed Requests: ${stats.failedRequests.toLocaleString()}`);
    report.push(`  Error Rate: ${stats.errorRate.toFixed(2)}%`);
    report.push(`  Test Duration: ${stats.duration.toFixed(2)}s`);
    report.push(`  Concurrency: ${stats.concurrency}`);
    report.push('');
    
    // Performance Metrics
    report.push('PERFORMANCE METRICS:');
    report.push(`  Requests/Second: ${stats.requestsPerSecond.toFixed(2)}`);
    report.push(`  Throughput: ${stats.throughput.toFixed(2)} successful req/s`);
    report.push(`  Average Response Time: ${stats.averageResponseTime.toFixed(2)}ms`);
    report.push(`  Min Response Time: ${stats.minResponseTime.toFixed(2)}ms`);
    report.push(`  Max Response Time: ${stats.maxResponseTime.toFixed(2)}ms`);
    report.push(`  50th Percentile: ${stats.p50ResponseTime.toFixed(2)}ms`);
    report.push(`  95th Percentile: ${stats.p95ResponseTime.toFixed(2)}ms`);
    report.push(`  99th Percentile: ${stats.p99ResponseTime.toFixed(2)}ms`);
    report.push('');
    
    // Validation Results
    report.push('VALIDATION RESULTS:');
    report.push(`  Overall Status: ${validationResult.passed ? 'PASSED' : 'FAILED'}`);
    report.push(`  Performance Score: ${validationResult.score}/100`);
    report.push(`  Total Violations: ${validationResult.violations.length}`);
    
    const errorViolations = validationResult.violations.filter(v => v.severity === 'error');
    const warningViolations = validationResult.violations.filter(v => v.severity === 'warning');
    
    report.push(`  Errors: ${errorViolations.length}`);
    report.push(`  Warnings: ${warningViolations.length}`);
    report.push('');
    
    // Violations Details
    if (validationResult.violations.length > 0) {
      report.push('VIOLATIONS:');
      
      for (const violation of validationResult.violations) {
        const severity = violation.severity.toUpperCase();
        report.push(`  [${severity}] ${violation.message}`);
        report.push(`    Expected: ${violation.threshold.metric} ${violation.threshold.operator} ${violation.threshold.value}`);
        report.push(`    Actual: ${violation.actualValue.toFixed(2)}`);
        report.push('');
      }
    }
    
    // Error Breakdown
    if (Object.keys(stats.errors).length > 0) {
      report.push('ERROR BREAKDOWN:');
      for (const [errorType, count] of Object.entries(stats.errors)) {
        const percentage = ((count / stats.totalRequests) * 100).toFixed(2);
        report.push(`  ${errorType}: ${count} (${percentage}%)`);
      }
      report.push('');
    }
    
    // Recommendations
    const recommendations = this.generateRecommendations(stats, validationResult);
    if (recommendations.length > 0) {
      report.push('RECOMMENDATIONS:');
      for (const recommendation of recommendations) {
        report.push(`  • ${recommendation}`);
      }
      report.push('');
    }
    
    report.push('='.repeat(80));
    
    return report.join('\n');
  }

  // Initialize default performance thresholds
  private initializeDefaultThresholds(): void {
    // Response time thresholds
    this.addThreshold({
      metric: 'averageResponseTime',
      operator: 'lt',
      value: 500, // 500ms
      description: 'Average response time should be less than 500ms',
      severity: 'error',
    });

    this.addThreshold({
      metric: 'p95ResponseTime',
      operator: 'lt',
      value: 1000, // 1s
      description: '95th percentile response time should be less than 1s',
      severity: 'error',
    });

    this.addThreshold({
      metric: 'p99ResponseTime',
      operator: 'lt',
      value: 2000, // 2s
      description: '99th percentile response time should be less than 2s',
      severity: 'warning',
    });

    // Error rate thresholds
    this.addThreshold({
      metric: 'errorRate',
      operator: 'lt',
      value: 1, // 1%
      description: 'Error rate should be less than 1%',
      severity: 'error',
    });

    this.addThreshold({
      metric: 'errorRate',
      operator: 'lt',
      value: 0.1, // 0.1%
      description: 'Error rate should be less than 0.1%',
      severity: 'warning',
    });

    // Throughput thresholds
    this.addThreshold({
      metric: 'requestsPerSecond',
      operator: 'gt',
      value: 100,
      description: 'Should handle at least 100 requests per second',
      severity: 'warning',
    });

    this.addThreshold({
      metric: 'throughput',
      operator: 'gt',
      value: 95,
      description: 'Should have at least 95 successful requests per second',
      severity: 'warning',
    });
  }

  private checkThreshold(threshold: PerformanceThreshold, actualValue: number): PerformanceViolation | null {
    let violated = false;
    
    switch (threshold.operator) {
      case 'lt':
        violated = actualValue >= threshold.value;
        break;
      case 'lte':
        violated = actualValue > threshold.value;
        break;
      case 'gt':
        violated = actualValue <= threshold.value;
        break;
      case 'gte':
        violated = actualValue < threshold.value;
        break;
      case 'eq':
        violated = actualValue !== threshold.value;
        break;
      case 'neq':
        violated = actualValue === threshold.value;
        break;
    }

    if (violated) {
      return {
        threshold,
        actualValue,
        severity: threshold.severity,
        message: `${threshold.description} (${threshold.metric}: ${actualValue.toFixed(2)} ${threshold.operator} ${threshold.value})`,
      };
    }

    return null;
  }

  private calculateScore(violations: PerformanceViolation[], totalThresholds: number): number {
    if (totalThresholds === 0) return 100;

    let penalty = 0;
    for (const violation of violations) {
      switch (violation.severity) {
        case 'error':
          penalty += 20; // Heavy penalty for errors
          break;
        case 'warning':
          penalty += 10; // Moderate penalty for warnings
          break;
        case 'info':
          penalty += 5; // Light penalty for info
          break;
      }
    }

    return Math.max(0, 100 - penalty);
  }

  private generateSummary(
    stats: LoadTestStats,
    violations: PerformanceViolation[],
    errorCount: number,
    warningCount: number
  ): string {
    const parts = [];
    
    if (errorCount === 0 && warningCount === 0) {
      parts.push('All performance thresholds passed');
    } else {
      if (errorCount > 0) {
        parts.push(`${errorCount} critical performance issue${errorCount > 1 ? 's' : ''}`);
      }
      if (warningCount > 0) {
        parts.push(`${warningCount} performance warning${warningCount > 1 ? 's' : ''}`);
      }
    }

    parts.push(`${stats.requestsPerSecond.toFixed(0)} RPS`);
    parts.push(`${stats.averageResponseTime.toFixed(0)}ms avg response`);
    parts.push(`${stats.errorRate.toFixed(2)}% error rate`);

    return parts.join(', ');
  }

  private generateRecommendations(
    stats: LoadTestStats,
    validationResult: PerformanceValidationResult
  ): string[] {
    const recommendations: string[] = [];

    // High error rate recommendations
    if (stats.errorRate > 5) {
      recommendations.push('High error rate detected. Check application logs and error handling.');
    }

    // High response time recommendations
    if (stats.averageResponseTime > 1000) {
      recommendations.push('High average response time. Consider optimizing database queries and caching.');
    }

    if (stats.p95ResponseTime > 2000) {
      recommendations.push('High 95th percentile response time indicates performance bottlenecks under load.');
    }

    // Low throughput recommendations
    if (stats.requestsPerSecond < 50) {
      recommendations.push('Low throughput detected. Consider scaling up resources or optimizing application performance.');
    }

    // Memory/resource recommendations based on error patterns
    if (stats.errors['ECONNRESET'] || stats.errors['ETIMEDOUT']) {
      recommendations.push('Connection errors detected. Check network configuration and connection pooling.');
    }

    if (stats.errors['500'] || stats.errors['Internal Server Error']) {
      recommendations.push('Server errors detected. Review application error logs and resource utilization.');
    }

    // General recommendations based on violations
    const errorViolations = validationResult.violations.filter(v => v.severity === 'error');
    if (errorViolations.length > 0) {
      recommendations.push('Critical performance thresholds violated. Immediate optimization required.');
    }

    return recommendations;
  }
}