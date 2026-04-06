# Ekylibre_implementation plan

## 1. Scope and Constraints

This plan covers implementation of the following module groups, excluding Commercial Workflows (sales/purchase domains):

1. Operations Engine Depth (interventions and work orders)
2. Inventory and Stock Accounting
3. Product and Traceability Graph
4. Accounting Breadth (internal accounting foundation)
5. Asset and Workforce Management
6. Process Maturity and Document Workflows

Explicitly out of scope for this plan:

- Orders, invoices, opportunities, sale/purchase contracts, receivable/payable commercial flows


## 2. Current-State Summary (Aquaponic-AI)

Current strengths already present:

- AI/voice-led survey and interpretation flow
- FastAPI backend with modular routers/services
- Dashboard/reporting and Google Sheets synchronization for financial outputs
- Dockerized runtime with PostgreSQL + Redis

Key gap pattern:

- Domain depth is shallow in operations, inventory, traceability, accounting internals, assets/workforce, and workflow orchestration
- Several frontend actions route between views but do not execute full end-to-end domain transactions


## 3. Target Architecture

## 3.1 Backend Layers

1. Router layer (`backend/routers`)
- Request validation, auth checks, tenant/farm scope checks, pagination/filter plumbing

2. Service layer (`backend/services`)
- Domain transaction orchestration
- Idempotent command handlers
- Event emission for audit and downstream projections

3. Model layer (`backend/models`)
- SQLAlchemy entities and relations
- Domain constraints and unique indexes

4. Schema layer (`backend/schemas`)
- Input/output DTOs
- Versioned API contracts (`v1` now, path to `v2`)

5. Cross-cutting (`backend/core`, `backend/utils`)
- Permissions and policy checks
- Audit and event logging
- Background jobs and retries

## 3.2 Frontend Layers

1. Domain modules under `frontend/src/app/components/*`
- Operations, Inventory, Traceability, Accounting, Assets, Workforce, Documents

2. Shared client layer
- Typed API client with retries and structured errors
- Optimistic updates only where safe

3. State strategy
- Query cache for server state
- Local UI state for forms/wizards only

4. UX standards
- One authoritative action path per operation
- Clear state transitions: draft -> validated -> posted -> locked

## 3.3 Data and Event Strategy

- PostgreSQL as source of truth
- Optional Redis for command dedupe keys and async worker queues
- Domain event table for auditable transitions and materialized projections
- Soft delete + immutable posting records for accounting/inventory correctness


## 4. Program Phasing (24-32 Weeks)

## Phase 0 (Weeks 1-2): Foundations and Guardrails

Deliverables:

1. Architectural Decision Records (ADRs)
- posting model, idempotency, event model, document lifecycle

2. Base infra improvements
- Alembic migration conventions
- request correlation IDs
- structured audit logging

3. Quality baseline
- Test pyramid policy (unit, integration, API contract, E2E)
- Seed/factory strategy for deterministic tests

Exit criteria:

- Team can add a new domain aggregate with migration, API, tests, and audit in < 1 day


## Phase 1 (Weeks 3-8): Operations Engine Depth

Goal:
Implement full intervention/work-order lifecycle with resources, execution, and cost attribution.

### 1. Domain model

Core entities:

- `operation_template`
- `operation_plan`
- `work_order`
- `work_step`
- `work_assignment` (worker/equipment)
- `work_input` (consumables)
- `work_output` (products/byproducts)
- `work_log` (actuals)
- `work_time_entry`
- `operation_cost_rollup`

State machine:

- `draft` -> `planned` -> `in_progress` -> `completed` -> `validated` -> `locked`
- Cancel path only until `validated`

### 2. Backend APIs

- `POST /operations/templates`
- `GET /operations/templates`
- `POST /operations/plans`
- `POST /work-orders`
- `PATCH /work-orders/{id}/state`
- `POST /work-orders/{id}/assignments`
- `POST /work-orders/{id}/inputs`
- `POST /work-orders/{id}/outputs`
- `POST /work-orders/{id}/logs`
- `GET /work-orders/{id}/cost-rollup`

### 3. Business rules

- No `completed` without required steps done
- Inputs must respect available stock reservations (Phase 2 integration)
- Time entries immutable after lock

