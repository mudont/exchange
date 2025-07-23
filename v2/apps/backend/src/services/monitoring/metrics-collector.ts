import { EventEmitter } from 'events';
import { structuredLogger } from './structured-logger';

export interface Metric {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  labels?: Record<string, string>;
  timestamp: Date;
  help?: string;
}

export interface Counter extends Metric {
  type: 'counter';
}

export interface Gauge extends Metric {
  type: 'gauge';
}

export interface Histogram extends Metric {
  type: 'histogram';
  buckets?: number[];
}

export interface Summary extends Metric {
  type: 'summary';
  quantiles?: number[];
}

export interface MetricsSnapshot {
  timestamp: Date;
  metrics: Metric[];
  summary: {
    totalMetrics: number;
    counters: number;
    gauges: number;
    histograms: number;
    summaries: number;
  };
}

export class MetricsCollector extends EventEmitter {
  private static instance: MetricsCollector;
  private metrics: Map<string, Metric> = new Map();
  private histogramBuckets: Map<string, number[]> = new Map();
  private summaryQuantiles: Map<string, number[]> = new Map();
  private collectionInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.initializeDefaultMetrics();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  // Counter operations
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing && existing.type === 'counter') {
      existing.value += value;
      existing.timestamp = new Date();
    } else {
      this.metrics.set(key, {
        name,
        value,
        type: 'counter',
        labels,
        timestamp: new Date(),
        help: `Counter metric for ${name}`,
      });
    }

    this.emit('metric_updated', { name, type: 'counter', value, labels });
  }

  // Gauge operations
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    
    this.metrics.set(key, {
      name,
      value,
      type: 'gauge',
      labels,
      timestamp: new Date(),
      help: `Gauge metric for ${name}`,
    });

    this.emit('metric_updated', { name, type: 'gauge', value, labels });
  }

  incrementGauge(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing && existing.type === 'gauge') {
      existing.value += value;
      existing.timestamp = new Date();
    } else {
      this.setGauge(name, value, labels);
    }

    this.emit('metric_updated', { name, type: 'gauge', value, labels });
  }

  decrementGauge(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.incrementGauge(name, -value, labels);
  }

  // Histogram operations
  observeHistogram(name: string, value: number, labels?: Record<string, string>, buckets?: number[]): void {
    const key = this.getMetricKey(name, labels);
    
    if (buckets) {
      this.histogramBuckets.set(name, buckets);
    }

    // For simplicity, we'll store the latest value
    // In a production system, you'd maintain bucket counts
    this.metrics.set(key, {
      name,
      value,
      type: 'histogram',
      labels,
      timestamp: new Date(),
      buckets: this.histogramBuckets.get(name),
      help: `Histogram metric for ${name}`,
    });

    this.emit('metric_updated', { name, type: 'histogram', value, labels });
  }

  // Summary operations
  observeSummary(name: string, value: number, labels?: Record<string, string>, quantiles?: number[]): void {
    const key = this.getMetricKey(name, labels);
    
    if (quantiles) {
      this.summaryQuantiles.set(name, quantiles);
    }

    // For simplicity, we'll store the latest value
    // In a production system, you'd maintain quantile calculations
    this.metrics.set(key, {
      name,
      value,
      type: 'summary',
      labels,
      timestamp: new Date(),
      quantiles: this.summaryQuantiles.get(name),
      help: `Summary metric for ${name}`,
    });

    this.emit('metric_updated', { name, type: 'summary', value, labels });
  }

  // Timing utility
  startTimer(name: string, labels?: Record<string, string>): () => void {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      this.observeHistogram(`${name}_duration_ms`, duration, labels, [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);
    };
  }

  // Get all metrics
  getAllMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  // Get metrics by type
  getMetricsByType(type: Metric['type']): Metric[] {
    return Array.from(this.metrics.values()).filter(m => m.type === type);
  }

  // Get specific metric
  getMetric(name: string, labels?: Record<string, string>): Metric | undefined {
    const key = this.getMetricKey(name, labels);
    return this.metrics.get(key);
  }

  // Get metrics snapshot
  getSnapshot(): MetricsSnapshot {
    const metrics = this.getAllMetrics();
    
    return {
      timestamp: new Date(),
      metrics,
      summary: {
        totalMetrics: metrics.length,
        counters: metrics.filter(m => m.type === 'counter').length,
        gauges: metrics.filter(m => m.type === 'gauge').length,
        histograms: metrics.filter(m => m.type === 'histogram').length,
        summaries: metrics.filter(m => m.type === 'summary').length,
      },
    };
  }

  // Export metrics in Prometheus format
  exportPrometheusFormat(): string {
    const lines: string[] = [];
    const metricsByName = new Map<string, Metric[]>();

    // Group metrics by name
    for (const metric of this.metrics.values()) {
      if (!metricsByName.has(metric.name)) {
        metricsByName.set(metric.name, []);
      }
      metricsByName.get(metric.name)!.push(metric);
    }

    // Generate Prometheus format
    for (const [name, metrics] of metricsByName) {
      const firstMetric = metrics[0];
      
      // Add help comment
      if (firstMetric.help) {
        lines.push(`# HELP ${name} ${firstMetric.help}`);
      }
      
      // Add type comment
      lines.push(`# TYPE ${name} ${firstMetric.type}`);
      
      // Add metric lines
      for (const metric of metrics) {
        const labelsStr = metric.labels ? 
          `{${Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : '';
        lines.push(`${metric.name}${labelsStr} ${metric.value} ${metric.timestamp.getTime()}`);
      }
      
      lines.push(''); // Empty line between metrics
    }

    return lines.join('\n');
  }

  // Clear all metrics
  clear(): void {
    this.metrics.clear();
    this.emit('metrics_cleared');
  }

  // Remove specific metric
  removeMetric(name: string, labels?: Record<string, string>): boolean {
    const key = this.getMetricKey(name, labels);
    const removed = this.metrics.delete(key);
    
    if (removed) {
      this.emit('metric_removed', { name, labels });
    }
    
    return removed;
  }

  // Start automatic collection of system metrics
  startSystemMetricsCollection(intervalMs: number = 10000): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }

    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, intervalMs);

    // Collect immediately
    this.collectSystemMetrics();
    
    structuredLogger.info('System metrics collection started', { intervalMs });
  }

  // Stop automatic collection
  stopSystemMetricsCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
      structuredLogger.info('System metrics collection stopped');
    }
  }

  // Business metrics helpers
  recordOrderPlaced(instrumentSymbol: string, side: string, userId: string): void {
    this.incrementCounter('orders_placed_total', 1, { 
      instrument: instrumentSymbol, 
      side: side.toLowerCase(),
      user_id: userId 
    });
  }

  recordTradeExecuted(instrumentSymbol: string, quantity: number, price: number): void {
    this.incrementCounter('trades_executed_total', 1, { instrument: instrumentSymbol });
    this.observeHistogram('trade_quantity', quantity, { instrument: instrumentSymbol });
    this.observeHistogram('trade_price', price, { instrument: instrumentSymbol });
  }

  recordUserLogin(userId: string, success: boolean): void {
    this.incrementCounter('user_logins_total', 1, { 
      user_id: userId, 
      success: success.toString() 
    });
  }

  recordApiRequest(method: string, path: string, statusCode: number, duration: number): void {
    this.incrementCounter('http_requests_total', 1, { 
      method: method.toUpperCase(), 
      path, 
      status: statusCode.toString() 
    });
    this.observeHistogram('http_request_duration_ms', duration, { 
      method: method.toUpperCase(), 
      path 
    });
  }

  recordDatabaseQuery(operation: string, table: string, duration: number, success: boolean): void {
    this.incrementCounter('database_queries_total', 1, { 
      operation: operation.toLowerCase(), 
      table, 
      success: success.toString() 
    });
    this.observeHistogram('database_query_duration_ms', duration, { 
      operation: operation.toLowerCase(), 
      table 
    });
  }

  recordCacheOperation(operation: string, hit: boolean): void {
    this.incrementCounter('cache_operations_total', 1, { 
      operation: operation.toLowerCase(), 
      hit: hit.toString() 
    });
  }

  // Private methods
  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    
    const sortedLabels = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    
    return `${name}{${sortedLabels}}`;
  }

  private initializeDefaultMetrics(): void {
    // Initialize common application metrics
    this.setGauge('app_start_time', Date.now());
    this.setGauge('app_version', 1, { version: process.env.APP_VERSION || '1.0.0' });
  }

  private collectSystemMetrics(): void {
    try {
      const process = require('process');
      const os = require('os');

      // Process metrics
      const memUsage = process.memoryUsage();
      this.setGauge('process_memory_rss_bytes', memUsage.rss);
      this.setGauge('process_memory_heap_used_bytes', memUsage.heapUsed);
      this.setGauge('process_memory_heap_total_bytes', memUsage.heapTotal);
      this.setGauge('process_memory_external_bytes', memUsage.external);

      // CPU usage (simplified)
      const cpuUsage = process.cpuUsage();
      this.setGauge('process_cpu_user_seconds_total', cpuUsage.user / 1000000);
      this.setGauge('process_cpu_system_seconds_total', cpuUsage.system / 1000000);

      // System metrics
      this.setGauge('system_memory_total_bytes', os.totalmem());
      this.setGauge('system_memory_free_bytes', os.freemem());
      this.setGauge('system_load_average_1m', os.loadavg()[0]);
      this.setGauge('system_load_average_5m', os.loadavg()[1]);
      this.setGauge('system_load_average_15m', os.loadavg()[2]);

      // Node.js specific
      this.setGauge('nodejs_version_info', 1, { version: process.version });
      this.setGauge('process_uptime_seconds', process.uptime());

    } catch (error) {
      structuredLogger.error('Failed to collect system metrics', error);
    }
  }
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();