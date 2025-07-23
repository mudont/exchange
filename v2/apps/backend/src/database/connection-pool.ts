import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export interface ConnectionPoolConfig {
  maxConnections: number;
  minConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  maxLifetimeMs: number;
  healthCheckIntervalMs: number;
}

export interface ConnectionPoolMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  averageAcquireTime: number;
  averageQueryTime: number;
  errorRate: number;
  lastHealthCheck: Date;
}

export class DatabaseConnectionPool {
  private static instance: DatabaseConnectionPool;
  private prismaClients: PrismaClient[] = [];
  private availableClients: PrismaClient[] = [];
  private busyClients: Set<PrismaClient> = new Set();
  private waitingQueue: Array<{
    resolve: (client: PrismaClient) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  private config: ConnectionPoolConfig;
  private metrics: ConnectionPoolMetrics;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private queryTimes: number[] = [];
  private acquireTimes: number[] = [];
  private errorCount: number = 0;
  private totalQueries: number = 0;

  private constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = {
      maxConnections: config.maxConnections || 20,
      minConnections: config.minConnections || 5,
      acquireTimeoutMs: config.acquireTimeoutMs || 10000,
      idleTimeoutMs: config.idleTimeoutMs || 300000, // 5 minutes
      maxLifetimeMs: config.maxLifetimeMs || 3600000, // 1 hour
      healthCheckIntervalMs: config.healthCheckIntervalMs || 30000, // 30 seconds
    };

    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      averageAcquireTime: 0,
      averageQueryTime: 0,
      errorRate: 0,
      lastHealthCheck: new Date(),
    };
  }

  static getInstance(config?: Partial<ConnectionPoolConfig>): DatabaseConnectionPool {
    if (!DatabaseConnectionPool.instance) {
      DatabaseConnectionPool.instance = new DatabaseConnectionPool(config);
    }
    return DatabaseConnectionPool.instance;
  }

  // Initialize the connection pool
  async initialize(): Promise<void> {
    logger.info('Initializing database connection pool', {
      minConnections: this.config.minConnections,
      maxConnections: this.config.maxConnections,
    });

    try {
      // Create minimum number of connections
      for (let i = 0; i < this.config.minConnections; i++) {
        const client = await this.createConnection();
        this.prismaClients.push(client);
        this.availableClients.push(client);
      }

      this.updateMetrics();
      this.startHealthCheck();

      logger.info('Database connection pool initialized', {
        totalConnections: this.prismaClients.length,
      });
    } catch (error) {
      logger.error('Failed to initialize connection pool', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Acquire a connection from the pool
  async acquire(): Promise<PrismaClient> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      // Check if there's an available connection
      if (this.availableClients.length > 0) {
        const client = this.availableClients.pop()!;
        this.busyClients.add(client);
        
        const acquireTime = Date.now() - startTime;
        this.recordAcquireTime(acquireTime);
        this.updateMetrics();
        
        resolve(client);
        return;
      }

      // Check if we can create a new connection
      if (this.prismaClients.length < this.config.maxConnections) {
        this.createConnection()
          .then(client => {
            this.prismaClients.push(client);
            this.busyClients.add(client);
            
            const acquireTime = Date.now() - startTime;
            this.recordAcquireTime(acquireTime);
            this.updateMetrics();
            
            resolve(client);
          })
          .catch(reject);
        return;
      }

      // Add to waiting queue
      const timeoutId = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
          this.updateMetrics();
          reject(new Error('Connection acquire timeout'));
        }
      }, this.config.acquireTimeoutMs);

      this.waitingQueue.push({
        resolve: (client: PrismaClient) => {
          clearTimeout(timeoutId);
          const acquireTime = Date.now() - startTime;
          this.recordAcquireTime(acquireTime);
          resolve(client);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timestamp: startTime,
      });

      this.updateMetrics();
    });
  }

  // Release a connection back to the pool
  async release(client: PrismaClient): Promise<void> {
    if (!this.busyClients.has(client)) {
      logger.warn('Attempting to release a connection that is not in use');
      return;
    }

    this.busyClients.delete(client);

    // Check if there are waiting requests
    if (this.waitingQueue.length > 0) {
      const waiting = this.waitingQueue.shift()!;
      this.busyClients.add(client);
      waiting.resolve(client);
    } else {
      this.availableClients.push(client);
    }

    this.updateMetrics();
  }

  // Execute a query with automatic connection management
  async executeQuery<T>(queryFn: (client: PrismaClient) => Promise<T>): Promise<T> {
    const client = await this.acquire();
    const startTime = Date.now();

    try {
      const result = await queryFn(client);
      
      const queryTime = Date.now() - startTime;
      this.recordQueryTime(queryTime);
      this.totalQueries++;
      
      return result;
    } catch (error) {
      this.errorCount++;
      logger.error('Query execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      await this.release(client);
      this.updateMetrics();
    }
  }

  // Execute a transaction with automatic connection management
  async executeTransaction<T>(transactionFn: (client: PrismaClient) => Promise<T>): Promise<T> {
    const client = await this.acquire();
    const startTime = Date.now();

    try {
      const result = await client.$transaction(async (tx) => {
        return await transactionFn(tx as PrismaClient);
      });
      
      const queryTime = Date.now() - startTime;
      this.recordQueryTime(queryTime);
      this.totalQueries++;
      
      return result;
    } catch (error) {
      this.errorCount++;
      logger.error('Transaction execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      await this.release(client);
      this.updateMetrics();
    }
  }

  // Get connection pool metrics
  getMetrics(): ConnectionPoolMetrics {
    return { ...this.metrics };
  }

  // Shutdown the connection pool
  async shutdown(): Promise<void> {
    logger.info('Shutting down database connection pool');

    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Reject all waiting requests
    for (const waiting of this.waitingQueue) {
      waiting.reject(new Error('Connection pool is shutting down'));
    }
    this.waitingQueue.length = 0;

    // Disconnect all clients
    const disconnectPromises = this.prismaClients.map(async (client) => {
      try {
        await client.$disconnect();
      } catch (error) {
        logger.error('Error disconnecting client', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    await Promise.allSettled(disconnectPromises);

    this.prismaClients.length = 0;
    this.availableClients.length = 0;
    this.busyClients.clear();

    logger.info('Database connection pool shut down');
  }

  // Private methods
  private async createConnection(): Promise<PrismaClient> {
    const client = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // Set up event listeners for monitoring
    client.$on('query', (e) => {
      if (e.duration > 1000) { // Log slow queries
        logger.warn('Slow query detected', {
          query: e.query.substring(0, 200),
          duration: e.duration,
          params: e.params,
        });
      }
    });

    client.$on('error', (e) => {
      logger.error('Database error', { error: e.message });
      this.errorCount++;
    });

    try {
      await client.$connect();
      return client;
    } catch (error) {
      await client.$disconnect();
      throw error;
    }
  }

  private updateMetrics(): void {
    this.metrics = {
      totalConnections: this.prismaClients.length,
      activeConnections: this.busyClients.size,
      idleConnections: this.availableClients.length,
      waitingRequests: this.waitingQueue.length,
      averageAcquireTime: this.calculateAverage(this.acquireTimes),
      averageQueryTime: this.calculateAverage(this.queryTimes),
      errorRate: this.totalQueries > 0 ? (this.errorCount / this.totalQueries) * 100 : 0,
      lastHealthCheck: this.metrics.lastHealthCheck,
    };
  }

  private recordAcquireTime(time: number): void {
    this.acquireTimes.push(time);
    if (this.acquireTimes.length > 100) {
      this.acquireTimes.shift();
    }
  }

  private recordQueryTime(time: number): void {
    this.queryTimes.push(time);
    if (this.queryTimes.length > 100) {
      this.queryTimes.shift();
    }
  }

  private calculateAverage(times: number[]): number {
    if (times.length === 0) return 0;
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Test a simple query on each available connection
      const healthCheckPromises = this.availableClients.map(async (client) => {
        try {
          await client.$queryRaw`SELECT 1`;
          return true;
        } catch (error) {
          logger.error('Connection health check failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          return false;
        }
      });

      const results = await Promise.allSettled(healthCheckPromises);
      const healthyConnections = results.filter(
        (result) => result.status === 'fulfilled' && result.value === true
      ).length;

      // Remove unhealthy connections
      const unhealthyCount = this.availableClients.length - healthyConnections;
      if (unhealthyCount > 0) {
        logger.warn('Removing unhealthy connections', { count: unhealthyCount });
        
        // This is a simplified approach - in production, you'd want more sophisticated handling
        for (let i = this.availableClients.length - 1; i >= 0; i--) {
          const result = results[i];
          if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value)) {
            const client = this.availableClients.splice(i, 1)[0];
            const clientIndex = this.prismaClients.indexOf(client);
            if (clientIndex !== -1) {
              this.prismaClients.splice(clientIndex, 1);
            }
            
            try {
              await client.$disconnect();
            } catch (error) {
              // Ignore disconnect errors for unhealthy connections
            }
          }
        }

        // Create replacement connections
        for (let i = 0; i < unhealthyCount; i++) {
          try {
            const newClient = await this.createConnection();
            this.prismaClients.push(newClient);
            this.availableClients.push(newClient);
          } catch (error) {
            logger.error('Failed to create replacement connection', {
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }

      this.metrics.lastHealthCheck = new Date();
      this.updateMetrics();

      logger.debug('Connection pool health check completed', {
        totalConnections: this.metrics.totalConnections,
        healthyConnections,
        unhealthyCount,
      });
    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// Export singleton instance
export const connectionPool = DatabaseConnectionPool.getInstance();