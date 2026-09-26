import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "dump-risk-admin";
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

export function adminAuthConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_USERNAME?.trim()
    && (process.env.ADMIN_PASSWORD?.length ?? 0) >= 16
    && (process.env.ADMIN_SESSION_SECRET?.length ?? 0) >= 32,
  );
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  if (!adminAuthConfigured()) return false;
  return safeEqual(username, process.env.ADMIN_USERNAME!.trim()) && safeEqual(password, process.env.ADMIN_PASSWORD!);
}

export function createAdminSession(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${signature(payload)}`;
}

export function isAdminRequest(request: Request): boolean {
  if (!adminAuthConfigured()) return false;
  const token = readCookie(request.headers.get("cookie"), ADMIN_COOKIE);
  if (!token) return false;
  const [version, expires, suppliedSignature] = token.split(".");
  if (version !== "v1" || !expires || !suppliedSignature) return false;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(suppliedSignature, signature(`${version}.${expires}`));
}

function signature(payload: string): string {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET ?? "").update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const item of header.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}
