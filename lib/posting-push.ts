import "server-only";

export function pushConfig() {
  const publicKey = process.env.POSTING_PUSH_PUBLIC_KEY;
  const privateKey = process.env.POSTING_PUSH_PRIVATE_KEY;
  const subject = process.env.POSTING_PUSH_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

// The server makes requests to these endpoints. Accept only known browser push services.
export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && !url.password &&
      (["fcm.googleapis.com", "updates.push.services.mozilla.com"].includes(url.hostname) ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname.endsWith(".notify.windows.com"));
  } catch {
    return false;
  }
}
