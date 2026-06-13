'use client';

/**
 * Custom Deal Fields Manager
 *
 * UI for viewing and editing custom fields on deals.
 * Reads/writes to the deal's custom_fields JSONB column.
 * Supports text, number, date, select, and boolean field types.
 */

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
    Plus, Trash2, Save, Settings, Type, Hash,
    Calendar, ToggleLeft, List, GripVertical, Pencil,
} from 'lucide-react';
import { dealsApi } from '@/lib/crm-api';

// ─── Types ──────────────────────────────────────────

type FieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

interface CustomFieldDef {
    key: string;
    label: string;
    type: FieldType;
    options?: string[]; // for select type
    required?: boolean;
}

interface CustomDealFieldsProps {
    dealId: string;
    className?: string;
    /** Field definitions — stored in localStorage or org-level config */
    fieldDefs?: CustomFieldDef[];
    onFieldDefsChange?: (defs: CustomFieldDef[]) => void;
}

const STORAGE_KEY = 'crm-custom-field-defs';
const FIELD_TYPE_MAP: Record<FieldType, { icon: React.ReactNode; label: string }> = {
    text: { icon: <Type className="w-3.5 h-3.5" />, label: 'Text' },
    number: { icon: <Hash className="w-3.5 h-3.5" />, label: 'Number' },
    date: { icon: <Calendar className="w-3.5 h-3.5" />, label: 'Date' },
    select: { icon: <List className="w-3.5 h-3.5" />, label: 'Select' },
    boolean: { icon: <ToggleLeft className="w-3.5 h-3.5" />, label: 'Yes/No' },
};

// ─── Component ──────────────────────────────────────

