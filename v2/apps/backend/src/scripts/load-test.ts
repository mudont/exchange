#!/usr/bin/env node

import { Command } from 'commander';
import { LoadTestRunner } from '../testing/load-testing/load-test-runner';
import { PerformanceValidator } from '../testing/load-testing/performance-validator';
import { loadTestConfigs, tradingScenarios } from '../testing/load-testing/trading-scenarios';
import { structuredLogger } from '../services/monitoring/structured-logger';

const program = new Command();

program
  .name('load-test')
  .description('Trading platform load testing CLI')
  .version('1.0.0');

program
  .command('run')
  .description('Run a load test')
  .option('-c, --config <name>', 'Load test configuration name', 'light')
  .option('-d, --duration <seconds>', 'Test duration in seconds')
  .option('--concurrency <number>', 'Number of concurrent users')
  .option('--ramp-up <seconds>', 'Ramp up time in seconds')
  .option('--target-rps <number>', 'Target requests per second')
  .option('--warmup <seconds>', 'Warmup time in seconds')
  .option('--cooldown <seconds>', 'Cooldown time in seconds')
  .option('--output <file>', 'Output file for results')
  .option('--format <format>', 'Output format (json|text|csv)', 'text')
  .option('--verbose', 'Verbose output')
  .action(async (options) => {
    try {
      console.log('🚀 Starting load test...\n');

      // Get configuration
      let config = loadTestConfigs[options.config as keyof typeof loadTestConfigs];
      if (!config) {
        console.error(`❌ Unknown configuration: ${options.config}`);
        console.log('Available configurations:', Object.keys(loadTestConfigs).join(', '));
        process.exit(1);
      }

      // Override with command line options
      if (options.duration) config = { ...config, duration: parseInt(options.duration) };
      if (options.concurrency) config = { ...config, concurrency: parseInt(options.concurrency) };
      if (options.rampUp) config = { ...config, rampUpTime: parseInt(options.rampUp) };
      if (options.targetRps) config = { ...config, targetRPS: parseInt(options.targetRps) };
      if (options.warmup) config = { ...config, warmupTime: parseInt(options.warmup) };
      if (options.cooldown) config = { ...config, cooldownTime: parseInt(options.cooldown) };

      console.log('📋 Test Configuration:');
      console.log(`   Name: ${config.name}`);
      console.log(`   Duration: ${config.duration}s`);
      console.log(`   Concurrency: ${config.concurrency}`);
      console.log(`   Scenarios: ${config.scenarios.length}`);
      if (config.rampUpTime) console.log(`   Ramp-up: ${config.rampUpTime}s`);
      if (config.targetRPS) console.log(`   Target RPS: ${config.targetRPS}`);
      console.log('');

      // Create and configure load test runner
      const runner = new LoadTestRunner(config);
      
      // Set up progress reporting
      let lastProgress = 0;
      runner.on('progress', (progress) => {
        if (options.verbose || progress.completedRequests - lastProgress >= 100) {
          console.log(`📊 Progress: ${progress.completedRequests} requests completed, ${progress.activeRequests} active`);
          lastProgress = progress.completedRequests;
        }
      });

      runner.on('error', (error) => {
        console.error('❌ Load test failed:', error.message);
        process.exit(1);
      });

      // Run the test
      const stats = await runner.run();

      console.log('\n✅ Load test completed!\n');

      // Validate performance
      const validator = new PerformanceValidator();
      const validationResult = validator.validate(stats);

      // Generate and display results
      if (options.format === 'json') {
        const output = {
          config,
          stats,
          validationResult,
          timestamp: new Date().toISOString(),
        };
        
        if (options.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, JSON.stringify(output, null, 2));
          console.log(`📄 Results saved to: ${options.output}`);
        } else {
          console.log(JSON.stringify(output, null, 2));
        }
      } else if (options.format === 'csv') {
        const csvOutput = generateCSVOutput(stats, validationResult);
        
        if (options.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, csvOutput);
          console.log(`📄 Results saved to: ${options.output}`);
        } else {
          console.log(csvOutput);
        }
      } else {
        // Text format (default)
        const report = validator.generateReport(stats, validationResult);
        
        if (options.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, report);
          console.log(`📄 Report saved to: ${options.output}`);
        } else {
          console.log(report);
        }
      }

      // Exit with appropriate code
      process.exit(validationResult.passed ? 0 : 1);
    } catch (error) {
      console.error('❌ Load test execution failed:', error);
      process.exit(1);
    }
  });

