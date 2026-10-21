// Fires one request per failure mode and prints status + trace id.
// Usage: node scripts/smoke.mjs [baseUrl]
const base = process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:3000';
const modes = ['pool', 'type', 'stripe', 'zod', 'timeout', 'redis', 'unhandled'];

async function hit(label, path, init) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}${path}`, init);
    const trace = res.headers.get('x-demo-trace-id') ?? 'n/a';
    console.log(`${String(res.status).padEnd(3)} ${String(Date.now() - started).padStart(5)}ms  ${label}  trace=${trace}`);
    return res;
  } catch (error) {
    console.log(`ERR       ${label}  ${error.message}`);
    return undefined;
  }
}

await hit('health', '/health');
await hit('order ok', '/orders/ord_demo_1001');
await hit('checkout ok', '/checkout', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-user-email': 'dana.whitfield@acme-labs.dev' },
  body: JSON.stringify({ orderId: 'ord_demo_1002' }),
});

for (const mode of modes) {
  await hit(`fail=${mode}`, `/admin/boom?fail=${mode}`, {
    headers: { 'x-user-email': `${mode}.tester@example.com` },
  });
}

await hit('webhook ok', '/webhooks/stripe', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: 'evt_demo_1', type: 'customer.created' }),
});
await hit('webhook fail', '/webhooks/stripe', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: 'evt_demo_2', type: 'invoice.paid', data: { object: { customer: 'cus_Qw3rTy9LmN0p' } } }),
});

console.log(`\nDone. Check Sentry project for events tagged service:sentry-demo-app, then open ./logs/app.log.`);
