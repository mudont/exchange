import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export interface QueryPlan {
  nodeType: string;
  totalCost: number;
  rows: number;
  width: number;
  actualTime: number;
  actualRows: number;
  actualLoops: number;
  plans?: QueryPlan[];
}

export interface QueryAnalysis {
  query: string;
  executionTime: number;
  planningTime: number;
  totalCost: number;
  actualRows: number;
  estimatedRows: number;
  indexesUsed: string[];
  suggestions: string[];
  plan: QueryPlan;
}

export interface OptimizedQuery {
  originalQuery: string;
  optimizedQuery: string;
  explanation: string;
  expectedImprovement: string;
}

export class QueryOptimizer {
  private prisma: PrismaClient;
  private queryCache: Map<string, QueryAnalysis> = new Map();
  private optimizationRules: Array<{
    pattern: RegExp;
    replacement: string;
    explanation: string;
  }> = [];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializeOptimizationRules();
  }

  // Analyze a query's performance
  async analyzeQuery(query: string): Promise<QueryAnalysis> {
    const queryHash = this.hashQuery(query);
    
    // Check cache first
    if (this.queryCache.has(queryHash)) {
      const cached = this.queryCache.get(queryHash)!;
      logger.debug('Query analysis served from cache', { queryHash });
      return cached;
    }

    try {
      logger.info('Analyzing query performance', { 
        query: query.substring(0, 100) + '...' 
      });

      // Get query execution plan
      const explainResult = await this.prisma.$queryRawUnsafe<any[]>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`
      );

      const planData = explainResult[0]['QUERY PLAN'][0];
      
      const analysis: QueryAnalysis = {
        query,
        executionTime: planData['Execution Time'] || 0,
        planningTime: planData['Planning Time'] || 0,
        totalCost: planData.Plan['Total Cost'] || 0,
        actualRows: planData.Plan['Actual Rows'] || 0,
        estimatedRows: planData.Plan['Plan Rows'] || 0,
        indexesUsed: this.extractIndexesFromPlan(planData.Plan),
        suggestions: this.generateSuggestions(planData.Plan, query),
        plan: this.formatPlan(planData.Plan),
      };

      // Cache the analysis
      this.queryCache.set(queryHash, analysis);
      if (this.queryCache.size > 100) {
        const firstKey = this.queryCache.keys().next().value;
        this.queryCache.delete(firstKey);
      }

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze query', {
        query: query.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Optimize a query based on common patterns
  optimizeQuery(query: string): OptimizedQuery[] {
    const optimizations: OptimizedQuery[] = [];

    for (const rule of this.optimizationRules) {
      if (rule.pattern.test(query)) {
        const optimizedQuery = query.replace(rule.pattern, rule.replacement);
        
        if (optimizedQuery !== query) {
          optimizations.push({
            originalQuery: query,
            optimizedQuery,
            explanation: rule.explanation,
            expectedImprovement: 'Moderate performance improvement expected',
          });
        }
      }
    }

    // Additional dynamic optimizations
    optimizations.push(...this.applyDynamicOptimizations(query));

    return optimizations;
  }

  // Get query performance recommendations
  async getPerformanceRecommendations(): Promise<Array<{
    category: string;
    recommendation: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    implementation: string;
  }>> {
    const recommendations = [];

    try {
      // Check for missing indexes
      const missingIndexes = await this.findMissingIndexes();
      recommendations.push(...missingIndexes);

      // Check for inefficient queries
      const inefficientQueries = await this.findInefficientQueries();
      recommendations.push(...inefficientQueries);

      // Check for table statistics
      const statisticsRecommendations = await this.checkTableStatistics();
      recommendations.push(...statisticsRecommendations);

      return recommendations;
    } catch (error) {
      logger.error('Failed to get performance recommendations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  // Benchmark query performance
  async benchmarkQuery(query: string, iterations: number = 10): Promise<{
    averageTime: number;
    minTime: number;
    maxTime: number;
    standardDeviation: number;
    iterations: number;
  }> {
    const times: number[] = [];

    logger.info('Benchmarking query', { 
      query: query.substring(0, 100) + '...',
      iterations 
    });

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      try {
        await this.prisma.$queryRawUnsafe(query);
        const endTime = Date.now();
        times.push(endTime - startTime);
      } catch (error) {
        logger.error('Query benchmark iteration failed', {
          iteration: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (times.length === 0) {
      throw new Error('All benchmark iterations failed');
    }

    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    // Calculate standard deviation
    const variance = times.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / times.length;
    const standardDeviation = Math.sqrt(variance);

    return {
      averageTime,
      minTime,
      maxTime,
      standardDeviation,
      iterations: times.length,
    };
  }

  // Compare two queries performance
  async compareQueries(query1: string, query2: string): Promise<{
    query1Analysis: QueryAnalysis;
    query2Analysis: QueryAnalysis;
    recommendation: string;
    performanceDifference: number;
  }> {
    const [analysis1, analysis2] = await Promise.all([
      this.analyzeQuery(query1),
      this.analyzeQuery(query2),
    ]);

    const performanceDifference = ((analysis1.executionTime - analysis2.executionTime) / analysis1.executionTime) * 100;
    
    let recommendation: string;
    if (Math.abs(performanceDifference) < 5) {
      recommendation = 'Both queries have similar performance';
    } else if (performanceDifference > 0) {
      recommendation = `Query 2 is ${Math.abs(performanceDifference).toFixed(1)}% faster`;
    } else {
      recommendation = `Query 1 is ${Math.abs(performanceDifference).toFixed(1)}% faster`;
    }

    return {
      query1Analysis: analysis1,
      query2Analysis: analysis2,
      recommendation,
      performanceDifference,
    };
  }

  // Private helper methods
  private initializeOptimizationRules(): void {
    this.optimizationRules = [
      {
        pattern: /SELECT \* FROM/gi,
        replacement: 'SELECT specific_columns FROM',
        explanation: 'Avoid SELECT * - specify only needed columns',
      },
      {
        pattern: /WHERE.*LIKE '%.*%'/gi,
        replacement: 'WHERE column_name ILIKE $1 -- Consider full-text search for better performance',
        explanation: 'Leading wildcard LIKE queries cannot use indexes efficiently',
      },
      {
        pattern: /ORDER BY.*LIMIT \d+/gi,
        replacement: '$& -- Consider adding index on ORDER BY columns',
        explanation: 'ORDER BY with LIMIT can benefit from appropriate indexes',
      },
      {
        pattern: /WHERE.*OR.*OR/gi,
        replacement: 'WHERE column IN (value1, value2, value3) -- Consider using IN instead of multiple ORs',
        explanation: 'Multiple OR conditions can often be optimized using IN clause',
      },
      {
        pattern: /JOIN.*ON.*=.*AND/gi,
        replacement: '$& -- Consider compound index on join columns',
        explanation: 'Complex JOIN conditions may benefit from compound indexes',
      },
    ];
  }

  private hashQuery(query: string): string {
    // Simple hash function for query caching
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private extractIndexesFromPlan(plan: any): string[] {
    const indexes: string[] = [];
    
    const extractFromNode = (node: any) => {
      if (node['Index Name']) {
        indexes.push(node['Index Name']);
      }
      
      if (node.Plans) {
        for (const childPlan of node.Plans) {
          extractFromNode(childPlan);
        }
      }
    };
    
    extractFromNode(plan);
    return [...new Set(indexes)]; // Remove duplicates
  }

  private generateSuggestions(plan: any, query: string): string[] {
    const suggestions: string[] = [];
    
    const analyzeNode = (node: any) => {
      // Check for sequential scans
      if (node['Node Type'] === 'Seq Scan' && node['Total Cost'] > 1000) {
        suggestions.push(`Consider adding an index on table ${node['Relation Name']} for the filter conditions`);
      }
      
      // Check for nested loops with high cost
      if (node['Node Type'] === 'Nested Loop' && node['Total Cost'] > 10000) {
        suggestions.push('High-cost nested loop detected - consider optimizing JOIN conditions or adding indexes');
      }
      
      // Check for sorts
      if (node['Node Type'] === 'Sort' && node['Total Cost'] > 1000) {
        suggestions.push('Expensive sort operation - consider adding an index to avoid sorting');
      }
      
      // Check for hash joins with large datasets
      if (node['Node Type'] === 'Hash Join' && node['Actual Rows'] > 100000) {
        suggestions.push('Large hash join detected - ensure proper indexes exist on join columns');
      }
      
      if (node.Plans) {
        for (const childPlan of node.Plans) {
          analyzeNode(childPlan);
        }
      }
    };
    
    analyzeNode(plan);
    
    // Add query-specific suggestions
    if (query.includes('LIKE') && query.includes('%')) {
      suggestions.push('Consider using full-text search (GIN indexes) for text search operations');
    }
    
    if (query.includes('ORDER BY') && query.includes('LIMIT')) {
      suggestions.push('Ensure indexes exist on ORDER BY columns for efficient LIMIT queries');
    }
    
    return suggestions;
  }

  private formatPlan(plan: any): QueryPlan {
    return {
      nodeType: plan['Node Type'],
      totalCost: plan['Total Cost'],
      rows: plan['Plan Rows'],
      width: plan['Plan Width'],
      actualTime: plan['Actual Total Time'] || 0,
      actualRows: plan['Actual Rows'] || 0,
      actualLoops: plan['Actual Loops'] || 0,
      plans: plan.Plans ? plan.Plans.map((p: any) => this.formatPlan(p)) : undefined,
    };
  }

  private applyDynamicOptimizations(query: string): OptimizedQuery[] {
    const optimizations: OptimizedQuery[] = [];
    
    // Optimize COUNT queries
    if (query.includes('COUNT(*)') && !query.includes('WHERE')) {
      optimizations.push({
        originalQuery: query,
        optimizedQuery: query.replace('COUNT(*)', 'COUNT(1)'),
        explanation: 'COUNT(1) can be slightly faster than COUNT(*) in some cases',
        expectedImprovement: 'Minor performance improvement',
      });
    }
    
    // Optimize EXISTS vs IN
    if (query.includes(' IN (SELECT ')) {
      const optimizedQuery = query.replace(/ IN \(SELECT /g, ' EXISTS (SELECT 1 FROM ');
      optimizations.push({
        originalQuery: query,
        optimizedQuery,
        explanation: 'EXISTS can be more efficient than IN with subqueries',
        expectedImprovement: 'Moderate performance improvement for large datasets',
      });
    }
    
    return optimizations;
  }

  private async findMissingIndexes(): Promise<Array<{
    category: string;
    recommendation: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    implementation: string;
  }>> {
    const recommendations = [];
    
    try {
      // Check for tables with high sequential scan ratios
      const result = await this.prisma.$queryRaw<Array<{
        schemaname: string;
        tablename: string;
        seq_scan: number;
        seq_tup_read: number;
        idx_scan: number;
      }>>`
        SELECT 
          schemaname,
          tablename,
          seq_scan,
          seq_tup_read,
          COALESCE(idx_scan, 0) as idx_scan
        FROM pg_stat_user_tables 
        WHERE seq_scan > COALESCE(idx_scan, 0) * 2 
        AND seq_tup_read > 10000
        ORDER BY seq_tup_read DESC
        LIMIT 5
      `;

      for (const table of result) {
        recommendations.push({
          category: 'Missing Indexes',
          recommendation: `Table ${table.tablename} has high sequential scan ratio (${table.seq_scan} seq scans vs ${table.idx_scan} index scans)`,
          impact: 'HIGH' as const,
          implementation: `ANALYZE ${table.tablename}; CREATE INDEX CONCURRENTLY ON ${table.tablename} (frequently_queried_column);`,
        });
      }
    } catch (error) {
      // Ignore errors in analysis
    }
    
    return recommendations;
  }

  private async findInefficientQueries(): Promise<Array<{
    category: string;
    recommendation: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    implementation: string;
  }>> {
    const recommendations = [];
    
    try {
      // This would require pg_stat_statements extension
      const result = await this.prisma.$queryRaw<Array<{
        query: string;
        mean_exec_time: number;
        calls: number;
      }>>`
        SELECT 
          query,
          mean_exec_time,
          calls
        FROM pg_stat_statements 
        WHERE mean_exec_time > 1000 
        AND calls > 10
        ORDER BY mean_exec_time * calls DESC 
        LIMIT 5
      `;

      for (const query of result) {
        recommendations.push({
          category: 'Slow Queries',
          recommendation: `Query with ${query.mean_exec_time.toFixed(2)}ms average execution time called ${query.calls} times`,
          impact: 'HIGH' as const,
          implementation: `EXPLAIN ANALYZE ${query.query.substring(0, 100)}...`,
        });
      }
    } catch (error) {
      // pg_stat_statements might not be available
      recommendations.push({
        category: 'Query Monitoring',
        recommendation: 'Enable pg_stat_statements extension for better query performance monitoring',
        impact: 'MEDIUM' as const,
        implementation: 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;',
      });
    }
    
    return recommendations;
  }

  private async checkTableStatistics(): Promise<Array<{
    category: string;
    recommendation: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    implementation: string;
  }>> {
    const recommendations = [];
    
    try {
      // Check for tables with outdated statistics
      const result = await this.prisma.$queryRaw<Array<{
        schemaname: string;
        tablename: string;
        last_analyze: Date | null;
        n_tup_ins: number;
        n_tup_upd: number;
        n_tup_del: number;
      }>>`
        SELECT 
          schemaname,
          tablename,
          last_analyze,
          n_tup_ins,
          n_tup_upd,
          n_tup_del
        FROM pg_stat_user_tables 
        WHERE (last_analyze IS NULL OR last_analyze < NOW() - INTERVAL '7 days')
        AND (n_tup_ins + n_tup_upd + n_tup_del) > 1000
        ORDER BY (n_tup_ins + n_tup_upd + n_tup_del) DESC
        LIMIT 5
      `;

      for (const table of result) {
        recommendations.push({
          category: 'Table Statistics',
          recommendation: `Table ${table.tablename} has outdated statistics (last analyzed: ${table.last_analyze || 'never'})`,
          impact: 'MEDIUM' as const,
          implementation: `ANALYZE ${table.tablename};`,
        });
      }
    } catch (error) {
      // Ignore errors in analysis
    }
    
    return recommendations;
  }
}

// Export singleton instance
export const queryOptimizer = new QueryOptimizer(new PrismaClient());