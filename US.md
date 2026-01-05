**PropWise Platform**

**Comprehensive Product Requirements Document**

**Executive Summary**

PropWise is an enterprise-grade, AI-powered property operations and investment management platform designed to transform how real estate stakeholders collaborate throughout the entire property lifecycle. The platform serves as a unified ecosystem connecting landlords, property managers, investors, lenders, contractors, and tenants, streamlining operations from initial deal analysis and financing through ongoing property management and rent collection.

**Market Opportunity**

The property management and real estate investment software market is experiencing significant growth, driven by increasing demand for digital transformation, operational efficiency, and data-driven decision-making. Current solutions are fragmented, requiring users to maintain multiple subscriptions and integrate disparate systems. PropWise addresses this gap by providing a comprehensive, end-to-end platform that consolidates deal analysis, financing, project management, and ongoing operations into a single, intelligent system.

**Value Proposition**

PropWise delivers measurable value through:

*   **Operational Efficiency**: Reduce administrative overhead by 60% through automation and intelligent workflows
*   **Enhanced Decision-Making**: AI-powered analytics provide predictive insights for renovation costs, property valuations, and tenant risk assessment
*   **Streamlined Collaboration**: Secure, role-based networking enables seamless communication between investors, lenders, contractors, and tenants
*   **Regulatory Compliance**: Jurisdiction-aware document generation and automated compliance monitoring
*   **Financial Transparency**: Real-time financial tracking, automated bookkeeping, and seamless integration with accounting systems

**Table of Contents**

