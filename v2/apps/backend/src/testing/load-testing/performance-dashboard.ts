import { EventEmitter } from 'events';
import { LoadTestStats } from './load-test-runner';
import { PerformanceValidationResult } from './performance-validator';
import { structuredLogger } from '../../services/monitoring/structured-logger';
import { metricsCollector } from '../../services/monitoring/metrics-collector';

export interface DashboardMetrics {
  timestamp: Date;
  activeTests: number;
  totalTestsRun: number;
  averageScore: number;
  systemHealth: 'healthy' | 'warning' | 'critical';
  recentTests: TestSummary[];
  performanceTrends: PerformanceTrend[];
  alerts: PerformanceAlert[];
}

export interface TestSummary {
  testId: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  score?: number;
  passed?: boolean;
  requestsPerSecond?: number;
  errorRate?: number;
  averageResponseTime?: number;
}

export interface PerformanceTrend {
  timestamp: Date;
  metric: string;
  value: number;
  trend: 'up' | 'down' | 'stable';
}

export interface PerformanceAlert {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  timestamp: Date;
  testId?: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

export class PerformanceDashboard extends EventEmitter {
  private static instance: PerformanceDashboard;
  private testHistory: Map<string, TestSummary> = new Map();
  private performanceHistory: PerformanceTrend[] = [];
  private alerts: PerformanceAlert[] = [];
  private maxHistorySize = 1000;
  private maxAlerts = 100;

  private constructor() {
    super();
    this.startMetricsCollection();
  }

  static getInstance(): PerformanceDashboard {
    if (!PerformanceDashboard.instance) {
      PerformanceDashboard.instance = new PerformanceDashboard();
    }
    return PerformanceDashboard.instance;
  }

  // Record test start
  recordTestStart(testId: string, name: string): void {
    const testSummary: TestSummary = {
      testId,
      name,
      startTime: new Date(),
      status: 'running',
    };

    this.testHistory.set(testId, testSummary);
    this.emit('testStarted', testSummary);

    structuredLogger.info('Test recorded in dashboard', {
      testId,
      name,
      status: 'started',
    });
  }

  // Record test completion
  recordTestCompletion(
    testId: string,
    stats: LoadTestStats,
    validationResult: PerformanceValidationResult
  ): void {
    const testSummary = this.testHistory.get(testId);
    if (!testSummary) {
      structuredLogger.warn('Test completion recorded for unknown test', { testId });
      return;
    }

    // Update test summary
    testSummary.endTime = new Date();
    testSummary.status = 'completed';
    testSummary.score = validationResult.score;
    testSummary.passed = validationResult.passed;
    testSummary.requestsPerSecond = stats.requestsPerSecond;
    testSummary.errorRate = stats.errorRate;
    testSummary.averageResponseTime = stats.averageResponseTime;

    this.testHistory.set(testId, testSummary);

    // Record performance trends
    this.recordPerformanceTrends(stats);

    // Check for alerts
    this.checkPerformanceAlerts(testId, stats, validationResult);

    this.emit('testCompleted', testSummary);

    structuredLogger.info('Test completion recorded in dashboard', {
      testId,
      score: validationResult.score,
      passed: validationResult.passed,
    });
  }

  // Record test failure
  recordTestFailure(testId: string, error: string): void {
    const testSummary = this.testHistory.get(testId);
    if (!testSummary) {
      structuredLogger.warn('Test failure recorded for unknown test', { testId });
      return;
    }

    testSummary.endTime = new Date();
    testSummary.status = 'failed';
    this.testHistory.set(testId, testSummary);

    // Create alert for test failure
    this.addAlert({
      id: `test-failure-${testId}`,
      severity: 'error',
      message: `Load test failed: ${error}`,
      timestamp: new Date(),
      testId,
    });

    this.emit('testFailed', testSummary);

    structuredLogger.error('Test failure recorded in dashboard', {
      testId,
      error,
    });
  }

