import { SchemaModuleFile, WorkspaceProject } from '@shared/domain/schemaTypes';
import { computeAutoLayout } from './autoLayout';
import { parseDbml } from '@shared/domain/dbml';
import { mergeSchemaFiles } from './schemaModules';
import { generateUniqueId } from './id';

export const COMMERCE_V1_DBML = `Project OmnichannelCommerce {
  database_type: 'PostgreSQL'
  Note: 'Core multi-domain commerce platform covering identity, catalog, and orders.'
}

Enum order_status {
  pending
  paid
  fulfilled
  cancelled
}

Table users [headercolor: #1e3a8a] {
  id uuid [pk, not null]
  email varchar(255) [unique, not null]
  full_name varchar(160) [not null]
  created_at timestamptz [default: \`now()\`]
  Note: 'Registered customer and operator accounts.'
}

Table organizations [headercolor: #1e3a8a] {
  id uuid [pk, not null]
  slug varchar(80) [unique, not null]
  legal_name varchar(200) [not null]
  tier varchar(40) [default: 'standard']
}

Table org_members [headercolor: #1e3a8a] {
  id uuid [pk, not null]
  org_id uuid [not null, ref: > organizations.id]
  user_id uuid [not null, ref: > users.id]
  role varchar(40) [not null, default: 'member']
}

Table categories [headercolor: #065f46] {
  id integer [pk, increment]
  parent_id integer [ref: > categories.id]
  name varchar(120) [not null]
  slug varchar(120) [unique, not null]
}

Table products [headercolor: #065f46] {
  id uuid [pk, not null]
  category_id integer [ref: > categories.id]
  sku varchar(64) [unique, not null]
  title varchar(200) [not null]
  is_active boolean [default: true]
}

Table orders [headercolor: #9a3412] {
  id uuid [pk, not null]
  org_id uuid [ref: > organizations.id]
  customer_id uuid [not null, ref: > users.id]
  status order_status [not null, default: 'pending']
  total_cents bigint [not null]
  created_at timestamptz [default: \`now()\`]
}

Table order_items [headercolor: #9a3412] {
  id uuid [pk, not null]
  order_id uuid [not null, ref: > orders.id]
  product_id uuid [not null, ref: > products.id]
  quantity integer [not null]
  unit_price_cents bigint [not null]
}

TableGroup "Identity & Access" [color: #2563EB] {
  Note: 'Authentication, tenant organizations, and RBAC memberships'
  users
  organizations
  org_members
}

TableGroup "Product Catalog" [color: #059669] {
  Note: 'Merchandising hierarchy and sellable SKUs'
  categories
  products
}

TableGroup "Order Fulfillment" [color: #D97706] {
  Note: 'Customer checkout, order lifecycle, and line items'
  orders
  order_items
}
`;

