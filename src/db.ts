import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env } from './env.js';

export interface DemoOrder {
  id: string;
  workspaceId: string;
  customerEmail: string;
  amountCents: number;
  items?: { sku: string; amount: number; quantity: number }[];
  status: string;
  createdAt: string;
}

interface OrderRow {
  id: string;
  workspace_id: string;
  customer_email: string;
  amount_cents: number;
  items: string | null;
  status: string;
  created_at: string;
}

const dbPath = resolve(env.DATABASE_PATH);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    items TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );
`);

const seed = db.prepare(
  `INSERT INTO orders (id, workspace_id, customer_email, amount_cents, items, status, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO NOTHING`,
);

seed.run(
  'ord_demo_1001',
  'ws_a91f4c2e7d',
  'dana.whitfield@acme-labs.dev',
  4999,
  JSON.stringify([{ sku: 'seat-pro', amount: 2499, quantity: 2 }]),
  'pending',
  new Date(Date.now() - 86_400_000).toISOString(),
);
seed.run(
  'ord_demo_1002',
  'ws_a91f4c2e7d',
  'marco.ibarra@northwind.io',
  9900,
  JSON.stringify([{ sku: 'seat-enterprise', amount: 9900, quantity: 1 }]),
  'paid',
  new Date(Date.now() - 3_600_000).toISOString(),
);
// Intentionally malformed: empty items array. Pricing this order throws a real TypeError.
seed.run(
  'ord_bad_items',
  'ws_a91f4c2e7d',
  'priya.raman@vertexpe.com',
  0,
  JSON.stringify([]),
  'pending',
  new Date(Date.now() - 600_000).toISOString(),
);

function toOrder(row: OrderRow | undefined): DemoOrder | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    customerEmail: row.customer_email,
    amountCents: row.amount_cents,
    items: row.items === null ? undefined : (JSON.parse(row.items) as DemoOrder['items']),
    status: row.status,
    createdAt: row.created_at,
  };
}

export function findOrder(id: string): DemoOrder | undefined {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
  return toOrder(row);
}

export function markOrderPaid(id: string): void {
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', id);
}
