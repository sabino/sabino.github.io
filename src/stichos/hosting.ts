/** Public configuration contains endpoints only; payment keys always remain on the server. */
export function resolveStoreOrigin(
  location: { protocol: string; origin: string; hostname: string },
  configured?: string,
): string | null {
  if (configured === '.') return location.origin;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
        return null;
      if (url.protocol === 'https:') return url.origin;
      if (
        location.protocol === 'http:' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )
        return url.origin;
    } catch {
      /* Invalid public configuration leaves purchases disabled. */
    }
    return null;
  }
  return location.protocol === 'http:' ? `http://${location.hostname}:4175` : null;
}

export const configuredStoreOrigin = () =>
  resolveStoreOrigin(
    location,
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
      ?.VITE_STORE_ORIGIN,
  );