### 4. Frontend scope

- Operations board (kanban by state)
- Work-order detail with tabs: plan, resources, inputs/outputs, logs, cost
- Template-driven creation wizard

### 5. Testing

- State machine property tests
- Integration tests for transitions + rollback behavior
- E2E: create template -> instantiate order -> execute -> validate

Exit criteria:

- 90%+ operations go through workflow without manual DB intervention
- Deterministic cost rollup available on completed work orders


## Phase 2 (Weeks 9-13): Inventory and Stock Accounting

Goal:
Build reliable stock ledger with movements, reservations, counts, and valuation anchors.

### 1. Domain model

Core entities:

- `stock_item` (SKU-level identity)
- `stock_lot` (batch/lot tracking)
- `stock_location` (zone/bin/tank/store)
- `stock_movement` (immutable ledger)
- `stock_reservation`
- `stock_count_session`
- `stock_count_line`
- `stock_adjustment`
- `valuation_snapshot`

Movement types:

- receive, consume, transfer, produce, adjust, waste, return

### 2. Backend APIs

- `POST /inventory/items`
- `POST /inventory/lots`
- `POST /inventory/movements`
- `POST /inventory/reservations`
- `POST /inventory/count-sessions`
- `POST /inventory/count-sessions/{id}/lines`
- `POST /inventory/count-sessions/{id}/finalize`
- `GET /inventory/on-hand`
- `GET /inventory/ledger`

### 3. Business rules

- Ledger is append-only
- Reservation consumes available-to-promise, not on-hand directly
- Negative stock blocked unless explicit policy override

### 4. Frontend scope

- On-hand dashboard by location/lot
- Movement entry form with guardrails
- Cycle count workflow and variance review

### 5. Testing

- Concurrency tests (simultaneous reservations/movements)
- Ledger reconciliation tests from seed data
- E2E: reserve -> consume -> produce -> count adjust

Exit criteria:

- Reconstruct on-hand entirely from ledger
- < 0.5% unexplained stock variance in pilot farms


## Phase 3 (Weeks 14-18): Product and Traceability Graph

Goal:
Provide farm-to-output lineage, backward and forward traceability.

### 1. Domain model

Core entities:

- `product_family`
- `product_variant`
- `product_spec`
- `batch`
- `batch_parent_link` (lineage DAG)
- `trace_event`
- `quality_check`
- `compliance_tag`

Trace event sources:

- operations, inventory, sensor events, quality inspections

### 2. Backend APIs

- `POST /products/families`
- `POST /products/variants`
- `POST /trace/batches`
- `POST /trace/events`
- `GET /trace/batches/{id}/lineage`
- `GET /trace/impact/{batch_id}`

### 3. Business rules

- Batch split/merge fully represented in lineage graph
- Trace event has mandatory source reference
- Immutable lineage links after validation

### 4. Frontend scope

- Lineage explorer (graph + table fallback)
- Batch dossier view with timeline
- Recall simulation page (impact radius)

### 5. Testing

- DAG integrity tests (no cycles)
- Query performance tests for multi-hop lineage
- E2E: create batch -> process -> split -> trace backward/forward

Exit criteria:

- Trace any output to all critical inputs within seconds
- Recall simulation produces deterministic impacted set


## Phase 4 (Weeks 19-23): Accounting Breadth (Core Internal Accounting)

Goal:
Introduce internal accounting backbone required for operations/inventory valuation and audit readiness.

### 1. Domain model

Core entities:

- `chart_account`
- `journal`
- `journal_entry`
- `journal_line`
- `fiscal_period`
- `closing_run`
- `tax_code`
- `asset_register`
- `depreciation_schedule`

### 2. Posting strategy

- Domain postings from operations and inventory into journals
- Reversal-only corrections (no destructive edits)
- Period lock enforcement

### 3. Backend APIs

- `POST /accounting/accounts`
- `POST /accounting/journals`
- `POST /accounting/entries`
- `POST /accounting/periods/{id}/close`
- `GET /accounting/trial-balance`
- `GET /accounting/gl`
- `POST /accounting/assets`
- `POST /accounting/assets/{id}/depreciate`

### 4. Frontend scope

