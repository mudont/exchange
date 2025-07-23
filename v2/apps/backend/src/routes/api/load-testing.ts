import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LoadTestRunner, LoadTestConfig } from '../../testing/load-testing/load-test-runner';
import { PerformanceValidator } from '../../testing/load-testing/performance-validator';
import { loadTestConfigs, tradingScenarios } from '../../testing/load-testing/trading-scenarios';
import { performanceDashboard } from '../../testing/load-testing/performance-dashboard';
import { structuredLogger } from '../../services/monitoring/structured-logger';
import { requireAuth } from '../../middleware/auth';

// Store active load tests
const activeTests = new Map<string, LoadTestRunner>();
const testResults = new Map<string, any>();

export async function loadTestingRoutes(fastify: FastifyInstance) {
  // Start a load test
  fastify.post('/start', {
    preHandler: [requireAuth],
    schema: {
      body: {
        type: 'object',
        properties: {
          configName: { 
            type: 'string',
            enum: ['light', 'medium', 'heavy', 'spike', 'endurance']
          },
          customConfig: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              duration: { type: 'number' },
              concurrency: { type: 'number' },
              rampUpTime: { type: 'number' },
              targetRPS: { type: 'number' },
              warmupTime: { type: 'number' },
              cooldownTime: { type: 'number' },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{
    Body: {
      configName?: string;
      customConfig?: Partial<LoadTestConfig>;
    }
  }>, reply: FastifyReply) => {
    try {
      const { configName, customConfig } = request.body;
      const userId = (request as any).user.id;

      // Get load test configuration
      let config: LoadTestConfig;
      if (customConfig) {
        config = {
          name: customConfig.name || 'Custom Load Test',
          duration: customConfig.duration || 60,
          concurrency: customConfig.concurrency || 10,
          rampUpTime: customConfig.rampUpTime,
          targetRPS: customConfig.targetRPS,
          scenarios: tradingScenarios,
          warmupTime: customConfig.warmupTime,
          cooldownTime: customConfig.cooldownTime,
        };
      } else if (configName && loadTestConfigs[configName as keyof typeof loadTestConfigs]) {
        config = loadTestConfigs[configName as keyof typeof loadTestConfigs];
      } else {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_CONFIG',
            message: 'Invalid load test configuration',
          },
        });
      }

      // Generate test ID
      const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;\n\n      // Create and start load test runner\n      const runner = new LoadTestRunner(config);\n      activeTests.set(testId, runner);\n\n      // Set up event listeners\n      runner.on('progress', (progress) => {\n        structuredLogger.info('Load test progress', {\n          testId,\n          userId,\n          ...progress,\n        });\n      });\n\n      runner.on('completed', (stats) => {\n        // Validate performance\n        const validator = new PerformanceValidator();\n        const validationResult = validator.validate(stats);\n        const report = validator.generateReport(stats, validationResult);\n\n        // Store results\n        testResults.set(testId, {\n          config,\n          stats,\n          validationResult,\n          report,\n          completedAt: new Date(),\n        });\n\n        // Clean up active test\n        activeTests.delete(testId);\n\n        structuredLogger.info('Load test completed', {\n          testId,\n          userId,\n          passed: validationResult.passed,\n          score: validationResult.score,\n        });\n      });\n\n      runner.on('error', (error) => {\n        structuredLogger.error('Load test failed', error, {\n          testId,\n          userId,\n        });\n\n        // Clean up\n        activeTests.delete(testId);\n        testResults.delete(testId);\n      });\n\n      // Start the test asynchronously\n      runner.run().catch((error) => {\n        structuredLogger.error('Load test execution failed', error, {\n          testId,\n          userId,\n        });\n      });\n\n      structuredLogger.info('Load test started', {\n        testId,\n        userId,\n        config: config.name,\n      });\n\n      return reply.status(202).send({\n        success: true,\n        data: {\n          testId,\n          config: {\n            name: config.name,\n            duration: config.duration,\n            concurrency: config.concurrency,\n            scenarios: config.scenarios.length,\n          },\n          status: 'started',\n        },\n      });\n    } catch (error) {\n      structuredLogger.error('Failed to start load test', error);\n      \n      return reply.status(500).send({\n        success: false,\n        error: {\n          code: 'LOAD_TEST_START_FAILED',\n          message: 'Failed to start load test',\n        },\n      });\n    }\n  });\n\n  // Get load test status\n  fastify.get('/status/:testId', {\n    preHandler: [requireAuth],\n    schema: {\n      params: {\n        type: 'object',\n        properties: {\n          testId: { type: 'string' },\n        },\n        required: ['testId'],\n      },\n    },\n  }, async (request: FastifyRequest<{\n    Params: { testId: string }\n  }>, reply: FastifyReply) => {\n    try {\n      const { testId } = request.params;\n      \n      // Check if test is active\n      const activeTest = activeTests.get(testId);\n      if (activeTest) {\n        return reply.send({\n          success: true,\n          data: {\n            testId,\n            status: 'running',\n            isRunning: true,\n          },\n        });\n      }\n\n      // Check if test is completed\n      const result = testResults.get(testId);\n      if (result) {\n        return reply.send({\n          success: true,\n          data: {\n            testId,\n            status: 'completed',\n            isRunning: false,\n            completedAt: result.completedAt,\n            stats: result.stats,\n            validationResult: result.validationResult,\n          },\n        });\n      }\n\n      return reply.status(404).send({\n        success: false,\n        error: {\n          code: 'TEST_NOT_FOUND',\n          message: 'Load test not found',\n        },\n      });\n    } catch (error) {\n      structuredLogger.error('Failed to get load test status', error);\n      \n      return reply.status(500).send({\n        success: false,\n        error: {\n          code: 'STATUS_CHECK_FAILED',\n          message: 'Failed to check load test status',\n        },\n      });\n    }\n  });\n\n  // Stop a running load test\n  fastify.post('/stop/:testId', {\n    preHandler: [requireAuth],\n    schema: {\n      params: {\n        type: 'object',\n        properties: {\n          testId: { type: 'string' },\n        },\n        required: ['testId'],\n      },\n    },\n  }, async (request: FastifyRequest<{\n    Params: { testId: string }\n  }>, reply: FastifyReply) => {\n    try {\n      const { testId } = request.params;\n      const userId = (request as any).user.id;\n      \n      const activeTest = activeTests.get(testId);\n      if (!activeTest) {\n        return reply.status(404).send({\n          success: false,\n          error: {\n            code: 'TEST_NOT_FOUND',\n            message: 'Active load test not found',\n          },\n        });\n      }\n\n      activeTest.stop();\n      activeTests.delete(testId);\n\n      structuredLogger.info('Load test stopped', {\n        testId,\n        userId,\n      });\n\n      return reply.send({\n        success: true,\n        data: {\n          testId,\n          status: 'stopped',\n        },\n      });\n    } catch (error) {\n      structuredLogger.error('Failed to stop load test', error);\n      \n      return reply.status(500).send({\n        success: false,\n        error: {\n          code: 'STOP_TEST_FAILED',\n          message: 'Failed to stop load test',\n        },\n      });\n    }\n  });\n\n  // Get load test report\n  fastify.get('/report/:testId', {\n    preHandler: [requireAuth],\n    schema: {\n      params: {\n        type: 'object',\n        properties: {\n          testId: { type: 'string' },\n        },\n        required: ['testId'],\n      },\n      querystring: {\n        type: 'object',\n        properties: {\n          format: { type: 'string', enum: ['json', 'text'] },\n        },\n      },\n    },\n  }, async (request: FastifyRequest<{\n    Params: { testId: string };\n    Querystring: { format?: 'json' | 'text' };\n  }>, reply: FastifyReply) => {\n    try {\n      const { testId } = request.params;\n      const { format = 'json' } = request.query;\n      \n      const result = testResults.get(testId);\n      if (!result) {\n        return reply.status(404).send({\n          success: false,\n          error: {\n            code: 'REPORT_NOT_FOUND',\n            message: 'Load test report not found',\n          },\n        });\n      }\n\n      if (format === 'text') {\n        reply.header('Content-Type', 'text/plain');\n        return reply.send(result.report);\n      }\n\n      return reply.send({\n        success: true,\n        data: {\n          testId,\n          config: result.config,\n          stats: result.stats,\n          validationResult: result.validationResult,\n          report: result.report,\n          completedAt: result.completedAt,\n        },\n      });\n    } catch (error) {\n      structuredLogger.error('Failed to get load test report', error);\n      \n      return reply.status(500).send({\n        success: false,\n        error: {\n          code: 'REPORT_FETCH_FAILED',\n          message: 'Failed to fetch load test report',\n        },\n      });\n    }\n  });\n\n  // List all load test results\n  fastify.get('/results', {\n    preHandler: [requireAuth],\n    schema: {\n      querystring: {\n        type: 'object',\n        properties: {\n          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },\n          offset: { type: 'number', minimum: 0, default: 0 },\n        },\n      },\n    },\n  }, async (request: FastifyRequest<{\n    Querystring: { limit?: number; offset?: number };\n  }>, reply: FastifyReply) => {\n    try {\n      const { limit = 20, offset = 0 } = request.query;\n      \n      const allResults = Array.from(testResults.entries()).map(([testId, result]) => ({\n        testId,\n        name: result.config.name,\n        completedAt: result.completedAt,\n        passed: result.validationResult.passed,\n        score: result.validationResult.score,\n        stats: {\n          totalRequests: result.stats.totalRequests,\n          successfulRequests: result.stats.successfulRequests,\n          errorRate: result.stats.errorRate,\n          averageResponseTime: result.stats.averageResponseTime,\n          requestsPerSecond: result.stats.requestsPerSecond,\n        },\n      }));\n\n      // Sort by completion time (newest first)\n      allResults.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());\n\n      const paginatedResults = allResults.slice(offset, offset + limit);\n\n      return reply.send({\n        success: true,\n        data: {\n          results: paginatedResults,\n          total: allResults.length,\n          limit,\n          offset,\n        },\n      });\n    } catch (error) {\n      structuredLogger.error('Failed to list load test results', error);\n      \n      return reply.status(500).send({\n        success: false,\n        error: {\n          code: 'RESULTS_LIST_FAILED',\n          message: 'Failed to list load test results',\n        },\n      });\n    }\n  });\n\n  // Get available load test configurations\n  fastify.get('/configs', {\n    preHandler: [requireAuth],\n  }, async (request: FastifyRequest, reply: FastifyReply) => {\n    try {\n      const configs = Object.entries(loadTestConfigs).map(([key, config]) => ({\n        key,\n        name: config.name,\n        duration: config.duration,\n        concurrency: config.concurrency,\n        scenarios: config.scenarios.length,\n        description: getConfigDescription(key),\n      }));\n\n      return reply.send({\n        success: true,\n        data: {\n          configs,\n        },\n      });\n    } catch (error) {\n      structuredLogger.error('Failed to get load test configs', error);\n      \n      return reply.status(500).send({\n        success: false,\n        error: {\n          code: 'CONFIGS_FETCH_FAILED',\n          message: 'Failed to fetch load test configurations',\n        },\n      });\n    }\n  });\n}\n\nfunction getConfigDescription(configKey: string): string {\n  const descriptions: Record<string, string> = {\n    light: 'Light load test suitable for development and basic validation',\n    medium: 'Medium load test for staging environment validation',\n    heavy: 'Heavy load test for production capacity validation',\n    spike: 'Spike test to validate system resilience under sudden load increases',\n    endurance: 'Long-running test to validate system stability over time',\n  };\n  \n  return descriptions[configKey] || 'Custom load test configuration';\n}"