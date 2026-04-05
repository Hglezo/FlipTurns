/** Canonical origin for metadata. Vercel fills host automatically; override with NEXT_PUBLIC_SITE_URL if needed. */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;

  if (process.env.VERCEL_ENV === "production") {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (host) return `https://${host}`;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}