- Chart of accounts manager
- Journal entry console
- Trial balance and GL explorer
- Period close workflow with checklists

### 5. Testing

- Double-entry invariant tests (sum debit == sum credit)
- Period-close blocking scenario tests
- Reversal and audit trail integrity tests

Exit criteria:

- Trial balance always balanced
- Period close blocks late writes correctly


## Phase 5 (Weeks 24-27): Asset and Workforce Management

Goal:
Schedule and measure equipment and workforce as first-class resources.

### 1. Domain model

Core entities:

- `asset`
- `asset_maintenance_plan`
- `asset_usage_log`
- `worker`
- `worker_skill`
- `shift`
- `timesheet`
- `timesheet_entry`
- `certification`

### 2. Backend APIs

- `POST /assets`
- `POST /assets/{id}/maintenance`
- `POST /assets/{id}/usage`
- `POST /workforce/workers`
- `POST /workforce/shifts`
- `POST /workforce/timesheets`
- `GET /workforce/utilization`

### 3. Business rules

- Assignment requires skill/certification match
- Equipment maintenance overdue blocks critical assignment
- Timesheet lock behavior aligns with accounting period policy

### 4. Frontend scope

- Asset registry + maintenance calendar
- Worker directory + skills matrix
- Shift planner + timesheet approval

### 5. Testing

- Assignment validator tests
- Utilization report correctness tests
- E2E: assign workers/equipment to work order -> capture actuals

Exit criteria:

- Resource conflicts detected pre-execution
- Utilization and labor cost available by operation


## Phase 6 (Weeks 28-32): Process Maturity and Document Workflows

Goal:
Move from ad hoc UI actions to governed workflows, templates, approvals, and audit-ready documents.

### 1. Domain model

Core entities:

- `document_template`
- `document_instance`
- `workflow_definition`
- `workflow_instance`
- `workflow_step`
- `approval_task`
- `attachment`
- `signature_record`

### 2. Backend APIs

- `POST /documents/templates`
- `POST /documents/instances`
- `POST /workflows/definitions`
- `POST /workflows/instances`
- `POST /workflows/instances/{id}/actions`
- `POST /approvals/{id}/approve`
- `POST /approvals/{id}/reject`

### 3. Business rules

- Configurable approval matrices by amount/risk/domain
- Immutable signed document versions
- SLA timers for pending approvals

### 4. Frontend scope

- Workflow designer (admin-only)
- Inbox for approvals/tasks
- Document center with templates and generated instances

### 5. Testing

- Workflow transition tests with policy permutations
- Signature/version immutability tests
- E2E: generate document -> route approval -> sign -> archive

Exit criteria:

- Critical processes use formal workflow and approvals
- Audit package export generated without manual collation


## 5. Cross-Module Integration Plan

## 5.1 Dependency order

1. Operations before deep inventory coupling
2. Inventory before full traceability
3. Accounting introduced after operations/inventory canonical events stabilize
4. Assets/workforce integrated into operations assignments
5. Document workflows wrap mature operational/accounting events

## 5.2 Integration contracts

- Operations emits events consumed by Inventory and Accounting
- Inventory movements emit valuation-impact events for Accounting
- Traceability subscribes to Operations + Inventory + Quality events

## 5.3 Canonical IDs

- `farm_id`, `operation_id`, `work_order_id`, `batch_id`, `stock_lot_id`, `journal_entry_id`
- All external integrations reference canonical IDs, not labels


## 6. Data Model and Migration Strategy

1. Migration discipline
- One aggregate per migration set
- Forward-compatible nullable columns first, then backfill, then enforce constraints

2. Backfill strategy
- Use idempotent scripts for historical derivations
- Preserve source references and migration provenance

3. Large-table strategy
- Partition high-volume ledgers (`stock_movement`, `trace_event`) by time/farm
- Add composite indexes for dominant query dimensions

4. Archival policy
- Warm storage for last 18-24 months
- Cold archive for historical immutable records


## 7. API Contract and Versioning

1. Contract standards
- OpenAPI-first with generated types for frontend
- Explicit error codes (domain + validation + policy)

2. Version policy
- `v1` additive where possible
- breaking changes behind `v2` namespace

3. Idempotency
- Command endpoints accept idempotency keys
- Server stores key hash + response envelope for replay protection


