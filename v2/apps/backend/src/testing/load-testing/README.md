# Load Testing and Performance Validation System

This comprehensive load testing system provides tools for validating the performance and scalability of the trading exchange platform.

## Features

- **Configurable Load Tests**: Multiple predefined configurations for different testing scenarios
- **Real-time Monitoring**: Live performance metrics and progress tracking
- **Performance Validation**: Automated threshold checking and scoring
- **Detailed Reporting**: Comprehensive reports with recommendations
- **CLI Tools**: Command-line interface for easy test execution
- **API Integration**: REST endpoints for programmatic test management
- **Dashboard**: Performance monitoring dashboard with alerts and trends

## Components

### 1. Load Test Runner (`load-test-runner.ts`)

The core engine that executes load tests with configurable scenarios.

**Key Features:**
- Concurrent request execution with configurable ramp-up
- Request rate limiting and throttling
- Real-time progress reporting
- Comprehensive statistics collection
- Event-driven architecture

**Usage:**
```typescript
import { LoadTestRunner } from './load-test-runner';

const config = {
  name: 'API Load Test',
  duration: 300, // 5 minutes
  concurrency: 50,
  scenarios: [/* scenario definitions */],
};

const runner = new LoadTestRunner(config);
const stats = await runner.run();
```

### 2. Performance Validator (`performance-validator.ts`)

Validates test results against configurable performance thresholds.

**Default Thresholds:**
- Average response time < 500ms (error)
- 95th percentile response time < 1s (error)
- 99th percentile response time < 2s (warning)
- Error rate < 1% (error)
- Throughput > 100 RPS (warning)

**Usage:**
```typescript
import { PerformanceValidator } from './performance-validator';

const validator = new PerformanceValidator();
const result = validator.validate(stats);
const report = validator.generateReport(stats, result);
```

### 3. Trading Scenarios (`trading-scenarios.ts`)

Pre-built test scenarios specific to the trading platform.

**Available Scenarios:**
- **Authentication**: User login/logout flows
- **Market Data**: Real-time market data requests
- **Order Book**: Order book retrieval and updates
- **Order Placement**: Buy/sell order submissions
- **Portfolio**: Account balance and position queries
- **Order Cancellation**: Order cancellation flows
- **WebSocket**: Real-time connection testing

### 4. Performance Dashboard (`performance-dashboard.ts`)

Real-time monitoring and alerting system for load tests.

**Features:**
- Test execution tracking
- Performance trend analysis
- Automated alerting
- Historical data storage
- System health monitoring

## Load Test Configurations

### Light Load Test
- **Duration**: 1 minute
- **Concurrency**: 10 users
- **Use Case**: Development and basic validation

### Medium Load Test
- **Duration**: 5 minutes
- **Concurrency**: 50 users
- **Target RPS**: 100
- **Use Case**: Staging environment validation

### Heavy Load Test
- **Duration**: 10 minutes
- **Concurrency**: 200 users
- **Target RPS**: 500
- **Use Case**: Production capacity validation

### Spike Test
- **Duration**: 3 minutes
- **Concurrency**: 500 users (quick ramp-up)
- **Use Case**: Resilience testing

### Endurance Test
- **Duration**: 30 minutes
- **Concurrency**: 100 users
- **Target RPS**: 200
- **Use Case**: Stability testing

## CLI Usage

### Run a Load Test
```bash
# Run with predefined configuration
npm run load-test run --config medium

# Run with custom parameters
npm run load-test run --config light --duration 120 --concurrency 20

# Run with output file
npm run load-test run --config heavy --output results.json --format json
```

### List Available Configurations
```bash
npm run load-test list-configs
```

### List Available Scenarios
```bash
npm run load-test list-scenarios
```

### Quick Benchmark
```bash
npm run benchmark
npm run benchmark --endpoint /api/orders --requests 200 --concurrency 20
```

### Validate Results
```bash
npm run load-test validate --file results.json
npm run load-test validate --file results.json --custom-thresholds thresholds.json
```

## API Endpoints

### Start Load Test
```http
POST /api/v1/load-testing/start
Content-Type: application/json

{
  "configName": "medium"
}
```

### Get Test Status
```http
GET /api/v1/load-testing/status/{testId}
```

### Stop Running Test
```http
POST /api/v1/load-testing/stop/{testId}
```

### Get Test Report
```http
GET /api/v1/load-testing/report/{testId}?format=json
GET /api/v1/load-testing/report/{testId}?format=text
```

### List Test Results
```http
GET /api/v1/load-testing/results?limit=20&offset=0
```

### Get Available Configurations
```http
GET /api/v1/load-testing/configs
```