export function CustomDealFields({
    dealId,
    className,
    fieldDefs: externalDefs,
    onFieldDefsChange,
}: CustomDealFieldsProps) {
    // Field definitions
    const [defs, setDefs] = useState<CustomFieldDef[]>([]);
    // Field values for this deal
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [editMode, setEditMode] = useState(false);
    // For adding new field def
    const [newField, setNewField] = useState<Partial<CustomFieldDef>>({ type: 'text', label: '', key: '' });
    const [showAddField, setShowAddField] = useState(false);

    // Load field definitions
    useEffect(() => {
        if (externalDefs) {
            setDefs(externalDefs);
        } else {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                try { setDefs(JSON.parse(stored)); } catch { /* ignore */ }
            }
        }
    }, [externalDefs]);

    // Load deal custom fields
    useEffect(() => {
        if (!dealId) return;
        (async () => {
            try {
                const deal = await dealsApi.getById(dealId);
                setValues((deal as any)?.custom_fields || {});
            } catch (err) {
                console.error('Failed to load custom fields:', err);
            }
        })();
    }, [dealId]);

    const saveDefs = useCallback((newDefs: CustomFieldDef[]) => {
        setDefs(newDefs);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newDefs));
        onFieldDefsChange?.(newDefs);
    }, [onFieldDefsChange]);

    const handleValueChange = useCallback((key: string, value: unknown) => {
        setValues(prev => ({ ...prev, [key]: value }));
        setDirty(true);
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            await dealsApi.update(dealId, { custom_fields: values } as any);
            setDirty(false);
        } catch (err) {
            console.error('Failed to save custom fields:', err);
        }
        setSaving(false);
    }, [dealId, values]);

    const addFieldDef = useCallback(() => {
        if (!newField.label) return;
        const key = newField.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const def: CustomFieldDef = {
            key,
            label: newField.label,
            type: newField.type || 'text',
            options: newField.type === 'select' ? (newField.options || []) : undefined,
            required: newField.required,
        };
        saveDefs([...defs, def]);
        setNewField({ type: 'text', label: '', key: '' });
        setShowAddField(false);
    }, [newField, defs, saveDefs]);

    const removeFieldDef = useCallback((key: string) => {
        saveDefs(defs.filter(d => d.key !== key));
        setValues(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setDirty(true);
    }, [defs, saveDefs]);

    return (
        <div className={cn('space-y-4', className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary" />
                    Custom Fields
                </h3>
                <div className="flex items-center gap-2">
                    {dirty && (
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={cn(
                                'flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg',
                                'bg-primary text-primary-foreground hover:bg-primary/90',
                                'disabled:opacity-50',
                            )}
                        >
                            <Save className="w-3 h-3" />
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    )}
                    <button
                        onClick={() => setEditMode(!editMode)}
                        className={cn(
                            'flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-border',
                            editMode ? 'bg-primary/10 border-primary/30 text-primary' : 'hover:bg-muted',
                        )}
                    >
                        <Pencil className="w-3 h-3" />
                        {editMode ? 'Done' : 'Edit Schema'}
                    </button>
                </div>
            </div>

            {/* Field values */}
            {defs.length === 0 ? (
                <div className="text-center py-6 rounded-lg border border-dashed border-border">
                    <Settings className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No custom fields defined yet.</p>
                    <button
                        onClick={() => { setEditMode(true); setShowAddField(true); }}
                        className="mt-2 text-xs text-primary hover:underline"
                    >
                        Add your first field
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {defs.map(def => (
                        <div key={def.key} className="flex items-start gap-3">
                            {editMode && (
                                <GripVertical className="w-4 h-4 text-muted-foreground mt-2.5 cursor-grab" />
                            )}
                            <div className="flex-1">
                                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                                    {FIELD_TYPE_MAP[def.type].icon}
                                    {def.label}
                                    {def.required && <span className="text-destructive">*</span>}
                                </label>
                                {renderFieldInput(def, values[def.key], handleValueChange)}
                            </div>
                            {editMode && (
                                <button
                                    onClick={() => removeFieldDef(def.key)}
                                    className="p-1.5 text-destructive hover:bg-destructive/10 rounded mt-5"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add field (edit mode) */}
            {editMode && (
                <div className="space-y-3 pt-2 border-t border-border">
                    {showAddField ? (
                        <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    placeholder="Field label"
                                    value={newField.label || ''}
                                    onChange={e => setNewField(p => ({ ...p, label: e.target.value }))}
                                    className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
                                />
                                <select
                                    value={newField.type || 'text'}
                                    onChange={e => setNewField(p => ({ ...p, type: e.target.value as FieldType }))}
                                    className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
                                >
                                    {Object.entries(FIELD_TYPE_MAP).map(([key, val]) => (
                                        <option key={key} value={key}>{val.label}</option>
                                    ))}
                                </select>
                            </div>
                            {newField.type === 'select' && (
                                <input
                                    type="text"
                                    placeholder="Options (comma-separated)"
                                    onChange={e => setNewField(p => ({ ...p, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                                    className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
                                />
                            )}
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-1.5 text-xs">
                                    <input
                                        type="checkbox"
                                        checked={newField.required || false}
                                        onChange={e => setNewField(p => ({ ...p, required: e.target.checked }))}
                                        className="rounded border-border"
                                    />
                                    Required
                                </label>
                                <div className="flex-1" />
                                <button onClick={() => setShowAddField(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                                <button
                                    onClick={addFieldDef}
                                    disabled={!newField.label}
                                    className="text-xs px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                    Add Field
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowAddField(true)}
                            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add Custom Field
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Field Input Renderer ───────────────────────────

function renderFieldInput(
    def: CustomFieldDef,
    value: unknown,
    onChange: (key: string, value: unknown) => void,
) {
    const base = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50';

    switch (def.type) {
        case 'text':
            return (
                <input
                    type="text"
                    value={(value as string) || ''}
                    onChange={e => onChange(def.key, e.target.value)}
                    className={base}
                    placeholder={`Enter ${def.label.toLowerCase()}`}
                />
            );
        case 'number':
            return (
                <input
                    type="number"
                    value={(value as number) ?? ''}
                    onChange={e => onChange(def.key, e.target.value ? Number(e.target.value) : null)}
                    className={base}
                    placeholder="0"
                />
            );
        case 'date':
            return (
                <input
                    type="date"
                    value={(value as string) || ''}
                    onChange={e => onChange(def.key, e.target.value)}
                    className={base}
                />
            );
        case 'select':
            return (
                <select
                    value={(value as string) || ''}
                    onChange={e => onChange(def.key, e.target.value)}
                    className={base}
                >
                    <option value="">Select...</option>
                    {(def.options || []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            );
        case 'boolean':
            return (
                <label className="flex items-center gap-2 py-1.5 cursor-pointer">
                    <div
                        onClick={() => onChange(def.key, !value)}
                        className={cn(
                            'relative w-9 h-5 rounded-full transition-colors cursor-pointer',
                            value ? 'bg-primary' : 'bg-muted-foreground/30',
                        )}
                    >
                        <div className={cn(
                            'absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform',
                            value ? 'translate-x-4' : 'translate-x-0.5',
                        )} />
                    </div>
                    <span className="text-sm text-muted-foreground">{value ? 'Yes' : 'No'}</span>
                </label>
            );
        default:
            return null;
    }
}

export default CustomDealFields;
