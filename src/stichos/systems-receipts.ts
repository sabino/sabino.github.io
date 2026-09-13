import type { SystemsResult } from './living-systems.ts';

/** A receipt is authored by the selected authority, never by a command payload. */
export interface SystemsEffectReceipt {
  scope: string;
  sequence: number;
  actorId: string;
  targetBodyId: string;
}

export interface SystemsReceiptSnapshot {
  version: 1;
  scopes: { scope: string; actorId: string; sequence: number }[];
}

export const SYSTEMS_RECEIPT_RULES = Object.freeze({
  maxScopes: 32,
  maxChangedObjects: 128,
  maxWardSeconds: 300,
});

type ValidatedResult = SystemsResult & {
  receipt?: SystemsEffectReceipt;
  recovery?: { coinLoss: number; cooldownUntil: number };
};

const plain = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  plain(value) && Object.keys(value).every((key) => keys.includes(key));
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
const scope = (value: unknown): value is string =>
  text(value, 256) && /^(?:solo|room):[a-zA-Z0-9_:.,-]+$/.test(value);
const sequence = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;
const bounded = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const address = (value: unknown): boolean =>
  exact(value, ['spaceId', 'x', 'y']) &&
  (value.spaceId === 'surface' ||
    (typeof value.spaceId === 'string' &&
      /^underground:[A-Za-z0-9_:.-]{1,128}:[0-2]$/.test(value.spaceId))) &&
  bounded(value.x, -1e7, 1e7) &&
  Math.abs(value.x) < 1e7 &&
  bounded(value.y, -1e7, 1e7) &&
  Math.abs(value.y) < 1e7;
const changedObjects = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length <= SYSTEMS_RECEIPT_RULES.maxChangedObjects &&
  value.every((id) => text(id, 200)) &&
  new Set(value).size === value.length;

export function validSystemsEffectReceipt(value: unknown): value is SystemsEffectReceipt {
  return (
    exact(value, ['scope', 'sequence', 'actorId', 'targetBodyId']) &&
    scope(value.scope) &&
    sequence(value.sequence) &&
    text(value.actorId, 200) &&
    text(value.targetBodyId, 160)
  );
}

/**
 * JSON-facing result validation is deliberately strict. Future additive effects need an
 * explicit validator update; an older build must not blindly execute a new effect.
 * Receipts are optional for legacy informational results, but accept() requires one.
 */
export function validateSystemResult(value: unknown): value is ValidatedResult {
  if (
    !exact(value, [
      'ok',
      'message',
      'removed',
      'opened',
      'health',
      'damage',
      'killed',
      'targetId',
      'transition',
      'wardSeconds',
      'rest',
      'receipt',
      'recovery',
    ]) ||
    typeof value.ok !== 'boolean' ||
    typeof value.message !== 'string' ||
    value.message.length > 2000 ||
    /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value.message)
  )
    return false;
  if (value.receipt !== undefined && !validSystemsEffectReceipt(value.receipt)) return false;
  if (value.removed !== undefined && !changedObjects(value.removed)) return false;
  if (value.opened !== undefined && !changedObjects(value.opened)) return false;
  if (value.health !== undefined && !bounded(value.health, 0, 1000000)) return false;
  if (value.damage !== undefined && !bounded(value.damage, 0, 1000000)) return false;
  if (value.killed !== undefined && typeof value.killed !== 'boolean') return false;
  if (value.targetId !== undefined && !text(value.targetId, 200)) return false;
  if (
    value.wardSeconds !== undefined &&
    !bounded(value.wardSeconds, 0, SYSTEMS_RECEIPT_RULES.maxWardSeconds)
  )
    return false;
  if (
    value.rest !== undefined &&
    (!exact(value.rest, ['hpFraction', 'staminaFraction']) ||
      !bounded(value.rest.hpFraction, 0, 1) ||
      !bounded(value.rest.staminaFraction, 0, 1))
  )
    return false;
  if (value.transition !== undefined) {
    const transition = value.transition;
    if (
      !exact(transition, ['actorId', 'from', 'to', 'reason']) ||
      !text(transition.actorId, 200) ||
      !address(transition.from) ||
      !address(transition.to) ||
      !['enter', 'stairs', 'return', 'recall', 'clinic'].includes(String(transition.reason)) ||
      (value.receipt !== undefined && transition.actorId !== value.receipt.actorId)
    )
      return false;
  }
  if (value.recovery !== undefined) {
    if (
      !exact(value.recovery, ['coinLoss', 'cooldownUntil']) ||
      !Number.isSafeInteger(value.recovery.coinLoss) ||
      !bounded(value.recovery.coinLoss, 0, 100000000) ||
      !bounded(value.recovery.cooldownUntil, 0, Number.MAX_SAFE_INTEGER) ||
      !plain(value.transition) ||
      !['recall', 'clinic'].includes(String(value.transition.reason))
    )
      return false;
  }
  // Failed commands are informational. They cannot smuggle a heal, move, or world edit.
  if (
    !value.ok &&
    ['removed', 'opened', 'transition', 'wardSeconds', 'rest', 'recovery'].some(
      (key) => value[key] !== undefined,
    )
  )
    return false;
  return true;
}

