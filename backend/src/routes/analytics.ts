/**
 * Analytics Routes
 * Advanced analytics endpoints
 * Phase 5.12: Advanced Analytics & Mobile
 */

import { Router, Request, Response } from 'express';
import { advancedAnalyticsService } from '../../shared-services/analytics';
import { logger } from '../utils/logger';
import ExcelJS from 'exceljs';
import {
  COLORS as C, PAGE, PDF, fmtGHS,
  pdfCover, pdfSection, pdfStatCards, pdfTable, pdfSeparator,
} from '../utils/pdfReportKit';

const router = Router();

// Middleware to get user context from authenticated request
const getUserContext = (req: Request) => {
  const user = (req as any).user;
  const userId = user?.id || user?.sub || (req.headers['x-user-id'] as string);
  const organizationId = user?.organizationId || user?.organization_id || (req.headers['x-organization-id'] as string);
  if (!organizationId) throw new Error('Organization ID required');
  return { userId: userId || 'unknown', organizationId };
};

/**
 * @route GET /api/v1/analytics/dashboard
 * @desc Get analytics dashboard summary
 * @access Private
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const summary = await advancedAnalyticsService.getDashboardSummary(organizationId);
    
    res.json({ success: true, data: summary });
  } catch (error) {
    logger.error('Failed to get dashboard summary', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get dashboard summary' });
  }
});

/**
 * @route GET /api/v1/analytics/cohorts
 * @desc Get cohort analysis
 * @access Private
 */
router.get('/cohorts', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const { groupBy, pipelineId, startDate, endDate } = req.query;
    
    const cohorts = await advancedAnalyticsService.getCohortAnalysis(
      organizationId,
      (groupBy as 'month' | 'quarter' | 'source' | 'agent') || 'month',
      pipelineId as string,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );
    
    res.json({ success: true, data: cohorts });
  } catch (error) {
    logger.error('Failed to get cohort analysis', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get cohort analysis' });
  }
});

/**
 * @route GET /api/v1/analytics/win-loss
 * @desc Get win/loss analysis
 * @access Private
 */
router.get('/win-loss', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const { period, pipelineId } = req.query;
    
    const analysis = await advancedAnalyticsService.getWinLossAnalysis(
      organizationId,
      (period as 'week' | 'month' | 'quarter' | 'year') || 'month',
      pipelineId as string
    );
    
    res.json({ success: true, data: analysis });
  } catch (error) {
    logger.error('Failed to get win/loss analysis', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get win/loss analysis' });
  }
});

/**
 * @route GET /api/v1/analytics/funnel/:pipelineId
 * @desc Get sales funnel analysis
 * @access Private
 */
router.get('/funnel/:pipelineId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const { pipelineId } = req.params;
    const { startDate, endDate } = req.query;
    
    const funnel = await advancedAnalyticsService.getFunnelAnalysis(
      organizationId,
      pipelineId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );
    
    if (!funnel) {
      res.status(404).json({ success: false, error: 'Pipeline not found' });
      return;
    }
    res.json({ success: true, data: funnel });
  } catch (error) {
    logger.error('Failed to get funnel analysis', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get funnel analysis' });
  }
});

/**
 * @route GET /api/v1/analytics/velocity
 * @desc Get deal velocity metrics
 * @access Private
 */
router.get('/velocity', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const { pipelineId } = req.query;
    
    const velocity = await advancedAnalyticsService.getDealVelocity(
      organizationId,
      pipelineId as string
    );
    
    res.json({ success: true, data: velocity });
  } catch (error) {
    logger.error('Failed to get deal velocity', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get deal velocity' });
  }
});

/**
 * @route GET /api/v1/analytics/lead-sources
 * @desc Get lead source analysis
 * @access Private
 */
router.get('/lead-sources', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const { startDate, endDate } = req.query;
    
    const sources = await advancedAnalyticsService.getLeadSourceAnalysis(
      organizationId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );
    
    res.json({ success: true, data: sources });
  } catch (error) {
    logger.error('Failed to get lead source analysis', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get lead source analysis' });
  }
});

