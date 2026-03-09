/**
 * Dashboard Analytics Service Unit Tests
 * 
 * Tests for getPortfolioMetrics, getBudgetOverview, getTimelineStatus,
 * getProjectHealthScore, getBudgetVarianceAnalysis, getProgressTrend,
 * forecastCompletion, and getActiveAlerts.
 * 
 * Validates that:
 * - Correct column names are used (total_budget, deleted_at, actual_costs, etc.)
 * - Results are shaped correctly
 * - Edge cases (empty results, zero budgets) are handled
 */

import {
  getPortfolioMetrics,
  getBudgetOverview,
  getTimelineStatus,
  getProjectHealthScore,
  getBudgetVarianceAnalysis,
  getProgressTrend,
  forecastCompletion,
  getActiveAlerts,
} from '../../../src/services/project-management/dashboardAnalyticsService';

// The pool mock is set up in tests/setup.ts
const { pool } = require('../../../src/database');

// Helper to create a mock client
function createMockClient() {
  const client = {
    query: jest.fn(),
    release: jest.fn(),
  };
  (pool.connect as jest.Mock).mockResolvedValue(client);
  return client;
}

describe('DashboardAnalyticsService', () => {
  const ORG_ID = 'org-123';
  const PROJECT_ID = 'proj-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // getPortfolioMetrics
  // =========================================================================
  describe('getPortfolioMetrics', () => {
    it('should return portfolio metrics with correct shape', async () => {
      const client = createMockClient();

      // Summary query result
      client.query.mockResolvedValueOnce({
        rows: [{
          total_projects: '5',
          active_projects: '3',
          completed_projects: '1',
          on_hold_projects: '1',
          total_budget: '5000000',
          total_spent: '2500000',
          total_units: '120',
          average_progress: '45.5',
        }],
      });

      // By status
      client.query.mockResolvedValueOnce({
        rows: [
          { status: 'construction', count: '3', total_budget: '3000000', percent_of_total: '60.0' },
          { status: 'completed', count: '1', total_budget: '1000000', percent_of_total: '20.0' },
        ],
      });

      // By project type
      client.query.mockResolvedValueOnce({
        rows: [
          { project_type: 'residential', count: '3', total_budget: '3000000', average_progress: '50.0' },
        ],
      });

      // By region
      client.query.mockResolvedValueOnce({
        rows: [
          { region: 'Greater Accra', count: '4', total_budget: '4000000' },
        ],
      });

      // Monthly trends
      client.query.mockResolvedValueOnce({
        rows: [
          { month: '2024-01', projects_started: '1', projects_completed: '0', budget_allocated: '1000000' },
        ],
      });

      const result = await getPortfolioMetrics(ORG_ID);

      expect(result.summary.totalProjects).toBe(5);
      expect(result.summary.activeProjects).toBe(3);
      expect(result.summary.completedProjects).toBe(1);
      expect(result.summary.onHoldProjects).toBe(1);
      expect(result.summary.totalBudget).toBe(5000000);
      expect(result.summary.totalSpent).toBe(2500000);
      expect(result.summary.totalUnits).toBe(120);
      expect(result.summary.averageProgress).toBe(45.5);

      expect(result.byStatus).toHaveLength(2);
      expect(result.byStatus[0].status).toBe('construction');
      expect(result.byProjectType).toHaveLength(1);
      expect(result.byRegion).toHaveLength(1);
      expect(result.trends).toHaveLength(1);
    });

    it('should use correct column names in SQL queries', async () => {
      const client = createMockClient();

      // Provide minimal results for all queries
      const emptyRow = {
        total_projects: '0', active_projects: '0', completed_projects: '0',
        on_hold_projects: '0', total_budget: '0', total_spent: '0',
        total_units: '0', average_progress: '0',
      };
      client.query.mockResolvedValueOnce({ rows: [emptyRow] }); // summary
      client.query.mockResolvedValueOnce({ rows: [] }); // status
      client.query.mockResolvedValueOnce({ rows: [] }); // type
      client.query.mockResolvedValueOnce({ rows: [] }); // region
      client.query.mockResolvedValueOnce({ rows: [] }); // trends

      await getPortfolioMetrics(ORG_ID);

      // Verify first query (summary) uses correct column names
      const summaryQuery = client.query.mock.calls[0][0];
      expect(summaryQuery).toContain('dp.total_budget');
      expect(summaryQuery).toContain('dp.deleted_at IS NULL');
      expect(summaryQuery).toContain('pc.actual_costs');
      expect(summaryQuery).toContain('pp.progress');
      
      // Must NOT contain wrong column names
      expect(summaryQuery).not.toContain('dp.total_project_cost');
      expect(summaryQuery).not.toContain('dp.is_deleted');
      expect(summaryQuery).not.toContain('pc.actual_cost)');
      expect(summaryQuery).not.toContain('pp.progress_percentage');
    });

    it('should apply filters correctly', async () => {
      const client = createMockClient();
      const emptyRow = {
        total_projects: '0', active_projects: '0', completed_projects: '0',
        on_hold_projects: '0', total_budget: '0', total_spent: '0',
        total_units: '0', average_progress: '0',
      };
      client.query.mockResolvedValueOnce({ rows: [emptyRow] });
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });

      const filters = {
        projectTypes: ['residential'],
        statuses: ['construction'],
        regions: ['Greater Accra'],
      };

      await getPortfolioMetrics(ORG_ID, filters);

      // Verify filters are in the query params
      const params = client.query.mock.calls[0][1];
      expect(params).toContain(ORG_ID);
      expect(params).toContain(filters.projectTypes);
      expect(params).toContain(filters.statuses);
      expect(params).toContain(filters.regions);
    });

    it('should handle zero/null values gracefully', async () => {
      const client = createMockClient();
      const nullRow = {
        total_projects: null, active_projects: null, completed_projects: null,
        on_hold_projects: null, total_budget: null, total_spent: null,
        total_units: null, average_progress: null,
      };
      client.query.mockResolvedValueOnce({ rows: [nullRow] });
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });

      const result = await getPortfolioMetrics(ORG_ID);
      expect(result.summary.totalProjects).toBe(0);
      expect(result.summary.totalBudget).toBe(0);
      expect(result.summary.totalSpent).toBe(0);
    });

    it('should release the client even on error', async () => {
      const client = createMockClient();
      client.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(getPortfolioMetrics(ORG_ID)).rejects.toThrow('DB error');
      expect(client.release).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getBudgetOverview
  // =========================================================================
  describe('getBudgetOverview', () => {
    it('should return budget overview with correct shape', async () => {
      const client = createMockClient();

      // Summary
      client.query.mockResolvedValueOnce({
        rows: [{
          total_budget: '10000000',
          total_actual: '4000000',
          total_committed: '1000000',
        }],
      });

      // By category
      client.query.mockResolvedValueOnce({
        rows: [
          { category: 'Materials', budgeted: '3000000', actual: '2500000' },
          { category: 'Labor', budgeted: '5000000', actual: '1200000' },
        ],
      });

      // By project
      client.query.mockResolvedValueOnce({
        rows: [
          { project_id: 'p1', project_name: 'Towers', total_budget: '5000000', actual_cost: '2000000' },
        ],
      });

      // Monthly trend
      client.query.mockResolvedValueOnce({
        rows: [
          { month: '2024-01', budgeted: '500000', actual: '400000' },
          { month: '2024-02', budgeted: '600000', actual: '550000' },
        ],
      });

      const result = await getBudgetOverview(ORG_ID);

      expect(result.totalBudget).toBe(10000000);
      expect(result.totalActualCost).toBe(4000000);
      expect(result.totalCommitted).toBe(1000000);
      expect(result.totalRemaining).toBe(5000000);
      expect(result.overallVariance).toBe(-6000000);

      expect(result.byCategory).toHaveLength(2);
      expect(result.byCategory[0].category).toBe('Materials');
      expect(result.byCategory[0].variance).toBe(-500000);

      expect(result.byProject).toHaveLength(1);
      expect(result.byProject[0].status).toBe('under_budget');

      expect(result.monthlyTrend).toHaveLength(2);
      expect(result.monthlyTrend[1].cumulative).toBe(950000);
    });

    it('should use correct column names in budget queries', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{ total_budget: '0', total_actual: '0', total_committed: '0' }],
      });
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });

      await getBudgetOverview(ORG_ID);

      // Summary query
      const summarySQL = client.query.mock.calls[0][0];
      expect(summarySQL).toContain('dp.total_budget');
      expect(summarySQL).toContain('pc.actual_costs');
      expect(summarySQL).toContain('pc.original_budget');
      expect(summarySQL).toContain('dp.deleted_at IS NULL');
      expect(summarySQL).not.toContain('dp.total_project_cost');
      expect(summarySQL).not.toContain('pc.budgeted_cost');
      expect(summarySQL).not.toContain('dp.is_deleted');

      // Category query
      const catSQL = client.query.mock.calls[1][0];
      expect(catSQL).toContain('pc.category');
      expect(catSQL).toContain('pc.original_budget');
      expect(catSQL).toContain('pc.actual_costs');
      expect(catSQL).not.toContain('pc.cost_category');
      expect(catSQL).not.toContain('pc.budgeted_cost');
    });

    it('should classify project budget status correctly', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{ total_budget: '0', total_actual: '0', total_committed: '0' }],
      });
      client.query.mockResolvedValueOnce({ rows: [] });

      // Projects with different utilization levels
      client.query.mockResolvedValueOnce({
        rows: [
          { project_id: 'p1', project_name: 'Over', total_budget: '1000', actual_cost: '1200' },  // >100%
          { project_id: 'p2', project_name: 'Warn', total_budget: '1000', actual_cost: '950' },   // >90%
          { project_id: 'p3', project_name: 'OnBudget', total_budget: '1000', actual_cost: '700' }, // >50%
          { project_id: 'p4', project_name: 'Under', total_budget: '1000', actual_cost: '200' },  // <50%
        ],
      });

      client.query.mockResolvedValueOnce({ rows: [] });

      const result = await getBudgetOverview(ORG_ID);

      expect(result.byProject[0].status).toBe('over_budget');
      expect(result.byProject[1].status).toBe('warning');
      expect(result.byProject[2].status).toBe('on_budget');
      expect(result.byProject[3].status).toBe('under_budget');
    });
  });

  // =========================================================================
  // getTimelineStatus
  // =========================================================================
  describe('getTimelineStatus', () => {
    it('should use correct column names in timeline query', async () => {
      const client = createMockClient();

      // Project query
      client.query.mockResolvedValueOnce({ rows: [] });
      // Milestones
      client.query.mockResolvedValueOnce({ rows: [] });
      // Completions
      client.query.mockResolvedValueOnce({ rows: [] });

      await getTimelineStatus(ORG_ID);

      const projectSQL = client.query.mock.calls[0][0];
      expect(projectSQL).toContain('dp.estimated_completion_date');
      expect(projectSQL).toContain('pp.phase_number');
      expect(projectSQL).toContain('pp.progress');
      expect(projectSQL).toContain('dp.deleted_at IS NULL');

      expect(projectSQL).not.toContain('dp.expected_completion_date');
      expect(projectSQL).not.toContain('pp.sequence_order');
      expect(projectSQL).not.toContain('pp.progress_percentage');
      expect(projectSQL).not.toContain('dp.is_deleted');
    });

    it('should classify completed projects correctly', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [
          {
            project_id: 'p1',
            project_name: 'Done Project',
            planned_end_date: '2024-01-01',
            status: 'completed',
            current_phase: null,
            percent_complete: '100',
          },
        ],
      });
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });

      const result = await getTimelineStatus(ORG_ID);

      expect(result.completed).toBe(1);
      expect(result.projects[0].status).toBe('completed');
    });

    it('should return empty arrays when no projects exist', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });
      client.query.mockResolvedValueOnce({ rows: [] });

      const result = await getTimelineStatus(ORG_ID);

      expect(result.onTrack).toBe(0);
      expect(result.atRisk).toBe(0);
      expect(result.delayed).toBe(0);
      expect(result.projects).toEqual([]);
      expect(result.upcomingMilestones).toEqual([]);
      expect(result.recentCompletions).toEqual([]);
    });
  });

  // =========================================================================
  // getProjectHealthScore
  // =========================================================================
  describe('getProjectHealthScore', () => {
    it('should use correct column names', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{
          project_name: 'Test Project',
          status: 'construction',
          total_budget: '5000000',
          estimated_completion_date: '2025-12-31',
          overall_progress: '60',
          total_spent: '2000000',
        }],
      });
      // Permits
      client.query.mockResolvedValueOnce({
        rows: [{ expired: '0', expiring: '0', pending: '1' }],
      });
      // Milestones
      client.query.mockResolvedValueOnce({
        rows: [{ missed: '0', overdue: '0', on_time: '3', completed: '3' }],
      });

      const result = await getProjectHealthScore(PROJECT_ID, ORG_ID);

      // Verify SQL uses correct columns
      const sql = client.query.mock.calls[0][0];
      expect(sql).toContain('dp.total_budget');
      expect(sql).toContain('dp.estimated_completion_date');
      expect(sql).toContain('pp.progress');
      expect(sql).toContain('pc.actual_costs');

      expect(sql).not.toContain('dp.total_project_cost');
      expect(sql).not.toContain('dp.expected_completion_date');
      expect(sql).not.toContain('pp.progress_percentage');

      // Verify result shape
      expect(result.projectName).toBe('Test Project');
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.scheduleScore).toBeLessThanOrEqual(100);
      expect(result.budgetScore).toBeLessThanOrEqual(100);
    });

    it('should flag over-budget projects with critical risk', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{
          project_name: 'Over Budget',
          status: 'construction',
          total_budget: '1000000',
          estimated_completion_date: '2025-12-31',
          overall_progress: '50',
          total_spent: '1200000', // 120% utilization
        }],
      });
      client.query.mockResolvedValueOnce({
        rows: [{ expired: '0', expiring: '0', pending: '0' }],
      });
      client.query.mockResolvedValueOnce({
        rows: [{ missed: '0', overdue: '0', on_time: '0', completed: '0' }],
      });

      const result = await getProjectHealthScore(PROJECT_ID, ORG_ID);

      expect(result.budgetScore).toBeLessThan(100);
      const budgetRisk = result.riskFactors.find(r => r.factor === 'Budget Exceeded');
      expect(budgetRisk).toBeDefined();
      expect(budgetRisk!.severity).toBe('critical');
    });

    it('should throw when project not found', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        getProjectHealthScore('nonexistent', ORG_ID)
      ).rejects.toThrow('Project not found');
    });
  });

  // =========================================================================
  // getBudgetVarianceAnalysis
  // =========================================================================
  describe('getBudgetVarianceAnalysis', () => {
    it('should use correct column names for EVM analysis', async () => {
      const client = createMockClient();

      // Project budget
      client.query.mockResolvedValueOnce({
        rows: [{ total_budget: '5000000' }],
      });

      // Phases
      client.query.mockResolvedValueOnce({
        rows: [
          { phase_id: 'ph1', phase_name: 'Foundation', budgeted_cost: '1000000', actual_cost: '900000', progress: '100' },
          { phase_id: 'ph2', phase_name: 'Structure', budgeted_cost: '2000000', actual_cost: '1800000', progress: '60' },
        ],
      });

      // Cost categories
      client.query.mockResolvedValueOnce({
        rows: [
          { category: 'Materials', budgeted: '2000000', actual: '1800000' },
          { category: 'Labor', budgeted: '1500000', actual: '1400000' },
        ],
      });

      await getBudgetVarianceAnalysis(PROJECT_ID, ORG_ID);

      // Verify project query
      const projectSQL = client.query.mock.calls[0][0];
      expect(projectSQL).toContain('dp.total_budget');
      expect(projectSQL).not.toContain('dp.total_project_cost');

      // Verify phase query
      const phaseSQL = client.query.mock.calls[1][0];
      expect(phaseSQL).toContain('pp.budget');
      expect(phaseSQL).toContain('pc.actual_costs');
      expect(phaseSQL).toContain('pp.progress');
      expect(phaseSQL).toContain('pp.phase_number');
      expect(phaseSQL).not.toContain('pp.budgeted_cost');
      expect(phaseSQL).not.toContain('pp.sequence_order');
      expect(phaseSQL).not.toContain('pp.progress_percentage');

      // Verify category query
      const catSQL = client.query.mock.calls[2][0];
      expect(catSQL).toContain('pc.category');
      expect(catSQL).toContain('pc.original_budget');
      expect(catSQL).toContain('pc.actual_costs');
      expect(catSQL).not.toContain('pc.cost_category');
      expect(catSQL).not.toContain('pc.budgeted_cost');
    });

    it('should calculate CPI and SPI correctly', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{ total_budget: '1000' }],
      });
      client.query.mockResolvedValueOnce({
        rows: [{
          phase_id: 'ph1',
          phase_name: 'Phase 1',
          budgeted_cost: '1000',
          actual_cost: '500',
          progress: '50', // EV = 1000 * 0.5 = 500, CPI = 500/500 = 1.0
        }],
      });
      client.query.mockResolvedValueOnce({ rows: [] });

      const result = await getBudgetVarianceAnalysis(PROJECT_ID, ORG_ID);

      expect(result.summary.cpi).toBe(1.0);
      expect(result.summary.spi).toBe(0.5); // EV/PV = 500/1000
      expect(result.phases[0].costPerformanceIndex).toBe(1.0);
    });
  });

  // =========================================================================
  // getProgressTrend
  // =========================================================================
  describe('getProgressTrend', () => {
    it('should use correct column names', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{ current_progress: '50' }],
      });

      await getProgressTrend(ORG_ID, undefined, 'weekly');

      const sql = client.query.mock.calls[0][0];
      expect(sql).toContain('pp.progress');
      expect(sql).toContain('dp.deleted_at IS NULL');
      expect(sql).not.toContain('pp.progress_percentage');
      expect(sql).not.toContain('dp.is_deleted');
    });

    it('should use project-specific query when projectId is provided', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{ current_progress: '75' }],
      });

      await getProgressTrend(ORG_ID, PROJECT_ID, 'daily');

      const params = client.query.mock.calls[0][1];
      expect(params).toContain(PROJECT_ID);
    });

    it('should generate forecast data points', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{ current_progress: '50' }],
      });

      const result = await getProgressTrend(ORG_ID, undefined, 'weekly');

      expect(result.dataPoints.length).toBeGreaterThan(0);
      expect(result.forecast.length).toBe(4);
      expect(result.burndown.length).toBe(result.dataPoints.length);
    });
  });

  // =========================================================================
  // forecastCompletion
  // =========================================================================
  describe('forecastCompletion', () => {
    it('should use correct column names', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{
          estimated_completion_date: '2025-12-31',
          planned_start_date: '2024-01-01',
          current_progress: '50',
        }],
      });

      await forecastCompletion(PROJECT_ID, ORG_ID);

      const sql = client.query.mock.calls[0][0];
      expect(sql).toContain('dp.estimated_completion_date');
      expect(sql).toContain('dp.planned_start_date');
      expect(sql).toContain('pp.progress');
      expect(sql).not.toContain('dp.expected_completion_date');
      expect(sql).not.toContain('dp.project_start_date');
      expect(sql).not.toContain('pp.progress_percentage');
    });

    it('should handle completed projects', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{
          estimated_completion_date: '2024-12-31',
          planned_start_date: '2024-01-01',
          current_progress: '100',
        }],
      });

      const result = await forecastCompletion(PROJECT_ID, ORG_ID);

      expect(result.currentProgress).toBe(100);
      expect(result.confidence).toBe(100);
      expect(result.assumptions).toContain('Project is complete');
    });

    it('should handle zero progress with low confidence', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{
          estimated_completion_date: '2025-12-31',
          planned_start_date: null,
          current_progress: '0',
        }],
      });

      const result = await forecastCompletion(PROJECT_ID, ORG_ID);

      expect(result.currentProgress).toBe(0);
      expect(result.confidence).toBe(30);
    });

    it('should throw when project not found', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        forecastCompletion('nonexistent', ORG_ID)
      ).rejects.toThrow('Project not found');
    });
  });

  // =========================================================================
  // getActiveAlerts
  // =========================================================================
  describe('getActiveAlerts', () => {
    it('should return alerts with correct shape', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({
        rows: [{
          id: 'alert-1',
          project_id: PROJECT_ID,
          project_name: 'Test Project',
          alert_type: 'budget_warning',
          severity: 'warning',
          title: 'Budget Alert',
          message: 'Budget exceeding 90%',
          reference_type: null,
          reference_id: null,
          status: 'active',
          created_at: '2024-01-15',
          action_url: null,
          action_label: null,
        }],
      });

      const result = await getActiveAlerts(ORG_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('alert-1');
      expect(result[0].alertType).toBe('budget_warning');
      expect(result[0].severity).toBe('warning');
    });

    it('should apply projectId and severity filters', async () => {
      const client = createMockClient();
      client.query.mockResolvedValueOnce({ rows: [] });

      await getActiveAlerts(ORG_ID, {
        projectId: PROJECT_ID,
        severity: ['critical', 'error'],
        limit: 10,
      });

      const sql = client.query.mock.calls[0][0];
      const params = client.query.mock.calls[0][1];

      expect(sql).toContain('pa.project_id = $2');
      expect(sql).toContain('pa.severity = ANY($3)');
      expect(params).toEqual([ORG_ID, PROJECT_ID, ['critical', 'error']]);
    });
  });
});
