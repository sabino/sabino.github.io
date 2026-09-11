/** The published node keeps shared rooms running independently of any browser. */
export const PUBLISHED_WORLD_NODE = 'wss://verso-world.host.sabino.pro/ws';

export function validateWorldNode(value: string): string {
  const url = new URL(value);
  if (
    value.length > 240 ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.protocol !== 'wss:' &&
      !(url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw Error('World nodes use wss://; unencrypted ws:// is only allowed on localhost.');
  return url.href;
}

export function worldNodeEndpoint(
  env: { VITE_WORLD_NODE_URL?: string } = import.meta.env ?? {},
): string {
  return validateWorldNode(env.VITE_WORLD_NODE_URL || PUBLISHED_WORLD_NODE);
}

/** Old releases saved their implicit peer default. Preserve an explicit new choice. */
export function preferredRoomEndpoint(saved: string | null, explicitChoice = false): string {
  if (saved === 'peer:' && explicitChoice) return saved;
  if (saved && saved !== 'peer:') {
    try {
      return validateWorldNode(saved);
    } catch {}
  }
  return worldNodeEndpoint();
}

export function hasCompleteRoomAddress(endpoint: string): boolean {
  return endpoint === 'peer:' || endpoint === worldNodeEndpoint();
}