## 8. Security, Governance, and Audit

1. Access control
- Role-based + farm-scoped + action-level policy checks

2. Audit log
- who/when/what/old/new for critical transitions
- immutable append-only audit trail

3. Compliance hooks
- optional PII field encryption
- retention policy with legal-hold markers


## 9. Observability and Reliability

1. Metrics
- command latency, transition failures, reconciliation drift, queue lag

2. Tracing
- correlation ID across API -> service -> DB -> worker

3. SLOs
- 99.5% API availability for core commands
- P95 < 400ms for standard reads, < 900ms for aggregate writes

4. Recovery playbooks
- stuck workflow, failed posting, stock mismatch, period-close rollback


## 10. Testing and Quality Gates

1. Unit tests
- domain invariants and calculators

2. Integration tests
- DB constraints, transaction boundaries, event outbox behavior

3. API contract tests
- schema and error compatibility

4. E2E tests
- top 20 operational journeys

5. Non-functional tests
- load tests for ledger writes and lineage queries
- chaos test for worker retries and idempotency

Quality gates per phase:

- No critical severity defects open
- Contract tests green
- Migration rollback validated in staging


## 11. Delivery Team Model

Recommended squad structure:

1. Core Platform Squad
- migrations, eventing, auth/audit, observability

2. Ops + Inventory Squad
- operations engine, inventory ledger, traceability

3. Finance + Workflow Squad
- accounting core, documents/approvals

4. UX + Product Ops
- frontend modules, usability validation, rollout enablement


## 12. Risk Register and Mitigations

1. Risk: Over-coupled domain rollout
- Mitigation: strict event contracts and anti-corruption services

2. Risk: Ledger correctness bugs
- Mitigation: append-only logs, reconciliation jobs, invariant tests

3. Risk: Performance regression on lineage/ledger
- Mitigation: partitioning, indexed query plans, projection tables

4. Risk: Workflow complexity explosion
- Mitigation: template libraries, policy defaults, progressive feature flags


## 13. Rollout Strategy

1. Feature flags by domain
- enable per farm/tenant and per role

2. Progressive rollout
- pilot farms -> controlled cohort -> broad release

3. Parallel run period
- compare old reports vs new generated reports for 4-6 weeks

4. Training and SOPs
- operator playbooks per module with failure handling steps


## 14. Milestone Plan (Suggested)

1. M1 (Week 2)
- foundations complete, baseline quality gates live

2. M2 (Week 8)
- operations lifecycle production-ready

3. M3 (Week 13)
- inventory ledger and counts production-ready

4. M4 (Week 18)
- traceability graph and recall simulation live

5. M5 (Week 23)
- accounting core and period close live

6. M6 (Week 27)
- assets/workforce integrated into operations

7. M7 (Week 32)
- workflow/doc approvals and audit package live


## 15. Immediate Next 2 Weeks (Actionable Starter Backlog)

1. Define and approve ADRs for:
- operation state machine
- stock ledger append-only model
- accounting posting and reversal policy

2. Create first migration packs:
- operations aggregate tables
- inventory ledger core tables

3. Implement first command APIs:
- create work order
- transition work order state
- post stock movement

4. Build first frontend slices:
- operations board
- on-hand inventory list

5. Add test harnesses:
- domain invariant test utilities
- API contract snapshots for new endpoints

6. Enable observability baseline:
- correlation IDs, structured logs, dashboard for command failures


## 16. Definition of Done (Global)

A module is considered complete only when:

1. Domain invariants are enforced in code and DB constraints
2. APIs are versioned, documented, and contract-tested
3. UI supports complete user workflow without manual DB edits
4. Audit events are emitted for critical state changes
5. Reconciliation reports pass in staging and pilot production
6. Runbook and SOP documentation exists for operators/support


## 17. Non-Goals (to prevent scope creep)

- Commercial workflows (sales/purchase full domain)
- Advanced BI replacement for existing spreadsheet dashboards in initial phases
- Multi-country tax engine complexity beyond basic tax code support


## 18. Naming and Repository Placement

Document title: `Ekylibre_implementation plan`

Suggested file path (this file):

- `Ekylibre_implementation_plan.md`
