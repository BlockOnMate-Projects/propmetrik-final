/**
 * Analytics Routes
 * Advanced analytics endpoints
 * Phase 5.12: Advanced Analytics & Mobile
 */

import { Router, Request, Response } from 'express';
import { advancedAnalyticsService } from '../../shared-services/analytics';
import { logger } from '../utils/logger';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const router = Router();

// Middleware to get user context
const getUserContext = (req: Request) => {
  const userId = req.headers['x-user-id'] as string || 'anonymous';
  const organizationId = req.headers['x-organization-id'] as string || 'default';
  return { userId, organizationId };
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
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=analytics-report-${new Date().toISOString().split('T')[0]}.pdf`
    );
    
    // Pipe to response
    doc.pipe(res);
    
    // Header
    doc
      .fontSize(24)
      .text('PROPMETRIK Analytics Report', { align: 'center' })
      .moveDown(0.5);
    
    doc
      .fontSize(10)
      .fillColor('#666')
      .text(`Generated on ${new Date().toLocaleDateString()}`, { align: 'center' })
      .moveDown(2);
    
    // Summary Section
    doc
      .fontSize(16)
      .fillColor('#000')
      .text('Monthly Summary', { underline: true })
      .moveDown(0.5);
    
    doc
      .fontSize(12)
      .text(`This Month: ${summary.thisMonth.deals} deals | $${summary.thisMonth.value.toLocaleString()} | ${summary.thisMonth.winRate}% win rate`)
      .moveDown(0.3)
      .text(`Last Month: ${summary.lastMonth.deals} deals | $${summary.lastMonth.value.toLocaleString()} | ${summary.lastMonth.winRate}% win rate`)
      .moveDown(0.3)
      .text(`Pipeline: ${summary.pipeline.totalDeals} active deals worth $${summary.pipeline.totalValue.toLocaleString()}`)
      .moveDown(1.5);
    
    // Cohort Analysis
    doc
      .fontSize(16)
      .text('Cohort Analysis (Last 6 Months)', { underline: true })
      .moveDown(0.5);
    
    // Simple table
    const tableTop = doc.y;
    const itemHeight = 20;
    
    // Headers
    doc
      .fontSize(10)
      .text('Cohort', 50, tableTop)
      .text('Deals', 130, tableTop)
      .text('Won', 180, tableTop)
      .text('Win Rate', 230, tableTop)
      .text('Value', 300, tableTop)
      .text('Avg Cycle', 380, tableTop);
    
    doc.moveTo(50, tableTop + 15).lineTo(450, tableTop + 15).stroke();
    
    // Data rows
    cohorts.slice(0, 6).forEach((cohort, i) => {
      const y = tableTop + 20 + (i * itemHeight);
      doc
        .fontSize(9)
        .text(cohort.cohort, 50, y)
        .text(cohort.totalDeals.toString(), 130, y)
        .text(cohort.wonDeals.toString(), 180, y)
        .text(`${cohort.winRate}%`, 230, y)
        .text(`$${cohort.totalValue.toLocaleString()}`, 300, y)
        .text(`${cohort.avgCycleTime}d`, 380, y);
    });
    
    // Footer
    doc
      .fontSize(8)
      .fillColor('#999')
      .text('PROPMETRIK - Real Estate Intelligence Platform', 50, 750, { align: 'center' });
    
    doc.end();
    
  } catch (error) {
    logger.error('Failed to export PDF', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to export PDF' });
  }
});

export default router;