export const COMMERCE_V2_DBML = `Project OmnichannelCommerce {
  database_type: 'PostgreSQL'
  Note: '''
    # Omnichannel Commerce & Ledger Platform

    Core relational data model powering multi-tenant B2B/B2C commerce, inventory reservation, order fulfillment, and an immutable **double-entry financial ledger**.

    > [!IMPORTANT]
    > All monetary amounts are stored as signed 64-bit integer minor units (\`bigint\` cents) alongside an ISO-4217 currency code. Floating-point numeric types are strictly prohibited for balances or totals.

    ## Domain Architecture

    | Domain | Responsibility | Primary Tables |
    | :--- | :--- | :--- |
    | **Identity & Access** | User accounts, tenant orgs, RBAC, and ERP API keys | \`users\`, \`organizations\`, \`org_members\`, \`api_keys\` |
    | **Product Catalog** | Category tree, master SKUs, sellable variants, warehouse stock | \`categories\`, \`products\`, \`product_variants\`, \`inventory_levels\` |
    | **Order Fulfillment** | Checkout lifecycle, line-item snapshots, carrier tracking | \`orders\`, \`order_items\`, \`shipments\` |
    | **Billing & Ledger** | Tax invoices, payment capture, double-entry journal | \`invoices\`, \`payments\`, \`ledger_entries\` |

    ## Engineering Conventions

    - **Primary Keys**: UUIDv7 / UUIDv4 across domain entities; \`bigint\` sequence for append-only \`ledger_entries\`.
    - **Timestamps**: Stored as \`timestamptz\` in UTC; application layer formats per tenant timezone.
    - **Tenant Isolation**: Every order and invoice links back to \`organizations.id\` for row-level security (RLS) policies.

    ## Operational Health Check

    \`\`\`sql
    -- Verify zero-sum ledger invariant per payment capture
    SELECT payment_id,
           SUM(CASE WHEN entry_type = 'debit' THEN amount_cents ELSE -amount_cents END) AS net_balance
    FROM ledger_entries
    GROUP BY payment_id
    HAVING SUM(CASE WHEN entry_type = 'debit' THEN amount_cents ELSE -amount_cents END) <> 0;
    \`\`\`
  '''
}

Enum order_status {
  pending [note: 'Checkout created, awaiting payment authorization']
  authorized [note: 'Funds held on payment method, inventory reserved']
  paid [note: 'Payment captured and tax invoice settled']
  partially_shipped [note: 'At least one fulfillment shipment dispatched']
  fulfilled [note: 'All line items delivered to customer']
  cancelled [note: 'Voided prior to capture; stock reservation released']
  refunded [note: 'Full or partial credit memo issued']
}

Enum ledger_entry_type {
  debit
  credit
}

Table users [headercolor: #1e3a8a] {
  id uuid [pk, not null]
  email varchar(255) [unique, not null, note: 'Normalized lowercase login email']
  full_name varchar(160) [not null]
  mfa_enabled boolean [not null, default: false]
  created_at timestamptz [default: \`now()\`]
  Note: 'Registered customer and operator accounts.'
}

Table organizations [headercolor: #1e3a8a] {
  id uuid [pk, not null]
  slug varchar(80) [unique, not null]
  legal_name varchar(200) [not null]
  tier varchar(40) [default: 'standard']
  tax_id varchar(64)
}

Table org_members [headercolor: #1e3a8a] {
  id uuid [pk, not null]
  org_id uuid [not null, ref: > organizations.id]
  user_id uuid [not null, ref: > users.id]
  role varchar(40) [not null, default: 'member']
  invited_at timestamptz [default: \`now()\`]
}

Table api_keys [headercolor: #1e3a8a] {
  id uuid [pk, not null]
  org_id uuid [not null, ref: > organizations.id]
  key_prefix varchar(12) [not null]
  scopes varchar(255) [not null]
  expires_at timestamptz
  Note: 'Scoped machine credentials for partner ERP sync.'
}

Table categories [headercolor: #065f46] {
  id integer [pk, increment]
  parent_id integer [ref: > categories.id]
  name varchar(120) [not null]
  slug varchar(120) [unique, not null]
}

Table products [headercolor: #065f46] {
  id uuid [pk, not null]
  category_id integer [ref: > categories.id]
  sku varchar(64) [unique, not null]
  title varchar(200) [not null]
  is_active boolean [default: true]
  Note: 'Master product record shared across regional storefronts.'
}

Table product_variants [headercolor: #065f46] {
  id uuid [pk, not null]
  product_id uuid [not null, ref: > products.id]
  variant_sku varchar(80) [unique, not null]
  attributes_json jsonb [not null]
  unit_price_cents bigint [not null]
}

Table inventory_levels [headercolor: #065f46] {
  id uuid [pk, not null]
  variant_id uuid [not null, ref: > product_variants.id]
  warehouse_code varchar(24) [not null]
  on_hand integer [not null, default: 0]
  reserved integer [not null, default: 0]
  Indexes {
    (variant_id, warehouse_code) [unique, name: 'idx_variant_warehouse']
  }
}

Table orders [headercolor: #9a3412] {
  id uuid [pk, not null]
  org_id uuid [ref: > organizations.id]
  customer_id uuid [not null, ref: > users.id]
  status order_status [not null, default: 'pending']
  currency char(3) [not null, default: 'USD']
  total_cents bigint [not null, note: 'Pre-computed sum of \`order_items.quantity * unit_price_cents\` plus tax/shipping']
  created_at timestamptz [default: \`now()\`]
  Indexes {
    (org_id, created_at) [name: 'idx_orders_org_created']
  }
  Note: '''
    ## Orders Aggregate Root

    Represents a customer purchase contract from checkout initiation through final delivery or refund.

    ### State Machine Transitions

    1. \`pending\` → \`authorized\` when payment gateway places an auth hold and \`inventory_levels.reserved\` is incremented.
    2. \`authorized\` → \`paid\` upon capture webhook; triggers immutable \`invoices\` generation.
    3. \`paid\` → \`partially_shipped\` → \`fulfilled\` as \`shipments\` records receive carrier scan timestamps.

    > [!NOTE]
    > Direct updates to \`total_cents\` after \`status = 'paid'\` are blocked by application policy. Adjustments must be recorded through \`ledger_entries\`.
  '''
}

Table order_items [headercolor: #9a3412] {
  id uuid [pk, not null]
  order_id uuid [not null, ref: > orders.id]
  variant_id uuid [not null, ref: > product_variants.id]
  quantity integer [not null]
  unit_price_cents bigint [not null, note: 'Price snapshot at checkout time; decoupled from future catalog edits']
}

Table shipments [headercolor: #9a3412] {
  id uuid [pk, not null]
  order_id uuid [not null, ref: > orders.id]
  carrier varchar(60) [not null]
  tracking_number varchar(120)
  shipped_at timestamptz
  delivered_at timestamptz
}

Table invoices [headercolor: #5b21b6] {
  id uuid [pk, not null]
  order_id uuid [not null, ref: > orders.id]
  org_id uuid [not null, ref: > organizations.id]
  invoice_number varchar(40) [unique, not null]
  amount_due_cents bigint [not null]
  issued_at timestamptz [default: \`now()\`]
  Note: 'Immutable tax invoice issued upon order authorization.'
}

Table payments [headercolor: #5b21b6] {
  id uuid [pk, not null]
  invoice_id uuid [not null, ref: > invoices.id]
  provider varchar(40) [not null]
  provider_txn_id varchar(160) [unique]
  amount_cents bigint [not null]
  captured_at timestamptz
}

Table ledger_entries [headercolor: #5b21b6] {
  id bigint [pk, increment]
  payment_id uuid [ref: > payments.id]
  account_code varchar(32) [not null, note: 'Chart-of-accounts identifier, e.g. \`1010-CASH\`, \`4000-REVENUE\`']
  entry_type ledger_entry_type [not null]
  amount_cents bigint [not null]
  posted_at timestamptz [not null, default: \`now()\`]
  Note: '''
    ## Double-Entry Financial Ledger

    Append-only accounting journal tracking every financial movement across customer receivables, cash clearing, platform fees, and merchant payouts.

    > [!WARNING]
    > **Immutability Contract**: Never execute \`UPDATE\` or \`DELETE\` statements against \`ledger_entries\`. Corrections and refunds must append offsetting \`debit\` / \`credit\` entries referencing the original \`payment_id\`.

    ### Standard Account Codes

    - \`1010-CASH\`: Settled processor clearing account
    - \`1200-AR\`: Accounts receivable for pending authorizations
    - \`4000-REVENUE\`: Recognized merchandise revenue
    - \`4050-REFUNDS\`: Contra-revenue refund adjustments
  '''
}

TableGroup "Identity & Access" [color: #2563EB] {
  Note: 'Authentication, tenant organizations, RBAC, and machine API keys'
  users
  organizations
  org_members
  api_keys
}

TableGroup "Product Catalog" [color: #059669] {
  Note: 'Merchandising hierarchy, sellable variants, and warehouse stock'
  categories
  products
  product_variants
  inventory_levels
}

TableGroup "Order Fulfillment" [color: #D97706] {
  Note: 'Checkout lifecycle, variant line items, and carrier shipments'
  orders
  order_items
  shipments
}

TableGroup "Billing & Ledger" [color: #7C3AED] {
  Note: '''
    ### Billing, Invoicing & Accounting

    Coordinates tax invoice issuance (\`invoices\`), external PSP settlement (\`payments\`), and internal double-entry bookkeeping (\`ledger_entries\`).

    - Supports idempotent webhook retries via \`payments.provider_txn_id\` unique constraint.
    - Reconciles daily against processor settlement reports.
  '''
  invoices
  payments
  ledger_entries
}

Note "Migration & Indexing Guide" {
  '''
  # Migration & Indexing Runbook

  Guidelines for evolving **OmnichannelCommerce** safely in production without table locks.

  ## Checklist for Schema Changes

  - [x] Always create indexes \`CONCURRENTLY\` on high-write tables (\`orders\`, \`ledger_entries\`)
  - [x] Use expand-and-contract migrations when renaming or dropping columns
  - [ ] Backfill new \`NOT NULL\` columns in batches of 5,000 rows before adding constraints

  ## Recommended Partitioning Strategy

  For deployments exceeding 50M rows in \`ledger_entries\`, partition by monthly range on \`posted_at\`:

  \`\`\`sql
  CREATE TABLE ledger_entries_2026_11
    PARTITION OF ledger_entries
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
  \`\`\`
  '''
}
`;

