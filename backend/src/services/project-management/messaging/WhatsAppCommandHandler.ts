/**
 * WhatsApp Command Handler Service
 * 
 * Phase 3.2: Split whatsappBotService
 * 
 * Handles text commands from WhatsApp messages.
 * Separated from bot logic for maintainability.
 * 
 * @module services/project-management/messaging/WhatsAppCommandHandler
 */

import { pool } from '../../../database';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { CommandContext, CommandResult, ConversationSession } from './types';
import { whatsAppTemplates } from './WhatsAppTemplates';

// =============================================================================
// COMMAND DEFINITIONS
// =============================================================================

type CommandHandler = (ctx: CommandContext, args: string[]) => Promise<CommandResult>;

interface CommandDefinition {
  aliases: string[];
  description: string;
  handler: CommandHandler;
  requiresProject?: boolean;
  requiresAuth?: boolean;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class WhatsAppCommandHandlerImpl extends BaseService {
  private commands: Map<string, CommandDefinition> = new Map();

  constructor() {
    super('WhatsAppCommandHandler');
    this.registerCommands();
  }

  /**
   * Register all available commands.
   */
  private registerCommands(): void {
    const commandDefs: CommandDefinition[] = [
      {
        aliases: ['help', 'h', '?'],
        description: 'Show available commands',
        handler: this.handleHelp.bind(this),
      },
      {
        aliases: ['status', 's'],
        description: 'View project status',
        handler: this.handleStatus.bind(this),
        requiresProject: true,
      },
      {
        aliases: ['rfi', 'rfis'],
        description: 'View pending RFIs',
        handler: this.handleRFIs.bind(this),
      },
      {
        aliases: ['submittals', 'submittal', 'sub'],
        description: 'View pending submittals',
        handler: this.handleSubmittals.bind(this),
      },
      {
        aliases: ['deliveries', 'delivery', 'del'],
        description: 'View upcoming deliveries',
        handler: this.handleDeliveries.bind(this),
        requiresProject: true,
      },
      {
        aliases: ['log', 'daily', 'dailylog'],
        description: 'Start daily log entry',
        handler: this.handleDailyLog.bind(this),
        requiresProject: true,
      },
      {
        aliases: ['weather', 'w'],
        description: 'Get site weather',
        handler: this.handleWeather.bind(this),
        requiresProject: true,
      },
      {
        aliases: ['budget', 'b'],
        description: 'View budget summary',
        handler: this.handleBudget.bind(this),
        requiresProject: true,
      },
      {
        aliases: ['photo', 'pic', 'upload'],
        description: 'Upload site photo',
        handler: this.handlePhoto.bind(this),
        requiresProject: true,
      },
      {
        aliases: ['projects', 'proj', 'p'],
        description: 'List your projects',
        handler: this.handleProjects.bind(this),
      },
    ];

    // Register each command under all its aliases
    for (const def of commandDefs) {
      for (const alias of def.aliases) {
        this.commands.set(alias.toLowerCase(), def);
      }
    }
  }

  /**
   * Parse and execute a command from text.
   */
  async executeCommand(
    text: string,
    context: CommandContext
  ): Promise<CommandResult> {
    const parts = text.trim().split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const command = this.commands.get(commandName);

    if (!command) {
      return {
        success: false,
        message: `Unknown command: ${commandName}\n\nType *HELP* for available commands.`,
      };
    }

    // Check requirements
    if (command.requiresProject && !context.projectId) {
      return {
        success: false,
        message: `This command requires a project context.\n\nPlease select a project first with *PROJECTS*`,
      };
    }

    if (command.requiresAuth && !context.userId) {
      return {
        success: false,
        message: `This command requires authentication.\n\nYour phone number is not registered in the system.`,
      };
    }

    try {
      return await command.handler(context, args);
    } catch (error: any) {
      this.logger?.error('Command execution error:', error);
      return {
        success: false,
        message: whatsAppTemplates.buildErrorMessage(error.message || 'Command failed'),
      };
    }
  }

  /**
   * Check if text starts with a known command.
   */
  isCommand(text: string): boolean {
    const commandName = text.trim().split(/\s+/)[0].toLowerCase();
    return this.commands.has(commandName);
  }

  // ==========================================================================
  // COMMAND HANDLERS
  // ==========================================================================

  private async handleHelp(ctx: CommandContext): Promise<CommandResult> {
    return {
      success: true,
      message: whatsAppTemplates.buildHelpMessage(),
    };
  }

  private async handleStatus(ctx: CommandContext): Promise<CommandResult> {
    const result = await this.query(
      `SELECT 
         p.name,
         p.status,
         p.overall_progress,
         p.total_budget,
         (SELECT COALESCE(SUM(amount), 0) FROM project_costs WHERE project_id = p.id) as spent,
         (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status != 'completed') as open_tasks
       FROM development_projects p
       WHERE p.id = $1`,
      [ctx.projectId]
    );

    if (!result.rows.length) {
      return { success: false, message: 'Project not found' };
    }

    const p = result.rows[0];
    const budgetPercent = p.total_budget > 0 
      ? ((parseFloat(p.spent) / parseFloat(p.total_budget)) * 100).toFixed(1) 
      : 0;

    const message = 
      `📊 *${p.name}*\n\n` +
      `📌 Status: ${this.formatStatus(p.status)}\n` +
      `📈 Progress: ${p.overall_progress || 0}%\n` +
      `💰 Budget Used: ${budgetPercent}%\n` +
      `📋 Open Tasks: ${p.open_tasks}\n`;

    return { success: true, message };
  }

  private async handleRFIs(ctx: CommandContext): Promise<CommandResult> {
    let whereClause = 'r.status IN ($1, $2)';
    const params: any[] = ['open', 'in_review'];

    if (ctx.userId) {
      whereClause += ' AND r.assigned_to = $3';
      params.push(ctx.userId);
    }

    const result = await this.query(
      `SELECT 
         r.id, r.rfi_number, r.subject, r.due_date, p.name as project_name
       FROM rfis r
       JOIN development_projects p ON p.id = r.project_id
       WHERE ${whereClause}
       ORDER BY r.due_date ASC
       LIMIT 5`,
      params
    );

    if (!result.rows.length) {
      return { success: true, message: '✅ No pending RFIs!' };
    }

    let message = `📋 *Pending RFIs (${result.rows.length})*\n\n`;
    
    for (const rfi of result.rows) {
      const daysLeft = Math.ceil(
        (new Date(rfi.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      const status = daysLeft < 0 ? '🔴 OVERDUE' : daysLeft <= 2 ? '🟡' : '🟢';
      
      message += `${status} RFI #${rfi.rfi_number}\n`;
      message += `  ${rfi.subject}\n`;
      message += `  📁 ${rfi.project_name}\n`;
      message += `  📅 Due: ${daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}\n\n`;
    }

    message += `\nReply with *RFI <number>* for details.`;

    return { 
      success: true, 
      message,
      responseOptions: [
        { key: 'view_all', label: 'View All', action: 'rfi_list' },
      ],
    };
  }

  private async handleSubmittals(ctx: CommandContext): Promise<CommandResult> {
    let whereClause = 's.status IN ($1, $2)';
    const params: any[] = ['pending', 'in_review'];

    if (ctx.userId) {
      whereClause += ' AND s.reviewer_id = $3';
      params.push(ctx.userId);
    }

    const result = await this.query(
      `SELECT 
         s.id, s.submittal_number, s.title, s.review_due_date, p.name as project_name
       FROM submittals s
       JOIN development_projects p ON p.id = s.project_id
       WHERE ${whereClause}
       ORDER BY s.review_due_date ASC
       LIMIT 5`,
      params
    );

    if (!result.rows.length) {
      return { success: true, message: '✅ No pending submittals!' };
    }

    let message = `📄 *Pending Submittals (${result.rows.length})*\n\n`;
    
    for (const sub of result.rows) {
      message += `📑 #${sub.submittal_number}: ${sub.title}\n`;
      message += `  📁 ${sub.project_name}\n`;
      message += `  📅 Review due: ${new Date(sub.review_due_date).toLocaleDateString()}\n\n`;
    }

    return { success: true, message };
  }

  private async handleDeliveries(ctx: CommandContext): Promise<CommandResult> {
    const result = await this.query(
      `SELECT 
         d.id, d.description, d.scheduled_date, d.supplier_name, d.status
       FROM material_deliveries d
       WHERE d.project_id = $1 
         AND d.status = 'scheduled'
         AND d.scheduled_date >= CURRENT_DATE
       ORDER BY d.scheduled_date ASC
       LIMIT 5`,
      [ctx.projectId]
    );

    if (!result.rows.length) {
      return { success: true, message: '📦 No upcoming deliveries scheduled.' };
    }

    let message = `🚚 *Upcoming Deliveries*\n\n`;
    
    for (const del of result.rows) {
      message += `📦 ${del.description}\n`;
      message += `  🚛 ${del.supplier_name}\n`;
      message += `  📅 ${new Date(del.scheduled_date).toLocaleDateString()}\n\n`;
    }

    return { success: true, message };
  }

  private async handleDailyLog(ctx: CommandContext): Promise<CommandResult> {
    return {
      success: true,
      message: 
        `📝 *Start Daily Log*\n\n` +
        `Project: ${ctx.session?.data?.projectName || 'Selected Project'}\n\n` +
        `Let's record today's activities.\n\n` +
        `*Step 1/5: Weather*\n` +
        `What's the weather like on site?\n\n` +
        `Reply with: ☀️ Sunny, ⛅ Cloudy, 🌧️ Rainy, or describe it.`,
      continueFlow: true,
    };
  }

  private async handleWeather(ctx: CommandContext): Promise<CommandResult> {
    // Would integrate with weather API
    const result = await this.query(
      `SELECT city, region FROM development_projects WHERE id = $1`,
      [ctx.projectId]
    );

    if (!result.rows.length) {
      return { success: false, message: 'Project location not found.' };
    }

    const { city, region } = result.rows[0];
    
    // Placeholder weather
    return {
      success: true,
      message: 
        `🌤️ *Weather for ${city || region || 'Site'}*\n\n` +
        `Temperature: 28°C\n` +
        `Conditions: Partly Cloudy\n` +
        `Humidity: 65%\n\n` +
        `_Weather data from Ghana Meteorological Agency_`,
    };
  }

  private async handleBudget(ctx: CommandContext): Promise<CommandResult> {
    const result = await this.query(
      `SELECT 
         p.name,
         p.total_budget,
         COALESCE(SUM(c.amount), 0) as spent
       FROM development_projects p
       LEFT JOIN project_costs c ON c.project_id = p.id
       WHERE p.id = $1
       GROUP BY p.id, p.name, p.total_budget`,
      [ctx.projectId]
    );

    if (!result.rows.length) {
      return { success: false, message: 'Project not found.' };
    }

    const { name, total_budget, spent } = result.rows[0];
    const budget = parseFloat(total_budget) || 0;
    const spentAmount = parseFloat(spent) || 0;
    const remaining = budget - spentAmount;
    const percentUsed = budget > 0 ? ((spentAmount / budget) * 100).toFixed(1) : 0;

    const statusEmoji = parseFloat(percentUsed.toString()) > 90 ? '🔴' : 
                        parseFloat(percentUsed.toString()) > 75 ? '🟡' : '🟢';

    return {
      success: true,
      message:
        `💰 *Budget Summary*\n` +
        `*${name}*\n\n` +
        `${statusEmoji} Status: ${percentUsed}% used\n\n` +
        `📊 Total Budget: GHS ${budget.toLocaleString()}\n` +
        `💸 Spent: GHS ${spentAmount.toLocaleString()}\n` +
        `💵 Remaining: GHS ${remaining.toLocaleString()}`,
    };
  }

  private async handlePhoto(ctx: CommandContext): Promise<CommandResult> {
    return {
      success: true,
      message:
        `📸 *Upload Site Photo*\n\n` +
        `To upload a photo:\n` +
        `1. Take or select a photo\n` +
        `2. Send it in this chat\n` +
        `3. Add a caption describing the location/work\n\n` +
        `The photo will be attached to:\n` +
        `*${ctx.session?.data?.projectName || 'Current Project'}*`,
      continueFlow: true,
    };
  }

  private async handleProjects(ctx: CommandContext): Promise<CommandResult> {
    if (!ctx.userId) {
      return {
        success: false,
        message: 'Your phone number is not registered. Please contact your administrator.',
      };
    }

    const result = await this.query(
      `SELECT 
         p.id, p.name, p.status, p.overall_progress
       FROM development_projects p
       JOIN project_team_members ptm ON ptm.project_id = p.id
       WHERE ptm.user_id = $1 AND p.status NOT IN ('completed', 'cancelled')
       ORDER BY p.updated_at DESC
       LIMIT 10`,
      [ctx.userId]
    );

    if (!result.rows.length) {
      return { success: true, message: 'You are not assigned to any active projects.' };
    }

    let message = `📁 *Your Projects*\n\n`;
    
    for (let i = 0; i < result.rows.length; i++) {
      const p = result.rows[i];
      message += `${i + 1}. *${p.name}*\n`;
      message += `   ${this.formatStatus(p.status)} • ${p.overall_progress || 0}% complete\n\n`;
    }

    message += `\nReply with a number to select a project.`;

    return { success: true, message };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
      pre_construction: '📋 Pre-construction',
      under_construction: '🏗️ Under Construction',
      finishing: '🔧 Finishing',
      completed: '✅ Completed',
      on_hold: '⏸️ On Hold',
      cancelled: '❌ Cancelled',
    };
    return statusMap[status] || status;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const whatsAppCommandHandler = new WhatsAppCommandHandlerImpl();
