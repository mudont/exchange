import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { structuredLogger } from '../../services/monitoring/structured-logger';
import { metricsCollector } from '../../services/monitoring/metrics-collector';
import { performanceDashboard } from './performance-dashboard';

export interface LoadTestConfig {
  name: string;
  duration: number; // in seconds
  concurrency: number;
  rampUpTime?: number; // in seconds
  targetRPS?: number; // requests per second
  scenarios: LoadTestScenario[];
  warmupTime?: number; // in seconds
  cooldownTime?: number; // in seconds
}

export interface LoadTestScenario {
  name: string;
  weight: number; // percentage of total requests
  setup?: () => Promise<any>;
  execute: (context: LoadTestContext) => Promise<LoadTestResult>;
  teardown?: (context: LoadTestContext) => Promise<void>;
}

export interface LoadTestContext {
  userId?: string;
  sessionData?: any;
  iteration: number;
  startTime: number;
  [key: string]: any;
}

export interface LoadTestResult {
  success: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface LoadTestStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  errorsPerSecond: number;
  errorRate: number;
  throughput: number;
  concurrency: number;
  duration: number;
  errors: Record<string, number>;
}

export class LoadTestRunner extends EventEmitter {
  private config: LoadTestConfig;
  private isRunning: boolean = false;
  private startTime: number = 0;
  private endTime: number = 0;
  private results: LoadTestResult[] = [];
  private activeRequests: number = 0;
  private completedRequests: number = 0;

  constructor(config: LoadTestConfig) {
    super();
    this.config = config;
  }

