# Connect Website — Client Self‑Service Listing Integration (Build Spec)

**Status:** Draft for build · **Owner:** Platform · **Last updated:** 2026‑07‑03
**Applies to:** Property Management (PM) **and** CRM / Deal Management. Each service gets an
**Integrations** tab; **Connect Website** lives inside it.

---

## 1. Goal & principle

Let an agency (e.g. Regimanuel Grey) connect **their own public website** to PropMetrik so that
**listings they publish in PropMetrik appear on their site automatically**, and **enquiries from
their site flow back into PropMetrik** as leads/deals. No duplicate data entry.

**Single source of truth:** PropMetrik owns the listing + lead data. Client sites **read** it (pull)
and **submit** enquiries (push in). PropMetrik never pushes a full copy of the data out to be stored
elsewhere — it stays authoritative.

```
PM/CRM agent publishes listing  ─▶  approved + marketplace_enabled  ─▶  org-scoped public API
        ▲                                                                      │
        │  deal created / updated                                              ▼
   CRM  └──────────  property_inquiries (lead)  ◀── enquiry form on client site (inbound)
```

This is deliberately **read‑out + submit‑in**, not two‑way replication.

---

## 2. What already exists (REUSE — do not rebuild)

| Capability | Location | Reuse as |
|---|---|---|
| Public property read API | `backend/src/routes/publicProperties.ts` → `GET /api/public/properties` (+ `/:id`, `/:id/enriched`, `/legal`, `/construction`, `/externals`, `/risk-assessment`) | Base for the org‑scoped listings feed |
| Public marketplace (token pages, search, similar, **inquiries**) | `backend/src/routes/marketplace.ts` | Enquiry intake + search patterns |
| **API‑key system**: `org_api_keys` (`scopes[]`, `rate_limit_per_minute/day`, `allowed_ips`, `expires_at`, `revoked_at`, `key_hash`), Redis rate‑limit, usage metering, **self‑service key CRUD** | `backend/src/routes/developerPortal.ts`, `middleware/analyticsApiAccess.ts` | Auth + throttling + key issuance for website keys |
| Publish/approval workflow + fields | `properties.marketplace_enabled`, `published_at`, `is_delisted`, `marketplace_listed_at`, `permanent_link_token`, `status` | The gate: only approved+enabled sync |
| **Inbound lead table** | `property_inquiries` (`name`, `email`, `phone`, `message`, `inquiry_type`, `transaction_type`, `offer_amount`, `deal_id`, `organization_id`, `source`, `utm_params`, `lead_score`, `status`) | Website enquiries land here; already bridges to CRM deals via `deal_id` |
| PM↔CRM property bridge (lead → deal on synced `crm_property`; deal won → sold) | see memory *PM Sale/Lease + CRM Bridge* | Inbound enquiry auto‑creates/attaches a deal |
| Integrations plumbing (`integrations` table, config JSON) | `backend/src/routes/integrations.ts`, `app-integrations.ts`, `xero.ts` | Pattern for a `website_connection` record |

**Bottom line:** ~70% is built. The feature is mostly *scoping + surfacing* existing infrastructure, not new systems.

---

## 3. What to build (the actual work)

### 3.1 Org‑scoped listings API (the linchpin)
`GET /api/public/properties` today returns **all** properties (`publicProperties.ts:27`, no org filter).
Add org scoping so a client site sees **only its own** approved listings.

- New/ూextended endpoint: `GET /api/v1/public/orgs/:orgId/listings` **or** infer org from the API key
  (preferred — key → `org_id`, no id in URL). Recommend **key‑inferred org** so the client never
  needs to know/guess an org id and can't enumerate others.
- Hard filter (non‑negotiable): `organization_id = <key.org_id>` AND `status = 'approved'` AND
  `marketplace_enabled = true` AND `is_delisted = false`.
- Query params: `limit` (≤100), `offset`/cursor, `transaction_type` (sale|rental|lease), `type`
  (property_type), `min_price`, `max_price`, `bedrooms`, `region`, `q` (search), `sort`, `updated_since`
  (for incremental polling).
- Response: stable, versioned JSON contract (see §7). Include `updated_at` per item so the client can
  poll incrementally, and an ETag/`Last-Modified` for cheap 304s.
- **Sources both PM and CRM listings:** union of `properties` (PM) and `crm_properties` (CRM) that
  are approved + marketplace‑enabled for the org. Normalise to one listing shape. (Confirm the exact
  join/ύview during build — the PM↔CRM bridge already keeps these in step.)