  // Get current dashboard metrics
  getDashboardMetrics(): DashboardMetrics {
    const now = new Date();
    const recentTests = this.getRecentTests(10);
    const activeTests = recentTests.filter(t => t.status === 'running').length;
    const completedTests = Array.from(this.testHistory.values()).filter(t => t.status === 'completed');
    
    const averageScore = completedTests.length > 0
      ? completedTests.reduce((sum, test) => sum + (test.score || 0), 0) / completedTests.length
      : 0;

    const systemHealth = this.calculateSystemHealth(recentTests);

    return {
      timestamp: now,
      activeTests,
      totalTestsRun: this.testHistory.size,
      averageScore,
      systemHealth,
      recentTests,
      performanceTrends: this.getRecentTrends(50),
      alerts: this.getRecentAlerts(20),
    };
  }

  // Get test history
  getTestHistory(limit: number = 50): TestSummary[] {
    const tests = Array.from(this.testHistory.values());
    return tests
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  // Get performance trends for a specific metric
  getPerformanceTrends(metric: string, hours: number = 24): PerformanceTrend[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.performanceHistory
      .filter(trend => trend.metric === metric && trend.timestamp >= cutoff)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // Get alerts
  getAlerts(severity?: 'info' | 'warning' | 'error', limit: number = 50): PerformanceAlert[] {
    let filteredAlerts = this.alerts;
    
    if (severity) {
      filteredAlerts = filteredAlerts.filter(alert => alert.severity === severity);
    }

    return filteredAlerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Clear old data
  cleanup(): void {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days

    // Clean up old test history
    for (const [testId, test] of this.testHistory.entries()) {
      if (test.startTime < cutoff) {
        this.testHistory.delete(testId);
      }
    }

    // Clean up old performance trends
    this.performanceHistory = this.performanceHistory.filter(
      trend => trend.timestamp >= cutoff
    );

    // Clean up old alerts
    this.alerts = this.alerts.filter(alert => alert.timestamp >= cutoff);

    // Limit array sizes
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory = this.performanceHistory.slice(-this.maxHistorySize);
    }

    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    structuredLogger.info('Dashboard cleanup completed', {
      testsRemaining: this.testHistory.size,
      trendsRemaining: this.performanceHistory.length,
      alertsRemaining: this.alerts.length,
    });
  }

  // Export dashboard data
  exportData(): any {
    return {
      testHistory: Array.from(this.testHistory.entries()),
      performanceHistory: this.performanceHistory,
      alerts: this.alerts,
      exportedAt: new Date(),
    };
  }

  // Import dashboard data
  importData(data: any): void {
    if (data.testHistory) {
      this.testHistory = new Map(data.testHistory);
    }

    if (data.performanceHistory) {
      this.performanceHistory = data.performanceHistory;
    }

    if (data.alerts) {
      this.alerts = data.alerts;
    }

    structuredLogger.info('Dashboard data imported', {
      tests: this.testHistory.size,
      trends: this.performanceHistory.length,
      alerts: this.alerts.length,
    });
  }

  // Private methods
  private getRecentTests(limit: number): TestSummary[] {
    return Array.from(this.testHistory.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  private getRecentTrends(limit: number): PerformanceTrend[] {
    return this.performanceHistory
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  private getRecentAlerts(limit: number): PerformanceAlert[] {
    return this.alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  private recordPerformanceTrends(stats: LoadTestStats): void {
    const timestamp = new Date();
    const metrics = [
      { name: 'requests_per_second', value: stats.requestsPerSecond },
      { name: 'error_rate', value: stats.errorRate },
      { name: 'average_response_time', value: stats.averageResponseTime },
      { name: 'p95_response_time', value: stats.p95ResponseTime },
      { name: 'throughput', value: stats.throughput },
    ];

    for (const metric of metrics) {
      const trend = this.calculateTrend(metric.name, metric.value);
      
      this.performanceHistory.push({
        timestamp,
        metric: metric.name,
        value: metric.value,
        trend,
      });
    }

    // Limit history size
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory = this.performanceHistory.slice(-this.maxHistorySize);
    }
  }

  private calculateTrend(metricName: string, currentValue: number): 'up' | 'down' | 'stable' {
    const recentTrends = this.performanceHistory
      .filter(trend => trend.metric === metricName)
      .slice(-5); // Look at last 5 values

    if (recentTrends.length < 2) {
      return 'stable';
    }

    const previousValue = recentTrends[recentTrends.length - 1].value;
    const threshold = previousValue * 0.05; // 5% threshold

    if (currentValue > previousValue + threshold) {
      return 'up';
    } else if (currentValue < previousValue - threshold) {
      return 'down';
    } else {
      return 'stable';
    }
  }

  private checkPerformanceAlerts(
    testId: string,
    stats: LoadTestStats,
    validationResult: PerformanceValidationResult
  ): void {
    // Alert for high error rate
    if (stats.errorRate > 5) {
      this.addAlert({
        id: `high-error-rate-${testId}`,
        severity: 'error',
        message: `High error rate detected: ${stats.errorRate.toFixed(2)}%`,
        timestamp: new Date(),
        testId,
        metric: 'error_rate',
        value: stats.errorRate,
        threshold: 5,
      });
    }

    // Alert for high response time
    if (stats.averageResponseTime > 1000) {
      this.addAlert({
        id: `high-response-time-${testId}`,
        severity: 'warning',
        message: `High average response time: ${stats.averageResponseTime.toFixed(2)}ms`,
        timestamp: new Date(),
        testId,
        metric: 'average_response_time',
        value: stats.averageResponseTime,
        threshold: 1000,
      });
    }

    // Alert for low throughput
    if (stats.throughput < 50) {
      this.addAlert({
        id: `low-throughput-${testId}`,
        severity: 'warning',
        message: `Low throughput detected: ${stats.throughput.toFixed(2)} req/s`,
        timestamp: new Date(),
        testId,
        metric: 'throughput',
        value: stats.throughput,
        threshold: 50,
      });
    }

    // Alert for failed validation
    if (!validationResult.passed) {
      this.addAlert({
        id: `validation-failed-${testId}`,
        severity: 'error',
        message: `Performance validation failed (Score: ${validationResult.score}/100)`,
        timestamp: new Date(),
        testId,
        metric: 'validation_score',
        value: validationResult.score,
        threshold: 80,
      });
    }
  }

  private addAlert(alert: PerformanceAlert): void {
    this.alerts.push(alert);
    
    // Limit alerts array size
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    this.emit('alert', alert);

    structuredLogger.warn('Performance alert generated', {
      alertId: alert.id,
      severity: alert.severity,
      message: alert.message,
      testId: alert.testId,
    });
  }

  private calculateSystemHealth(recentTests: TestSummary[]): 'healthy' | 'warning' | 'critical' {
    if (recentTests.length === 0) {
      return 'healthy';
    }

    const completedTests = recentTests.filter(t => t.status === 'completed');
    const failedTests = recentTests.filter(t => t.status === 'failed');
    const passedTests = completedTests.filter(t => t.passed === true);

    const failureRate = failedTests.length / recentTests.length;
    const passRate = passedTests.length / completedTests.length;

    // Critical if high failure rate or low pass rate
    if (failureRate > 0.2 || (completedTests.length > 0 && passRate < 0.5)) {
      return 'critical';
    }

    // Warning if moderate issues
    if (failureRate > 0.1 || (completedTests.length > 0 && passRate < 0.8)) {
      return 'warning';
    }

    return 'healthy';
  }

  private startMetricsCollection(): void {
    // Collect dashboard metrics every minute
    setInterval(() => {
      const metrics = this.getDashboardMetrics();
      
      metricsCollector.recordGauge('load_test_active_tests', metrics.activeTests);
      metricsCollector.recordGauge('load_test_total_tests', metrics.totalTestsRun);
      metricsCollector.recordGauge('load_test_average_score', metrics.averageScore);
      metricsCollector.recordGauge('load_test_alerts_count', metrics.alerts.length);

      // Record system health as numeric value
      const healthValue = metrics.systemHealth === 'healthy' ? 1 : 
                         metrics.systemHealth === 'warning' ? 0.5 : 0;
      metricsCollector.recordGauge('load_test_system_health', healthValue);
    }, 60000); // Every minute

    // Cleanup old data every hour
    setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000); // Every hour
  }
}

// Export singleton instance
export const performanceDashboard = PerformanceDashboard.getInstance();