/**
 * @route GET /api/v1/analytics/agent-performance
 * @desc Get agent performance leaderboard
 * @access Private
 */
router.get('/agent-performance', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const { period } = req.query;
    
    const performance = await advancedAnalyticsService.getAgentPerformance(
      organizationId,
      (period as 'week' | 'month' | 'quarter' | 'year') || 'month'
    );
    
    res.json({ success: true, data: performance });
  } catch (error) {
    logger.error('Failed to get agent performance', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get agent performance' });
  }
});

/**
 * @route GET /api/v1/analytics/export/excel
 * @desc Export analytics data as Excel
 * @access Private
 */
router.get('/export/excel', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const { type } = req.query;
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PROPMETRIK';
    workbook.created = new Date();
    
    // Get data based on type
    if (type === 'cohorts' || !type) {
      const cohorts = await advancedAnalyticsService.getCohortAnalysis(organizationId);
      const sheet = workbook.addWorksheet('Cohort Analysis');
      sheet.columns = [
        { header: 'Cohort', key: 'cohort', width: 15 },
        { header: 'Total Deals', key: 'totalDeals', width: 12 },
        { header: 'Won Deals', key: 'wonDeals', width: 12 },
        { header: 'Lost Deals', key: 'lostDeals', width: 12 },
        { header: 'Active Deals', key: 'activeDeals', width: 12 },
        { header: 'Win Rate (%)', key: 'winRate', width: 12 },
        { header: 'Total Value', key: 'totalValue', width: 15 },
        { header: 'Avg Deal Size', key: 'avgDealSize', width: 15 },
        { header: 'Avg Cycle Time (days)', key: 'avgCycleTime', width: 18 },
      ];
      cohorts.forEach(c => sheet.addRow(c));
    }
    
    if (type === 'win-loss' || !type) {
      const winLoss = await advancedAnalyticsService.getWinLossAnalysis(organizationId);
      const sheet = workbook.addWorksheet('Win-Loss Analysis');
      sheet.columns = [
        { header: 'Period', key: 'period', width: 12 },
        { header: 'Won Count', key: 'wonCount', width: 12 },
        { header: 'Won Value', key: 'wonValue', width: 15 },
        { header: 'Lost Count', key: 'lostCount', width: 12 },
        { header: 'Lost Value', key: 'lostValue', width: 15 },
        { header: 'Win Rate (%)', key: 'winRate', width: 12 },
        { header: 'Avg Time to Win', key: 'avgTimeToWin', width: 15 },
        { header: 'Avg Time to Loss', key: 'avgTimeToLoss', width: 15 },
      ];
      winLoss.forEach(w => sheet.addRow({
        period: w.period,
        wonCount: w.won.count,
        wonValue: w.won.value,
        lostCount: w.lost.count,
        lostValue: w.lost.value,
        winRate: w.winRate,
        avgTimeToWin: w.avgTimeToWin,
        avgTimeToLoss: w.avgTimeToLoss,
      }));
    }
    
    if (type === 'lead-sources' || !type) {
      const sources = await advancedAnalyticsService.getLeadSourceAnalysis(organizationId);
      const sheet = workbook.addWorksheet('Lead Sources');
      sheet.columns = [
        { header: 'Source', key: 'source', width: 20 },
        { header: 'Total Deals', key: 'dealsCount', width: 12 },
        { header: 'Won Deals', key: 'wonDeals', width: 12 },
        { header: 'Lost Deals', key: 'lostDeals', width: 12 },
        { header: 'Win Rate (%)', key: 'winRate', width: 12 },
        { header: 'Total Value', key: 'totalValue', width: 15 },
        { header: 'Avg Deal Size', key: 'avgDealSize', width: 15 },
      ];
      sources.forEach(s => sheet.addRow(s));
    }
    
    if (type === 'agents' || !type) {
      const agents = await advancedAnalyticsService.getAgentPerformance(organizationId);
      const sheet = workbook.addWorksheet('Agent Performance');
      sheet.columns = [
        { header: 'Agent', key: 'agentName', width: 20 },
        { header: 'Won Deals', key: 'dealsWon', width: 12 },
        { header: 'Lost Deals', key: 'dealsLost', width: 12 },
        { header: 'Win Rate (%)', key: 'winRate', width: 12 },
        { header: 'Total Value', key: 'totalValue', width: 15 },
        { header: 'Avg Deal Size', key: 'avgDealSize', width: 15 },
        { header: 'Avg Cycle Time', key: 'avgCycleTime', width: 15 },
        { header: 'Activities', key: 'activitiesCount', width: 12 },
        { header: 'Tasks Completed', key: 'tasksCompleted', width: 15 },
      ];
      agents.forEach(a => sheet.addRow(a));
    }
    
    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=analytics-report-${new Date().toISOString().split('T')[0]}.xlsx`
    );
    
    // Write to response
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    logger.error('Failed to export Excel', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to export Excel' });
  }
});

/**
 * @route GET /api/v1/analytics/export/pdf
 * @desc Export analytics summary as PDF
 * @access Private
 */
router.get('/export/pdf', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    
    // Get summary data
    const summary = await advancedAnalyticsService.getDashboardSummary(organizationId);
    const cohorts = await advancedAnalyticsService.getCohortAnalysis(organizationId);
    
    // Create PDF
    const doc = PDF.create();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=analytics-report-${new Date().toISOString().split('T')[0]}.pdf`
    );
    
    // Pipe to response
    doc.pipe(res);
    
    // Cover page
    pdfCover(doc, {
      title: 'Analytics Report',
      subtitle: 'Platform Performance Summary',
      reportType: 'ANALYTICS',
      meta: [
        `${summary.thisMonth.deals} deals this month | ${summary.pipeline.totalDeals} in pipeline`,
        `Pipeline Value: $${summary.pipeline.totalValue.toLocaleString()}`,
      ],
    });
    
    // Summary Section
    pdfSection(doc, 'Monthly Summary');
    pdfStatCards(doc, [
      { label: 'This Month Deals', value: String(summary.thisMonth.deals), color: C.info },
      { label: 'This Month Value', value: `$${summary.thisMonth.value.toLocaleString()}`, color: C.positive },
      { label: 'Win Rate', value: `${summary.thisMonth.winRate}%`, color: C.warning },
      { label: 'Pipeline Deals', value: String(summary.pipeline.totalDeals), color: C.heading },
    ]);

    doc.moveDown(0.5);
    pdfTable(doc, ['Period', 'Deals', 'Value', 'Win Rate'],
      [
        ['This Month', String(summary.thisMonth.deals), `$${summary.thisMonth.value.toLocaleString()}`, `${summary.thisMonth.winRate}%`],
        ['Last Month', String(summary.lastMonth.deals), `$${summary.lastMonth.value.toLocaleString()}`, `${summary.lastMonth.winRate}%`],
        ['Pipeline', String(summary.pipeline.totalDeals), `$${summary.pipeline.totalValue.toLocaleString()}`, '-'],
      ],
      [PAGE.contentWidth * 0.3, PAGE.contentWidth * 0.2, PAGE.contentWidth * 0.3, PAGE.contentWidth * 0.2]);

    pdfSeparator(doc);
    
    // Cohort Analysis
    pdfSection(doc, 'Cohort Analysis (Last 6 Months)');
    
    const cohortRows = cohorts.slice(0, 6).map((cohort) => [
      cohort.cohort,
      String(cohort.totalDeals),
      String(cohort.wonDeals),
      `${cohort.winRate}%`,
      `$${cohort.totalValue.toLocaleString()}`,
      `${cohort.avgCycleTime}d`,
    ]);

    pdfTable(doc,
      ['Cohort', 'Deals', 'Won', 'Win Rate', 'Value', 'Avg Cycle'],
      cohortRows,
      [PAGE.contentWidth * 0.2, PAGE.contentWidth * 0.12, PAGE.contentWidth * 0.12, PAGE.contentWidth * 0.15, PAGE.contentWidth * 0.25, PAGE.contentWidth * 0.16]);
    
    PDF.addFooters(doc);
    doc.end();
    
  } catch (error) {
    logger.error('Failed to export PDF', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to export PDF' });
  }
});

export default router;
