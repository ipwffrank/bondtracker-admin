// Sentry error monitoring for the admin portal. Same shape as the
// main app's setup. Activates only when VITE_SENTRY_DSN is set.
//
// Use a SEPARATE Sentry project from the main app so admin-only
// errors don't pollute the customer-facing alert volume.

import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications.',
      /Loading chunk \d+ failed/i,
      /Failed to fetch dynamically imported module/i,
    ],
  });
}

export function setSentryUser(user) {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  if (!user) { Sentry.setUser(null); return; }
  Sentry.setUser({ id: user.uid, email: user.email || undefined });
  Sentry.setTag('role', 'host-admin');
}

export { Sentry };
