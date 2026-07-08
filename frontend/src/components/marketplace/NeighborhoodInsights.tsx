'use client';

/**
 * NeighborhoodInsights — Zillow-style neighbourhood context on a public listing.
 * Fetches /api/marketplace/properties/:token/neighborhood (+ /narrative) and renders:
 *   • AI neighbourhood overview (grounded strictly on the data below)
 *   • Getting around  — Walk / Transit / Bike scores (OpenStreetMap heuristic)
 *   • Nearby schools / hospitals / transit (OpenStreetMap)
 *   • Flood risk (NADMO incident data)
 *   • Area demographics (Ghana Statistical Service)
 * Every section is independent and self-hides when its data is unavailable.
 */

import { useEffect, useState } from 'react';
import {
  GraduationCap, Stethoscope, Bus, Footprints, Bike, Droplets, Users, Sparkles,
  Loader2, TrendingUp, Home, Info, MapPin,
} from 'lucide-react';

interface Amenity { name: string; distance_km: number; kind?: string; lat?: number | null; lng?: number | null }
interface GAScore { score: number; label: string; count: number }
interface GettingAround { walk: GAScore; transit: GAScore; bike: GAScore; method: string; radius_km: number }

interface Insights {
  location: { lat: number; lng: number } | null;
  region_label: string | null;
  city: string | null;
  amenities: { schools: Amenity[]; hospitals: Amenity[]; transit_stops: Amenity[] } | null;
  floodRisk: {
    score: number;
    level: 'low' | 'moderate' | 'high' | 'critical';
    nearby_incidents: number;
    nearest_incident_distance_m: number | null;
    risk_factors: string[];
  } | null;
  gettingAround: GettingAround | null;
  demographics: {
    region_label: string;
    currency: string;
    median_income_monthly: number | null;
    median_income_annual: number | null;
    avg_household_size: number | null;
    population_2021: number | null;
    population_2030: number | null;
  } | null;
}

export default function NeighborhoodInsights({ token }: { token: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [narrative, setNarrative] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    setNarrative(null);

    fetch(`/api/marketplace/properties/${token}/neighborhood`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setData(j?.data ?? null); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });

    // Narrative loads independently (it's AI + slower) so the data isn't held back.
    fetch(`/api/marketplace/properties/${token}/neighborhood/narrative`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setNarrative(j?.data?.summary ?? null); })
      .catch(() => {});

    return () => { alive = false; };
  }, [token]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400" />
        <span className="text-sm">Loading neighbourhood insights…</span>
      </div>
    );
  }
  if (!data) return null;

  const ga = data.gettingAround;
  const showGA = !!ga && (ga.walk.score > 0 || ga.transit.score > 0 || ga.bike.score > 0);
  const hasAnything = narrative || showGA || data.amenities || data.floodRisk || data.demographics;
  if (!hasAnything) return null;

  return (
    <>
      {narrative && (
        <Card>
          <Heading icon={<Sparkles className="w-5 h-5" />} title="Neighbourhood overview" />
          <p className="text-foreground/85 leading-relaxed">{narrative}</p>
          <SourceNote>AI summary of the verified data below — not a valuation or guarantee.</SourceNote>
        </Card>
      )}

      {showGA && ga && (
        <Card>
          <Heading icon={<Footprints className="w-5 h-5" />} title="Getting around" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
            <GAItem icon={<Footprints className="w-5 h-5" />} name="Walk Score" s={ga.walk} />
            <GAItem icon={<Bus className="w-5 h-5" />} name="Transit Score" s={ga.transit} />
            <GAItem icon={<Bike className="w-5 h-5" />} name="Bike Score" s={ga.bike} />
          </div>
          <SourceNote>Estimated from OpenStreetMap within {ga.radius_km} km — reflects mapped amenities, so coverage varies by area.</SourceNote>
        </Card>
      )}

      {data.amenities && data.amenities.schools.length > 0 && (
        <Card>
          <Heading icon={<GraduationCap className="w-5 h-5" />} title="Nearby schools" />
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
            {data.amenities.schools.map((s, i) => (
              <div key={i} className="snap-start shrink-0 w-[230px] sm:w-[250px]">
                <SchoolCard s={s} />
              </div>
            ))}
          </div>
          <SourceNote>Source: OpenStreetMap. Distances are straight-line from the property. Ghana has no national school-rating body, so no rating is shown.</SourceNote>
        </Card>
      )}

      {data.amenities && (data.amenities.hospitals.length > 0 || data.amenities.transit_stops.length > 0) && (
        <Card>
          <Heading icon={<Stethoscope className="w-5 h-5" />} title="Healthcare & transit" />
          <div className="space-y-4">
            <AmenityGroup icon={<Stethoscope className="w-4 h-4" />} title="Hospitals & clinics" items={data.amenities.hospitals} />
            <AmenityGroup icon={<Bus className="w-4 h-4" />} title="Transit stops" items={data.amenities.transit_stops} />
          </div>
          <SourceNote>Source: OpenStreetMap.</SourceNote>
        </Card>
      )}

      {data.floodRisk && <FloodCard f={data.floodRisk} />}

      {data.demographics && <DemographicsCard d={data.demographics} region={data.region_label} />}
    </>
  );
}