  async run(testId?: string): Promise<LoadTestStats> {
    if (this.isRunning) {
      throw new Error('Load test is already running');
    }

    this.isRunning = true;
    this.results = [];
    this.activeRequests = 0;
    this.completedRequests = 0;

    // Generate test ID if not provided
    const currentTestId = testId || `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Record test start in dashboard
    performanceDashboard.recordTestStart(currentTestId, this.config.name);

    structuredLogger.info('Starting load test', {
      testId: currentTestId,
      testName: this.config.name,
      duration: this.config.duration,
      concurrency: this.config.concurrency,
      scenarios: this.config.scenarios.length,
    });

    try {
      // Warmup phase
      if (this.config.warmupTime) {
        await this.warmup();
      }

      // Main test phase
      this.startTime = performance.now();
      await this.executeLoadTest();
      this.endTime = performance.now();

      // Cooldown phase
      if (this.config.cooldownTime) {
        await this.cooldown();
      }

      const stats = this.calculateStats();
      
      structuredLogger.info('Load test completed', {
        testId: currentTestId,
        testName: this.config.name,
        stats,
      });

      this.emit('completed', stats, currentTestId);
      return stats;
    } catch (error) {
      // Record test failure in dashboard
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      performanceDashboard.recordTestFailure(currentTestId, errorMessage);

      structuredLogger.error('Load test failed', error, {
        testId: currentTestId,
        testName: this.config.name,
      });
      this.emit('error', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  stop(): void {
    if (this.isRunning) {
      this.isRunning = false;
      this.emit('stopped');
      structuredLogger.info('Load test stopped', {
        testName: this.config.name,
      });
    }
  }

  private async warmup(): Promise<void> {
    structuredLogger.info('Starting warmup phase', {
      testName: this.config.name,
      warmupTime: this.config.warmupTime,
    });

    // Execute a few requests to warm up the system
    const warmupRequests = Math.min(10, this.config.concurrency);
    const promises: Promise<void>[] = [];

    for (let i = 0; i < warmupRequests; i++) {
      promises.push(this.executeScenario(this.getRandomScenario(), {
        userId: `warmup-user-${i}`,
        iteration: 0,
        startTime: performance.now(),
      }));
    }

    await Promise.all(promises);
    await this.sleep(this.config.warmupTime! * 1000);
  }

  private async cooldown(): Promise<void> {
    structuredLogger.info('Starting cooldown phase', {
      testName: this.config.name,
      cooldownTime: this.config.cooldownTime,
    });

    await this.sleep(this.config.cooldownTime! * 1000);
  }

  private async executeLoadTest(): Promise<void> {
    const testDuration = this.config.duration * 1000; // Convert to milliseconds
    const rampUpTime = (this.config.rampUpTime || 0) * 1000;
    const targetRPS = this.config.targetRPS;

    let currentConcurrency = 1;
    const maxConcurrency = this.config.concurrency;
    const rampUpIncrement = rampUpTime > 0 ? maxConcurrency / (rampUpTime / 1000) : maxConcurrency;

    const testStartTime = performance.now();
    let lastRampUpTime = testStartTime;

    while (performance.now() - testStartTime < testDuration && this.isRunning) {
      const currentTime = performance.now();
      
      // Handle ramp-up
      if (rampUpTime > 0 && currentTime - testStartTime < rampUpTime) {
        const timeSinceLastRampUp = currentTime - lastRampUpTime;
        if (timeSinceLastRampUp >= 1000) { // Ramp up every second
          currentConcurrency = Math.min(
            maxConcurrency,
            Math.floor((currentTime - testStartTime) / 1000 * rampUpIncrement)
          );
          lastRampUpTime = currentTime;
        }
      } else {
        currentConcurrency = maxConcurrency;
      }

      // Control request rate if targetRPS is specified
      if (targetRPS) {
        const elapsedSeconds = (currentTime - testStartTime) / 1000;
        const expectedRequests = elapsedSeconds * targetRPS;
        const actualRequests = this.completedRequests;
        
        if (actualRequests >= expectedRequests) {
          await this.sleep(10); // Small delay to prevent overwhelming
          continue;
        }
      }

      // Launch requests up to current concurrency level
      while (this.activeRequests < currentConcurrency && this.isRunning) {
        this.launchRequest();
      }

      await this.sleep(10); // Small delay to prevent tight loop
    }

    // Wait for all active requests to complete
    while (this.activeRequests > 0) {
      await this.sleep(100);
    }
  }

  private launchRequest(): void {
    this.activeRequests++;
    
    const scenario = this.getRandomScenario();
    const context: LoadTestContext = {
      userId: `user-${Math.floor(Math.random() * 1000)}`,
      iteration: this.completedRequests,
      startTime: performance.now(),
    };

    this.executeScenario(scenario, context)
      .finally(() => {
        this.activeRequests--;
        this.completedRequests++;
        
        // Emit progress event
        if (this.completedRequests % 100 === 0) {
          this.emit('progress', {
            completedRequests: this.completedRequests,
            activeRequests: this.activeRequests,
            elapsedTime: performance.now() - this.startTime,
          });
        }
      });
  }

  private async executeScenario(scenario: LoadTestScenario, context: LoadTestContext): Promise<void> {
    try {
      // Setup phase
      if (scenario.setup) {
        await scenario.setup();
      }

      // Execute scenario
      const result = await scenario.execute(context);
      this.results.push(result);

      // Record metrics
      metricsCollector.recordHistogram('load_test_response_time', result.responseTime, {
        scenario: scenario.name,
        success: result.success.toString(),
      });

      metricsCollector.incrementCounter('load_test_requests_total', 1, {
        scenario: scenario.name,
        success: result.success.toString(),
      });

      // Teardown phase
      if (scenario.teardown) {
        await scenario.teardown(context);
      }
    } catch (error) {
      const result: LoadTestResult = {
        success: false,
        responseTime: performance.now() - context.startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      
      this.results.push(result);
      
      structuredLogger.error('Scenario execution failed', error, {
        scenario: scenario.name,
        context,
      });
    }
  }

  private getRandomScenario(): LoadTestScenario {
    const totalWeight = this.config.scenarios.reduce((sum, scenario) => sum + scenario.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const scenario of this.config.scenarios) {
      random -= scenario.weight;
      if (random <= 0) {
        return scenario;
      }
    }
    
    return this.config.scenarios[0]; // Fallback
  }

  private calculateStats(): LoadTestStats {
    const successfulResults = this.results.filter(r => r.success);
    const failedResults = this.results.filter(r => !r.success);
    const responseTimes = this.results.map(r => r.responseTime);
    
    responseTimes.sort((a, b) => a - b);
    
    const duration = (this.endTime - this.startTime) / 1000; // Convert to seconds
    const totalRequests = this.results.length;
    const successfulRequests = successfulResults.length;
    const failedRequests = failedResults.length;
    
    // Calculate percentiles
    const p50Index = Math.floor(responseTimes.length * 0.5);
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);
    
    // Count errors by type
    const errors: Record<string, number> = {};
    failedResults.forEach(result => {
      const errorType = result.error || 'Unknown error';
      errors[errorType] = (errors[errorType] || 0) + 1;
    });

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      minResponseTime: responseTimes.length > 0 ? responseTimes[0] : 0,
      maxResponseTime: responseTimes.length > 0 ? responseTimes[responseTimes.length - 1] : 0,
      p50ResponseTime: responseTimes.length > 0 ? responseTimes[p50Index] : 0,
      p95ResponseTime: responseTimes.length > 0 ? responseTimes[p95Index] : 0,
      p99ResponseTime: responseTimes.length > 0 ? responseTimes[p99Index] : 0,
      requestsPerSecond: duration > 0 ? totalRequests / duration : 0,
      errorsPerSecond: duration > 0 ? failedRequests / duration : 0,
      errorRate: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
      throughput: duration > 0 ? successfulRequests / duration : 0,
      concurrency: this.config.concurrency,
      duration,
      errors,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}