1.  [Product Vision & Strategy](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#product-vision--strategy)
2.  [User Personas & Roles](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#user-personas--roles)
3.  [Core Product Modules](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#core-product-modules)
4.  [Feature Specifications](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#feature-specifications)
5.  [Technical Architecture](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#technical-architecture)
6.  [Integration Ecosystem](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#integration-ecosystem)
7.  [Security & Compliance](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#security--compliance)
8.  [Data Architecture](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#data-architecture)
9.  [AI/ML Capabilities](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#aiml-capabilities)
10.  [Subscription Model & Pricing](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#subscription-model--pricing)
11.  [Implementation Roadmap](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#implementation-roadmap)
12.  [Success Metrics & KPIs](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#success-metrics--kpis)
13.  [Risk Assessment & Mitigation](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#risk-assessment--mitigation)
14.  [Appendices](https://claude.ai/chat/3925b065-b271-4c26-b132-2601f338dd65#appendices)

**1\. Product Vision & Strategy**

**1.1 Vision Statement**

To become the definitive platform for real estate investment and property management, empowering stakeholders with AI-driven insights, seamless collaboration tools, and comprehensive operational capabilities that drive profitability and efficiency across the entire property lifecycle.

**1.2 Strategic Objectives**

**Year 1 (Months 0-12): Foundation & Market Entry**

*   Launch MVP with core property management and deal analysis capabilities
*   Onboard 500+ properties and establish 20+ lender partnerships
*   Achieve SOC 2 Type I certification
*   Build foundational AI models for renovation cost estimation

**Year 2 (Months 13-24): Scale & Enhancement**

*   Expand to 5,000+ properties under management
*   Launch marketplace features and advanced AI capabilities
*   Achieve SOC 2 Type II certification
*   Introduce white-labeling for enterprise clients

**Year 3 (Months 25-36): Market Leadership**

*   Establish platform as industry standard with 20,000+ properties
*   Launch API ecosystem for third-party integrations
*   Expand internationally with jurisdiction-specific compliance
*   Introduce predictive maintenance and portfolio optimization AI

**1.3 Competitive Positioning**

PropWise differentiates itself through:

*   **Unified Platform Approach**: Unlike competitors focusing solely on property management (AppFolio, Buildium) or deal analysis (BiggerPockets calculators), PropWise integrates the entire workflow
*   **Lender Integration**: Direct connection to capital sources, reducing financing friction
*   **Advanced AI Capabilities**: State-of-the-art machine learning for cost estimation, valuation, and risk assessment
*   **Flexible Collaboration**: Secure networking model enabling controlled information sharing
*   **Jurisdiction Intelligence**: AI-powered compliance and document generation adapted to local regulations

**2\. User Personas & Roles**

**2.1 Primary User Roles**

**Owner / Landlord**

**Profile**: Individual or entity owning 1-50 rental properties  
**Primary Goals**: Maximize ROI, minimize vacancy, ensure compliance, streamline operations  
**Key Activities**: Portfolio oversight, financial review, strategic decision-making  
**Pain Points**: Time-consuming administrative tasks, difficulty accessing capital, limited market insights

**Core Permissions**:

*   Full property and financial data access
*   Approve major expenses and capital improvements
*   Configure payout preferences and accounting integrations
*   View consolidated reporting across portfolio

**Property Manager**

**Profile**: Professional managing properties on behalf of owners  
**Primary Goals**: Maintain high occupancy, ensure tenant satisfaction, optimize operational efficiency  
**Key Activities**: Lease management, maintenance coordination, tenant communication, reporting  
**Pain Points**: Manual processes, fragmented tools, difficulty demonstrating value to owners

**Core Permissions**:

*   Property and unit CRUD operations
*   Lease lifecycle management
*   Maintenance request handling and vendor assignment
*   Financial reporting (limited to assigned properties)
*   Tenant communication and screening

**Investor / Buyer**

**Profile**: Individual or entity seeking property acquisition opportunities  
**Primary Goals**: Identify profitable deals, secure financing, execute efficiently  
**Key Activities**: Market research, deal analysis, lender outreach, due diligence  
**Pain Points**: Limited market data, difficulty quantifying renovation costs, financing uncertainty

**Core Permissions**:

*   Property search and comparables analysis
*   Deal calculator access with scenario modeling
*   Lender connection and deal submission
*   Document sharing with connected users
*   Project management post-acquisition

**Lender**

**Profile**: Hard money, private, or institutional lender specializing in real estate  
**Primary Goals**: Originate quality loans, manage risk, streamline underwriting  
**Key Activities**: Deal review, document collection, underwriting, term sheet issuance  
**Pain Points**: Inconsistent deal packages, manual data entry, limited borrower visibility

**Core Permissions**:

*   Multi-user organization management (loan officers, underwriters)
*   Inbound deal pipeline management
*   Document request and collection workflows
*   Configurable underwriting criteria and templates
*   Credit report ordering and review
*   Term sheet generation and e-signature

**Tenant**

**Profile**: Residential tenant renting a property managed through the platform  
**Primary Goals**: Convenient rent payment, responsive maintenance, transparent communication  
**Key Activities**: Rent payment, maintenance requests, document access, communication  
**Pain Points**: Inconvenient payment methods, slow maintenance response, lack of transparency

**Core Permissions**:

*   View lease details and payment history
*   Submit and track maintenance requests with photos
*   Make rent payments via ACH or card
*   E-sign lease documents and amendments
*   Direct messaging with property manager

**Contractor / Vendor**

**Profile**: Licensed contractor or service provider performing property work  
**Primary Goals**: Secure consistent work, streamline invoicing, build reputation  
**Key Activities**: Bid submission, work order execution, progress updates, billing  
**Pain Points**: Payment delays, unclear scope, difficulty showcasing work quality

**Core Permissions**:

*   View assigned work orders and project details
*   Submit bids and proposals
*   Update task progress and upload photos
*   Submit invoices and track payment status
*   Build profile with credentials and reviews

**Platform Administrator**

**Profile**: PropWise internal staff managing platform operations  
**Primary Goals**: Ensure platform stability, support users, manage billing, maintain compliance  
**Key Activities**: User support, tenant account management, system monitoring, compliance oversight

**Core Permissions**:

*   Global user and organization management
*   Audit log access and compliance reporting
*   Subscription and billing administration
*   System configuration and feature flags
*   Analytics and usage monitoring

**2.2 Permission Model**

PropWise implements a sophisticated Role-Based Access Control (RBAC) system with multi-tenant isolation:

**Tenant Isolation**: Each organization operates within a secure, isolated tenant environment with dedicated data partitioning

**Hierarchical Permissions**: Permissions inherit from role definitions but can be customized at the organization level

**Property-Level Scoping**: Manager and contractor permissions can be scoped to specific properties or units

**Audit Trail**: All permission changes and data access logged with immutable audit records

**Just-In-Time Access**: Temporary elevated permissions for specific workflows (e.g., year-end reporting)

**3\. Core Product Modules**

**3.1 Module Overview**

PropWise is architected around ten interconnected modules, each serving specific user workflows while sharing a common data foundation:

┌─────────────────────────────────────────────────────────────┐

│ PROPWISE PLATFORM │

├─────────────────────────────────────────────────────────────┤

│ Dashboard & Alerts │ Properties │ Listings │ Deals │

├─────────────────────────────────────────────────────────────┤

│ Screening │ Maintenance │ Projects │ Transactions │

├─────────────────────────────────────────────────────────────┤

│ Documents │ Reports & Analytics │ Lenders │ Chat │

└─────────────────────────────────────────────────────────────┘

**3.2 Dashboard & Alerts Module**

**Purpose**: Provide unified visibility into portfolio performance, proactive notifications, and AI-driven insights

**Key Components**:

*   **Portfolio Overview**: Real-time metrics including occupancy rate, rent collection status, maintenance backlog, and financial performance
*   **Customizable Widgets**: Drag-and-drop interface for personalizing dashboard based on role and priorities
*   **Alert Engine**: Configurable notifications for critical events (overdue rent, lease expiration, maintenance escalation, document expiry)
*   **AI Insights Panel**: Proactive recommendations based on predictive analytics (vacancy risk, maintenance forecasting, market opportunities)
*   **Quick Actions**: One-click access to common workflows (add property, create listing, process payment, submit maintenance)

**User Stories**:

*   As a landlord, I want to see my portfolio occupancy and YTD revenue at a glance so I can assess performance quickly
*   As a property manager, I want to receive alerts for leases expiring within 60 days so I can initiate renewal conversations proactively
*   As an investor, I want AI insights highlighting properties meeting my acquisition criteria so I can act on opportunities faster

**3.3 Properties Module**

**Purpose**: Centralized repository for all property and unit information with comprehensive lifecycle management

**Key Components**:

*   **Property Repository**: Structured storage of property details (address, type, specifications, ownership, acquisition details)
*   **Unit Management**: Individual unit tracking with bed/bath configuration, square footage, amenities, photos, and 3D tours
*   **Document Library**: Associated documents (deeds, insurance policies, inspection reports, warranties) with version control
*   **Historical Records**: Transaction history, previous tenants, maintenance logs, renovation records
*   **Geospatial Features**: Map-based property visualization with radius search and neighborhood analysis
*   **Valuation Tracking**: Historical value estimates and comparable sales monitoring

**Technical Requirements**:

*   Support for 10,000+ properties per tenant
*   Sub-second query performance for property search
*   Geospatial indexing for location-based queries
*   Image storage with automatic compression and CDN delivery
*   Property data import via CSV, API, or MLS integration

**3.4 Listings Module**

**Purpose**: Comprehensive listing management with multi-channel syndication and lead capture

**Key Components**:

*   **Listing Creator**: Guided workflow for creating compelling property listings with AI-powered copywriting assistance
*   **Media Management**: Photo galleries, virtual tours, floor plans, and video uploads with automatic optimization
*   **Syndication Engine**: One-click publishing to authorized portals (MLS, Zillow, Redfin, Apartments.com, etc.)
*   **Status Workflow**: Lifecycle management (Coming Soon → Active → Under Contract → Rented/Sold)
*   **Lead Management**: Inquiry capture, automated response, lead scoring, and CRM integration
*   **Performance Analytics**: View counts, inquiry rates, time-on-market metrics

**Syndication Partners**:

*   MLS/IDX providers (via licensed data feeds)
*   Zillow Rental Manager API
*   Apartments.com partner integration
*   Facebook Marketplace automation
*   Custom portal APIs

**3.5 Screening Module**

**Purpose**: Comprehensive tenant screening with integrated background check services ensuring FCRA compliance

**Key Components**:

*   **Screening Workflow**: Applicant invitation, consent collection, report ordering, review interface
*   **Multi-Provider Integration**: Unified interface for Experian, TransUnion, and specialized screening services
*   **Report Dashboard**: Consolidated view of credit, criminal background, eviction history, income verification, rental history
*   **AI Risk Scoring**: Machine learning model analyzing multiple data points to generate tenant risk assessment
*   **Compliance Manager**: Automated adverse action letter generation and FCRA documentation

**Integrated Screening Providers**:

| Provider | Services | Payment Model | Integration Type |
| --- | --- | --- | --- |
| Experian Connect | Credit, rental history, fraud detection | Pay-per-screen | REST API |
| RentRisk | Modular screening with Experian + Plaid | Pay-per-screen | REST API |
| RentSpree | TransUnion credit, eviction, background | Applicant pays | Embedded widget |
| Baselane | Credit, eviction, rental history, analytics | Applicant pays | Webhook API |
| Rentberry | Credit, background (TransUnion) | Applicant pays | Embedded widget |

**Compliance Features**:

*   FCRA-compliant consent workflows
*   Automated adverse action letter generation
*   Audit trail for all screening activities
*   Applicant rights notifications
*   Data retention and purging policies

**3.6 Maintenance Module**

**Purpose**: End-to-end maintenance request management from submission through resolution

**Key Components**:

*   **Request Submission**: Multi-channel intake (tenant portal, email, SMS, mobile app) with photo/video attachments
*   **AI Triage**: Automatic classification (emergency, urgent, routine) and priority assignment
*   **Vendor Marketplace**: Network of vetted contractors with ratings, specializations, and availability
*   **Work Order Management**: Assignment, scheduling, progress tracking, photo documentation
*   **Cost Tracking**: Estimate vs. actual cost analysis with budget alerts
*   **Inspection Checklists**: Standardized templates for routine inspections and move-in/move-out conditions
*   **Tenant Communication**: Automated status updates and completion notifications

**AI-Powered Features**:

*   Intelligent request categorization and priority assignment
*   Predictive maintenance recommendations based on property age and systems
*   Vendor suggestion based on job type, location, and past performance
*   Cost estimation using historical data and regional averages

**3.7 Deals & Lenders Module**

**Purpose**: Sophisticated deal analysis tools with direct lender connectivity for streamlined financing

**Key Components**:

**Deal Calculator**

*   **Strategy Selection**: Flip, Buy & Hold (Rental), BRRRR, or Custom scenarios
*   **Input Framework**:
    *   Acquisition: Purchase price, closing costs, down payment
    *   Renovation: Itemized scope with AI-powered cost estimation
    *   Financing: Terms, rates, points, amortization
    *   Operations: Vacancy assumptions, management fees, insurance, taxes, utilities
    *   Exit: Holding period, disposition costs, appreciation assumptions
*   **Output Metrics**:
    *   **Flip**: ARV, profit, ROI, annualized return, time to profit
    *   **Rental**: Cash flow, cap rate, cash-on-cash return, IRR, equity buildup, break-even analysis
    *   **BRRRR**: Refinance analysis, cash recovery, long-term cash flow
*   **Comparables Engine**: Automated comp pulling with filters (bed/bath, square footage, age, condition) and statistical analysis (median, quartiles, price per sqft)
*   **Scenario Modeling**: Side-by-side comparison of multiple strategies or renovation scopes

**Lender Marketplace**

*   **Lender Profiles**: Detailed information on loan products, terms, geographic focus, property types, and underwriting criteria
*   **Rating System**: Verified reviews from borrowers, approval rates, closing times, and responsiveness scores
*   **Deal Submission**: Structured package including property details, analysis results, renovation scope, borrower profile, and supporting documents
*   **Pipeline Management**: Multi-stage workflow (Submitted → Under Review → Documents Requested → Underwriting → Term Sheet → Closing)
*   **Document Portal**: Secure exchange of financial statements, property inspections, appraisals, and legal documents
*   **Term Sheet Workflow**: Lender-generated term sheets with electronic acceptance and counter-offer capability

**Lender Organization Features**:

*   Multi-user management (admins, loan officers, underwriters, processors)
*   Configurable underwriting templates (DSCR thresholds, LTV limits, property type restrictions)
*   Automated credit pulls via Experian/Equifax APIs
*   Borrower KYC and verification workflows
*   Portfolio-level analytics and origination reporting

**3.8 Projects Module**

**Purpose**: Comprehensive project management for renovations and capital improvements

**Key Components**:

*   **Deal-to-Project Conversion**: Seamlessly convert deal calculator inputs into actionable project plans
*   **Task Management**: Gantt charts, Kanban boards, milestone tracking, dependencies, and critical path analysis
*   **Budget Tracking**: Budget vs. actual analysis with variance alerts and change order management
*   **Contractor Portal**: Dedicated interface for viewing assignments, uploading progress, and submitting invoices
*   **Draw Management**: Lender draw requests tied to milestone completion with photo verification
*   **Photo Timeline**: Chronological visual documentation of project progression
*   **Inspection Scheduler**: Coordinate required inspections (permits, lender, final walkthrough)
*   **Material Procurement**: Track material orders, deliveries, and associated costs

**Change Order Workflow**:

1.  Project manager or contractor proposes change with justification and cost impact
2.  Owner/investor reviews and approves or negotiates
3.  Budget automatically updates and deal metrics recalculate
4.  Lender notified if additional funding required

**3.9 Transactions & Bookkeeping Module**

**Purpose**: Automated financial management with integrated payment processing and accounting

**Key Components**:

**Rent Collection**

*   **Payment Methods**: ACH (via Plaid), credit/debit cards (via Stripe), manual cash/check recording
*   **Recurring Billing**: Automated monthly rent charges with configurable due dates
*   **Late Fee Engine**: Automatic calculation and application based on jurisdiction-specific rules
*   **Payment Plans**: Structured repayment arrangements for past-due balances
*   **Tenant Portal**: Self-service payment history, upcoming charges, receipt downloads

**Financial Management**

*   **Chart of Accounts**: Pre-configured for rental properties with customization options
*   **Automatic Categorization**: AI-powered transaction classification (rent, utilities, maintenance, etc.)
*   **Property-Level P&L**: Individual property income statements and cash flow analysis
*   **Owner Distributions**: Automated payout scheduling via Stripe Connect or ACH
*   **1099 Management**: Contractor payment tracking and year-end 1099 generation
*   **Reconciliation**: Bank feed integration via Plaid for automatic reconciliation

**Accounting Integration**

*   **QuickBooks Online**: Bi-directional sync of transactions, vendors, and chart of accounts
*   **Xero**: Full integration with automatic invoice and bill creation
*   **Export Capabilities**: CSV, QBO, and Excel formats for external accounting systems

**3.10 Documents & E-Sign Module**

**Purpose**: Secure document management with intelligent generation and electronic signature capabilities

**Key Components**:

**Storage Architecture**

*   **Tiered Storage Plans**:
    *   Starter: 50 GB on AWS S3 Standard
    *   Professional: 100 GB with Glacier archival option
    *   Enterprise: Custom storage with dedicated buckets
*   **Organization**: Hierarchical folder structure (Properties → Units → Document Types)
*   **Metadata**: Tagging, custom fields, relationship mapping (document ↔ property/tenant/project)
*   **Version Control**: Automatic versioning with change tracking and rollback capability
*   **Lifecycle Management**: Automated archival to Glacier after 180 days of inactivity

**Document Generation**

*   **AI-Powered Templates**: Jurisdiction-aware lease agreements, addendums, notices, and disclosures
*   **Merge Fields**: Dynamic population from property, tenant, and lease data
*   **Template Library**: 50+ pre-built templates covering common scenarios
*   **Custom Templates**: User-created templates with merge field mapping

**Template Categories**:

*   Lease Agreements (residential, commercial, month-to-month)
*   Lease Addendums (pet policy, parking, utilities, modifications)
*   Notices (rent increase, lease termination, entry notification, violation)
*   Inspection Forms (move-in, move-out, periodic, maintenance)
*   Contractor Agreements (service contracts, bids, change orders)
*   Financial Forms (W-9, 1099, rent receipts, security deposit disposition)

**E-Signature Integration**

*   **Provider Options**: DocuSign, HelloSign, Adobe Sign
*   **Workflow Features**: Multi-party signing, signing order control, field validation, witness requirements
*   **Audit Trail**: Complete signing history with timestamps and IP addresses
*   **Mobile Optimization**: Responsive signing experience across devices

**AI Lease Generation Workflow**:

1.  User selects jurisdiction and lease type
2.  AI (fine-tuned LLM) generates compliant draft based on local regulations
3.  User reviews and customizes provisions
4.  Merge fields auto-populate from property and tenant data
5.  Document sent for e-signature with automatic reminders
6.  Signed document automatically stored and indexed

**3.11 Reports & Analytics Module**

**Purpose**: Comprehensive reporting and business intelligence for data-driven decision making

**Key Components**:

**Standard Reports**

*   **Financial Reports**:
    *   Rent roll with occupancy and collection rates
    *   Property-level P&L and cash flow statements
    *   Portfolio-level income statements and balance sheets
    *   Owner distribution summaries
    *   Tax preparation packages (Schedule E support)
*   **Operational Reports**:
    *   Maintenance response time and resolution metrics
    *   Lease expiration schedules and renewal rates
    *   Tenant screening outcomes and approval rates
    *   Vendor performance scorecards
    *   Project status and budget variance
*   **Market Reports**:
    *   Comparable sales and rental analysis
    *   Market rent trends by neighborhood
    *   Occupancy rates by property type and location
    *   Investment performance benchmarking

**Custom Report Builder**

*   Drag-and-drop interface for creating custom reports
*   Filter, group, and sort capabilities
*   Calculated fields and aggregations
*   Scheduled report generation and distribution
*   Export formats: PDF, Excel, CSV

**AI Insights & Predictions**

*   **Occupancy Forecasting**: Predict vacancy risk based on lease expirations, market conditions, and historical patterns
*   **Rent Optimization**: Recommend optimal rent pricing based on comps, property features, and demand signals
*   **Maintenance Predictions**: Anticipate major system failures based on property age and maintenance history
*   **Portfolio Recommendations**: Identify acquisition and disposition opportunities based on performance metrics

**3.12 Cash Management Module**

**Purpose**: Advanced treasury management for sophisticated investors and property managers

**Key Components**:

*   **Multi-Account Management**: Connect and monitor multiple bank accounts via Plaid integration
*   **Operating Reserve**: Automated reserve funding based on configurable rules (% of rent, fixed amount per unit)
*   **Escrow Accounts**: Dedicated accounts for security deposits with interest tracking (where required by law)
*   **Owner Distributions**: Automated or manual payout scheduling with waterfall logic
*   **Reconciliation Dashboard**: Real-time view of all accounts with transaction categorization
*   **Fund Routing**: Intelligent routing of incoming rent to operating account, reserves, and owner distributions
*   **Yield Optimization**: Integration with high-yield savings partners (Baselane-style) for idle cash

**Cash Flow Forecasting**:

*   Project future cash positions based on scheduled rent, known expenses, and historical patterns
*   Scenario analysis for capital improvements or acquisitions
*   Alert system for projected shortfalls

**3.13 Collaboration & Communication Module**

**Purpose**: Secure, contextual communication between platform participants

**Key Components**:

**Connection Management**

*   **Request System**: Users send connection requests explaining relationship and intended collaboration
*   **Privacy Controls**: Conversations and data sharing only available between connected users
*   **Network Types**: Professional connections (investor-lender), service connections (manager-contractor), tenant connections
*   **Connection Levels**: Basic (messaging only), Enhanced (document sharing), Full (deal collaboration)

**Messaging System**

*   **1:1 Conversations**: Direct messaging between connected users
*   **Group Conversations**: Multi-party discussions around properties, projects, or deals
*   **Threaded Replies**: Organized conversation structure for complex discussions
*   **Rich Media**: Support for photos, documents, videos, and voice messages
*   **Context Links**: Reference properties, deals, projects, or work orders within conversations
*   **Search & Archive**: Full-text search of message history with archival capabilities

**Video Conferencing**

*   **Integrated Meetings**: Create and join video calls without leaving the platform
*   **Provider Options**: Google Meet API, Zoom SDK, or embedded WebRTC solution
*   **Screen Sharing**: Share property photos, deal calculators, or documents during calls
*   **Recording**: Optional call recording with participant consent (cloud storage)
*   **Scheduling**: Calendar integration for scheduling property tours or project meetings

**Notification System**

*   **Multi-Channel**: In-app, email, SMS, and push notifications (mobile apps)
*   **Granular Controls**: User-configurable notification preferences by event type and urgency
*   **Digest Options**: Real-time, hourly, or daily digest formats
*   **Priority Routing**: Emergency notifications (urgent maintenance) bypass quiet hours

**4\. Feature Specifications**

**4.1 Priority Classification**

Features are classified using MoSCoW prioritization for MVP and subsequent releases:

**Must Have (MVP)**: Core functionality required for minimum viable product launch **Should Have (V1)**: Important features for competitive positioning and user satisfaction **Could Have (V2)**: Enhancements that improve user experience but aren't critical **Won't Have (Deferred)**: Features explicitly deferred to future consideration

**4.2 Feature Matrix**

| Feature | Priority | Target Release | Dependencies |
| --- | --- | --- | --- |
| User authentication & RBAC | Must Have | MVP | None |
| Property & unit CRUD | Must Have | MVP | Authentication |
| Basic lease management | Must Have | MVP | Properties, E-sign integration |
| Maintenance ticketing | Must Have | MVP | Properties, File upload |
| Deal calculator (basic) | Must Have | MVP | None |
| Stripe integration (subscriptions) | Must Have | MVP | Payment provider account |
| Document storage (S3) | Must Have | MVP | AWS infrastructure |
| Basic messaging | Must Have | MVP | Connection management |
| Email notifications (SES) | Must Have | MVP | AWS infrastructure |
| Rent collection (ACH/Card) | Should Have | V1 | Stripe, Plaid |
| Lender module & deal submission | Should Have | V1 | Deal calculator, Messaging |
| Screening integrations | Should Have | V1 | Provider partnerships |
| Project management | Should Have | V1 | Deal calculator |
| Comparables API integration | Should Have | V1 | Data provider licensing |
| QuickBooks/Xero export | Should Have | V1 | Accounting APIs |
| AI renovation estimator | Should Have | V1 | ML infrastructure |
| Video conferencing | Should Have | V1 | Google Meet/Zoom APIs |
| Advanced reporting | Could Have | V2 | Data warehouse |
| MLS/IDX syndication | Could Have | V2 | MLS partnerships |
| AI lease generation | Could Have | V2 | LLM integration |
| Tenant risk scoring | Could Have | V2 | ML models, Historical data |
| Marketplace features | Could Have | V2 | Vendor onboarding |
| White-labeling | Won't Have | V3+ | Enterprise infrastructure |
| International expansion | Won't Have | V3+ | Legal review, Localization |

**4.3 Detailed Feature Acceptance Criteria**

**User Authentication & Authorization**

**Functional Requirements**:

*   FR-AUTH-001: System shall support email/password authentication with bcrypt hashing (cost factor 12)
*   FR-AUTH-002: System shall enforce password complexity (min 12 characters, uppercase, lowercase, number, special character)
*   FR-AUTH-003: System shall implement OAuth2 with JWT access tokens (15 min expiry) and refresh tokens (30 day expiry)
*   FR-AUTH-004: System shall support multi-factor authentication via TOTP (Google Authenticator, Authy) for sensitive roles
*   FR-AUTH-005: System shall implement role-based access control with property-level permission scoping
*   FR-AUTH-006: System shall log all authentication attempts and permission changes to audit trail

**Non-Functional Requirements**:

*   NFR-AUTH-001: Authentication API response time < 200ms at 95th percentile
*   NFR-AUTH-002: Support 1000 concurrent authentication requests
*   NFR-AUTH-003: Password reset links valid for 1 hour with one-time use

**Acceptance Criteria**:

*   AC-AUTH-001: User can register with email and password meeting complexity requirements
*   AC-AUTH-002: User receives verification email within 30 seconds of registration
*   AC-AUTH-003: User can log in and receive JWT tokens with appropriate claims
*   AC-AUTH-004: Expired access tokens automatically refresh using valid refresh token
*   AC-AUTH-005: Invalid refresh token returns 401 and requires re-authentication
*   AC-AUTH-006: MFA-enabled user prompted for TOTP code after password validation
*   AC-AUTH-007: User with insufficient permissions receives 403 when accessing restricted resource

**Property & Unit Management**

**Functional Requirements**:

*   FR-PROP-001: System shall store property details (address with geocoding, type, year built, lot size, structure details)
*   FR-PROP-002: System shall support multiple units per property with individual configurations
*   FR-PROP-003: System shall upload and store property photos (max 50 per property, 10MB per photo)
*   FR-PROP-004: System shall automatically compress and optimize images for web delivery
*   FR-PROP-005: System shall support bulk property import via CSV with validation and error reporting
*   FR-PROP-006: System shall maintain property ownership history and transfer records
*   FR-PROP-007: System shall calculate and display property-level metrics (occupancy, revenue, expenses)

**Non-Functional Requirements**:

*   NFR-PROP-001: Property search returns results < 300ms for queries with < 1000 results
*   NFR-PROP-002: Image upload and processing completes < 5 seconds per image
*   NFR-PROP-003: Support 100,000 properties per tenant with consistent performance

**Acceptance Criteria**:

*   AC-PROP-001: User can create property with complete details and photos
*   AC-PROP-002: Property appears in property list immediately after creation
*   AC-PROP-003: User can search properties by address, zip, or custom criteria with instant results
*   AC-PROP-004: Uploaded photos automatically resize to 1920px max dimension and convert to WebP
*   AC-PROP-005: Property map view displays all properties with accurate geocoded locations
*   AC-PROP-006: CSV import validates required fields and provides detailed error report for invalid rows
*   AC-PROP-007: Property detail page shows accurate occupancy and financial summary

**Deal Calculator**

**Functional Requirements**:

*   FR-DEAL-001: System shall support three calculation strategies (Flip, Buy & Hold, BRRRR)
*   FR-DEAL-002: System shall accept detailed input parameters across acquisition, renovation, financing, and operations
*   FR-DEAL-003: System shall calculate and display key metrics appropriate to selected strategy
*   FR-DEAL-004: System shall save multiple scenarios for side-by-side comparison
*   FR-DEAL-005: System shall integrate with comparables API to auto-populate ARV and rental estimates
*   FR-DEAL-006: System shall invoke AI model for renovation cost estimation based on scope
*   FR-DEAL-007: System shall allow customization of all calculated assumptions and ranges
*   FR-DEAL-008: System shall export deal analysis to PDF with charts and summary

**Acceptance Criteria**:

*   AC-DEAL-001: User selects Flip strategy, inputs purchase price and renovation scope, receives ARV estimate and profit calculation
*   AC-DEAL-002: User selects Buy & Hold strategy, receives monthly cash flow and cap rate calculation
*   AC-DEAL-003: AI renovation estimator returns itemized cost breakdown with total and timeline estimate
*   AC-DEAL-004: Comparables section displays minimum 5 relevant properties when available
*   AC-DEAL-005: User can save and name scenario, then create alternate scenario with different assumptions
*   AC-DEAL-006: Scenario comparison view displays side-by-side metrics with delta calculations
*   AC-DEAL-007: Deal export PDF includes all inputs, assumptions, calculations, and charts
*   AC-DEAL-008: Changes to inputs trigger real-time recalculation of all dependent metrics

**Tenant Screening**

**Functional Requirements**:

*   FR-SCREEN-001: System shall integrate with minimum 3 screening providers (Experian, TransUnion via RentSpree, Baselane)
*   FR-SCREEN-002: System shall collect FCRA-compliant consent from applicants
*   FR-SCREEN-003: System shall submit screening request to selected provider via API
*   FR-SCREEN-004: System shall retrieve and store screening reports securely (encrypted at rest)
*   FR-SCREEN-005: System shall generate AI-powered tenant risk score based on credit, rental history, and income verification
*   FR-SCREEN-006: System shall automatically generate adverse action letters when applicant is denied based on screening
*   FR-SCREEN-007: System shall maintain audit trail of all screening activities for compliance

**Acceptance Criteria**:

*   AC-SCREEN-001: Property manager initiates screening, applicant receives consent form via email/SMS
*   AC-SCREEN-002: Applicant completes consent form, screening automatically orders from selected provider
*   AC-SCREEN-003: Screening report available within provider SLA (typically 1-5 minutes)
*   AC-SCREEN-004: AI risk score displays with explanation of contributing factors
*   AC-SCREEN-005: Manager can review full report including credit, criminal, eviction, and rental history
*   AC-SCREEN-006: Adverse action workflow triggers when applicant denied, auto-generates compliant letter
*   AC-SCREEN-007: All screening reports stored with AES-256 encryption and auto-purge after retention period

**5\. Technical Architecture**

**5.1 Architecture Overview**

PropWise employs a modern, cloud-native microservices architecture designed for scalability, resilience, and maintainability. The system is decomposed into domain-specific services communicating via RESTful APIs and asynchronous messaging.

┌─────────────────────────────────────────────────────────────────┐

│ CLIENT TIER │

├──────────────────┬──────────────────┬───────────────────────────┤

│ Web App │ Mobile Apps │ Admin Portal │

│ (Next.js) │ (React Native) │ (React) │

└────────┬─────────┴────────┬─────────┴──────────┬────────────────┘

│ │ │

└──────────────────┴────────────────────┘

│

┌──────────────────▼─────────────────────┐

│ AWS API Gateway / CloudFront │

│ (SSL/TLS, Rate Limiting, WAF) │

└──────────────────┬─────────────────────┘

│

┌──────────────────▼─────────────────────┐

│ APPLICATION TIER │

│ (Microservices on EKS) │

├─────────────────────────────────────────┤

│ Auth Property Deal Financial │

│ Service Service Service Service │

│ │

│ Lender Project Comms Document │

│ Service Service Service Service │

│ │

│ Screen AI/ML Admin Analytics │

│ Service Service Service Service │

└──────────────────┬─────────────────────┘

│

┌──────────────────▼─────────────────────┐

│ DATA TIER │

├──────────────┬──────────────┬──────────┤

│ PostgreSQL │ Redis │ S3 │

│ (RDS) │ (Cache) │ (Docs) │

├──────────────┼──────────────┼──────────┤

│ Elasticsearch│ RabbitMQ │ SageMaker│

│ (Search) │ (Queue) │ (ML) │

└──────────────┴──────────────┴──────────┘

**5.2 Technology Stack**

**Frontend Stack**

**Web Application**

*   **Framework**: Next.js 14+ (React 18+)
    *   Server-side rendering for SEO-critical pages (listings, public profiles)
    *   Static generation for documentation and marketing content
    *   API routes for backend-for-frontend patterns
*   **State Management**: Zustand for global state, React Query for server state
*   **UI Components**:
    *   Tailwind CSS 3+ for styling
    *   shadcn/ui for accessible component primitives
    *   Recharts for data visualization
    *   React Hook Form for form handling with Zod validation
*   **Maps**: Mapbox GL JS for property mapping and geospatial features
*   **Real-time**: Socket.io client for chat and notifications

**Mobile Applications**

*   **Framework**: React Native 0.72+
    *   Shared business logic with web via Yarn workspaces
    *   Platform-specific optimizations for iOS and Android
*   **Navigation**: React Navigation 6+
*   **State Management**: Zustand (shared with web)
*   **Native Modules**:
    *   React Native Camera for photo capture
    *   React Native Document Picker for file uploads
    *   Plaid Link SDK for bank connection

**Admin Portal**

*   **Framework**: React with Vite for fast development
*   **Admin Components**: React Admin framework for CRUD operations
*   **Monitoring Dashboards**: Grafana embedded iframes

**Backend Stack**

**Primary API Services**

*   **Language**: Python 3.11+
*   **Framework**: FastAPI 0.104+
    *   Async/await for I/O-bound operations
    *   Automatic OpenAPI documentation
    *   Built-in validation with Pydantic v2
    *   Dependency injection for clean architecture
*   **ORM**: SQLAlchemy 2.0+ with async support
*   **Migration**: Alembic for database version control
*   **Validation**: Pydantic models for request/response schemas
*   **Authentication**: Python-JOSE for JWT handling, passlib for password hashing
*   **Testing**: pytest with pytest-asyncio, coverage >85% target

**Real-time Communication Service**

*   **Language**: Node.js 18+ (LTS)
*   **Framework**: Express.js with Socket.io for WebSocket support
*   **Purpose**: Handles chat, notifications, and real-time updates
*   **Rationale**: Node.js excels at concurrent connections and event-driven architecture

**Service Architecture Pattern**

*   Domain-driven design with bounded contexts
*   Each service owns its database schema (logical separation in PostgreSQL)
*   Services communicate via:
    *   Synchronous: RESTful APIs (service-to-service)
    *   Asynchronous: RabbitMQ for events and background jobs
*   API Gateway pattern for client-facing APIs

**Core Microservices**

| Service | Responsibility | Tech Stack | Port |
| --- | --- | --- | --- |
| Auth Service | Authentication, authorization, user management | FastAPI + Redis | 8001 |
| Property Service | Properties, units, leases, tenants | FastAPI + PostgreSQL | 8002 |
| Deal Service | Deal calculator, scenarios, lender submission | FastAPI + PostgreSQL | 8003 |
| Financial Service | Payments, bookkeeping, transactions | FastAPI + Stripe SDK | 8004 |
| Lender Service | Lender portal, deal pipeline, underwriting | FastAPI + PostgreSQL | 8005 |
| Project Service | Project management, tasks, contractors | FastAPI + PostgreSQL | 8006 |
| Screening Service | Background checks, credit reports | FastAPI + Provider SDKs | 8007 |
| Document Service | File storage, versioning, e-sign integration | FastAPI + S3 SDK | 8008 |
| Communication Service | Chat, video, notifications | Node.js + Socket.io | 8009 |
| AI/ML Service | Model inference, cost estimation, predictions | FastAPI + SageMaker | 8010 |
| Analytics Service | Reporting, business intelligence | FastAPI + PostgreSQL | 8011 |
| Admin Service | Platform management, billing | FastAPI + Stripe | 8012 |

**Data Layer**

**Primary Database**

*   **Technology**: PostgreSQL 15+
*   **Hosting**: AWS RDS Multi-AZ deployment
*   **Configuration**:
    *   Instance class: db.r6g.xlarge (4 vCPU, 32GB RAM) for production
    *   Storage: GP3 SSD with 10,000 IOPS provisioned
    *   Automated backups: daily with 30-day retention
    *   Point-in-time recovery enabled
*   **Features Utilized**:
    *   Row-Level Security (RLS) for tenant isolation
    *   PostGIS extension for geospatial queries
    *   Full-text search with tsvector
    *   JSONB columns for flexible attributes
    *   Partitioning for large tables (transactions, audit logs)

**Caching Layer**

*   **Technology**: Redis 7+ (AWS ElastiCache)
*   **Configuration**:
    *   Cluster mode enabled with 3 shards, 1 replica per shard
    *   Instance type: cache.r6g.large (2 vCPU, 13GB RAM)
*   **Use Cases**:
    *   Session storage (JWT token blacklist)
    *   API response caching (comparables, property search)
    *   Rate limiting counters
    *   Real-time leaderboards and counters
    *   Pub/Sub for notifications

**Search Engine**

*   **Technology**: Elasticsearch 8+ (AWS OpenSearch Service)
*   **Configuration**:
    *   3 data nodes (r6g.large.search) for high availability
    *   1 dedicated master node
*   **Indexes**:
    *   Properties (full-text search, geospatial)
    *   Comparables (fast filtering and aggregations)
    *   Documents (content search)
*   **Features**:
    *   Synonyms for property search (apt ↔ apartment)
    *   Fuzzy matching for addresses
    *   Aggregations for faceted search

**Object Storage**

*   **Technology**: AWS S3
*   **Bucket Structure**:
    *   propwise-prod-documents: Lease PDFs, reports, signed agreements
    *   propwise-prod-photos: Property photos, maintenance images
    *   propwise-prod-backups: Database dumps, logs
    *   propwise-prod-ml-models: Trained model artifacts
*   **Configuration**:
    *   Server-side encryption (SSE-S3, AES-256)
    *   Versioning enabled on documents bucket
    *   Lifecycle policies: transition to Glacier after 180 days (documents), 365 days (photos)
    *   CloudFront CDN for photo delivery
    *   Pre-signed URLs for secure, temporary access
*   **Compliance**: Object Lock for WORM (write-once-read-many) on legal documents

**Message Queue**

*   **Technology**: RabbitMQ 3.12+ (AWS MQ)
*   **Configuration**: Cluster with 3 brokers for high availability
*   **Queues**:
    *   email.notifications: Email sending tasks
    *   screening.requests: Background check processing
    *   document.generation: PDF generation, e-sign initiation
    *   analytics.events: Analytics event processing
    *   ml.inference: ML model prediction requests
    *   data.sync: Third-party API syncs (Zillow, QuickBooks)
*   **Pattern**: Publish-subscribe with durable queues and dead-letter exchanges

**Data Warehouse**

*   **Technology**: AWS Redshift (introduced in V2)
*   **Purpose**: Historical analytics, complex reporting, ML training data
*   **ETL**: AWS Glue jobs for nightly PostgreSQL → Redshift sync

**AI/ML Infrastructure**

**Model Development**

*   **Languages**: Python 3.11+ with scikit-learn, XGBoost, PyTorch
*   **Environment**: Jupyter notebooks on SageMaker Studio
*   **Experiment Tracking**: MLflow for experiment logging and model registry
*   **Feature Store**: SageMaker Feature Store for shared features

**Model Deployment**

*   **Hosting**: AWS SageMaker Endpoints with auto-scaling
*   **Models in Production**:
    *   **Renovation Cost Estimator**: XGBoost regression model
        *   Inputs: Property characteristics, scope items, zip code
        *   Output: Cost range (low, mid, high estimates)
        *   Inference time: <200ms
    *   **Tenant Risk Scoring**: Ensemble (Random Forest + Logistic Regression)
        *   Inputs: Credit score, income ratio, rental history, eviction records
        *   Output: Risk score (0-100) with explanation
        *   Inference time: <100ms
    *   **Rent/ARV Predictor**: Gradient boosting with market data
        *   Inputs: Property features, comparables, market trends
        *   Output: Rent/value range with confidence intervals
        *   Inference time: <300ms
*   **Monitoring**: SageMaker Model Monitor for data drift detection

**LLM Integration**

*   **Providers**: OpenAI API (GPT-4) or Anthropic Claude API
*   **Use Cases**:
    *   AI lease generation (jurisdiction-aware)
    *   Property description copywriting
    *   Maintenance request categorization
    *   Chat assistance for deal analysis
*   **Implementation**:
    *   LangChain for prompt management and chaining
    *   Vector database (Pinecone) for jurisdiction-specific legal context
    *   Prompt templates with few-shot examples
    *   Output validation and sanitization
    *   Cost monitoring and rate limiting

**Cloud Infrastructure**

**Compute**

*   **Container Orchestration**: AWS EKS (Elastic Kubernetes Service)
    *   Kubernetes 1.28+
    *   3 node groups: general (t3.large), compute (c6i.xlarge), memory (r6i.xlarge)
    *   Horizontal Pod Autoscaler based on CPU/memory and custom metrics
    *   Cluster Autoscaler for node scaling
*   **Containerization**: Docker with multi-stage builds
*   **Registry**: AWS ECR for container images

**Networking**

*   **VPC**: Custom VPC with public and private subnets across 3 AZs
*   **Load Balancer**: Application Load Balancer (ALB) with SSL termination
*   **API Gateway**: AWS API Gateway for external API access
    *   Request/response transformation
    *   API key management for partners
    *   Usage plans and throttling
*   **CDN**: CloudFront for global asset delivery
*   **DNS**: Route 53 with health checks and failover

**Security Infrastructure**

*   **Secrets Management**: AWS Secrets Manager for API keys, database credentials
*   **Key Management**: AWS KMS for encryption key management
*   **Certificate Management**: AWS ACM for SSL/TLS certificates
*   **WAF**: AWS WAF with OWASP Top 10 rule set
*   **DDoS Protection**: AWS Shield Standard (included)

**Monitoring & Observability**

*   **Metrics**: Prometheus for application metrics, CloudWatch for AWS metrics
*   **Visualization**: Grafana dashboards with custom panels
*   **Logging**:
    *   Application logs: Structured JSON to CloudWatch Logs
    *   Aggregation: ELK Stack (Elasticsearch, Logstash, Kibana)
    *   Retention: 30 days hot, 1 year archive
*   **Tracing**: AWS X-Ray for distributed tracing
*   **Error Tracking**: Sentry for error aggregation and alerting
*   **Uptime Monitoring**: Pingdom for external endpoint monitoring

**CI/CD Pipeline**

*   **Version Control**: GitHub with protected main branch
*   **CI**: GitHub Actions workflows
    *   Trigger: Push to feature branch
    *   Steps: Lint → Unit tests → Integration tests → Build → Push to ECR
    *   Quality gates: 85% code coverage, 0 high-severity vulnerabilities
*   **CD**: ArgoCD for GitOps-based deployments
    *   Environments: dev → staging → production
    *   Automated deployments to dev
    *   Manual approval for staging/production
    *   Rollback capability
*   **Infrastructure as Code**: Terraform for all AWS resources
    *   Modules for common patterns (service, database, queue)
    *   State stored in S3 with DynamoDB locking
    *   Drift detection via scheduled runs

**5.3 Multi-Tenancy Strategy**

PropWise implements a **hybrid multi-tenancy model** balancing cost efficiency with data isolation:

**Tenant Isolation Approach**

**Shared Database with Row-Level Security (Default)**

*   All tenants share PostgreSQL instance and schemas
*   tenant\_id column on every table
*   Row-Level Security (RLS) policies enforce automatic filtering
*   Application middleware injects tenant context
*   Cost-effective for small to mid-size tenants
*   Enables cross-tenant analytics for platform insights

**Dedicated Schema per Tenant (Premium)**

*   Each premium tenant receives dedicated PostgreSQL schema
*   Improved logical isolation and simplified backup/restore
*   Better performance isolation for large tenants
*   Available for Professional tier and above

**Dedicated Database per Tenant (Enterprise)**

*   Fully isolated RDS instance per enterprise tenant
*   Complete data sovereignty and compliance assurance
*   Custom backup schedules and retention policies
*   Dedicated Redis and S3 buckets
*   Available for Enterprise tier (custom pricing)

**Implementation Details**

\# Tenant Context Middleware (FastAPI)

@app.middleware("http")

async def tenant\_context\_middleware(request: Request, call\_next):

\# Extract tenant from JWT claims or subdomain

tenant\_id = extract\_tenant\_from\_request(request)

\# Set tenant context for RLS

async with SessionLocal() as session:

await session.execute(

text(f"SET app.current\_tenant = '{tenant\_id}'")

)

request.state.tenant\_id = tenant\_id

response = await call\_next(request)

return response

\# RLS Policy Example

CREATE POLICY tenant\_isolation ON properties

USING (tenant\_id = current\_setting('app.current\_tenant')::uuid);

**S3 Isolation**

*   Bucket prefix per tenant: s3://propwise-prod-documents/{tenant\_id}/
*   IAM policies restrict access to tenant-specific prefixes
*   Pre-signed URLs scoped to tenant resources

**Cache Isolation**

*   Redis keys prefixed with tenant ID: tenant:{tenant\_id}:property:{property\_id}
*   Prevents cross-tenant cache pollution

**5.4 Scalability & Performance**

**Horizontal Scaling**

*   All services stateless for horizontal scaling
*   Database connection pooling (PgBouncer) to handle connection limits
*   Read replicas for read-heavy workloads (reports, analytics)
*   Caching aggressive for computationally expensive operations

**Performance Targets**

| Operation | Target | Measurement |
| --- | --- | --- |
| API Response (CRUD) | <300ms | 95th percentile |
| Property Search | <500ms | 95th percentile |
| Deal Calculator | <1s | 95th percentile |
| AI Inference | <2s | 95th percentile |
| File Upload | <5s | For 10MB file |
| Report Generation | <10s | Complex reports |

**Load Testing Benchmarks**

*   Support 10,000 concurrent users
*   100,000 properties per tenant without degradation
*   1,000 requests/second per service at 95% success rate

**Database Optimization**

*   Strategic indexes on foreign keys and query filters
*   Partial indexes for common filtered queries
*   Materialized views for complex reports (refreshed nightly)
*   Query optimization monitoring with pg\_stat\_statements
*   Connection pooling (100 connections, 25 per service)

**Caching Strategy**

*   L1: In-memory application cache (5-minute TTL)
*   L2: Redis distributed cache (1-hour TTL)
*   L3: CDN edge cache for static assets (24-hour TTL)
*   Cache invalidation on write operations

**6\. Integration Ecosystem**

**6.1 Integration Architecture**

PropWise employs a layered integration architecture:

**Integration Layer Components**

*   **API Clients**: Type-safe SDK wrappers for each third-party API
*   **Retry Logic**: Exponential backoff with jitter for transient failures
*   **Rate Limiting**: Token bucket algorithm respecting provider limits
*   **Webhook Handlers**: Secure endpoints for provider callbacks
*   **Error Handling**: Graceful degradation and fallback strategies
*   **Monitoring**: Per-integration success rates and latency tracking

**6.2 Payment Integrations**

**Stripe (Primary Payment Processor)**

**Use Cases**:

*   Platform subscription billing
*   Credit card rent payments
*   Marketplace payouts via Stripe Connect
*   ACH payments (with Plaid verification)

**Integration Details**:

*   **SDK**: Stripe Python SDK 7.0+
*   **Stripe Connect**: Express accounts for landlords/property managers
*   **Products**: Subscriptions, Payment Intents, ACH Direct Debit
*   **Webhooks**:
    *   payment\_intent.succeeded: Confirm rent payment
    *   charge.refunded: Process refund
    *   customer.subscription.deleted: Handle subscription cancellation
*   **Security**: Webhook signature verification, PCI-compliant tokenization
*   **Testing**: Comprehensive test suite with Stripe test mode

**Implementation Example**:

\# Create Connected Account for Landlord

account = stripe.Account.create(

type="express",

country="US",

email=landlord.email,

capabilities={

"card\_payments": {"requested": True},

"transfers": {"requested": True},

},

)

\# Process Rent Payment with Application Fee

payment\_intent = stripe.PaymentIntent.create(

amount=rent\_amount,

currency="usd",

customer=tenant.stripe\_customer\_id,

application\_fee\_amount=platform\_fee,

transfer\_data={"destination": landlord.stripe\_account\_id},

metadata={"property\_id": property\_id, "lease\_id": lease\_id},

)

**Plaid (Bank Account Verification & ACH)**

**Use Cases**:

*   Link bank accounts for ACH payments
*   Verify account ownership and balance
*   Income verification for tenant screening
*   Cash management account aggregation

**Integration Details**:

*   **SDK**: Plaid Python SDK 15.0+
*   **Products**: Auth, Balance, Transactions, Income
*   **Flow**:
    1.  Generate Link token with required products
    2.  User completes Plaid Link flow (OAuth or instant verification)
    3.  Exchange public token for access token
    4.  Retrieve account and routing numbers
    5.  Store encrypted access token for future use

**Security**:

*   Access tokens encrypted with AWS KMS
*   Minimal permission scopes requested
*   Automatic token rotation

**6.3 Property Data Integrations**

**Zillow API (Property Data & Comparables)**

**Use Cases**:

*   Fetch property details (Zestimate, characteristics, tax history)
*   Pull comparable sales and rentals
*   Monitor property value changes

**Integration Details**:

*   **API**: Zillow API (requires partnership agreement)
*   **Endpoints**:
    *   GetDeepSearchResults: Property details by address
    *   GetZestimate: Current value estimate
    *   GetComps: Comparable properties
    *   GetRentEstimate: Rental value estimate
*   **Rate Limits**: 1,000 calls/day (negotiable with partnership)
*   **Caching**: 24-hour cache for property details, 1-hour for Zestimates
*   **Fallback**: User can manually input comps if API unavailable

**Important**: Zillow API has terms of service restrictions. Commercial use requires partnership agreement and adherence to attribution requirements.

**Redfin/ATTOM/CoreLogic (Alternative Data Providers)**

For production, licensing agreements with professional data providers required:

*   **ATTOM Data Solutions**: Property characteristics, sales history, foreclosure data
*   **CoreLogic**: AVM (automated valuation model), property records
*   **Redfin**: Not available via public API, requires partnership for data feed

**MLS/IDX Integration** (V2 Feature)

**Use Cases**:

*   Syndicate listings to MLS
*   Import MLS listings to platform
*   Display IDX-compliant property search

**Integration Providers**:

*   **Bridge Interactive**: MLS data normalization and syndication
*   **Listhub**: Listing syndication to multiple portals
*   **RESO Web API**: Standardized MLS data access

**Compliance Requirements**:

*   IDX data display rules compliance
*   Attribution requirements
*   Lead delivery to listing agents

**6.4 Document & E-Signature Integrations**

**DocuSign**

**Use Cases**:

*   Lease agreement signing (landlord + tenant + guarantors)
*   Contractor agreements
*   Lender term sheets
*   Amendment and addendums

**Integration Details**:

*   **SDK**: DocuSign Python SDK
*   **API**: eSignature REST API v2.1
*   **Features Used**:
    *   Templates: Pre-built templates with merge fields
    *   Embedded Signing: Sign documents without leaving PropWise
    *   Sequential Routing: Define signing order
    *   SMS Authentication: Verify signer identity
    *   Webhooks: Get notified on completion, decline, voiding
*   **Document Flow**:
    *   Generate document from template with merged data
    *   Create envelope with recipients and signing tabs
    *   Send envelope or initiate embedded signing session
    *   Handle webhook callbacks for status updates
    *   Download completed document to S3

**HelloSign (Dropbox Sign)**

**Alternative e-signature provider** with simpler API and lower cost for high-volume signing.

**Integration Details**:

*   **SDK**: HelloSign Python SDK
*   **Features**: Templates, embedded signing, audit trails
*   **Advantage**: More developer-friendly API, better pricing for startups

**6.5 Communication Integrations**

**AWS SES (Email Service)**

**Use Cases**:

*   Transactional emails (password reset, notifications, receipts)
*   Marketing emails (newsletters, feature announcements)
*   Automated reminders (rent due, lease expiration)

**Configuration**:

*   Production: Out of SES sandbox, verified domain with SPF/DKIM
*   Suppression List: Automatic bounce and complaint handling
*   Templates: HTML templates with variable substitution
*   Tracking: Open and click tracking via SNS webhooks
*   Limits: 50,000 emails/day (can request increase)

**Google Meet API (Video Conferencing)**

**Use Cases**:

*   Property tours (investor ↔ property manager)
*   Contractor meetings
*   Lender consultations

**Integration**:

*   **API**: Google Calendar API with Meet add-on
*   **Flow**: Create calendar event with conferenceData property
*   **URL**: Extract Meet link and share with participants
*   **Alternative**: Zoom SDK for native integration with join from app

**Twilio (SMS Notifications)**

**Use Cases**:

*   Urgent maintenance alerts
*   Rent payment reminders
*   Two-factor authentication
*   Application status updates

**Integration**:

*   **SDK**: Twilio Python SDK
*   **Services**: Programmable SMS, Verify API (2FA)
*   **Rate Limiting**: Respect carrier limitations
*   **Compliance**: TCPA consent and opt-out handling

**6.6 Accounting Integrations**

**QuickBooks Online**

**Use Cases**:

*   Sync transactions (rent payments, expenses)
*   Export chart of accounts
*   Create invoices and bills
*   Generate owner distributions

**Integration**:

*   **API**: QuickBooks Online API v3
*   **Authentication**: OAuth 2.0 with refresh tokens
*   **Sync Strategy**: Bi-directional sync every 6 hours
*   **Mapping**: PropWise categories ↔ QBO accounts
*   **Conflict Resolution**: QBO is source of truth for accounting

**Implementation**:

\# Sync Rent Payment to QuickBooks

qbo\_client = QuickBooksClient(access\_token)

payment = Payment()

payment.CustomerRef = {"value": tenant.qbo\_customer\_id}

payment.TotalAmt = rent\_amount

payment.Line = \[{

"Amount": rent\_amount,

"LinkedTxn": \[{

"TxnId": invoice.qbo\_invoice\_id,

"TxnType": "Invoice"

}\]

}\]

payment.save(qbo\_client)

**Xero**

**Alternative accounting platform** popular internationally.

**Integration**:

*   **API**: Xero API v2
*   **Authentication**: OAuth 2.0
*   **Features**: Similar functionality to QuickBooks integration

**6.7 Background Check Integrations**

**Integration Matrix**

| Provider | Service | API Type | Cost Model | PropWise Role |
| --- | --- | --- | --- | --- |
| Experian Connect | Credit + Rental History | REST API | Per-report | Initiate & retrieve |
| RentRisk | Modular Screening | REST API | Per-report | Initiate & retrieve |
| RentSpree | TransUnion Screening | Embedded Widget | Applicant pays | Webhook receiver |
| Baselane | Credit + Analytics | REST + Webhook | Applicant pays | Webhook receiver |
| Rentberry | Background + Credit | Embedded Widget | Applicant pays | Webhook receiver |

**Experian Connect Integration**

**Features**:

*   Credit report (full or thin file)
*   Rental payment history (RentBureau)
*   Fraud detection (FraudIQ)
*   Income insights (via Clarity Services)

**Flow**:

1.  Property manager initiates screening in PropWise
2.  PropWise API calls Experian Connect with applicant details
3.  Applicant receives Experian consent form via email/SMS
4.  Applicant completes consent and identity verification
5.  Experian generates report and sends to PropWise webhook
6.  PropWise stores report PDF and structured data
7.  AI risk scoring model analyzes report
8.  Property manager reviews report and AI insights

**Compliance**:

*   FCRA-compliant consent collection
*   Proper use disclosure provided to applicant
*   Adverse action workflow if denied
*   Report retention for 7 years, purge after

**RentSpree Integration** (Applicant-Initiated)

**Features**:

*   TransUnion credit report
*   Criminal background check
*   Eviction history
*   Reusable reports (applicant can share with multiple landlords)

**Flow**:

1.  Property manager shares RentSpree application link
2.  Applicant creates RentSpree account and pays for screening
3.  RentSpree collects consent and orders reports
4.  Completed reports sent to PropWise via webhook
5.  PropWise associates report with applicant and property

**Advantage**: No cost to landlord, applicant controls report sharing

**7\. Security & Compliance**

**7.1 Security Architecture**

**Defense in Depth Strategy**

PropWise implements multiple layers of security controls:

**Layer 1: Network Security**

*   VPC with private subnets for application and data tiers
*   Security groups restricting inbound traffic to necessary ports
*   Network ACLs for subnet-level filtering
*   AWS WAF protecting API Gateway from common attacks
*   DDoS protection via AWS Shield
*   VPN or AWS Direct Connect for admin access

**Layer 2: Application Security**

*   OWASP Top 10 mitigation strategies
*   Input validation and sanitization (Pydantic models)
*   Output encoding to prevent XSS
*   SQL injection prevention via parameterized queries (SQLAlchemy)
*   CSRF tokens for state-changing operations
*   Rate limiting per IP and per user
*   Security headers (CSP, HSTS, X-Frame-Options)

**Layer 3: Authentication & Authorization**

*   Strong password requirements (min 12 chars, complexity)
*   Bcrypt password hashing (cost factor 12)
*   JWT-based authentication with short-lived tokens (15 min)
*   Refresh token rotation on use
*   Multi-factor authentication for privileged roles
*   Role-based access control (RBAC) with property-level scoping
*   Row-level security in database

**Layer 4: Data Security**

*   Encryption in transit (TLS 1.3)
*   Encryption at rest (AES-256)
    *   RDS: AWS-managed encryption
    *   S3: SSE-S3 encryption
    *   Sensitive fields: Application-level encryption with KMS
*   PII tokenization for credit cards (Stripe handles)
*   Secrets management via AWS Secrets Manager
*   Key rotation policies (90 days)

**Layer 5: Monitoring & Response**

*   Real-time security event logging
*   Automated alerts for suspicious activity
*   Security Information and Event Management (SIEM)
*   Incident response runbooks
*   Regular security audits and penetration testing

**7.2 Data Privacy & Compliance**

**GDPR Compliance** (for EU users)

**Lawful Basis**: Contract performance and legitimate interest **Data Subject Rights**:

*   Right to access: Self-service data export
*   Right to rectification: User profile editing
*   Right to erasure: Account deletion with data purge
*   Right to portability: JSON export of user data
*   Right to object: Opt-out of marketing communications
*   Right to restriction: Temporary processing suspension

**Implementation**:

*   Consent management system for optional data processing
*   Data retention policies (default: 7 years for financial records, 3 years for operational data)
*   Privacy Policy and Terms of Service with explicit consent
*   DPA (Data Processing Agreement) for enterprise customers
*   Sub-processor disclosure (Stripe, DocuSign, screening providers)

**CCPA Compliance** (California Consumer Privacy Act)

**Consumer Rights**:

*   Right to know what personal information is collected
*   Right to delete personal information
*   Right to opt-out of sale (PropWise doesn't sell data)
*   Right to non-discrimination for exercising rights

**Implementation**:

*   "Do Not Sell My Personal Information" link in footer
*   45-day response timeframe for requests
*   Verified consumer request process

**FCRA Compliance** (Fair Credit Reporting Act)

**Requirements for Tenant Screening**:

*   Obtain written consent before ordering credit report
*   Provide "Summary of Rights" document
*   Issue pre-adverse action notice if denying based on report
*   Issue adverse action notice with report details and rights
*   Maintain records for 25 months

**PropWise Implementation**:

*   Electronic consent workflow with required disclosures
*   Automated adverse action letter generation
*   Audit trail of all screening activities
*   Screening report retention and purge policies
*   User training materials on FCRA compliance

**Fair Housing Compliance**

**Prohibited Discrimination**: PropWise ensures platform cannot facilitate discrimination based on protected classes (race, color, religion, national origin, sex, familial status, disability)

**Implementation**:

*   No fields collecting protected class information
*   Training materials on Fair Housing for users
*   Consistent application of screening criteria
*   Audit capability for fair housing investigations
*   Terms of Service prohibiting discriminatory use

**PCI DSS Compliance**

**Scope Minimization**: PropWise uses Stripe for all card processing, keeping card data out of PropWise systems

**SAQ A-EP** (Self-Assessment Questionnaire for e-commerce with outsourced payment processing):

*   Annual PCI self-assessment completion
*   Quarterly ASV (Approved Scanning Vendor) scans
*   No cardholder data storage, processing, or transmission
*   Secure redirect to Stripe-hosted checkout or embedded Stripe Elements

**SOC 2 Certification Roadmap**

**Type I** (Design - Target: Month 9)

*   Document policies and procedures
*   Implement controls (access management, change management, monitoring)
*   Engage audit firm (Big 4 or specialist)
*   Complete 3-month readiness assessment
*   Undergo audit and receive report

**Type II** (Operating Effectiveness - Target: Month 21)

*   Demonstrate 6-12 months of control operation
*   Evidence collection automation
*   Undergo extended audit period
*   Receive Type II report

**SOC 2 Trust Service Criteria Coverage**:

*   Security (required)
*   Availability (required for SaaS)
*   Confidentiality (for tenant data)
*   Processing Integrity (for financial calculations)

**7.3 Audit & Compliance Monitoring**

**Audit Logging**

All security-relevant events logged to immutable audit trail:

**Events Logged**:

*   Authentication attempts (success/failure)
*   Authorization failures
*   Data access (especially PII and financial)
*   Data modifications (who, what, when)
*   Administrative actions
*   System configuration changes
*   File uploads/downloads
*   API calls to third-party services

**Log Format**:

{

"timestamp": "2025-10-26T14:23:45.123Z",

"event\_type": "data\_access",

"user\_id": "usr\_abc123",

"tenant\_id": "ten\_xyz789",

"resource\_type": "screening\_report",

"resource\_id": "scr\_report\_456",

"action": "view",

"ip\_address": "192.168.1.100",

"user\_agent": "Mozilla/5.0...",

"result": "success"

}

**Audit Trail Features**:

*   Immutable storage (append-only)
*   Encryption at rest
*   Retention: 7 years for compliance-critical events
*   Real-time streaming to SIEM
*   Searchable via Elasticsearch
*   Automated anomaly detection

**Compliance Dashboards**

**For Tenants**:

*   Data access logs (who viewed what)
*   Failed authentication attempts
*   Configuration changes
*   User permission changes

**For Platform Admins**:

*   Overall security metrics
*   Compliance control effectiveness
*   Failed audit log writes (critical alert)
*   Anomalous behavior patterns

**Vulnerability Management**

**Continuous Monitoring**:

*   **SAST** (Static Application Security Testing): GitHub CodeQL on every commit
*   **DAST** (Dynamic Application Security Testing): Weekly scans with OWASP ZAP
*   **Dependency Scanning**: Snyk monitoring for vulnerable dependencies
*   **Container Scanning**: Trivy scanning Docker images before deployment
*   **Infrastructure Scanning**: Checkov validating Terraform for security misconfigurations

**Remediation SLAs**:

*   Critical: 24 hours
*   High: 7 days
*   Medium: 30 days
*   Low: Next release cycle

**Penetration Testing**:

*   Annual external penetration test by certified firm
*   Scope: Web application, APIs, infrastructure
*   Report with findings and remediation timeline
*   Re-test after fixes

**8\. Data Architecture**

**8.1 Database Schema (Simplified ERD)**

**Core Entities**

┌─────────────────┐ ┌─────────────────┐

│ Organization │ │ User │

├─────────────────┤ ├─────────────────┤

│ id (PK) │────────<│ id (PK) │

│ name │ │ org\_id (FK) │

│ type │ │ email │

│ tier │ │ role │

│ status │ │ password\_hash │

└─────────────────┘ └─────────────────┘

│ │

│ │

v v

┌─────────────────┐ ┌─────────────────┐

│ Property │ │ Connection │

├─────────────────┤ ├─────────────────┤

│ id (PK) │ │ id (PK) │

│ org\_id (FK) │ │ user\_a\_id (FK) │

│ address │ │ user\_b\_id (FK) │

│ geo\_point │ │ status │

│ type │ │ created\_at │

└─────────────────┘ └─────────────────┘

│

│

v

┌─────────────────┐ ┌─────────────────┐

│ Unit │────────<│ Lease │

├─────────────────┤ ├─────────────────┤

│ id (PK) │ │ id (PK) │

│ property\_id(FK) │ │ unit\_id (FK) │

│ unit\_number │ │ tenant\_id (FK) │

│ bedrooms │ │ start\_date │

│ bathrooms │ │ end\_date │

│ sqft │ │ rent\_amount │

└─────────────────┘ └─────────────────┘

│ │

│ │

v v

┌─────────────────┐ ┌─────────────────┐

│ MaintenanceReq │ │ Payment │

├─────────────────┤ ├─────────────────┤

│ id (PK) │ │ id (PK) │

│ unit\_id (FK) │ │ lease\_id (FK) │

│ reported\_by(FK) │ │ amount │

│ category │ │ method │

│ priority │ │ status │

│ status │ │ stripe\_intent\_id│

└─────────────────┘ └─────────────────┘

┌─────────────────┐ ┌─────────────────┐

│ Deal │────────<│ Project │

├─────────────────┤ ├─────────────────┤

│ id (PK) │ │ id (PK) │

│ property\_id(FK) │ │ deal\_id (FK) │

│ owner\_id (FK) │ │ status │

│ strategy │ │ budget │

│ inputs (JSONB) │ │ actual\_cost │

│ results (JSONB) │ │ start\_date │

└─────────────────┘ └─────────────────┘

│ │

│ │

v v

┌─────────────────┐ ┌─────────────────┐

│ DealLender │ │ Task │

├─────────────────┤ ├─────────────────┤

│ id (PK) │ │ id (PK) │

│ deal\_id (FK) │ │ project\_id (FK) │

│ lender\_id (FK) │ │ title │

│ status │ │ assigned\_to(FK) │

│ term\_sheet\_url │ │ status │

└─────────────────┘ └─────────────────┘

┌─────────────────┐ ┌─────────────────┐

│ Document │ │ ScreeningRpt │

├─────────────────┤ ├─────────────────┤

│ id (PK) │ │ id (PK) │

│ org\_id (FK) │ │ applicant\_id(FK)│

│ related\_type │ │ property\_id(FK) │

│ related\_id │ │ provider │

│ s3\_key │ │ credit\_score │

│ type │ │ risk\_score │

│ version │ │ report\_url │

└─────────────────┘ └─────────────────┘

**8.2 Key Tables Detail**

**Organizations Table**

CREATE TABLE organizations (

id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

name VARCHAR(255) NOT NULL,

type VARCHAR(50) NOT NULL, -- 'landlord', 'property\_manager', 'lender'

tier VARCHAR(50) NOT NULL DEFAULT 'starter', -- 'starter', 'professional', 'enterprise'

status VARCHAR(50) NOT NULL DEFAULT 'active',

stripe\_customer\_id VARCHAR(255),

storage\_quota\_gb INTEGER NOT NULL DEFAULT 50,

storage\_used\_gb DECIMAL(10,2) DEFAULT 0,

created\_at TIMESTAMP DEFAULT NOW(),

updated\_at TIMESTAMP DEFAULT NOW()

);

CREATE INDEX idx\_organizations\_status ON organizations(status);

CREATE INDEX idx\_organizations\_stripe ON organizations(stripe\_customer\_id);

**Properties Table**

CREATE TABLE properties (

id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

org\_id UUID NOT NULL REFERENCES organizations(id),

address\_line1 VARCHAR(255) NOT NULL,

address\_line2 VARCHAR(255),

city VARCHAR(100) NOT NULL,

state VARCHAR(2) NOT NULL,

zip VARCHAR(10) NOT NULL,

country VARCHAR(2) DEFAULT 'US',

geo\_point GEOGRAPHY(POINT) NOT NULL, -- PostGIS

property\_type VARCHAR(50) NOT NULL, -- 'single\_family', 'multi\_family', 'condo', etc.

year\_built INTEGER,

lot\_size\_sqft INTEGER,

total\_units INTEGER DEFAULT 1,

purchase\_price DECIMAL(12,2),

purchase\_date DATE,

current\_value DECIMAL(12,2),

last\_valuation\_date DATE,

status VARCHAR(50) DEFAULT 'active',

created\_at TIMESTAMP DEFAULT NOW(),

updated\_at TIMESTAMP DEFAULT NOW()

);

CREATE INDEX idx\_properties\_org ON properties(org\_id);

CREATE INDEX idx\_properties\_zip ON properties(zip);

CREATE INDEX idx\_properties\_geo ON properties USING GIST(geo\_point);

CREATE INDEX idx\_properties\_status ON properties(status);

\-- Row-Level Security

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant\_isolation ON properties

USING (org\_id = current\_setting('app.current\_tenant')::UUID);

**Leases Table**

CREATE TABLE leases (

id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

unit\_id UUID NOT NULL REFERENCES units(id),

tenant\_id UUID NOT NULL REFERENCES users(id),

start\_date DATE NOT NULL,

end\_date DATE NOT NULL,

rent\_amount DECIMAL(10,2) NOT NULL,

security\_deposit DECIMAL(10,2) NOT NULL,

payment\_due\_day INTEGER NOT NULL DEFAULT 1, -- Day of month

late\_fee\_amount DECIMAL(10,2),

late\_fee\_grace\_days INTEGER DEFAULT 5,

status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'expired', 'terminated'

auto\_renew BOOLEAN DEFAULT FALSE,

signed\_document\_id UUID REFERENCES documents(id),

created\_at TIMESTAMP DEFAULT NOW(),

updated\_at TIMESTAMP DEFAULT NOW()

);

CREATE INDEX idx\_leases\_unit ON leases(unit\_id);

CREATE INDEX idx\_leases\_tenant ON leases(tenant\_id);

CREATE INDEX idx\_leases\_status ON leases(status);

CREATE INDEX idx\_leases\_end\_date ON leases(end\_date) WHERE status = 'active';

**Deals Table**

CREATE TABLE deals (

id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

org\_id UUID NOT NULL REFERENCES organizations(id),

property\_id UUID REFERENCES properties(id),

owner\_id UUID NOT NULL REFERENCES users(id),

name VARCHAR(255) NOT NULL,

strategy VARCHAR(50) NOT NULL, -- 'flip', 'rent', 'brrrr'

status VARCHAR(50) DEFAULT 'analysis', -- 'analysis', 'submitted', 'funded', 'closed'

inputs JSONB NOT NULL, -- All calculator inputs

results JSONB, -- Calculated outputs

scenarios JSONB, -- Array of alternative scenarios

created\_at TIMESTAMP DEFAULT NOW(),

updated\_at TIMESTAMP DEFAULT NOW()

);

CREATE INDEX idx\_deals\_org ON deals(org\_id);

CREATE INDEX idx\_deals\_owner ON deals(owner\_id);

CREATE INDEX idx\_deals\_property ON deals(property\_id);

CREATE INDEX idx\_deals\_status ON deals(status);

CREATE INDEX idx\_deals\_strategy ON deals(strategy);

**Payments Table** (Partitioned)

CREATE TABLE payments (

id UUID DEFAULT gen\_random\_uuid(),

org\_id UUID NOT NULL REFERENCES organizations(id),

lease\_id UUID REFERENCES leases(id),

payer\_id UUID NOT NULL REFERENCES users(id),

amount DECIMAL(10,2) NOT NULL,

method VARCHAR(50) NOT NULL, -- 'ach', 'card', 'cash', 'check'

status VARCHAR(50) NOT NULL, -- 'pending', 'completed', 'failed', 'refunded'

stripe\_payment\_intent\_id VARCHAR(255),

stripe\_charge\_id VARCHAR(255),

fee\_amount DECIMAL(10,2),

net\_amount DECIMAL(10,2),

payment\_date DATE NOT NULL,

description TEXT,

metadata JSONB,

created\_at TIMESTAMP DEFAULT NOW(),

updated\_at TIMESTAMP DEFAULT NOW(),

PRIMARY KEY (id, payment\_date)

) PARTITION BY RANGE (payment\_date);

\-- Create partitions for each month

CREATE TABLE payments\_2025\_10 PARTITION OF payments

FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

\-- ... additional partitions created via automation

CREATE INDEX idx\_payments\_lease ON payments(lease\_id, payment\_date);

CREATE INDEX idx\_payments\_payer ON payments(payer\_id, payment\_date);

CREATE INDEX idx\_payments\_stripe\_intent ON payments(stripe\_payment\_intent\_id);

**Audit Logs Table** (Append-Only, Partitioned)

CREATE TABLE audit\_logs (

id UUID DEFAULT gen\_random\_uuid(),

timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

org\_id UUID,

user\_id UUID,

event\_type VARCHAR(100) NOT NULL,

resource\_type VARCHAR(100),

resource\_id UUID,

action VARCHAR(50) NOT NULL,

details JSONB,

ip\_address INET,

user\_agent TEXT,

result VARCHAR(50),

PRIMARY KEY (id, timestamp)

) PARTITION BY RANGE (timestamp);

CREATE TABLE audit\_logs\_2025\_10 PARTITION OF audit\_logs

FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE INDEX idx\_audit\_logs\_user ON audit\_logs(user\_id, timestamp);

CREATE INDEX idx\_audit\_logs\_resource ON audit\_logs(resource\_type, resource\_id, timestamp);

CREATE INDEX idx\_audit\_logs\_event ON audit\_logs(event\_type, timestamp);

**8.3 Data Retention & Archival**

**Retention Policies by Data Type**

| Data Type | Retention Period | Archive Strategy | Compliance Rationale |
| --- | --- | --- | --- |
| Financial transactions | 7 years | Migrate to Glacier after 2 years | IRS, SOX requirements |
| Screening reports | 7 years | Keep in S3 Standard | FCRA requirement |
| Leases & signed documents | 7 years post-termination | Migrate to Glacier after 1 year | Contract law |
| Audit logs (security) | 7 years | Migrate to Glacier after 1 year | SOC 2, compliance |
| Audit logs (operational) | 3 years | Migrate to Glacier after 6 months | Operational needs |
| Property photos | Indefinite (user-controlled) | Migrate to Glacier after 1 year | User discretion |
| User profiles (inactive) | 3 years post-deletion | Hard delete after 90 days | GDPR, CCPA |
| Maintenance records | 5 years | Keep in PostgreSQL | Warranty, liability |
| Chat messages | 3 years | Export to S3 after 1 year | Business records |

**Automated Archival Process**

*   Daily job identifies records meeting archival criteria
*   PostgreSQL partitions dropped and archived to S3 (Parquet format)
*   S3 lifecycle policies transition to Glacier
*   Metadata retained in PostgreSQL for searchability
*   Restoration process for archived data retrieval (24-48 hour SLA)

**9\. AI/ML Capabilities**

**9.1 AI/ML Strategy**

PropWise leverages AI/ML to provide intelligent automation and predictive insights, differentiating from competitors while enhancing user decision-making.

**ML Development Lifecycle**

1.  **Problem Definition**: Identify high-value prediction or automation opportunity
2.  **Data Collection**: Aggregate historical data from platform and external sources
3.  **Feature Engineering**: Transform raw data into predictive features
4.  **Model Development**: Train and evaluate multiple algorithms
5.  **Validation**: Backtesting and holdout validation
6.  **Deployment**: Containerized model on SageMaker endpoint
7.  **Monitoring**: Track prediction accuracy and data drift
8.  **Iteration**: Continuous model improvement with new data

**9.2 ML Models in Production**

**Renovation Cost Estimator**

**Business Value**: Accurate renovation cost estimation reduces deal analysis time and improves investment decisions.

**Model Type**: Gradient Boosting (XGBoost)

**Features (Inputs)**:

*   Property characteristics: Age, sqft, bed/bath, property type
*   Renovation scope: Categories (kitchen, bath, flooring, HVAC, roof, etc.)
*   Quality level: Budget, mid-range, high-end
*   Regional factors: ZIP code, local labor rates, permit costs
*   Market conditions: Material cost indexes, contractor availability

**Training Data Sources**:

*   Historical PropWise project data (actual costs)
*   External datasets: HomeAdvisor, Remodeling Magazine Cost vs Value
*   Contractor bid data from platform
*   ~50,000 renovation projects (target training size)

**Output**:

*   Cost estimate per line item
*   Total project cost (low, mid, high range)
*   Timeline estimate (weeks)
*   Confidence score (0-100)

**Model Performance Targets**:

*   Mean Absolute Percentage Error (MAPE): <15%
*   Within ±20% accuracy: 80% of predictions
*   Inference time: <200ms

**Retraining Schedule**: Monthly with new project completion data

**API Endpoint**:

POST /api/ai/renovation-estimate

{

"property": {

"zip": "90210",

"sqft": 2000,

"year\_built": 1985,

"property\_type": "single\_family"

},

"scope": \[

{"category": "kitchen", "quality": "mid\_range"},

{"category": "master\_bath", "quality": "mid\_range"},

{"category": "flooring", "rooms": 5, "quality": "mid\_range"}

\]

}

Response:

{

"estimate\_id": "est\_abc123",

"line\_items": \[

{

"category": "kitchen",

"low": 18000,

"mid": 25000,

"high": 35000,

"timeline\_weeks": 4

},

...

\],

"total\_low": 42000,

"total\_mid": 58000,

"total\_high": 78000,

"confidence\_score": 85,

"timeline\_weeks": 10

}

**Tenant Risk Scoring Model**

**Business Value**: Reduce tenant default risk and improve screening efficiency.

**Model Type**: Ensemble (Random Forest + Logistic Regression)

**Features**:

*   Credit score and history
*   Income-to-rent ratio
*   Employment stability
*   Previous rental payment history (via RentBureau)
*   Eviction records
*   Criminal background (jurisdiction-dependent)
*   Number of previous addresses
*   Debt-to-income ratio

**Training Data**:

*   Historical tenant payment performance from platform
*   Default events (60+ days delinquent or eviction)
*   Anonymized screening data from providers
*   Target: 100,000+ tenant records

**Output**:

*   Risk score (0-100, where 100 is lowest risk)
*   Risk category: Low, Medium, High
*   Key risk factors (explainability)
*   Recommended deposit amount (1x, 1.5x, 2x rent)

**Model Performance**:

*   AUC-ROC: >0.75
*   Precision at 90% recall: >60%
*   No disparate impact on protected classes (rigorous testing)

**Compliance Considerations**:

*   Model audited for Fair Housing compliance
*   Explainability required (SHAP values)
*   Cannot use protected class proxies
*   Regular bias testing and monitoring

**Retraining**: Quarterly with new payment data

**Rent/ARV Prediction Model**

**Business Value**: Data-driven pricing for optimal rent collection and accurate deal analysis.

**Model Type**: Gradient Boosting with external data features

**Features**:

*   Property characteristics: Bed/bath, sqft, age, condition
*   Location: ZIP, neighborhood, school district ratings
*   Amenities: Parking, laundry, AC, updates
*   Comparable properties: Recent sales/rentals within 0.5 mile radius
*   Market trends: Days on market, price trends, inventory levels
*   Seasonality: Month of year

**Training Data**:

*   MLS/IDX sales data (licensed)
*   Zillow/Redfin rental listings
*   PropWise historical rents
*   Target: 500,000+ property records

**Output (Rent Prediction)**:

*   Predicted monthly rent (median)
*   95% confidence interval
*   Comparable properties used (with details)
*   Market positioning (percentile)

**Output (ARV Prediction)**:

*   After-repair value estimate
*   95% confidence interval
*   Comparable sales (with adjustments)
*   Value appreciation projection (1, 3, 5 years)

**Model Performance**:

*   MAPE: <10% for rent, <8% for ARV
*   Coverage: 90% of US ZIP codes

**Retraining**: Weekly with new MLS/market data

**9.3 LLM Integration (Generative AI)**

**AI Lease Agreement Generator**

**Business Value**: Save legal costs and time while ensuring jurisdiction compliance.

**Architecture**:

*   **Base Model**: GPT-4 or Claude 3 Opus via API
*   **Fine-tuning**: State-specific legal templates and clause libraries
*   **Vector Database**: Pinecone storing jurisdiction-specific regulations and case law
*   **Retrieval-Augmented Generation (RAG)**: Retrieve relevant legal context before generation

**Workflow**:

1.  User selects jurisdiction (state + city if applicable) and lease type
2.  User inputs lease parameters (rent, dates, deposit, special terms)
3.  PropWise retrieves relevant legal requirements from vector DB
4.  Constructs prompt with legal context + user parameters + base template
5.  LLM generates complete lease document
6.  Post-processing: Validation, formatting, merge fields
7.  Human review step (required) before e-signature

**Prompt Engineering**:

prompt = f"""

You are a legal document drafting assistant specializing in residential leases.

Context:

\- Jurisdiction: {state}, {city}

\- Relevant statutes: {retrieved\_statutes}

\- Required clauses: {required\_clauses}

\- Prohibited clauses: {prohibited\_clauses}

Task: Generate a residential lease agreement with the following parameters:

\- Landlord: {landlord\_name}

\- Tenant: {tenant\_name}

\- Property: {property\_address}

\- Rent: ${rent\_amount}/month, due on day {due\_day}

\- Term: {start\_date} to {end\_date}

\- Security Deposit: ${deposit\_amount}

\- Special terms: {special\_terms}

Requirements:

1\. Include all jurisdiction-required disclosures

2\. Use clear, legally precise language

3\. Ensure Fair Housing compliance

4\. Format in numbered sections

5\. Include signature blocks

Generate the complete lease agreement:

"""

**Legal Disclaimer**: All AI-generated agreements include prominent disclaimer requiring legal review. PropWise does not provide legal advice.

**Compliance**:

*   Lawyer-reviewed templates per state (initial setup)
*   Regular updates as laws change
*   Version control and change tracking
*   Audit trail of generated documents

**AI Property Description Writer**

**Use Case**: Generate compelling listing descriptions from property data and photos.

**Implementation**:

*   GPT-4 Vision API analyzes property photos
*   Extracts features (modern kitchen, hardwood floors, natural light, etc.)
*   Combines with structured data (bed/bath, sqft, amenities)
*   Generates marketing copy in specified tone (professional, casual, luxury)
*   A/B testing to optimize for inquiry rates

**Example Output**:

"Stunning 3-bedroom, 2-bath single-family home in the heart of West Albany. This beautifully updated property features a gourmet kitchen with granite countertops and stainless steel appliances, gleaming hardwood floors throughout, and an abundance of natural light. The spacious master suite offers a spa-like bathroom and walk-in closet. Enjoy the private backyard perfect for entertaining. Minutes from top-rated schools and shopping. Don't miss this gem!"

**9.4 AI Ethics & Governance**

**Principles**:

1.  **Transparency**: Users informed when interacting with AI
2.  **Explainability**: Model decisions must be interpretable
3.  **Fairness**: Regular bias testing, no disparate impact
4.  **Privacy**: AI models don't memorize PII
5.  **Human Oversight**: Critical decisions require human review

**AI Governance Committee**:

*   Product, Engineering, Legal, and Ethics representatives
*   Quarterly review of AI model performance and compliance
*   Approval required for new AI features affecting tenant decisions
*   Incident response for AI-related issues

**Bias Testing**:

*   Pre-deployment: Test models across demographic groups
*   Post-deployment: Monitor for disparate impact
*   Mitigation: Adjust features, retrain, or implement fairness constraints

**10\. Subscription Model & Pricing**

**10.1 Pricing Strategy**

PropWise employs a **tiered subscription model** with usage-based add-ons, balancing accessibility for small landlords with scalability for large property managers.

**Pricing Philosophy**:

*   Transparent, value-based pricing
*   No hidden fees or surprise charges
*   Annual discount (20% off) to encourage commitment
*   Free trial (14 days) with full feature access

**10.2 Subscription Tiers**

**Starter Plan - $49/month**

**Target**: Individual landlords with 1-5 properties

**Included**:

*   Up to 5 properties
*   Unlimited units
*   1 user account
*   Basic property & lease management
*   Maintenance ticketing
*   Tenant portal
*   Document storage: 50 GB
*   Rent collection (ACH): 1% per transaction + $0.50
*   Rent collection (Card): 2.9% + $0.30
*   Basic reporting
*   Email support

**Limitations**:

*   No lender module access
*   No AI features
*   No project management
*   No screening integrations
*   No accounting sync

**Professional Plan - $99/month**

**Target**: Property managers and serious investors with 6-25 properties

**Included (Everything in Starter, plus)**:

*   Up to 25 properties
*   3 user accounts
*   Deal calculator with AI renovation estimator
*   Comparables integration (100 lookups/month)
*   Lender module (send deals to 5 lenders/month)
*   Tenant screening (pay-per-screen via integrated providers)
*   Project management
*   Advanced reporting & analytics
*   Document storage: 100 GB
*   QuickBooks/Xero export
*   Chat & video conferencing
*   Priority email support
*   Phone support (business hours)

**Add-ons**:

*   Additional properties: $2/property/month
*   Additional users: $15/user/month
*   Extra comps lookups: $20 per 100 lookups

**Enterprise Plan - Custom Pricing**

**Target**: Large property management firms, institutional investors, lenders

**Included (Everything in Professional, plus)**:

*   Unlimited properties
*   Unlimited users
*   White-labeling options
*   Dedicated database instance
*   Custom integrations
*   AI lease generation
*   Advanced AI analytics
*   Custom reporting
*   Dedicated account manager
*   SLA guarantee (99.9% uptime)
*   Priority support (24/7)
*   Onboarding & training
*   API access for custom builds

**Pricing Model**: Quote-based on portfolio size and requirements

**Lender Tier - $199/month**

**Target**: Hard money and private lenders

**Included**:

*   Unlimited deal submissions received
*   Multi-user organization (up to 10 loan officers)
*   Pipeline management
*   Document collection portal
*   Underwriting templates
*   Credit report integration (pay-per-pull)
*   Term sheet generation & e-sign
*   Lender analytics dashboard
*   Marketplace profile (verified 4+ star rating)
*   Priority support

**Add-ons**:

*   Additional users: $20/user/month
*   Premium marketplace placement: $100/month

**10.3 Usage-Based Fees**

**Transaction Fees** (applied to all tiers):

*   ACH rent payments: 1% + $0.50 (capped at $5)
*   Credit card payments: 2.9% + $0.30
*   Payout to landlord: $0 (included, via Stripe Connect)

**Screening Costs** (pass-through, landlord or applicant pays):

*   Basic credit check: $20-30 per applicant
*   Comprehensive screening: $40-60 per applicant
*   Pricing varies by provider

**E-Signature** (Professional+ tiers):

*   Included: 20 envelopes/month
*   Additional: $1 per envelope

**Comparables Lookups** (Professional tier):

*   Included: 100 lookups/month
*   Additional: $20 per 100 lookups
*   Enterprise: Unlimited

**10.4 Revenue Projections (Year 1-3)**

**Assumptions**:

*   Customer acquisition: 50 in Month 1, scaling to 500/month by Month 12
*   Churn rate: 5% monthly (improving to 3% by Year 2)
*   Mix: 60% Starter, 30% Professional, 8% Enterprise, 2% Lender
*   Average properties per customer: 3.5 (Starter), 12 (Professional), 150 (Enterprise)
*   Transaction revenue: $2,500/month in Month 1, scaling proportionally

**Year 1 Projections**:

*   Ending MRR: $180,000
*   Annual Revenue: ~$1.1M
*   Ending Customers: 3,500
*   Properties Under Management: 18,000

**Year 2 Projections**:

*   Ending MRR: $650,000
*   Annual Revenue: ~$5.2M
*   Ending Customers: 12,000
*   Properties Under Management: 65,000

**Year 3 Projections**:

*   Ending MRR: $1,800,000
*   Annual Revenue: ~$18M
*   Ending Customers: 30,000
*   Properties Under Management: 180,000

**Revenue Composition (Year 3)**:

*   Subscription Revenue: 70%
*   Transaction Fees: 22%
*   Usage-Based Fees: 5%
*   Professional Services: 3%

**10.5 Competitive Pricing Analysis**

| Provider | Target Market | Starting Price | Key Differentiator |
| --- | --- | --- | --- |
| PropWise | Investors + Managers | $49/mo | Deal analysis + lender integration |
| AppFolio | Property Managers | $280/mo | Enterprise PMS, mature platform |
| Buildium | Small-Mid Managers | $50/mo | All-in-one PMS |
| TenantCloud | DIY Landlords | $0-18/mo | Freemium, basic features |
| Stessa | Investors | Free | Portfolio tracking, no management |
| Cozy (Apartments.com) | Landlords | Free | Rent collection + screening |
| Baselane | Landlords | Free | Banking + light management |

**PropWise Positioning**: Premium value at mid-market price, uniquely combining investment analysis, financing, and management in one platform.

**11\. Implementation Roadmap**

**11.1 Development Phases**

**Phase 0: Foundation (Months 0-1)**

**Goal**: Infrastructure setup and development environment

**Deliverables**:

*   AWS account structure (dev, staging, prod)
*   Terraform modules for core infrastructure
*   GitHub repository with CI/CD pipelines
*   Development environment setup (Docker Compose)
*   Database schema design and initial migrations
*   Authentication service (OAuth2 + JWT)
*   API Gateway configuration
*   Basic frontend scaffolding (Next.js)

**Team**: Full team (10 people) **Burn**: $150K

**Phase 1: MVP (Months 2-5)**

**Goal**: Core functionality for early adopter landlords

**Features**:

*   User registration and authentication (including MFA)
*   Organization and user management
*   Property and unit CRUD with photo uploads
*   Basic lease management
*   Tenant portal (view lease, payment history)
*   Maintenance request submission and tracking
*   Document storage (S3) with folder organization
*   E-signature integration (DocuSign)
*   Basic deal calculator (manual inputs, no AI)
*   Stripe integration for subscriptions
*   Email notifications (AWS SES)
*   Basic responsive web UI

**Success Criteria**:

*   10 beta customers managing 50 properties
*   <200ms API response time (95th percentile)
*   99.5% uptime
*   Core user flows tested end-to-end

**Team**: Full team **Burn**: $600K

**Phase 2: V1 - Essential Integrations (Months 6-9)**

**Goal**: Add key integrations and AI features

**Features**:

*   Rent collection (ACH via Plaid + Card via Stripe)
*   Payout automation (Stripe Connect)
*   Tenant screening integrations (Experian, RentSpree, Baselane)
*   AI risk scoring for screening reports
*   Lender module (organization setup, deal pipeline)
*   Deal submission workflow to lenders
*   Comparables API integration (licensed data provider)
*   AI renovation cost estimator (XGBoost model v1)
*   Project management module (tasks, budget tracking)
*   Contractor portal
*   QuickBooks Online export
*   In-app messaging (1:1 chat)
*   Connection/friend request system
*   Video conferencing integration (Google Meet)
*   Advanced reporting (rent roll, P&L, maintenance metrics)
*   Mobile-responsive enhancements

**Success Criteria**:

*   200 paying customers managing 1,200 properties
*   20 lenders on platform
*   50 deals submitted to lenders
*   AI estimator within 20% accuracy for 75% of projects
*   $50K MRR

**Team**: Full team + 2 additional ML engineers **Burn**: $650K

**Phase 3: V2 - Scale & Advanced Features (Months 10-15)**

**Goal**: Differentiated features and scaling infrastructure

**Features**:

*   MLS/IDX syndication partnerships
*   Listing marketplace with multi-channel publishing
*   AI rent/ARV prediction model
*   AI lease generation (LLM-based)
*   Cash management module with Plaid aggregation
*   Xero integration
*   Mobile apps (React Native for iOS and Android)
*   Advanced AI insights dashboard
*   Predictive maintenance recommendations
*   Portfolio optimization suggestions
*   White-labeling capabilities (for Enterprise)
*   Public API (for partner integrations)
*   Enhanced security (SOC 2 Type I readiness)
*   Data warehouse (Redshift) for analytics
*   Advanced admin portal with BI dashboards

**Success Criteria**:

*   1,500 paying customers managing 10,000+ properties
*   100 lenders on platform
*   500 deals submitted monthly
*   $180K MRR
*   SOC 2 Type I certification achieved
*   Mobile apps launched with 1,000+ downloads

**Team**: Full team + 2 mobile developers + 1 ML engineer **Burn**: $900K

**Phase 4: V3 - Enterprise & Expansion (Months 16-24)**

**Goal**: Enterprise features and market expansion

**Features**:

*   Multi-property portfolio analytics
*   Advanced forecasting and scenario planning
*   Vendor marketplace with bidding
*   Insurance marketplace integration
*   Property acquisition lead generation
*   Advanced AI models (maintenance prediction, market timing)
*   International expansion (Canada, UK - localization)
*   Enhanced white-labeling with custom domains
*   Advanced API features (webhooks, custom integrations)
*   SOC 2 Type II certification
*   Enterprise-grade SLA guarantees
*   Custom reporting builder
*   Role-based dashboards per persona

**Success Criteria**:

*   5,000 paying customers managing 40,000+ properties
*   250 lenders on platform
*   2,000 deals submitted monthly
*   $650K MRR
*   10 enterprise customers (100+ properties each)
*   SOC 2 Type II certification achieved

**Team**: Full team + growth team (3 people) **Burn**: $1.2M

**11.2 Go-to-Market Timeline**

**Pre-Launch (Months 0-4)**:

*   Market research and customer interviews (50+ investors/landlords)
*   Brand development (logo, design system, messaging)
*   Website development (marketing site + product documentation)
*   Beta program recruitment (target: 20 users)
*   Content marketing foundation (blog, SEO strategy)

**Soft Launch (Month 5)**:

*   Invite-only beta access
*   Collect feedback and iterate rapidly
*   Establish customer success processes
*   Build case studies from beta users
*   Referral program design

**Public Launch (Month 6)**:

*   Public access to platform
*   Press release and media outreach
*   Launch promotion (first 3 months at 50% off)
*   Partnerships with real estate investment communities (BiggerPockets, REI clubs)
*   Paid advertising (Google Ads, Facebook, targeted publications)
*   Webinar series for education and demos
*   Trade show presence (NMHC, NARPM conferences)

**Growth Phase (Months 7-12)**:

*   Scale paid acquisition channels
*   Content marketing expansion (SEO, guides, calculators)
*   Lender recruitment program
*   Partner ecosystem development (contractors, vendors)
*   Customer success team expansion
*   Community building (user forum, events)

**Scale Phase (Months 13-24)**:

*   Enterprise sales team
*   Channel partnerships (property management franchises)
*   International expansion
*   Industry awards and recognition
*   Thought leadership (conference speaking, industry reports)

**11.3 Team Scaling Plan**

**MVP Team (Months 0-5)**: 10 people

*   Product Manager (1)
*   Backend Engineers (3)
*   Frontend Engineers (2)
*   DevOps Engineer (1)
*   QA Engineer (1)
*   UI/UX Designer (1)
*   ML Engineer (1) - part-time

**V1 Team (Months 6-9)**: 12 people

*   Add: ML Engineers (2) - full-time for AI features

**V2 Team (Months 10-15)**: 15 people

*   Add: Mobile Developers (2)
*   Add: ML Engineer (1) - for advanced models

**V3 Team (Months 16-24)**: 20 people

*   Add: Growth Team (Marketing Manager, Sales Rep, Content Creator)
*   Add: Customer Success Manager (1)
*   Add: Backend Engineer (1) - for scaling

**Support Functions** (ongoing):

*   Legal/Compliance Consultant (contracted)
*   Accounting/Finance (contracted initially, hire CFO Month 18)
*   HR/Recruiting (contracted initially, hire Head of People Month 18)

**11.4 Budget & Funding Requirements**

**Seed Funding Target**: $3.5M

*   Runway: 24 months to profitability inflection point
*   Use of Funds:
    *   Engineering & Product Development: 60% ($2.1M)
    *   Go-to-Market (Marketing, Sales): 25% ($875K)
    *   Operations (Legal, Compliance, Insurance): 10% ($350K)
    *   Contingency: 5% ($175K)

**Monthly Burn Rate**:

*   Months 0-5 (MVP): $150K/month
*   Months 6-9 (V1): $160K/month
*   Months 10-15 (V2): $180K/month
*   Months 16-24 (V3): $220K/month

**Path to Profitability**:

*   Breakeven MRR: ~$400K (Month 20-22)
*   Contribution margin: 85% (after AWS, third-party APIs, transaction fees)
*   Expected profitability: Month 22-24

**Series A Funding** (Month 18-20): $12-15M

*   Accelerate growth, expand sales team
*   International expansion
*   Advanced AI capabilities
*   Strategic acquisitions (e.g., complementary tools)

**12\. Success Metrics & KPIs**

**12.1 Product Health Metrics**

**Activation Metrics**:

*   Time to first property created: Target <10 minutes
*   Time to first lease created: Target <30 minutes
*   Completion of onboarding checklist: Target 80% within 7 days

**Engagement Metrics**:

*   Daily Active Users / Monthly Active Users (DAU/MAU): Target >30%
*   Properties added per active user: Target 2+ per month (growth phase)
*   Logins per user per week: Target 3+ for property managers
*   Feature adoption rates:
    *   Deal calculator: 60% of investors
    *   Rent collection: 80% of landlords
    *   Screening: 70% of new leases
    *   Maintenance: 90% of properties

**Retention Metrics**:

*   Monthly churn rate: <5% (target 3% by Year 2)
*   Net Revenue Retention (NRR): Target 110%+ (through upsells and expansion)
*   Customer lifetime value (LTV): Target $5,000+
*   12-month retention: Target 70%+

**Quality Metrics**:

*   API error rate: <0.5%
*   Page load time (p95): <2 seconds
*   App crash rate: <1% of sessions
*   Support ticket resolution time: <24 hours (median)
*   Customer Satisfaction (CSAT): Target 85%+
*   Net Promoter Score (NPS): Target 50+

**12.2 Business Metrics**

**Revenue Metrics**:

*   Monthly Recurring Revenue (MRR)
*   MRR Growth Rate: Target 15-20% monthly (early stage)
*   Average Revenue Per User (ARPU): Track by tier
*   Customer Acquisition Cost (CAC): Target <$500
*   LTV/CAC Ratio: Target >3:1
*   Transaction revenue per active property: Target $15/month

**Sales & Marketing Metrics**:

*   Website conversion rate: Target 5% (visitor → trial signup)
*   Trial-to-paid conversion: Target 25%
*   Payback period: Target <12 months
*   Marketing qualified leads (MQLs) → trials: Target 40%
*   Organic vs. paid acquisition mix: Target 60/40

**Operational Metrics**:

*   Properties under management: Primary growth indicator
*   Deals created: Leading indicator of investor engagement
*   Deals submitted to lenders: Measure of ecosystem value
*   Lender response rate: Target >70%
*   Average deal funding time: Track reduction over time
*   Rent collected via platform: Target 70% of total rent
*   Screening reports ordered: Per-property rate

**12.3 AI Model Performance Metrics**

**Renovation Cost Estimator**:

*   Mean Absolute Percentage Error (MAPE): Target <15%
*   Predictions within ±20% of actual: Target 80%
*   User satisfaction with estimates (survey): Target 75% "helpful"
*   Adoption rate: Target 60% of deal calculations

**Tenant Risk Scoring**:

*   AUC-ROC: Target >0.75
*   Precision at 90% recall: Target >60%
*   Tenant default rate (high-risk scored): <15%
*   Tenant default rate (low-risk scored): <3%
*   No disparate impact across protected groups: Continuous monitoring

**Rent/ARV Prediction**:

*   MAPE for rent: Target <10%
*   MAPE for ARV: Target <8%
*   User confidence in predictions (survey): Target 80% "trust"

**12.4 User Satisfaction Metrics**

**Net Promoter Score (NPS)**:

*   Overall target: 50+
*   By cohort: New users (0-90 days), Active users (90+ days)
*   Track quarterly and by tier

**Customer Satisfaction (CSAT)**:

*   Post-interaction surveys: Target 85%+
*   Key touchpoints: Onboarding, support interactions, feature launches

**Feature Satisfaction**:

*   Survey after using key features
*   Identify areas for improvement

**Support Metrics**:

*   First response time: Target <4 hours
*   Resolution time: Target <24 hours (median)
*   Customer effort score: Target "very easy"

**13\. Risk Assessment & Mitigation**

**13.1 Technical Risks**

**Risk**: Scalability challenges with rapid user growth

**Impact**: High - Performance degradation, downtime **Probability**: Medium **Mitigation**:

*   Horizontal scaling architecture from day one
*   Load testing at 10x expected capacity
*   Auto-scaling policies for all services
*   CDN for static assets
*   Database read replicas
*   Regular performance audits

**Risk**: Data loss or corruption

**Impact**: Critical - Legal liability, customer trust **Probability**: Low **Mitigation**:

*   Automated daily backups with 30-day retention
*   Point-in-time recovery enabled
*   Multi-region backup replication
*   Quarterly disaster recovery drills
*   Immutable audit logs
*   File versioning in S3

**Risk**: Security breach or data leak

**Impact**: Critical - Legal liability, reputation damage **Probability**: Medium (industry-wide threat) **Mitigation**:

*   Comprehensive security architecture (see Section 7)
*   Regular penetration testing
*   Bug bounty program
*   Employee security training
*   Incident response plan
*   Cyber insurance

**Risk**: Third-party API failures (Stripe, Plaid, screening providers)

**Impact**: High - Service disruption **Probability**: Medium **Mitigation**:

*   Graceful degradation strategies
*   Multiple provider options where possible
*   Retry logic with exponential backoff
*   Status page communicating outages
*   Manual override capabilities
*   SLA agreements with providers

**13.2 Business Risks**

**Risk**: Customer acquisition costs higher than projected

**Impact**: High - Burn rate increase, runway reduction **Probability**: Medium **Mitigation**:

*   Diversified acquisition channels
*   Strong organic/referral program
*   Product-led growth strategy
*   CAC payback monitoring (monthly)
*   Efficient trial-to-paid funnel optimization

**Risk**: High churn rate in early stages

**Impact**: High - Difficulty achieving scale **Probability**: Medium **Mitigation**:

*   Robust onboarding program
*   Customer success team from day one
*   Proactive outreach to at-risk customers
*   Continuous product improvement based on feedback
*   Value demonstration (ROI calculators, reports)

**Risk**: Slow lender adoption

**Impact**: Medium - Reduced deal flow value proposition **Probability**: Medium **Mitigation**:

*   Direct lender recruitment (sales team)
*   No-cost trial for lenders
*   Demonstrate quality deal flow
*   Integration with lender workflows
*   Industry partnerships and endorsements

**Risk**: Competitor response (established players add features)

**Impact**: Medium - Harder differentiation **Probability**: High **Mitigation**:

*   Speed to market with unique features
*   Strong lender network (network effects)
*   Superior AI capabilities
*   Better user experience
*   Build switching costs (data lock-in)

**13.3 Regulatory & Legal Risks**

**Risk**: FCRA violation in screening workflows

**Impact**: Critical - Fines, lawsuits, license revocation **Probability**: Medium **Mitigation**:

*   Legal counsel review of screening features
*   Automated compliance checks in workflows
*   Required disclosures and consent
*   User training on FCRA requirements
*   Regular compliance audits
*   Insurance coverage

**Risk**: Fair Housing complaint or lawsuit

**Impact**: High - Reputation damage, fines **Probability**: Medium **Mitigation**:

*   No collection of protected class data
*   AI model bias testing
*   User training on Fair Housing
*   Terms of Service prohibiting discrimination
*   Audit capability for investigations
*   Legal defense insurance

**Risk**: State-specific landlord-tenant law violations

**Impact**: Medium - Legal issues for users and platform **Probability**: Medium **Mitigation**:

*   AI lease generation reviewed by lawyers per state
*   Clear disclaimers (not legal advice)
*   Regular updates as laws change
*   Encourage users to consult local counsel
*   Knowledge base with jurisdiction guidance

**Risk**: Data privacy regulation non-compliance (GDPR, CCPA)

**Impact**: High - Fines, operational restrictions **Probability**: Low **Mitigation**:

*   Privacy-by-design architecture
*   Data protection impact assessments
*   User consent management
*   Data subject rights workflows
*   Regular privacy audits
*   DPO (Data Protection Officer) appointment

**Risk**: Changes to third-party API terms or availability

**Impact**: Medium-High - Feature disruption **Probability**: Medium **Mitigation**:

*   Contractual agreements where possible
*   Multiple provider options (Zillow + ATTOM + CoreLogic)
*   Abstraction layer for easy provider swapping
*   Monitor API terms of service changes
*   Build proprietary data assets over time

**13.4 Financial Risks**

**Risk**: Underestimated development costs

**Impact**: Medium - Runway reduction **Probability**: Medium **Mitigation**:

*   20% contingency buffer in budget
*   Phased development (MVP → V1 → V2)
*   Regular sprint planning and velocity tracking
*   Offshore development for certain tasks
*   Open-source libraries where appropriate

**Risk**: Payment processing disputes and chargebacks

**Impact**: Low-Medium - Revenue loss, Stripe account risk **Probability**: Medium **Mitigation**:

*   Clear payment terms and confirmation emails
*   Proactive fraud detection
*   Responsive dispute resolution
*   Maintain chargeback rate <1%
*   Adequate reserves

**Risk**: Difficulty raising follow-on funding

**Impact**: High - May need to cut team or features **Probability**: Low (given traction and market) **Mitigation**:

*   Path to profitability by Month 24
*   Strong unit economics (high margins)
*   Demonstrate clear market traction
*   Build relationships with Series A investors early
*   Option to bootstrap if needed (slower growth)

**14\. Appendices**

**Appendix A: Glossary**

**ACH (Automated Clearing House)**: Electronic bank-to-bank payment network  
**ARV (After Repair Value)**: Estimated property value after renovations  
**BRRRR**: Buy, Rehab, Rent, Refinance, Repeat investment strategy  
**Cap Rate**: Capitalization rate; net operating income / property value  
**DSCR (Debt Service Coverage Ratio)**: Net operating income / debt payments  
**FCRA (Fair Credit Reporting Act)**: Federal law regulating consumer credit reporting  
**IDX (Internet Data Exchange)**: System for displaying MLS listings  
**IRR (Internal Rate of Return)**: Investment return metric  
**LTV (Loan-to-Value)**: Loan amount / property value ratio  
**MLS (Multiple Listing Service)**: Database of properties for sale  
**NOI (Net Operating Income)**: Revenue minus operating expenses  
**RBAC (Role-Based Access Control)**: Permission system based on user roles  
**ROI (Return on Investment)**: (Gain - Cost) / Cost  
**RLS (Row-Level Security)**: Database security enforcing data isolation  
**SOC 2**: Security audit standard for service providers

**Appendix B: API Endpoint Reference**

Complete API documentation will be generated via OpenAPI/Swagger specification. Key endpoint categories:

**Authentication**:

*   POST /api/auth/register
*   POST /api/auth/login
*   POST /api/auth/refresh
*   POST /api/auth/logout
*   POST /api/auth/password-reset

**Properties**:

*   GET /api/properties
*   POST /api/properties
*   GET /api/properties/{id}
*   PATCH /api/properties/{id}
*   DELETE /api/properties/{id}
*   POST /api/properties/{id}/photos

**Deals**:

*   POST /api/deals
*   GET /api/deals/{id}
*   POST /api/deals/{id}/calculate
*   POST /api/deals/{id}/scenarios
*   POST /api/deals/{id}/send-to-lender

**Lenders**:

*   GET /api/lenders
*   POST /api/lenders/{id}/deals/{dealId}/respond

**Payments**:

*   POST /api/payments/setup-intent
*   POST /api/payments/charge
*   POST /api/payments/transfer

**AI**:

*   POST /api/ai/renovation-estimate
*   POST /api/ai/rent-prediction
*   POST /api/ai/risk-score

Full API documentation available at: https://api.propwise.io/docs

**Appendix C: User Research Summary**

**Methodology**: 50 interviews with landlords, property managers, and investors (July-September 2025)

**Key Findings**:

1.  **Pain Point #1**: Fragmented tools - average user has 5+ subscriptions
2.  **Pain Point #2**: Difficulty accessing financing - 78% say finding capital is hardest part
3.  **Pain Point #3**: Time-consuming administrative tasks - average 10 hours/week per property
4.  **Feature Demand**: Deal analysis tools ranked #1 requested feature
5.  **Willingness to Pay**: 82% would pay $50-100/month for unified platform
6.  **Trust Factor**: Lender connections valued higher than additional PMS features

**Personas Identified**: See Section 2.1

**Appendix D: Competitive Analysis Matrix**

Detailed competitive analysis available in separate document. Key differentiators:

| Feature | PropWise | AppFolio | Buildium | Stessa |
| --- | --- | --- | --- | --- |
| Deal Calculator | ✓ | ✗ | ✗ | ✓ |
| Lender Integration | ✓ | ✗ | ✗ | ✗ |
| AI Cost Estimation | ✓ | ✗ | ✗ | ✗ |
| Property Management | ✓ | ✓ | ✓ | ✗ |
| Rent Collection | ✓ | ✓ | ✓ | ✗ |
| Starting Price | $49 | $280 | $50 | Free |

**Appendix E: Technology Decision Rationale**

**Python FastAPI vs. Node.js**:

*   Python chosen for AI/ML ecosystem compatibility
*   FastAPI offers async performance comparable to Node.js
*   Superior for data-heavy operations
*   Type safety with Pydantic

**PostgreSQL vs. MongoDB**:

*   PostgreSQL for structured, relational data
*   ACID compliance critical for financial transactions
*   PostGIS for geospatial features
*   Proven scalability

**AWS vs. GCP vs. Azure**:

*   AWS for comprehensive service offerings
*   Strong AI/ML services (SageMaker)
*   Best documentation and community
*   Startup credits available

**React vs. Vue vs. Angular**:

*   React for largest talent pool
*   Next.js SSR for SEO-critical pages
*   Extensive ecosystem and libraries

**Appendix F: Legal & Compliance Checklist**

**Pre-Launch**:

*   \[ \] Terms of Service drafted and reviewed
*   \[ \] Privacy Policy drafted and reviewed
*   \[ \] FCRA compliance procedures documented
*   \[ \] Fair Housing training materials created
*   \[ \] Data Processing Agreement template for enterprise
*   \[ \] Cookie consent management implemented
*   \[ \] Accessible website (WCAG 2.1 AA)

**Post-Launch** (Month 6):

*   \[ \] SOC 2 audit initiated
*   \[ \] Cyber insurance policy obtained
*   \[ \] E&O insurance for platform errors
*   \[ \] Business licenses obtained in operating states
*   \[ \] Tax nexus analysis for multi-state operations

**Ongoing**:

*   \[ \] Quarterly privacy audits
*   \[ \] Annual penetration testing
*   \[ \] FCRA compliance monitoring
*   \[ \] Trademark registration (brand protection)

**15\. Conclusion & Next Steps**

PropWise represents a significant market opportunity to transform the real estate investment and property management landscape. By uniquely combining deal analysis, lender connectivity, and comprehensive property operations into a single, AI-powered platform, PropWise addresses critical pain points that existing solutions leave unserved.

**Key Success Factors**:

1.  **Product Excellence**: Intuitive UX with powerful features that save time and improve decisions
2.  **Network Effects**: Lender marketplace creates increasing value as platform grows
3.  **AI Differentiation**: Proprietary models provide insights competitors cannot match
4.  **Execution Speed**: First-mover advantage in integrated deal analysis + PMS category
5.  **Customer Success**: Obsessive focus on user outcomes and satisfaction

**Immediate Next Steps (Month 0)**:

1.  Secure seed funding ($3.5M target)
2.  Finalize founding team hires (Product, Engineering leads)
3.  Execute AWS infrastructure setup
4.  Initiate design system and UX research
5.  Begin lender partnership conversations
6.  Establish data provider relationships (comps APIs)
7.  Legal entity formation and IP protection

**90-Day Milestones**:

*   Month 1: Complete infrastructure setup, begin MVP development
*   Month 2: Authentication and property management modules functional
*   Month 3: Beta testing environment ready, recruit first 10 beta users

**Path to Market Leadership**:

*   **Year 1**: Establish product-market fit, achieve 3,500 customers
*   **Year 2**: Scale to 12,000 customers, introduce advanced AI features
*   **Year 3**: Market leader with 30,000 customers and $18M ARR

PropWise is positioned to become the definitive platform for the modern real estate investor and property manager. With the right execution, regulatory compliance, and customer-centric approach, PropWise will transform how real estate professionals operate, unlocking significant value for all stakeholders in the ecosystem.

**Document Approval**:

*   Product Owner: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
*   Engineering Lead: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
*   Legal/Compliance: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
*   Executive Sponsor: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Contact Information**: For questions or feedback on this PRD, contact:

*   Product Management: product@propwise.io
*   Engineering: engineering@propwise.io