## Environment Setup

### Required Environment Variables
```bash
API_BASE_URL=http://localhost:3001  # Target API URL
API_KEY_SECRET=your-secret-key      # For API key hashing
```

### Dependencies
```bash
npm install axios commander
```

## Performance Thresholds

### Response Time Thresholds
- **Average Response Time**: < 500ms (critical)
- **95th Percentile**: < 1000ms (critical)
- **99th Percentile**: < 2000ms (warning)

### Error Rate Thresholds
- **Overall Error Rate**: < 1% (critical)
- **Low Error Rate**: < 0.1% (warning)

### Throughput Thresholds
- **Minimum RPS**: > 100 (warning)
- **Minimum Successful RPS**: > 95 (warning)

### Custom Thresholds
Create a JSON file with custom thresholds:

```json
[
  {
    "metric": "averageResponseTime",
    "operator": "lt",
    "value": 300,
    "description": "Average response time should be less than 300ms",
    "severity": "error"
  },
  {
    "metric": "errorRate",
    "operator": "lt",
    "value": 0.5,
    "description": "Error rate should be less than 0.5%",
    "severity": "warning"
  }
]
```

## Monitoring and Alerting

### Dashboard Metrics
- Active test count
- Total tests executed
- Average performance score
- System health status
- Recent test results
- Performance trends
- Active alerts

### Alert Types
- **High Error Rate**: > 5% error rate
- **High Response Time**: > 1000ms average
- **Low Throughput**: < 50 RPS
- **Validation Failure**: Performance thresholds not met
- **Test Failure**: Test execution errors

### System Health Levels
- **Healthy**: < 10% failure rate, > 80% pass rate
- **Warning**: 10-20% failure rate, 50-80% pass rate
- **Critical**: > 20% failure rate, < 50% pass rate

## Best Practices

### Test Design
1. **Start Small**: Begin with light load tests
2. **Gradual Increase**: Progressively increase load
3. **Realistic Scenarios**: Use production-like test data
4. **Monitor Resources**: Watch system resources during tests
5. **Baseline First**: Establish performance baselines

### Test Execution
1. **Isolated Environment**: Run tests in dedicated environments
2. **Consistent Conditions**: Maintain consistent test conditions
3. **Multiple Runs**: Execute multiple test runs for reliability
4. **Peak Hours**: Test during expected peak usage times
5. **Failure Analysis**: Analyze failures immediately

### Performance Optimization
1. **Identify Bottlenecks**: Use test results to find bottlenecks
2. **Iterative Improvement**: Make incremental improvements
3. **Regression Testing**: Validate improvements don't cause regressions
4. **Capacity Planning**: Use results for capacity planning
5. **SLA Validation**: Ensure tests validate SLA requirements

## Troubleshooting

### Common Issues

#### High Error Rates
- Check application logs for errors
- Verify database connections
- Monitor resource utilization
- Check rate limiting configuration

#### Poor Performance
- Analyze database query performance
- Check caching effectiveness
- Monitor memory usage
- Verify network latency

#### Test Failures
- Verify API endpoints are accessible
- Check authentication credentials
- Ensure test data is available
- Monitor test environment resources

### Debug Mode
Enable verbose logging:
```bash
npm run load-test run --config light --verbose
```

### Log Analysis
Check structured logs for detailed information:
```bash
grep "load_test" logs/application.log | jq .
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Performance Tests
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  performance-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run load-test run --config medium --output results.json
      - uses: actions/upload-artifact@v2
        with:
          name: performance-results
          path: results.json
```

### Performance Gates
Fail builds on performance regressions:
```bash
npm run load-test run --config light --output results.json
if [ $? -ne 0 ]; then
  echo "Performance test failed"
  exit 1
fi
```

## Metrics and Observability

### Prometheus Metrics
- `load_test_requests_total`: Total requests executed
- `load_test_response_time`: Response time histogram
- `load_test_active_tests`: Number of active tests
- `load_test_system_health`: System health gauge

### Grafana Dashboard
Import the provided Grafana dashboard configuration to visualize:
- Request rates and response times
- Error rates and success rates
- Test execution timeline
- Performance trends
- System health status

## Support and Maintenance

### Regular Tasks
1. **Clean Old Data**: Dashboard automatically cleans old data
2. **Update Thresholds**: Review and update performance thresholds
3. **Scenario Updates**: Keep test scenarios current with API changes
4. **Capacity Planning**: Use results for infrastructure planning

### Monitoring
- Set up alerts for test failures
- Monitor dashboard for performance trends
- Review test results regularly
- Track performance improvements over time

For additional support or questions, refer to the main project documentation or contact the development team.