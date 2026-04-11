import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId } from '../middleware/pmAuth';
import {
  COLORS as C, PAGE, PDF, fmtGHS, titleCase, safeDate, ensureSpace,
  pdfCover, pdfPageHeader, pdfSection, pdfStatCards,
  pdfKeyValueGrid, pdfProgressBar, pdfTable, pdfInfoPanel,
  pdfBudgetBar, pdfBudgetLegend, pdfSeparator,
} from '../utils/pdfReportKit';

const router = Router();
registerPMParamValidation(router);

// ---------- PROJECT SUMMARY REPORT ----------
router.get('/projects/:projectId/reports/summary', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const orgId = getAuthOrgId(req);

    // Fetch project
    const projRes = await pool.query(
      `SELECT * FROM development_projects WHERE id = $1 AND organization_id = $2`, [projectId, orgId]
    );
    if (!projRes.rows.length) return res.status(404).json({ success: false, error: 'Project not found' });
    const project = projRes.rows[0];

    // Parallel queries
    const [costsRes, issuesRes, risksRes, meetingsRes, drawingsRes, contractorsRes] = await Promise.all([
      pool.query(`SELECT SUM(amount) as total_spent, COUNT(*) as count FROM project_costs WHERE project_id = $1`, [projectId]),
      pool.query(`SELECT status, COUNT(*) as count FROM project_issues WHERE project_id = $1 GROUP BY status`, [projectId]),
      pool.query(`SELECT status, risk_level, COUNT(*) as count FROM project_risks WHERE project_id = $1 GROUP BY status, risk_level`, [projectId]),
      pool.query(`SELECT COUNT(*) as count FROM project_meetings WHERE project_id = $1`, [projectId]),
      pool.query(`SELECT COUNT(*) as count, COUNT(*) FILTER (WHERE status = 'approved') as approved FROM project_drawings WHERE project_id = $1`, [projectId]),
      pool.query(`SELECT COUNT(*) as count FROM project_contractors WHERE project_id = $1`,[projectId]).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    const doc = PDF.create();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=project-summary-${projectId.slice(0, 8)}.pdf`);
    doc.pipe(res);

    // Cover page
    pdfCover(doc, {
      title: project.name || 'Project Summary',
      subtitle: 'Project Summary Report',
      reportType: 'PROJECT SUMMARY',
      meta: [
        `Status: ${titleCase(project.status)} | Location: ${project.location || project.address || 'N/A'}`,
        project.total_budget ? `Budget: ${fmtGHS(project.total_budget)}` : '',
      ].filter(Boolean) as string[],
    });

    // Project Info
    pdfSection(doc, 'Project Information');
    pdfKeyValueGrid(doc, [
      ['Project Name', project.name || 'N/A'],
      ['Status', titleCase(project.status)],
      ['Location', project.location || project.address || 'N/A'],
      ['Start Date', safeDate(project.start_date)],
      ['End Date', safeDate(project.end_date)],
      ['Total Budget', project.total_budget ? fmtGHS(project.total_budget) : 'Not set'],
    ]);

    // Financial Summary
    pdfSection(doc, 'Financial Summary');
    const spent = Number(costsRes.rows[0]?.total_spent || 0);
    const budget = Number(project.total_budget || 0);
    pdfStatCards(doc, [
      { label: 'Total Budget', value: budget ? fmtGHS(budget) : 'Not set', color: C.info },
      { label: 'Total Spent', value: fmtGHS(spent), color: C.heading },
      { label: 'Remaining', value: budget ? fmtGHS(budget - spent) : 'N/A', color: (budget - spent) >= 0 ? C.positive : C.negative },
      { label: 'Cost Entries', value: String(costsRes.rows[0]?.count || 0), color: C.muted },
    ]);
    if (budget > 0) pdfProgressBar(doc, 'Budget Utilization', spent, budget);

    // Issues & Risks Summary
    pdfSection(doc, 'Issues & Risks');
    const issueStats = issuesRes.rows;
    const totalIssues = issueStats.reduce((s: number, r: any) => s + Number(r.count), 0);
    const riskStats = risksRes.rows;
    const totalRisks = riskStats.reduce((s: number, r: any) => s + Number(r.count), 0);

    pdfStatCards(doc, [
      { label: 'Total Issues', value: String(totalIssues), color: totalIssues > 0 ? C.warning : C.positive },
      { label: 'Total Risks', value: String(totalRisks), color: totalRisks > 0 ? C.negative : C.positive },
    ]);

    if (issueStats.length > 0) {
      pdfTable(doc, ['Status', 'Count'],
        issueStats.map((r: any) => [titleCase(r.status), String(r.count)]),
        [PAGE.contentWidth * 0.6, PAGE.contentWidth * 0.4]);
    }
    if (riskStats.length > 0) {
      ensureSpace(doc, 60);
      pdfTable(doc, ['Risk Level', 'Status', 'Count'],
        riskStats.map((r: any) => [titleCase(r.risk_level), titleCase(r.status), String(r.count)]),
        [PAGE.contentWidth * 0.35, PAGE.contentWidth * 0.35, PAGE.contentWidth * 0.3]);
    }

    // Drawings & Meetings
    pdfSection(doc, 'Drawings & Meetings');
    pdfKeyValueGrid(doc, [
      ['Total Drawings', String(drawingsRes.rows[0]?.count || 0)],
      ['Approved Drawings', String(drawingsRes.rows[0]?.approved || 0)],
      ['Total Meetings', String(meetingsRes.rows[0]?.count || 0)],
      ['Active Contractors', String(contractorsRes.rows[0]?.count || 0)],
    ]);

    PDF.addFooters(doc);
    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// ---------- ISSUES & RISKS REPORT ----------
router.get('/projects/:projectId/reports/issues', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const orgId = getAuthOrgId(req);

    const projRes = await pool.query(`SELECT name FROM development_projects WHERE id = $1 AND organization_id = $2`, [projectId, orgId]);
    if (!projRes.rows.length) return res.status(404).json({ success: false, error: 'Project not found' });

    const [issuesRes, risksRes] = await Promise.all([
      pool.query(`SELECT * FROM project_issues WHERE project_id = $1 ORDER BY created_at DESC`, [projectId]),
      pool.query(`SELECT * FROM project_risks WHERE project_id = $1 ORDER BY created_at DESC`, [projectId]),
    ]);

    const doc = PDF.create();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=issues-report-${projectId.slice(0, 8)}.pdf`);
    doc.pipe(res);

    pdfCover(doc, {
      title: projRes.rows[0].name,
      subtitle: 'Issues & Risks Report',
      reportType: 'ISSUES & RISKS',
      meta: [
        `${issuesRes.rows.length} Issues | ${risksRes.rows.length} Risks`,
      ],
    });

    // Issues Table
    pdfSection(doc, `Issues (${issuesRes.rows.length})`);
    if (issuesRes.rows.length > 0) {
      pdfTable(doc, ['#', 'Title', 'Severity', 'Priority', 'Status', 'Due Date'], issuesRes.rows.map((r: any) => [
        r.issue_number || '-', (r.title || '').slice(0, 30), titleCase(r.severity), titleCase(r.priority), titleCase(r.status),
        r.due_date ? new Date(r.due_date).toLocaleDateString('en-GB') : '-',
      ]), [50, 135, 65, 60, 65, 70]);
    } else {
      pdfInfoPanel(doc, 'No issues found for this project.', 'success');
    }

    // Risks Table
    ensureSpace(doc, 100);
    pdfSection(doc, `Risks (${risksRes.rows.length})`);
    if (risksRes.rows.length > 0) {
      pdfTable(doc, ['#', 'Title', 'Level', 'Probability', 'Impact', 'Status'], risksRes.rows.map((r: any) => [
        r.risk_number || '-', (r.title || '').slice(0, 30), titleCase(r.risk_level), titleCase(r.probability), titleCase(r.impact), titleCase(r.status),
      ]), [50, 135, 60, 65, 60, 65]);
    } else {
      pdfInfoPanel(doc, 'No risks found for this project.', 'success');
    }

    PDF.addFooters(doc);
    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// ---------- MEETING MINUTES REPORT ----------
router.get('/projects/:projectId/reports/meeting/:meetingId', async (req: Request, res: Response) => {
  try {
    const { projectId, meetingId } = req.params;
    const orgId = getAuthOrgId(req);

    const projRes = await pool.query(`SELECT name FROM development_projects WHERE id = $1 AND organization_id = $2`, [projectId, orgId]);
    if (!projRes.rows.length) return res.status(404).json({ success: false, error: 'Project not found' });

    const [meetingRes, attendeesRes, actionsRes] = await Promise.all([
      pool.query(`SELECT * FROM project_meetings WHERE id = $1 AND project_id = $2`, [meetingId, projectId]),
      pool.query(`SELECT * FROM meeting_attendees WHERE meeting_id = $1 ORDER BY name`, [meetingId]),
      pool.query(`SELECT * FROM meeting_action_items WHERE meeting_id = $1 ORDER BY priority DESC`, [meetingId]),
    ]);

    if (!meetingRes.rows.length) return res.status(404).json({ success: false, error: 'Meeting not found' });
    const meeting = meetingRes.rows[0];

    const doc = PDF.create();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=meeting-${meeting.meeting_number}.pdf`);
    doc.pipe(res);

    pdfCover(doc, {
      title: meeting.title || 'Meeting Minutes',
      subtitle: `${meeting.meeting_number} — ${projRes.rows[0].name}`,
      reportType: 'MEETING MINUTES',
      meta: [
        `Date: ${safeDate(meeting.meeting_date)} | Type: ${titleCase(meeting.meeting_type || 'general')}`,
        `${attendeesRes.rows.length} Attendees | ${actionsRes.rows.length} Action Items`,
      ],
    });

    // Meeting details
    pdfSection(doc, 'Meeting Details');
    pdfKeyValueGrid(doc, [
      ['Title', meeting.title || 'N/A'],
      ['Type', titleCase(meeting.meeting_type || 'general')],
      ['Date', safeDate(meeting.meeting_date)],
      ['Time', meeting.start_time ? `${meeting.start_time}${meeting.end_time ? ` — ${meeting.end_time}` : ''}` : 'N/A'],
      ['Location', meeting.location || 'N/A'],
      ['Status', titleCase(meeting.status || 'scheduled')],
    ]);

    // Agenda
    if (meeting.agenda) {
      pdfSection(doc, 'Agenda');
      doc.font('Helvetica').fontSize(10).fill(C.body)
        .text(meeting.agenda, PAGE.margin, doc.y, { width: PAGE.contentWidth });
      doc.moveDown();
    }

    // Attendees
    pdfSection(doc, `Attendees (${attendeesRes.rows.length})`);
    if (attendeesRes.rows.length > 0) {
      pdfTable(doc, ['Name', 'Role', 'Company', 'Attended'], attendeesRes.rows.map((a: any) => [
        a.name || '-', a.role || '-', a.company || '-', a.attended ? 'Yes' : 'No',
      ]), [140, 100, 120, 60]);
    }

    // Notes
    if (meeting.notes) {
      ensureSpace(doc, 60);
      pdfSection(doc, 'Notes');
      doc.font('Helvetica').fontSize(10).fill(C.body)
        .text(meeting.notes, PAGE.margin, doc.y, { width: PAGE.contentWidth });
      doc.moveDown();
    }

    // Action Items
    ensureSpace(doc, 60);
    pdfSection(doc, `Action Items (${actionsRes.rows.length})`);
    if (actionsRes.rows.length > 0) {
      pdfTable(doc, ['Description', 'Assigned To', 'Due Date', 'Priority', 'Status'], actionsRes.rows.map((a: any) => [
        (a.description || '').slice(0, 40), a.assigned_to || '-',
        a.due_date ? new Date(a.due_date).toLocaleDateString('en-GB') : '-',
        titleCase(a.priority), titleCase(a.status),
      ]), [150, 80, 70, 60, 60]);
    } else {
      pdfInfoPanel(doc, 'No action items recorded for this meeting.', 'info');
    }

    PDF.addFooters(doc);
    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// ---------- BUDGET REPORT ----------
router.get('/projects/:projectId/reports/budget', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const orgId = getAuthOrgId(req);

    const projRes = await pool.query(`SELECT name, total_budget FROM development_projects WHERE id = $1 AND organization_id = $2`, [projectId, orgId]);
    if (!projRes.rows.length) return res.status(404).json({ success: false, error: 'Project not found' });
    const project = projRes.rows[0];

    const costsRes = await pool.query(
      `SELECT category, SUM(amount) as total, COUNT(*) as entries FROM project_costs WHERE project_id = $1 GROUP BY category ORDER BY total DESC`,
      [projectId]
    );

    const doc = PDF.create();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=budget-report-${projectId.slice(0, 8)}.pdf`);
    doc.pipe(res);

    const totalSpent = costsRes.rows.reduce((s: number, r: any) => s + Number(r.total), 0);
    const budget = Number(project.total_budget || 0);

    pdfCover(doc, {
      title: project.name,
      subtitle: 'Budget Report',
      reportType: 'BUDGET REPORT',
      meta: [
        budget ? `Budget: ${fmtGHS(budget)} | Spent: ${fmtGHS(totalSpent)}` : `Total Spent: ${fmtGHS(totalSpent)}`,
        budget ? `Utilization: ${((totalSpent / budget) * 100).toFixed(1)}%` : '',
      ].filter(Boolean) as string[],
    });

    pdfSection(doc, 'Budget Overview');
    pdfStatCards(doc, [
      { label: 'Total Budget', value: budget ? fmtGHS(budget) : 'Not set', color: C.info },
      { label: 'Total Spent', value: fmtGHS(totalSpent), color: C.heading },
      { label: 'Remaining', value: budget ? fmtGHS(budget - totalSpent) : 'N/A', color: (budget - totalSpent) >= 0 ? C.positive : C.negative },
    ]);
    if (budget > 0) pdfProgressBar(doc, 'Budget Utilization', totalSpent, budget);

    pdfSection(doc, 'Spending by Category');
    if (costsRes.rows.length > 0) {
      // Visual budget bars per category
      costsRes.rows.forEach((r: any) => {
        pdfBudgetBar(doc, titleCase(r.category || 'Uncategorized'), budget > 0 ? (Number(r.total) / budget) * budget : Number(r.total), Number(r.total));
      });
      pdfSeparator(doc);

      // Detailed table
      pdfTable(doc, ['Category', 'Total Spent', 'Entries', '% of Total'], costsRes.rows.map((r: any) => [
        titleCase(r.category || 'Uncategorized'), fmtGHS(r.total),
        String(r.entries), totalSpent > 0 ? `${((Number(r.total) / totalSpent) * 100).toFixed(1)}%` : '0%',
      ]), [160, 120, 60, 80]);
    } else {
      pdfInfoPanel(doc, 'No cost entries found for this project.', 'info');
    }

    PDF.addFooters(doc);
    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

export default router;
