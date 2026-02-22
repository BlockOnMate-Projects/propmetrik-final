'use client';

/**
 * Stacking Plan Visualization
 *
 * Renders a visual floor-by-floor grid of a building, with each unit
 * color-coded by occupancy status. Shows summary metrics at the top.
 *
 * @module components/crm/StackingPlanView
 */

import { useState, useEffect, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import {
    Building2, Layers, Plus, Trash2, Users, DollarSign,
    ChevronDown, ChevronRight, Edit2, Check, X,
} from 'lucide-react';
import { fetchApi } from '@/lib/api';

const CRM_BASE = '/crm';

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface Unit {
    id: string;
    floor_id: string;
    unit_number: string;
    unit_type: string;
    area_sqm: number | null;
    status: 'vacant' | 'occupied' | 'reserved' | 'maintenance';
    tenant_name: string | null;
    tenant_contact_id: string | null;
    deal_id: string | null;
    lease_start: string | null;
    lease_end: string | null;
    monthly_rent: number | null;
    rent_currency: string;
    notes: string | null;
}

interface Floor {
    id: string;
    floor_number: number;
    floor_name: string | null;
    total_units: number;
    gross_area_sqm: number | null;
    net_leasable_sqm: number | null;
    units: Unit[];
}

interface StackingPlan {
    property_id: string;
    total_floors: number;
    total_units: number;
    occupied_units: number;
    vacant_units: number;
    occupancy_rate: number;
    total_leasable_sqm: number;
    occupied_sqm: number;
    monthly_revenue: number;
    floors: Floor[];
}

// ─────────────────────────────────────────────────────
// Status colors
// ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; label: string }> = {
    vacant: { bg: 'bg-success/20', border: 'border-success/40', text: 'text-success', label: 'Vacant' },
    occupied: { bg: 'bg-info/20', border: 'border-info/40', text: 'text-info', label: 'Occupied' },
    reserved: { bg: 'bg-warning/20', border: 'border-warning/40', text: 'text-warning', label: 'Reserved' },
    maintenance: { bg: 'bg-destructive/20', border: 'border-destructive/40', text: 'text-destructive', label: 'Maintenance' },
};

// ─────────────────────────────────────────────────────
// Unit Cell
// ─────────────────────────────────────────────────────

const UnitCell = memo(function UnitCell({
    unit,
    onSelect,
}: {
    unit: Unit;
    onSelect: (u: Unit) => void;
}) {
    const cfg = STATUS_CONFIG[unit.status] || STATUS_CONFIG.vacant;
    const isLeaseExpiring =
        unit.lease_end &&
        new Date(unit.lease_end).getTime() - Date.now() < 90 * 86400000 &&
        new Date(unit.lease_end).getTime() > Date.now();

    return (
        <button
            onClick={() => onSelect(unit)}
            className={cn(
                'relative rounded-lg border p-2 text-left transition-all hover:scale-[1.03] hover:shadow-lg min-w-[100px]',
                cfg.bg, cfg.border,
            )}
        >
            {isLeaseExpiring && (
                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-warning animate-pulse" title="Lease expiring soon" />
            )}
            <p className={cn('text-xs font-semibold', cfg.text)}>{unit.unit_number}</p>
            <p className="text-[10px] text-muted-foreground truncate">{unit.tenant_name || cfg.label}</p>
            {unit.area_sqm && <p className="text-[10px] text-muted-foreground">{unit.area_sqm} sqm</p>}
            {unit.monthly_rent && (
                <p className="text-[10px] text-muted-foreground font-mono">
                    {unit.rent_currency} {unit.monthly_rent.toLocaleString()}/mo
                </p>
            )}
        </button>
    );
});

// ─────────────────────────────────────────────────────
// Floor Row
// ─────────────────────────────────────────────────────

