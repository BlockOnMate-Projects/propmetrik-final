#!/usr/bin/env npx ts-node
/**
 * Economic Data API Load Testing Script
 * 
 * Tests the performance and reliability of economic data endpoints
 * under concurrent load.
 * 
 * Usage:
 *   npx ts-node scripts/load-test/economic-api-load-test.ts
 *   npx ts-node scripts/load-test/economic-api-load-test.ts --concurrent=50 --duration=60
 */

import axios, { AxiosError } from 'axios';

// =====================================================
// CONFIGURATION
// =====================================================

interface LoadTestConfig {
  baseUrl: string;
  concurrentUsers: number;
  durationSeconds: number;
  rampUpSeconds: number;
  endpoints: EndpointConfig[];
}

interface EndpointConfig {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  body?: object;
  weight: number; // Relative frequency
}

const DEFAULT_CONFIG: LoadTestConfig = {
  baseUrl: process.env.API_URL || 'http://localhost:4000/api/v1/data-hub',
  concurrentUsers: 10,
  durationSeconds: 30,
  rampUpSeconds: 5,
  endpoints: [
    { name: 'Economic Snapshot', method: 'GET', path: '/economic/snapshot', weight: 30 },
    { name: 'FX Live Rates', method: 'GET', path: '/economic/fx/live', weight: 25 },
    { name: 'Exchange Rate USD', method: 'GET', path: '/economic/exchange-rate/USD', weight: 20 },
    { name: 'Indicator History', method: 'GET', path: '/economic/indicator/inflation_rate', weight: 10 },
    { name: 'Sync Status', method: 'GET', path: '/economic/sync/status', weight: 5 },
    { name: 'Monitoring Report', method: 'GET', path: '/monitoring/report', weight: 5 },
    { name: 'Currency Convert', method: 'POST', path: '/economic/convert', body: { amount: 1000, fromCurrency: 'USD' }, weight: 5 },
  ],
};

// =====================================================
// METRICS
// =====================================================

interface RequestMetrics {
  endpoint: string;
  startTime: number;
  endTime: number;
  duration: number;
  statusCode: number;
  success: boolean;
  error?: string;
}

interface AggregateMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  minLatency: number;
  maxLatency: number;
  requestsPerSecond: number;
  errorRate: number;
  byEndpoint: Record<string, EndpointMetrics>;
}

interface EndpointMetrics {
  count: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  errorCount: number;
}

// =====================================================
// LOAD TEST RUNNER
// =====================================================

class LoadTestRunner {
  private config: LoadTestConfig;
  private metrics: RequestMetrics[] = [];
  private running = false;
  private startTime = 0;
  private activeUsers = 0;