### 3.2 Extend `org_api_keys` for a `listings` scope
- Add scope values: `listings:read` (feed), `leads:write` (accept inbound enquiries). Keys are
  **read‑only for listings**, **write‑only for leads** — never full API access.
- Reuse existing rate‑limit + IP allowlist + expiry + revoke. A widget key is **publishable**
  (it ends up in browser JS), so it must be low‑privilege, rate‑limited, and origin‑restricted.
- Add `allowed_origins TEXT[]` (CORS origins) alongside `allowed_ips` — widget keys are gated by
  `Origin`, server‑to‑server keys by IP.

### 3.3 `website_connections` record (per org, per service)
A small table so each service (PM, CRM) can hold its own connection + settings:
```
website_connections(
  id, organization_id, service TEXT CHECK (service IN ('pm','crm')),
  api_key_id UUID REFERENCES org_api_keys(id),
  site_url TEXT, allowed_origins TEXT[],
  auto_publish BOOLEAN DEFAULT false,      -- publish on approval without extra click
  include_sale BOOLEAN, include_rental BOOLEAN, include_lease BOOLEAN,
  branding JSONB,                          -- widget theme (colors, logo, layout)
  status TEXT, last_synced_at, created_by, created_at, updated_at
)
```
This keeps PM's and CRM's website settings independent even for the same org.

### 3.4 Inbound lead flow (CRM‑critical)
Website enquiry form → `POST /api/v1/public/leads` (auth: `leads:write` key) →
insert `property_inquiries` (org from key, `source='website'`, capture `utm_params`) →
**existing bridge** creates/attaches a CRM **deal** and routes to the agent. Reuses `deal_id`,
`lead_score`, PM Enquiries inbox. **This is the CRM half of the feature — don't skip it.**

### 3.5 Delivery mechanisms (BUILD TWO, DEFER THE REST)
1. **JSON API (developer clients)** — §3.1, documented. This *is* the "feed"; no separate XML.
2. **Embeddable widget (no‑code clients incl. WordPress)** — one `<script>` tag:
   ```html
   <script src="https://cdn.propmetrik.com/embed/listings.js"
           data-key="pmk_live_xxx" data-layout="grid"></script>
   <div id="propmetrik-listings"></div>
   ```
   Renders a responsive listing grid from the org‑scoped API, CORS‑gated by `Origin`, read‑only,
   themeable via `website_connections.branding`. Works on any site including WordPress (Custom HTML
   block) — which is why a **dedicated WordPress plugin is NOT needed at launch**.

**Deferred (build only on real client demand):** outbound push webhooks (polling is sufficient and
avoids retries/signing/dead‑letter complexity), XML feed, native WordPress plugin, GraphQL.

---

## 4. The Integrations tab (UX — both services)

Add an **Integrations** tab to PM and CRM nav; **Connect Website** is a card inside it. Shared React
components, service‑aware via a `service: 'pm' | 'crm'` prop.

**Connect Website card flow:**
1. **Connect** → enter site URL + allowed origin(s) → mint a scoped key (`listings:read` [+ `leads:write`]).
2. **Show** endpoint URL, the key (once), live docs link, and copy‑paste **widget snippet**.
3. **Settings:** which transaction types sync (sale/rental/lease), `auto_publish` toggle, widget theme.
4. **Status:** last sync, request volume (from metering), enquiries received (from `property_inquiries`),
   rotate/revoke key.

Differences by service:
- **PM:** listings source = `properties` (rentals + sales the PM manages). Enquiries → PM Enquiries inbox.
- **CRM:** listings source = `crm_properties` (agent for‑sale/for‑lease listings). Enquiries → **lead → deal**
  in the pipeline (auto‑routed to the owning agent). Surfaces "X enquiries → Y deals this month."

---

## 5. Data model changes (summary)

1. `org_api_keys`: extend `scopes` domain (`listings:read`, `leads:write`); add `allowed_origins TEXT[]`.
2. New `website_connections` table (§3.3).
3. (Optional) `property_inquiries.source` already exists — standardise `'website'`; ensure `utm_params`
   captured from the widget/form.
4. No change to core `properties` / `crm_properties` — reuse existing publish flags.

All migrations idempotent; single prod DB → show migration + run via `npm run migrate`.

---

## 6. Security & correctness (must‑haves)

