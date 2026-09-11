import type { PeerOptions } from 'peerjs';

export const PEER_CONNECT_TIMEOUT = 35000;

export interface PeerNetworkDiagnostic {
  stage: 'configuring' | 'signalling' | 'connecting' | 'online' | 'failed' | 'closed';
  hosting: boolean;
  signalling: boolean;
  relayConfigured: boolean;
  localCandidates: string[];
  remoteCandidates: string[];
  route: 'unknown' | 'local-host' | 'direct' | 'relay';
  roundTripMs?: number;
  iceState?: string;
  candidateErrors: { service: 'stun' | 'turn'; code: number }[];
  error?: { code: string; reason: string };
}

export interface PeerNetworkEnvironment {
  VITE_PEER_ICE_SERVERS?: string;
  VITE_PEER_ICE_ENDPOINT?: string;
  VITE_PEER_SIGNAL_URL?: string;
  VITE_PEER_RELAY_ONLY?: string;
}

// PeerJS 1.5.5's bundled public TURN hostnames no longer resolve. Never report
// relay availability merely because those dead entries exist in the dependency.
const DIRECT_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export function validateIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value) || !value.length || value.length > 16)
    throw Error('The relay configuration must contain 1–16 ICE servers.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw Error('Invalid ICE server configuration.');
    const urls = typeof entry.urls === 'string' ? [entry.urls] : entry.urls;
    if (
      !Array.isArray(urls) ||
      !urls.length ||
      urls.length > 8 ||
      !urls.every(
        (url: unknown) =>
          typeof url === 'string' &&
          url.length <= 256 &&
          /^(stun|stuns|turn|turns):(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/i.test(
            url,
          ),
      )
    )
      throw Error('ICE servers need valid STUN or TURN addresses.');
    const turn = urls.some((url: string) => /^turns?:/i.test(url));
    if (
      turn &&
      (typeof entry.username !== 'string' ||
        !entry.username.length ||
        entry.username.length > 512 ||
        typeof entry.credential !== 'string' ||
        !entry.credential.length ||
        entry.credential.length > 1024)
    )
      throw Error('A TURN relay needs a username and credential.');
    return {
      urls: [...urls],
      ...(turn ? { username: entry.username, credential: entry.credential } : {}),
    };
  });
}

export function hasTurnServer(options: PeerOptions): boolean {
  return (options.config?.iceServers ?? []).some((server: RTCIceServer) =>
    (typeof server.urls === 'string' ? [server.urls] : server.urls).some((url: string) =>
      /^turns?:/i.test(url),
    ),
  );
}

function serviceUrl(value: string, base: string): URL {
  const url = new URL(value, base);
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw Error('The connection service must use HTTPS (HTTP is allowed only on localhost).');
  return url;
}

/** Operator-owned configuration, never read from an untrusted invitation URL. */
export async function peerNetworkOptions(
  env: PeerNetworkEnvironment = import.meta.env ?? {},
  fetcher: typeof fetch = fetch,
  base = globalThis.location?.href ?? 'http://localhost/',
): Promise<PeerOptions> {
  let iceServers = structuredClone(DIRECT_ICE);
  if (env.VITE_PEER_ICE_SERVERS) {
    try {
      iceServers = validateIceServers(JSON.parse(env.VITE_PEER_ICE_SERVERS));
    } catch {
      throw Error('The deployed relay configuration is invalid. Contact the world operator.');
    }
  }
  if (env.VITE_PEER_ICE_ENDPOINT) {
    const url = serviceUrl(env.VITE_PEER_ICE_ENDPOINT, base);
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(6000),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    }).catch(() => {
      throw Error('The relay credential service did not answer. Try connecting again.');
    });
    if (!response.ok) throw Error('The relay credential service refused this connection.');
    const body = await response.text();
    if (body.length > 32768) throw Error('The relay credential response was too large.');
    try {
      const data = JSON.parse(body);
      iceServers = validateIceServers(Array.isArray(data) ? data : data.iceServers);
    } catch {
      throw Error('The relay credential service returned invalid ICE servers.');
    }
  }
  const options: PeerOptions = {
    config: {
      iceServers,
      iceTransportPolicy: env.VITE_PEER_RELAY_ONLY === 'true' ? 'relay' : 'all',
    },
  };
  if (options.config?.iceTransportPolicy === 'relay' && !hasTurnServer(options))
    throw Error('Relay-only mode needs a configured TURN server.');
  if (env.VITE_PEER_SIGNAL_URL) {
    const url = serviceUrl(env.VITE_PEER_SIGNAL_URL, base);
    if (url.search) throw Error('The signalling server URL cannot contain a query.');
    options.host = url.hostname;
    options.port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    options.path = url.pathname;
    options.secure = url.protocol === 'https:';
  }
  return options;
}

export function peerFailure(
  code: string,
  diagnostic: Pick<PeerNetworkDiagnostic, 'hosting' | 'signalling' | 'relayConfigured'>,
): { code: string; reason: string } {
  let reason: string;
  if (code === 'peer-unavailable')
    reason =
      'The room host is not online under that code. Keep the host’s game open and share its current link.';
  else if (code === 'unavailable-id')
    reason =
      'That room already has an online host. Join its room instead, or close the other host before resuming it.';
  else if (['browser-incompatible', 'invalid-id', 'invalid-key', 'ssl-unavailable'].includes(code))
    reason =
      'This browser or connection configuration cannot open the room. Use a current browser and the HTTPS game link.';
  else if (
    ['network', 'socket-error', 'socket-closed', 'server-error'].includes(code) ||
    !diagnostic.signalling
  )
    reason =
      'Room discovery could not reach the signalling service. Check the internet connection, VPN or network filter, then retry.';
  else if (diagnostic.relayConfigured)
    reason =
      'Room discovery is online, but the browsers could not establish a connection. The configured TURN relay may be unreachable or blocked; try another network or the dedicated world node.';
  else
    reason =
      'Room discovery is online, but this network did not allow a direct browser connection. This edition has no TURN relay configured; it needs a relay or a dedicated world node to connect these networks.';
  return { code, reason };
}

/** Only coarse transport facts are retained; no IP addresses, SDP or credentials. */
export function selectedPeerRoute(report: RTCStatsReport): {
  route: 'unknown' | 'direct' | 'relay';
  roundTripMs?: number;
} {
  let selected: RTCStats | undefined;
  report.forEach((entry) => {
    if (entry.type === 'transport' && entry.selectedCandidatePairId)
      selected = report.get(entry.selectedCandidatePairId);
  });
  if (!selected)
    report.forEach((entry) => {
      if (entry.type === 'candidate-pair' && entry.state === 'succeeded' && entry.nominated)
        selected = entry;
    });
  const pair = selected as RTCIceCandidatePairStats | undefined;
  if (!pair) return { route: 'unknown' };
  const local = report.get(pair.localCandidateId),
    remote = report.get(pair.remoteCandidateId);
  const rtt = pair.currentRoundTripTime;
  return {
    route:
      local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relay' : 'direct',
    ...(typeof rtt === 'number' && Number.isFinite(rtt)
      ? { roundTripMs: Math.round(rtt * 1000) }
      : {}),
  };
}