  constructor(config: Partial<LoadTestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Parse command line arguments
   */
  static parseArgs(): Partial<LoadTestConfig> {
    const args = process.argv.slice(2);
    const config: Partial<LoadTestConfig> = {};

    for (const arg of args) {
      if (arg.startsWith('--concurrent=')) {
        config.concurrentUsers = parseInt(arg.split('=')[1], 10);
      } else if (arg.startsWith('--duration=')) {
        config.durationSeconds = parseInt(arg.split('=')[1], 10);
      } else if (arg.startsWith('--url=')) {
        config.baseUrl = arg.split('=')[1];
      }
    }

    return config;
  }

  /**
   * Select a random endpoint based on weights
   */
  private selectEndpoint(): EndpointConfig {
    const totalWeight = this.config.endpoints.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;

    for (const endpoint of this.config.endpoints) {
      random -= endpoint.weight;
      if (random <= 0) return endpoint;
    }

    return this.config.endpoints[0];
  }

  /**
   * Make a single request and record metrics
   */
  private async makeRequest(endpoint: EndpointConfig): Promise<void> {
    const startTime = Date.now();
    let statusCode = 0;
    let success = false;
    let error: string | undefined;

    try {
      const url = `${this.config.baseUrl}${endpoint.path}`;
      const response = endpoint.method === 'GET'
        ? await axios.get(url, { timeout: 30000 })
        : await axios.post(url, endpoint.body, { timeout: 30000 });

      statusCode = response.status;
      success = response.status >= 200 && response.status < 300;
    } catch (err) {
      const axiosError = err as AxiosError;
      statusCode = axiosError.response?.status || 0;
      error = axiosError.message;
    }

    const endTime = Date.now();
    this.metrics.push({
      endpoint: endpoint.name,
      startTime,
      endTime,
      duration: endTime - startTime,
      statusCode,
      success,
      error,
    });
  }

  /**
   * Simulate a virtual user
   */
  private async runUser(): Promise<void> {
    while (this.running) {
      const endpoint = this.selectEndpoint();
      await this.makeRequest(endpoint);
      
      // Small random delay between requests (100-500ms)
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 400));
    }
  }

  /**
   * Run the load test
   */
  async run(): Promise<AggregateMetrics> {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         PropMetrik Economic API Load Test                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Base URL: ${this.config.baseUrl}`);
    console.log(`Concurrent Users: ${this.config.concurrentUsers}`);
    console.log(`Duration: ${this.config.durationSeconds}s`);
    console.log(`Ramp-up: ${this.config.rampUpSeconds}s`);
    console.log('');
    console.log('Endpoints:');
    for (const ep of this.config.endpoints) {
      console.log(`  - ${ep.name} (${ep.method} ${ep.path}) - weight: ${ep.weight}`);
    }
    console.log('');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('');

    this.running = true;
    this.startTime = Date.now();
    this.metrics = [];

    // Ramp up users
    const rampUpInterval = (this.config.rampUpSeconds * 1000) / this.config.concurrentUsers;
    const userPromises: Promise<void>[] = [];

    console.log('Starting users...');

    for (let i = 0; i < this.config.concurrentUsers; i++) {
      await new Promise((r) => setTimeout(r, rampUpInterval));
      this.activeUsers++;
      process.stdout.write(`\rActive users: ${this.activeUsers}/${this.config.concurrentUsers}`);
      userPromises.push(this.runUser());
    }

    console.log('\n');
    console.log(`All ${this.config.concurrentUsers} users active. Running for ${this.config.durationSeconds}s...`);
    console.log('');

    // Progress bar
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - this.startTime) / 1000;
      const progress = Math.min(elapsed / this.config.durationSeconds, 1);
      const barLength = 40;
      const filled = Math.round(progress * barLength);
      const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
      const reqCount = this.metrics.length;
      process.stdout.write(`\r[${bar}] ${Math.round(progress * 100)}% | Requests: ${reqCount}`);
    }, 100);

    // Wait for duration
    await new Promise((r) => setTimeout(r, this.config.durationSeconds * 1000));

    // Stop
    this.running = false;
    clearInterval(progressInterval);

    // Wait for in-flight requests
    await new Promise((r) => setTimeout(r, 1000));

    console.log('\n\n');

    return this.calculateMetrics();
  }

  /**
   * Calculate aggregate metrics
   */
  private calculateMetrics(): AggregateMetrics {
    const durations = this.metrics.map((m) => m.duration).sort((a, b) => a - b);
    const totalDuration = (Date.now() - this.startTime) / 1000;

    const byEndpoint: Record<string, EndpointMetrics> = {};
    
    for (const metric of this.metrics) {
      if (!byEndpoint[metric.endpoint]) {
        byEndpoint[metric.endpoint] = {
          count: 0,
          avgLatency: 0,
          minLatency: Infinity,
          maxLatency: 0,
          errorCount: 0,
        };
      }

      const ep = byEndpoint[metric.endpoint];
      ep.count++;
      ep.avgLatency = ((ep.avgLatency * (ep.count - 1)) + metric.duration) / ep.count;
      ep.minLatency = Math.min(ep.minLatency, metric.duration);
      ep.maxLatency = Math.max(ep.maxLatency, metric.duration);
      if (!metric.success) ep.errorCount++;
    }

    // Fix Infinity min values
    for (const ep of Object.values(byEndpoint)) {
      if (ep.minLatency === Infinity) ep.minLatency = 0;
    }

    return {
      totalRequests: this.metrics.length,
      successfulRequests: this.metrics.filter((m) => m.success).length,
      failedRequests: this.metrics.filter((m) => !m.success).length,
      averageLatency: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      p50Latency: durations[Math.floor(durations.length * 0.5)] || 0,
      p95Latency: durations[Math.floor(durations.length * 0.95)] || 0,
      p99Latency: durations[Math.floor(durations.length * 0.99)] || 0,
      minLatency: durations[0] || 0,
      maxLatency: durations[durations.length - 1] || 0,
      requestsPerSecond: Math.round((this.metrics.length / totalDuration) * 100) / 100,
      errorRate: Math.round((this.metrics.filter((m) => !m.success).length / this.metrics.length) * 10000) / 100,
      byEndpoint,
    };
  }

  /**
   * Print results
   */
  printResults(metrics: AggregateMetrics): void {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                     LOAD TEST RESULTS                         ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Summary:');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log(`  Total Requests:     ${metrics.totalRequests}`);
    console.log(`  Successful:         ${metrics.successfulRequests} (${100 - metrics.errorRate}%)`);
    console.log(`  Failed:             ${metrics.failedRequests} (${metrics.errorRate}%)`);
    console.log(`  Requests/sec:       ${metrics.requestsPerSecond}`);
    console.log('');
    console.log('Latency (ms):');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log(`  Min:                ${metrics.minLatency}ms`);
    console.log(`  Average:            ${metrics.averageLatency}ms`);
    console.log(`  P50 (median):       ${metrics.p50Latency}ms`);
    console.log(`  P95:                ${metrics.p95Latency}ms`);
    console.log(`  P99:                ${metrics.p99Latency}ms`);
    console.log(`  Max:                ${metrics.maxLatency}ms`);
    console.log('');
    console.log('By Endpoint:');
    console.log('───────────────────────────────────────────────────────────────────');
    
    for (const [name, ep] of Object.entries(metrics.byEndpoint)) {
      const errorPct = ep.count > 0 ? ((ep.errorCount / ep.count) * 100).toFixed(1) : '0';
      console.log(`  ${name}:`);
      console.log(`    Count: ${ep.count} | Avg: ${Math.round(ep.avgLatency)}ms | Errors: ${ep.errorCount} (${errorPct}%)`);
    }

    console.log('');
    console.log('───────────────────────────────────────────────────────────────────');
    
    // Pass/Fail criteria
    const passed = metrics.errorRate < 5 && metrics.p95Latency < 2000;
    console.log(`  Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (!passed) {
      if (metrics.errorRate >= 5) {
        console.log(`    - Error rate ${metrics.errorRate}% exceeds 5% threshold`);
      }
      if (metrics.p95Latency >= 2000) {
        console.log(`    - P95 latency ${metrics.p95Latency}ms exceeds 2000ms threshold`);
      }
    }
    
    console.log('');
  }
}

// =====================================================
// MAIN
// =====================================================

async function main(): Promise<void> {
  try {
    const config = LoadTestRunner.parseArgs();
    const runner = new LoadTestRunner(config);
    const metrics = await runner.run();
    runner.printResults(metrics);

    // Exit with error if test failed
    const passed = metrics.errorRate < 5 && metrics.p95Latency < 2000;
    process.exit(passed ? 0 : 1);
  } catch (error) {
    console.error('Load test failed:', error);
    process.exit(1);
  }
}

main();