- **Least privilege keys:** listings key = read‑only, published data only; leads key = write‑only to
  `property_inquiries`. Never expose internal/valuation/financial fields on the public shape.
- **Approval gate is the safety net:** nothing appears until `status='approved'` AND
  `marketplace_enabled` AND `!is_delisted`. Enforce in the query, not the client.
- **Origin/IP restriction + rate limits** on every public key (reuse `analyticsApiAccess`).
- **No enumeration:** org inferred from key; never accept a client‑supplied `organization_id`.
- **PII on inbound:** enquiry endpoint is unauthenticated‑by‑widget‑key; validate + rate‑limit +
  spam/captcha guard; store only what the form collects.
- **CORS:** listings/widget responses send `Access‑Control‑Allow‑Origin` from `allowed_origins`.
- **Caching:** ETag/`Last‑Modified` + short CDN cache on the listings feed; invalidate on publish/unpublish.

---

## 7. Public listing JSON contract (v1, illustrative)

```jsonc
GET /api/v1/public/listings?transaction_type=sale&updated_since=2026-07-01T00:00:00Z
Authorization: Bearer pmk_live_xxx        // org inferred from key
{
  "success": true,
  "count": 24,
  "total": 138,
  "next_cursor": "…",
  "data": [{
    "id": "uuid",
    "reference": "RG-000123",
    "title": "4-bed detached, East Legon",
    "transaction_type": "sale",           // sale | rental | lease
    "property_type": "residential_house",
    "status": "available",
    "price": { "amount": 3500000, "currency": "GHS", "period": null },
    "location": { "city": "Accra", "region": "greater_accra", "area": "East Legon", "lat": null, "lng": null },
    "beds": 4, "baths": 5, "size_sqm": 432, "plot_sqm": 800,
    "features": ["parking","garden","solar"],
    "images": ["https://…"], "cover_image": "https://…",
    "description": "…",
    "permalink": "https://app.propmetrik.com/p/<permanent_link_token>",
    "enquiry_url": "https://…",           // deep-link or widget form target
    "published_at": "…", "updated_at": "…"
  }]
}
```
Rules: only public‑safe fields; `updated_at` present for incremental polling; images are absolute URLs.

---

## 8. Phased roadmap

| Phase | Scope | Ships |
|---|---|---|
| **1 — Scoped feed + key scope** | Org‑scoped listings endpoint (PM+CRM union), `listings:read`/`leads:write` scopes, approval‑gated query, JSON contract v1 | Developer clients can integrate |
| **2 — Connect Website UI** | Integrations tab + Connect Website card in **both** PM and CRM; key issuance, docs, snippet, settings, status | Self‑service onboarding |
| **3 — Embeddable widget** | `listings.js` script + CORS + theming from `website_connections.branding` | No‑code / WordPress clients |
| **4 — Inbound leads polish** | `POST /public/leads` + widget enquiry form + UTM + spam guard; CRM deal auto‑routing surfaced | Round‑trip: listings out, leads in |
| **5 — On demand only** | Outbound webhooks, XML feed, native WP plugin, GraphQL | Build when a client requires it |

**MVP = Phases 1–2** (a developer client can go live). Phases 3–4 make it self‑service + no‑code.
Phase 5 stays a backlog until demand is real.

---

## 9. Open decisions (resolve at build time)

1. **Org via key vs URL** — recommend **key‑inferred** (no id in URL). Confirm.
2. **PM + CRM listing union** — one normalised endpoint reading both `properties` and `crm_properties`,
   or two endpoints? Recommend **one** endpoint, `service`/source tagged per item.
3. **Widget hosting** — CDN (`cdn.propmetrik.com`) vs served from the app. Recommend CDN + long cache.
4. **Auto‑publish default** — off (explicit publish) vs on (publish on approval). Recommend **off** default,
   per‑connection toggle.
5. **Pricing/entitlement** — is website integration a paid add‑on (like analytics) or bundled? Ties into
   the existing subscription/entitlement gating.

---

## 10. Explicitly out of scope (avoid over‑build)

- Two‑way replication / storing listing copies on the client site.
- Real‑time push (webhooks) at launch — polling `updated_since` is sufficient.
- A bespoke WordPress plugin — the widget covers WordPress.
- Separate XML/RSS feed — the JSON API is the feed.
- Per‑client one‑off integrations — everything is org‑scoped + self‑service by design.
