# PROPMETRIK Tenant Portal (Phase 4)

This is the standalone Tenant Portal application for PROPMETRIK, designed to provide a dedicated experience for potential and active tenants.

## Architecture

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + Radix UI (Shadcn patterns)
- **Port**: 3001
- **API**: Communicates with Backend on Port 4000

## Features (Phase 4 Implemented)

### 1. Application Portal (Iter 4.1)
- **Route**: `/apply/[propertyId]`
- Allows tenants to submit applications for properties.
- Multi-step wizard: Personal Info -> Employment -> References -> Review.

### 2. Status Tracking (Iter 4.2)
- **Route**: `/application/[applicationId]/status`
- Real-time tracking of application status (Submitted, Under Review, Approved, etc.).
- Displays timeline of events.

### 3. Lease Signing (Iter 4.3)
- **Route**: `/lease/[applicationId]` (alias for lease signing flow)
- Digital lease review.
- Signature pad integration for legally binding signatures.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3001](http://localhost:3001).

## Environment Variables

- `NEXT_PUBLIC_API_URL`: URL of the main PROPMETRIK backend (default: `http://localhost:4000`)