export const SAAS_TELEMETRY_DBML = `Project MultiTenantTelemetry {
  database_type: 'PostgreSQL'
  Note: 'Multi-tenant SaaS observability, alerting, and quota metering schema.'
}

Table tenants [headercolor: #0f172a] {
  id uuid [pk, not null]
  name varchar(140) [not null]
  plan_code varchar(40) [not null]
  created_at timestamptz [default: \`now()\`]
}

Table projects [headercolor: #0f172a] {
  id uuid [pk, not null]
  tenant_id uuid [not null, ref: > tenants.id]
  slug varchar(80) [not null]
  region varchar(32) [not null]
}

Table ingest_pipelines [headercolor: #0369a1] {
  id uuid [pk, not null]
  project_id uuid [not null, ref: > projects.id]
  source_type varchar(40) [not null]
  retention_days integer [not null, default: 30]
}

Table metric_series [headercolor: #0369a1] {
  id bigint [pk, increment]
  pipeline_id uuid [not null, ref: > ingest_pipelines.id]
  metric_name varchar(160) [not null]
  labels_hash char(64) [not null]
}

Table alert_rules [headercolor: #b91c1c] {
  id uuid [pk, not null]
  project_id uuid [not null, ref: > projects.id]
  series_id bigint [ref: > metric_series.id]
  threshold double [not null]
  severity varchar(16) [not null]
}

Table incidents [headercolor: #b91c1c] {
  id uuid [pk, not null]
  rule_id uuid [not null, ref: > alert_rules.id]
  opened_at timestamptz [not null]
  resolved_at timestamptz
  summary text
}

TableGroup "Tenant Control Plane" [color: #334155] {
  Note: 'Workspace isolation and regional project provisioning'
  tenants
  projects
}

TableGroup "Telemetry Ingestion" [color: #0284C7] {
  Note: 'Streaming metric collectors and series cardinality index'
  ingest_pipelines
  metric_series
}

TableGroup "Alerting & Incident Response" [color: #DC2626] {
  Note: 'Threshold evaluators and incident timeline tracking'
  alert_rules
  incidents
}
`;