program
  .command('list-configs')
  .description('List available load test configurations')
  .action(() => {
    console.log('📋 Available Load Test Configurations:\n');
    
    Object.entries(loadTestConfigs).forEach(([key, config]) => {
      console.log(`🔧 ${key}:`);
      console.log(`   Name: ${config.name}`);
      console.log(`   Duration: ${config.duration}s`);
      console.log(`   Concurrency: ${config.concurrency}`);
      console.log(`   Scenarios: ${config.scenarios.length}`);
      if (config.rampUpTime) console.log(`   Ramp-up: ${config.rampUpTime}s`);
      if (config.targetRPS) console.log(`   Target RPS: ${config.targetRPS}`);
      console.log('');
    });
  });

program
  .command('list-scenarios')
  .description('List available test scenarios')
  .action(() => {
    console.log('🎯 Available Test Scenarios:\n');
    
    tradingScenarios.forEach((scenario) => {
      console.log(`📝 ${scenario.name}:`);
      console.log(`   Weight: ${scenario.weight}%`);
      console.log('');
    });
  });

program
  .command('validate')
  .description('Validate performance thresholds against a results file')
  .requiredOption('-f, --file <path>', 'Path to results JSON file')
  .option('--custom-thresholds <path>', 'Path to custom thresholds JSON file')
  .action(async (options) => {
    try {
      const fs = await import('fs/promises');
      
      // Load results
      const resultsData = await fs.readFile(options.file, 'utf-8');
      const results = JSON.parse(resultsData);
      
      if (!results.stats) {
        console.error('❌ Invalid results file format');
        process.exit(1);
      }

      // Create validator
      const validator = new PerformanceValidator();
      
      // Load custom thresholds if provided
      if (options.customThresholds) {
        const thresholdsData = await fs.readFile(options.customThresholds, 'utf-8');
        const customThresholds = JSON.parse(thresholdsData);
        
        validator.clearThresholds();
        customThresholds.forEach((threshold: any) => {
          validator.addThreshold(threshold);
        });
      }

      // Validate performance
      const validationResult = validator.validate(results.stats);
      const report = validator.generateReport(results.stats, validationResult);

      console.log(report);
      
      process.exit(validationResult.passed ? 0 : 1);
    } catch (error) {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    }
  });

program
  .command('benchmark')
  .description('Run a quick benchmark test')
  .option('--endpoint <url>', 'Specific endpoint to benchmark', '/api/market/quotes')
  .option('--requests <number>', 'Number of requests', '100')
  .option('--concurrency <number>', 'Concurrent requests', '10')
  .action(async (options) => {
    try {
      console.log('🏃 Running quick benchmark...\n');

      const config = {
        name: 'Quick Benchmark',
        duration: 30,
        concurrency: parseInt(options.concurrency),
        scenarios: [{
          name: 'benchmark',
          weight: 100,
          async execute() {
            const axios = await import('axios');
            const startTime = performance.now();
            
            try {
              const response = await axios.default.get(`${process.env.API_BASE_URL || 'http://localhost:3001'}${options.endpoint}`);
              const responseTime = performance.now() - startTime;
              
              return {
                success: response.status >= 200 && response.status < 400,
                responseTime,
                statusCode: response.status,
              };
            } catch (error) {
              return {
                success: false,
                responseTime: performance.now() - startTime,
                error: error instanceof Error ? error.message : 'Unknown error',
              };
            }
          },
        }],
      };

      const runner = new LoadTestRunner(config);
      const stats = await runner.run();

      console.log('📊 Benchmark Results:');
      console.log(`   Requests: ${stats.totalRequests}`);
      console.log(`   Success Rate: ${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)}%`);
      console.log(`   Avg Response Time: ${stats.averageResponseTime.toFixed(2)}ms`);
      console.log(`   Requests/Second: ${stats.requestsPerSecond.toFixed(2)}`);
      console.log(`   95th Percentile: ${stats.p95ResponseTime.toFixed(2)}ms`);
      
    } catch (error) {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    }
  });

function generateCSVOutput(stats: any, validationResult: any): string {
  const headers = [
    'timestamp',
    'total_requests',
    'successful_requests',
    'failed_requests',
    'error_rate',
    'avg_response_time',
    'min_response_time',
    'max_response_time',
    'p50_response_time',
    'p95_response_time',
    'p99_response_time',
    'requests_per_second',
    'throughput',
    'validation_passed',
    'performance_score',
  ];

  const values = [
    new Date().toISOString(),
    stats.totalRequests,
    stats.successfulRequests,
    stats.failedRequests,
    stats.errorRate,
    stats.averageResponseTime,
    stats.minResponseTime,
    stats.maxResponseTime,
    stats.p50ResponseTime,
    stats.p95ResponseTime,
    stats.p99ResponseTime,
    stats.requestsPerSecond,
    stats.throughput,
    validationResult.passed,
    validationResult.score,
  ];

  return [headers.join(','), values.join(',')].join('\n');
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// Parse command line arguments
program.parse();