/**
 * Frontend observability bootstrap — Sentry (+ optional PostHog).
 * No-ops cleanly when DSN/key env vars are unset so local dev stays free of noise.
 */

export function initObservability() {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (sentryDsn) {
    void import("@sentry/react").then((Sentry) => {
      Sentry.init({
        dsn: sentryDsn,
        environment: (import.meta.env.VITE_ENVIRONMENT as string | undefined) ?? "local",
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
      });
    });
  }

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const posthogHost =
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";
  if (posthogKey) {
    void import("posthog-js").then(({ default: posthog }) => {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        person_profiles: "identified_only",
        capture_pageview: true,
      });
    });
  }
}