function FloorRow({
    floor,
    onSelectUnit,
}: {
    floor: Floor;
    onSelectUnit: (u: Unit) => void;
}) {
    const [expanded, setExpanded] = useState(true);
    const occupiedCount = floor.units.filter(u => u.status === 'occupied').length;
    const floorOccupancy = floor.units.length ? Math.round((occupiedCount / floor.units.length) * 100) : 0;

    return (
        <div className="border border-border rounded-xl overflow-hidden">
            {/* Floor header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">
                        {floor.floor_name || `Floor ${floor.floor_number}`}
                    </span>
                    <span className="text-xs text-muted-foreground">({floor.units.length} units)</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                                className={cn('h-full rounded-full', floorOccupancy >= 80 ? 'bg-info' : floorOccupancy >= 50 ? 'bg-warning' : 'bg-success')}
                                style={{ width: `${floorOccupancy}%` }}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground">{floorOccupancy}%</span>
                    </div>
                </div>
            </button>

            {/* Units grid */}
            {expanded && (
                <div className="p-3">
                    {floor.units.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic text-center py-2">No units configured</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                            {floor.units.map(unit => (
                                <UnitCell key={unit.id} unit={unit} onSelect={onSelectUnit} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────
// Unit Detail Panel
// ─────────────────────────────────────────────────────

function UnitDetailPanel({
    unit,
    onClose,
}: {
    unit: Unit;
    onClose: () => void;
}) {
    const cfg = STATUS_CONFIG[unit.status] || STATUS_CONFIG.vacant;
    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-background border-l border-border z-40 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Unit {unit.unit_number}</h3>
                <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-4">
                <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.bg, cfg.border, cfg.text)}>
                    {cfg.label}
                </div>

                <div className="space-y-2 text-xs">
                    <Row label="Type" value={unit.unit_type} />
                    <Row label="Area" value={unit.area_sqm ? `${unit.area_sqm} sqm` : '—'} />
                    <Row label="Tenant" value={unit.tenant_name || '—'} />
                    <Row label="Rent" value={unit.monthly_rent ? `${unit.rent_currency} ${unit.monthly_rent.toLocaleString()}/mo` : '—'} />
                    <Row label="Lease Start" value={unit.lease_start || '—'} />
                    <Row label="Lease End" value={unit.lease_end || '—'} />
                    {unit.notes && <Row label="Notes" value={unit.notes} />}
                </div>
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-start">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground font-medium text-right max-w-[60%]">{value}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────

interface StackingPlanViewProps {
    propertyId: string;
    className?: string;
}

export function StackingPlanView({ propertyId, className }: StackingPlanViewProps) {
    const [plan, setPlan] = useState<StackingPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

    const fetchPlan = useCallback(async () => {
        try {
            const data = await fetchApi<StackingPlan>(`${CRM_BASE}/properties/${propertyId}/stacking-plan`);
            setPlan(data);
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, [propertyId]);

    useEffect(() => { fetchPlan(); }, [fetchPlan]);

    if (loading) {
        return (
            <div className={cn('animate-pulse space-y-3', className)}>
                <div className="h-20 bg-muted/40 rounded-xl" />
                <div className="h-32 bg-muted/40 rounded-xl" />
            </div>
        );
    }

    if (!plan || plan.total_floors === 0) {
        return (
            <div className={cn('rounded-xl border border-dashed border-border p-8 text-center', className)}>
                <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No stacking plan configured</p>
                <p className="text-xs text-muted-foreground mt-1">Add floors and units to visualize building occupancy.</p>
            </div>
        );
    }

    return (
        <div className={cn('space-y-4', className)}>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryCard icon={<Building2 className="w-4 h-4" />} label="Floors" value={plan.total_floors} />
                <SummaryCard icon={<Layers className="w-4 h-4" />} label="Units" value={`${plan.occupied_units}/${plan.total_units}`} sub={`${plan.occupancy_rate}% occupied`} />
                <SummaryCard icon={<Users className="w-4 h-4" />} label="Vacant" value={plan.vacant_units} color="success" />
                <SummaryCard icon={<DollarSign className="w-4 h-4" />} label="Monthly Revenue" value={`GHS ${plan.monthly_revenue.toLocaleString()}`} />
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 px-1">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-1.5 text-xs">
                        <span className={cn('w-2.5 h-2.5 rounded-sm', cfg.bg, 'border', cfg.border)} />
                        <span className="text-muted-foreground">{cfg.label}</span>
                    </div>
                ))}
            </div>

            {/* Floor rows */}
            <div className="space-y-2">
                {plan.floors.map(floor => (
                    <FloorRow key={floor.id} floor={floor} onSelectUnit={setSelectedUnit} />
                ))}
            </div>

            {/* Unit detail slide-out */}
            {selectedUnit && (
                <UnitDetailPanel unit={selectedUnit} onClose={() => setSelectedUnit(null)} />
            )}
        </div>
    );
}

// ─── Summary Card ────────────────────────────────────

function SummaryCard({
    icon,
    label,
    value,
    sub,
    color = 'primary',
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    sub?: string;
    color?: string;
}) {
    const colorMap: Record<string, string> = {
        primary: 'text-primary',
        success: 'text-success',
        warning: 'text-warning',
        destructive: 'text-destructive',
        info: 'text-info',
    };
    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <div className={cn('flex items-center gap-1.5 mb-1', colorMap[color] || 'text-primary')}>
                {icon}
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-lg font-bold text-foreground">{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
    );
}

export default StackingPlanView;