/* ── Flood ─────────────────────────────────────────────────────────── */

const FLOOD_STYLES: Record<string, { chip: string; dot: string; label: string }> = {
  low: { chip: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30', dot: 'bg-green-500', label: 'Low risk' },
  moderate: { chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30', dot: 'bg-amber-500', label: 'Moderate risk' },
  high: { chip: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30', dot: 'bg-orange-500', label: 'High risk' },
  critical: { chip: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30', dot: 'bg-red-500', label: 'Critical risk' },
};

function FloodCard({ f }: { f: NonNullable<Insights['floodRisk']> }) {
  const s = FLOOD_STYLES[f.level] || FLOOD_STYLES.low;
  return (
    <Card>
      <Heading icon={<Droplets className="w-5 h-5" />} title="Flood risk" />
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${s.chip}`}>
          <span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}
        </span>
        <span className="text-sm text-muted-foreground">
          {f.nearby_incidents > 0
            ? `${f.nearby_incidents} historical flood incident${f.nearby_incidents > 1 ? 's' : ''} recorded nearby${f.nearest_incident_distance_m != null ? ` (nearest ≈ ${f.nearest_incident_distance_m} m)` : ''}.`
            : 'No historical flood incidents recorded near this location.'}
        </span>
      </div>
      {f.risk_factors.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {f.risk_factors.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
              <Info className="w-3.5 h-3.5 mt-0.5 text-amber-500 flex-shrink-0" /> {r}
            </li>
          ))}
        </ul>
      )}
      <SourceNote>Based on NADMO-reported flood incidents. Reflects recorded history, not a full hydrological flood-zone model.</SourceNote>
    </Card>
  );
}

/* ── Demographics ──────────────────────────────────────────────────── */

function DemographicsCard({ d, region }: { d: NonNullable<Insights['demographics']>; region: string | null }) {
  const money = (n: number | null) =>
    n == null ? null : new Intl.NumberFormat('en-GH', { style: 'currency', currency: d.currency || 'GHS', maximumFractionDigits: 0 }).format(n);
  const growth =
    d.population_2021 && d.population_2030 && d.population_2021 > 0
      ? Math.round(((d.population_2030 - d.population_2021) / d.population_2021) * 100)
      : null;

  return (
    <Card>
      <Heading icon={<Users className="w-5 h-5" />} title={`Area profile${region ? ` — ${region}` : ''}`} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {money(d.median_income_monthly) && (
          <Metric icon={<TrendingUp className="w-4 h-4" />} label="Median household income" value={money(d.median_income_monthly)!} sub="/ month" />
        )}
        {d.avg_household_size != null && (
          <Metric icon={<Home className="w-4 h-4" />} label="Avg household size" value={d.avg_household_size.toFixed(1)} sub="people" />
        )}
        {d.population_2021 != null && (
          <Metric
            icon={<Users className="w-4 h-4" />}
            label="Regional population"
            value={Math.round(d.population_2021).toLocaleString()}
            sub={growth != null ? `${growth >= 0 ? '+' : ''}${growth}% by 2030` : '2021 census'}
          />
        )}
      </div>
      <SourceNote>Source: Ghana Statistical Service (regional figures — indicative of the wider area, not this street).</SourceNote>
    </Card>
  );
}

/* ── Small building blocks ─────────────────────────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm">{children}</div>;
}

function Heading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-indigo-600 dark:text-indigo-400">{icon}</span>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    </div>
  );
}

function SourceNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">{children}</p>;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-600 dark:text-green-400';
  if (score >= 50) return 'text-indigo-600 dark:text-indigo-400';
  if (score >= 25) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

/** Zillow-style "Getting around" row item: coloured icon box + score / 100 + band. */
function GAItem({ icon, name, s }: { icon: React.ReactNode; name: string; s: GAScore }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{name}</div>
        <div className="font-bold leading-tight">
          <span className={`text-xl ${scoreColor(s.score)}`}>{s.score}</span>
          <span className="text-sm font-normal text-muted-foreground"> / 100</span>
        </div>
        <div className="text-xs text-muted-foreground leading-tight">{s.label}</div>
      </div>
    </div>
  );
}

/** Short level token from a school's kind ("Public school · SHS" → "SHS"). */
function schoolLevel(kind?: string): string | null {
  if (!kind || !kind.includes('·')) return null;
  const lvl = kind.split('·').pop()!.trim();
  const map: Record<string, string> = { Preschool: 'PRE', Primary: 'PRI', JHS: 'JHS', SHS: 'SHS' };
  if (map[lvl]) return map[lvl];
  const range = lvl.split(/[–-]/).map((s) => map[s.trim()]).filter(Boolean);
  return range.length ? range.join('–') : null;
}

/**
 * Zillow-style school card: prominent name, a colored circular badge (school level
 * or a cap — we don't fabricate the GreatSchools rating), type + distance, and a
 * clickable map link when we have coordinates.
 */
function SchoolCard({ s }: { s: Amenity }) {
  const level = schoolLevel(s.kind);
  const type = s.kind ? s.kind.split('·')[0].trim() : 'School';
  const mapHref = s.lat != null && s.lng != null ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}` : undefined;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-[15px] leading-snug line-clamp-2">{s.name}</p>
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            {type}{s.distance_km != null ? ` • ${s.distance_km} km away` : ''}
          </p>
        </div>
        <div className="w-14 h-14 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
          {level ? <span className="text-sm font-bold leading-none">{level}</span> : <GraduationCap className="w-6 h-6" />}
        </div>
      </div>
      {mapHref && (
        <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-indigo-600 dark:text-indigo-400">
          <MapPin className="w-3 h-3" /> View on map
        </span>
      )}
    </>
  );

  return mapHref ? (
    <a href={mapHref} target="_blank" rel="noopener noreferrer"
      className="flex flex-col h-full rounded-xl border border-border bg-card p-4 hover:border-indigo-500/50 hover:shadow-sm transition-all">
      {inner}
    </a>
  ) : (
    <div className="flex flex-col h-full rounded-xl border border-border bg-card p-4">{inner}</div>
  );
}

function AmenityGroup({ icon, title, items }: { icon: React.ReactNode; title: string; items: Amenity[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
        <span className="text-indigo-600 dark:text-indigo-400">{icon}</span>{title}
        <span className="text-xs text-muted-foreground font-normal">({items.length})</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((a, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-foreground/80 truncate flex items-center gap-1.5 min-w-0">
              <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{a.name}{a.kind ? <span className="text-muted-foreground"> · {a.kind}</span> : null}</span>
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{a.distance_km} km</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 bg-muted/60 rounded-xl">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">{icon}<span className="text-[11px]">{label}</span></div>
      <p className="text-base font-bold text-foreground leading-none">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}
