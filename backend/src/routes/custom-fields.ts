/**
 * Custom Fields Framework Routes
 * CRUD for custom_field_definitions and custom_field_values
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { registerPMParamValidation, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';

const router = Router();
registerPMParamValidation(router);

// ============================================================================
// FIELD DEFINITIONS
// ============================================================================

// List custom field definitions (optionally for a specific entity type)
router.get('/custom-fields', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { entity_type } = req.query;
    let query = `SELECT * FROM custom_field_definitions WHERE organization_id = $1 AND is_active = true`;
    const params: any[] = [orgId];
    let idx = 2;
    if (entity_type) { query += ` AND entity_type = $${idx++}`; params.push(entity_type); }
    query += ` ORDER BY entity_type, sort_order, field_label`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

// Create a custom field definition
router.post('/custom-fields', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const userId = getAuthUserId(req);
    const { entity_type, field_name, field_label, field_type, options, default_value, required, sort_order, validation_regex, min_value, max_value, placeholder, help_text } = req.body;
    if (!entity_type || !field_name || !field_label) {
      return res.status(400).json({ success: false, error: 'entity_type, field_name, and field_label are required' });
    }
    const result = await pool.query(
      `INSERT INTO custom_field_definitions (organization_id, entity_type, field_name, field_label, field_type, options, default_value, required, sort_order, validation_regex, min_value, max_value, placeholder, help_text, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (organization_id, entity_type, field_name) DO UPDATE SET
         field_label = EXCLUDED.field_label, field_type = EXCLUDED.field_type, options = EXCLUDED.options,
         default_value = EXCLUDED.default_value, required = EXCLUDED.required, sort_order = EXCLUDED.sort_order,
         validation_regex = EXCLUDED.validation_regex, min_value = EXCLUDED.min_value, max_value = EXCLUDED.max_value,
         placeholder = EXCLUDED.placeholder, help_text = EXCLUDED.help_text, updated_at = NOW()
       RETURNING *`,
      [orgId, entity_type, field_name, field_label, field_type || 'text', JSON.stringify(options || []), default_value, required || false, sort_order || 0, validation_regex, min_value, max_value, placeholder, help_text, userId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Update a custom field definition
router.put('/custom-fields/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const fields = ['field_label', 'field_type', 'options', 'default_value', 'required', 'sort_order', 'is_active', 'validation_regex', 'min_value', 'max_value', 'placeholder', 'help_text'];
    const updates: string[] = [];
    const params: any[] = [id, orgId];
    let idx = 3;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        params.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push('updated_at = NOW()');
    const result = await pool.query(`UPDATE custom_field_definitions SET ${updates.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Field definition not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

// Delete a custom field definition (and all its values)
router.delete('/custom-fields/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { id } = req.params;
    const result = await pool.query('DELETE FROM custom_field_definitions WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Field definition not found' });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// ============================================================================
// FIELD VALUES (for a specific entity)
// ============================================================================

// Get all custom field values for an entity
router.get('/custom-fields/values/:entityType/:entityId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { entityType, entityId } = req.params;
    const result = await pool.query(
      `SELECT cfv.*, cfd.field_name, cfd.field_label, cfd.field_type, cfd.options, cfd.required
       FROM custom_field_values cfv
       JOIN custom_field_definitions cfd ON cfd.id = cfv.field_definition_id
       WHERE cfv.entity_type = $1 AND cfv.entity_id = $2 AND cfd.organization_id = $3 AND cfd.is_active = true
       ORDER BY cfd.sort_order`,
      [entityType, entityId, orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

// Set/update a custom field value
router.put('/custom-fields/values/:entityType/:entityId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getAuthOrgId(req);
    const { entityType, entityId } = req.params;
    const { values } = req.body; // Array of { field_definition_id, value }
    if (!Array.isArray(values)) return res.status(400).json({ success: false, error: 'values must be an array' });
    const results = [];
    for (const v of values) {
      // Determine value column based on field type
      const defResult = await pool.query('SELECT field_type FROM custom_field_definitions WHERE id = $1 AND organization_id = $2', [v.field_definition_id, orgId]);
      if (defResult.rows.length === 0) continue;
      const fieldType = defResult.rows[0].field_type;
      let valueText = null, valueNumber = null, valueDate = null, valueBoolean = null, valueJson = null;
      if (['text', 'textarea', 'url', 'email', 'phone', 'select'].includes(fieldType)) valueText = v.value;
      else if (['number', 'currency'].includes(fieldType)) valueNumber = v.value;
      else if (fieldType === 'date') valueDate = v.value;
      else if (fieldType === 'checkbox') valueBoolean = v.value;
      else if (fieldType === 'multi_select') valueJson = v.value;
      else valueText = typeof v.value === 'string' ? v.value : JSON.stringify(v.value);

      const result = await pool.query(
        `INSERT INTO custom_field_values (field_definition_id, entity_id, entity_type, value_text, value_number, value_date, value_boolean, value_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (field_definition_id, entity_id) DO UPDATE SET
           value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number, value_date = EXCLUDED.value_date,
           value_boolean = EXCLUDED.value_boolean, value_json = EXCLUDED.value_json, updated_at = NOW()
         RETURNING *`,
        [v.field_definition_id, entityId, entityType, valueText, valueNumber, valueDate, valueBoolean, valueJson ? JSON.stringify(valueJson) : null]
      );
      results.push(result.rows[0]);
    }
    res.json({ success: true, data: results });
  } catch (error) { next(error); }
});

// Supported entity types
router.get('/custom-fields/entity-types', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: ['project', 'issue', 'risk', 'drawing', 'meeting', 'equipment', 'bid_package', 'warranty', 'incident', 'contractor', 'vendor'],
  });
});

// Supported field types
router.get('/custom-fields/field-types', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: [
      { value: 'text', label: 'Text' },
      { value: 'textarea', label: 'Long Text' },
      { value: 'number', label: 'Number' },
      { value: 'currency', label: 'Currency' },
      { value: 'date', label: 'Date' },
      { value: 'select', label: 'Dropdown' },
      { value: 'multi_select', label: 'Multi-Select' },
      { value: 'checkbox', label: 'Checkbox' },
      { value: 'url', label: 'URL' },
      { value: 'email', label: 'Email' },
      { value: 'phone', label: 'Phone' },
    ],
  });
});

export default router;