export function validSystemsReceiptSnapshot(value: unknown): value is SystemsReceiptSnapshot {
  if (
    !exact(value, ['version', 'scopes']) ||
    value.version !== 1 ||
    !Array.isArray(value.scopes) ||
    value.scopes.length > SYSTEMS_RECEIPT_RULES.maxScopes
  )
    return false;
  const seen = new Set<string>();
  for (const entry of value.scopes) {
    if (
      !exact(entry, ['scope', 'actorId', 'sequence']) ||
      !scope(entry.scope) ||
      !text(entry.actorId, 200) ||
      !sequence(entry.sequence) ||
      seen.has(entry.scope)
    )
      return false;
    seen.add(entry.scope);
  }
  return true;
}

/**
 * A bounded monotonic anti-replay ledger, not cryptographic authentication. The caller
 * supplies the already authenticated authority scope and actor, never receipt metadata.
 * No scope eviction: forgetting a high-water mark would enable replay after reconnect.
 */
export class SystemsReceiptLedger {
  private scopes = new Map<string, { actorId: string; sequence: number }>();

  constructor(saved?: SystemsReceiptSnapshot) {
    if (saved !== undefined && !this.restore(saved))
      throw new Error('Invalid systems receipt ledger.');
  }

  snapshot(): SystemsReceiptSnapshot {
    return {
      version: 1,
      scopes: [...this.scopes].map(([scope, entry]) => ({ scope, ...entry })),
    };
  }

  /** Atomic and monotonic, including when called again on an already active ledger. */
  restore(saved: unknown): boolean {
    if (!validSystemsReceiptSnapshot(saved)) return false;
    const merged = new Map(this.scopes);
    for (const { scope, actorId, sequence } of saved.scopes) {
      const prior = merged.get(scope);
      if (prior && prior.actorId !== actorId) return false;
      merged.set(scope, { actorId, sequence: Math.max(sequence, prior?.sequence ?? 0) });
    }
    if (merged.size > SYSTEMS_RECEIPT_RULES.maxScopes) return false;
    this.scopes = merged;
    return true;
  }

  accept(
    result: unknown,
    current: {
      scope: string;
      actorId: string;
      bodyId: string;
      /** Pass false for a dead/inactive body; the valid receipt is still consumed. */
      allowEffects?: boolean;
    },
  ): boolean {
    if (!validateSystemResult(result) || !result.ok || !result.receipt) return false;
    const receipt = result.receipt;
    if (
      !scope(current.scope) ||
      !text(current.actorId, 200) ||
      receipt.scope !== current.scope ||
      receipt.actorId !== current.actorId
    )
      return false;
    const prior = this.scopes.get(current.scope);
    if (prior && (prior.actorId !== current.actorId || receipt.sequence <= prior.sequence))
      return false;
    if (!prior && this.scopes.size >= SYSTEMS_RECEIPT_RULES.maxScopes) return false;
    this.scopes.set(current.scope, { actorId: current.actorId, sequence: receipt.sequence });
    return current.allowEffects !== false && receipt.targetBodyId === current.bodyId;
  }
}

export { address as validSystemAddress };