export function createInitialWorkspace(): WorkspaceProject {
  const parsedV1 = parseDbml(COMMERCE_V1_DBML);
  const posV1 = computeAutoLayout(parsedV1, 'full');

  const parsedV2 = parseDbml(COMMERCE_V2_DBML);
  const posV2 = computeAutoLayout(parsedV2, 'full');

  const now = new Date();
  const v1Date = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 6).toISOString();
  const v2Date = new Date(now.getTime() - 1000 * 60 * 60 * 18).toISOString();

  return {
    id: generateUniqueId('ws_commerce'),
    name: 'Omnichannel Commerce & Ledger',
    description:
      'Multi-domain relational architecture spanning Identity, Catalog, Fulfillment, and Double-Entry Billing.',
    dbml: COMMERCE_V2_DBML,
    tablePositions: posV2,
    groupMeta: {},
    stickyNotes: [
      {
        id: 'note_ledger_audit',
        x: (posV2['ledger_entries']?.x || 700) + 298,
        y: (posV2['ledger_entries']?.y || 450) - 10,
        width: 240,
        color: 'amber',
        title: 'Ledger Immutability Rule',
        content:
          'Never UPDATE or DELETE rows in ledger_entries. Reversals must post an offsetting debit/credit pair.',
        author: 'Schema Architect',
        updatedAt: v2Date,
        linkedTarget: 'table:ledger_entries',
      },
      {
        id: 'note_catalog_variants',
        x: (posV2['product_variants']?.x || 400) + 10,
        y: (posV2['product_variants']?.y || 100) - 150,
        width: 246,
        color: 'sky',
        title: 'Domain Boundary Note',
        content:
          'Order items bind to product_variants rather than products to preserve historical SKU pricing.',
        author: 'Domain Lead',
        updatedAt: v2Date,
        linkedTarget: 'group:Product Catalog',
      },
    ],
    detailLevel: 'full',
    versions: [
      {
        id: generateUniqueId('ver'),
        tag: 'v1.1.0',
        title: 'Added Billing & Ledger Domain + Variant Inventory',
        description:
          'Introduced invoices, payments, ledger_entries, api_keys, product_variants, inventory_levels, and shipments.',
        dbml: COMMERCE_V2_DBML,
        tablePositions: posV2,
        stickyNotes: [],
        createdAt: v2Date,
        isPublished: true,
      },
      {
        id: generateUniqueId('ver'),
        tag: 'v1.0.0',
        title: 'Initial Commerce Core Schema',
        description:
          'Baseline Identity & Access, Product Catalog, and Order Fulfillment tables.',
        dbml: COMMERCE_V1_DBML,
        tablePositions: posV1,
        stickyNotes: [],
        createdAt: v1Date,
        isPublished: true,
      },
    ],
    createdAt: v1Date,
    updatedAt: now.toISOString(),
  };
}

