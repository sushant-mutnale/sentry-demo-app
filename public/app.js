/* global Sentry */
const config = window.__DEMO_CONFIG__ ?? {};
const out = document.getElementById('out');

let bootAttempts = 0;

function boot() {
  if (!window.Sentry) {
    if (++bootAttempts < 100) {
      setTimeout(boot, 50);
    } else {
      log('Sentry browser SDK failed to load (CDN blocked?) — events will not be sent', 'err');
    }
    return;
  }

  if (!config.dsn) {
    log('SENTRY_DSN is empty — browser events will not be sent', 'err');
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: 1,
  });
  Sentry.setUser({ id: 'usr_browser_demo', email: 'browser.demo@example.com' });
  Sentry.setTag('surface', 'demo-web');
  log('Sentry browser SDK ready');
}

boot();

function log(message, klass) {
  out.insertAdjacentHTML('afterbegin', `<div class="${klass ?? ''}">${new Date().toLocaleTimeString()} — ${message}</div>`);
}

document.querySelectorAll('button[data-action]').forEach((button) => {
  button.addEventListener('click', (event) => {
    Sentry.addBreadcrumb({ category: 'ui.click', message: `button ${event.currentTarget.dataset.action}` });
    const action = event.currentTarget.dataset.action;
    log(`triggering ${action}`);

    if (action === 'js') {
      const user = undefined;
      void user.profile.name;
    }

    if (action === 'rejection') {
      Promise.reject(new Error('Browser demo: unhandled rejection from checkout widget'));
    }

    if (action === 'fetch') {
      fetch('/admin/boom?fail=type')
        .then(async (res) => log(`server replied ${res.status} (trace ${res.headers.get('x-demo-trace-id') ?? 'n/a'})`, 'err'))
        .catch((error) => log(`fetch failed: ${error.message}`, 'err'));
    }

    if (action === 'message') {
      if (!window.Sentry) return log('Sentry SDK not loaded yet', 'err');
      Sentry.captureMessage('Demo message from the browser', { level: 'warning' });
      log('message sent', 'ok');
    }
  });
});
