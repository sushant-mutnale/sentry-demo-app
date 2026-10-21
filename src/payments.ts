import * as Sentry from '@sentry/node';
import type { DemoOrder } from './db.js';
import { StripeInvalidRequestError } from './errors.js';

export interface ChargeResult {
  chargeId: string;
  amountCents: number;
  currency: string;
}

export async function chargeOrder(order: DemoOrder): Promise<ChargeResult> {
  return Sentry.startSpan(
    {
      op: 'payment.charge',
      name: 'charge order',
      attributes: { 'order.id': order.id, 'order.amount_cents': order.amountCents },
    },
    async () => {
      const priced = priceOrder(order);
      return {
        chargeId: `ch_${Math.random().toString(36).slice(2, 14)}`,
        amountCents: priced.amountCents,
        currency: priced.currency,
      };
    },
  );
}

function priceOrder(order: DemoOrder): { amountCents: number; currency: string } {
  // Deliberate bug (triggered by `ord_bad_items`): items is `[]`, so `items[0]` is
  // undefined and reading `.amount` throws a genuine TypeError with a 3-frame stack.
  const lineItem = order.items![0];
  const amount = lineItem!.amount;
  const quantity = lineItem!.quantity;

  if (amount <= 0) {
    throw new StripeInvalidRequestError(`cus_${order.id}`);
  }

  return { amountCents: amount * quantity, currency: 'usd' };
}
