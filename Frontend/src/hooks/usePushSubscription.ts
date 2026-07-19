import { useCallback, useEffect, useState } from "react";
import { getClientId } from "@/lib/clientId";
import { getVapidPublicKey, subscribeToPush, unsubscribeFromPush } from "@/lib/sessionApi";

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const bytes = Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  return bytes.buffer;
}

export type PushPermissionState = "unsupported" | "unconfigured" | "default" | "granted" | "denied";

/**
 * Phase 3's Web Push permission flow — see Docs/frontend/README.md's "Web
 * Push (Phase 3)" section. `unconfigured` means the backend has no VAPID
 * keys set (Backend/.env.example ships them blank), in which case the UI
 * should hide the opt-in entirely rather than offer a button that 503s.
 */
export function usePushSubscription() {
  const [state, setState] = useState<PushPermissionState>("default");
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    getVapidPublicKey()
      .then((res) => {
        setVapidPublicKey(res.public_key);
        if (!res.public_key) {
          setState("unconfigured");
        } else {
          setState(Notification.permission as PushPermissionState);
        }
      })
      .catch(() => setState("unconfigured"));
  }, []);

  const subscribe = useCallback(async () => {
    if (!vapidPublicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      setState(permission as PushPermissionState);
      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      await subscribeToPush(getClientId(), subscription);
    } catch {
      setError("Couldn't enable notifications — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [vapidPublicKey]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
      await unsubscribeFromPush(getClientId());
    } catch {
      setError("Couldn't disable notifications — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, subscribe, unsubscribe };
}