export function createSaaSTelemetryWorkspace(): WorkspaceProject {
  const parsed = parseDbml(SAAS_TELEMETRY_DBML);
  const pos = computeAutoLayout(parsed, 'full');
  const now = new Date().toISOString();

  return {
    id: generateUniqueId('ws_saas'),
    name: 'Multi-Tenant SaaS Telemetry',
    description: 'Control plane, ingestion pipelines, and alerting rules.',
    dbml: SAAS_TELEMETRY_DBML,
    tablePositions: pos,
    groupMeta: {},
    stickyNotes: [],
    detailLevel: 'full',
    versions: [
      {
        id: generateUniqueId('ver'),
        tag: 'v1.0.0',
        title: 'Initial Telemetry Schema',
        description: 'Baseline tenant control plane and incident models.',
        dbml: SAAS_TELEMETRY_DBML,
        tablePositions: pos,
        stickyNotes: [],
        createdAt: now,
        isPublished: true,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function createModularStarterWorkspace(): WorkspaceProject {
  const now = new Date().toISOString();
  const schemaFolder = 'schema';
  const schemaFiles: SchemaModuleFile[] = [
    {
      id: `mod_${Date.now()}_project`,
      path: `${schemaFolder}/_project.dbml`,
      content: `Project ModularStore {\n  database_type: 'PostgreSQL'\n  Note: '''\n    # Modular Store Schema\n\n    Each domain team owns its own \`.dbml\` file under \`schema/\`.\n    \`schema.dbml\` is merged automatically on the fly for diagram & docs inspection and is never pushed to GitHub.\n  '''\n}\n\nTableGroup "Identity" [color: #2563EB] {\n  users\n}\n\nTableGroup "Catalog" [color: #059669] {\n  products\n}\n\nTableGroup "Fulfillment" [color: #D97706] {\n  orders\n  order_items\n}\n`,
    },
    {
      id: `mod_${Date.now()}_users`,
      path: `${schemaFolder}/users.dbml`,
      content: `Table users [headercolor: #1e3a8a] {\n  id integer [pk, increment]\n  email varchar(255) [unique, not null]\n  full_name varchar(160) [not null]\n  created_at timestamp [default: \`now()\`]\n  Note: 'Owned by Identity team.'\n}\n`,
    },
    {
      id: `mod_${Date.now()}_products`,
      path: `${schemaFolder}/products.dbml`,
      content: `Table products [headercolor: #065f46] {\n  id integer [pk, increment]\n  sku varchar(64) [unique, not null]\n  title varchar(200) [not null]\n  price_cents integer [not null]\n  created_at timestamp [default: \`now()\`]\n  Note: 'Owned by Catalog team.'\n}\n`,
    },
    {
      id: `mod_${Date.now()}_orders`,
      path: `${schemaFolder}/orders.dbml`,
      content: `Table orders [headercolor: #9a3412] {\n  id integer [pk, increment]\n  user_id integer [not null]\n  status varchar(40) [not null, default: 'pending']\n  created_at timestamp [default: \`now()\`]\n  Note: 'Owned by Orders team.'\n}\n\nRef: orders.user_id > users.id\n\nTable order_items [headercolor: #9a3412] {\n  id integer [pk, increment]\n  order_id integer [not null]\n  product_id integer [not null]\n  quantity integer [not null, default: 1]\n}\n\nRef: order_items.order_id > orders.id [delete: cascade]\nRef: order_items.product_id > products.id\n`,
    },
  ];

  const merged = mergeSchemaFiles(schemaFiles, { schemaFolder });
  const parsed = parseDbml(merged.mergedDbml);
  const pos = computeAutoLayout(parsed, 'full');

  return {
    id: generateUniqueId('ws_modular'),
    name: 'Modular Store (schema/*.dbml)',
    description:
      'Modular per-table DBML files under schema/ merged automatically into schema.dbml on the fly.',
    dbml: merged.mergedDbml,
    schemaFiles,
    activeSchemaFile: `${schemaFolder}/orders.dbml`,
    schemaFolder,
    tablePositions: pos,
    groupMeta: {},
    stickyNotes: [],
    detailLevel: 'full',
    versions: [
      {
        id: generateUniqueId('ver'),
        tag: 'v1.0.0',
        title: 'Initial Modular Schema',
        description:
          'Split into schema/_project.dbml, schema/users.dbml, schema/products.dbml, and schema/orders.dbml.',
        dbml: merged.mergedDbml,
        tablePositions: pos,
        stickyNotes: [],
        createdAt: now,
        isPublished: true,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

