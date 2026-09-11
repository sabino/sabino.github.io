export interface AICompanionStatus {
  paired: boolean;
  installed: boolean;
  version: string | null;
  auth: 'chatgpt' | 'apiKey' | 'none' | 'unknown';
  browserWasm: false;
  transport: 'native-app-server-stdio';
  chatAvailable: false;
  toolsIsolated: false;
  reason: string;
  setup: string[];
}
export interface NPCQuestion {
  npc: { id: string; name: string; role: string; clan: string };
  message: string;
  context: { place: string; bodyName: string; year: 3886; facts: string[] };
}
export class AICompanionError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'AICompanionError';
    this.code = code;
  }
}

/** Pairing capabilities remain only in this instance, never in storage or URLs. */
export class AICompanion {
  private token = '';
  private readonly endpoint: string;
  private readonly transport: typeof fetch;
  constructor({
    endpoint = 'http://127.0.0.1:4176',
    transport = fetch,
  }: { endpoint?: string; transport?: typeof fetch } = {}) {
    const url = new URL(endpoint);
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new AICompanionError(
        'Use an HTTP localhost companion address without a path or credentials.',
        'invalid_endpoint',
      );
    this.endpoint = url.origin;
    this.transport = transport;
  }
  get paired() {
    return !!this.token;
  }
  private async request(path: string, body?: unknown) {
    let response: Response;
    try {
      response = await this.transport(this.endpoint + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new AICompanionError(
        'The local companion could not be reached. Start it on this computer and allow the browser’s local-network request if asked.',
        'unreachable',
      );
    }
    let value;
    try {
      value = await response.json();
    } catch {
      throw new AICompanionError('The companion returned an invalid response.', 'invalid_response');
    }
    if (!response.ok) {
      if (response.status === 401) this.token = '';
      throw new AICompanionError(
        typeof value.message === 'string' ? value.message : 'The companion rejected that request.',
        typeof value.code === 'string' ? value.code : 'request_failed',
      );
    }
    return value;
  }
  async pair(code: string): Promise<AICompanionStatus> {
    if (typeof code !== 'string' || code.trim().length < 24 || code.trim().length > 128)
      throw new AICompanionError(
        'Paste the pairing code printed by your companion.',
        'invalid_code',
      );
    const value = await this.request('/api/ai/pair', { code: code.trim() });
    if (typeof value.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.token))
      throw new AICompanionError(
        'The companion returned an invalid pairing capability.',
        'invalid_response',
      );
    this.token = value.token;
    return this.status();
  }
  async status(): Promise<AICompanionStatus> {
    const value = await this.request('/api/ai/status');
    if (
      !value ||
      value.paired !== true ||
      typeof value.installed !== 'boolean' ||
      !['chatgpt', 'apiKey', 'none', 'unknown'].includes(value.auth) ||
      value.chatAvailable !== false ||
      value.browserWasm !== false ||
      value.toolsIsolated !== false ||
      value.transport !== 'native-app-server-stdio' ||
      typeof value.reason !== 'string' ||
      !Array.isArray(value.setup) ||
      !value.setup.every((line: unknown) => typeof line === 'string')
    )
      throw new AICompanionError(
        'The companion capability contract is not recognized.',
        'invalid_response',
      );
    return value as AICompanionStatus;
  }
  async ask(question: NPCQuestion): Promise<{ text: string }> {
    // Deliberately receives an explicit unavailable response in this release.
    return this.request('/api/ai/chat', question);
  }
  async disconnect(): Promise<void> {
    if (!this.token) return;
    try {
      await this.request('/api/ai/disconnect', {});
    } finally {
      this.token = '';
    }
  }
}
