import type { Stichos } from './session.ts';
import { drawHumanoid } from './art.ts';
import { COSMETICS, previewCosmetic } from './progression.ts';
import { formatStorePrice, hostedCheckoutUrl } from './store-protocol.ts';
import './store.css';

interface CatalogSkin {
  id: string;
  amount: number | null;
  currency: string | null;
  available: boolean;
}
interface Catalog {
  enabled: boolean;
  testMode: boolean;
  skins: CatalogSkin[];
}
const premium = COSMETICS.filter((style) => style.currency === 'premium');
const mounted = new WeakMap<HTMLElement, symbol>();
const verifiedWallets = new WeakMap<Stichos, string[]>();
const walletRequests = new WeakMap<Stichos, number>();

const storeOrigin = () => `${location.protocol}//${location.hostname}:4175`;
const nextWalletRequest = (game: Stichos) => {
  const value = (walletRequests.get(game) ?? 0) + 1;
  walletRequests.set(game, value);
  return value;
};
function applyWallet(game: Stichos, ids: string[]) {
  const previous = verifiedWallets.get(game) ?? [];
  const next = [...new Set(ids.filter((id) => premium.some((style) => style.id === id)))].sort();
  verifiedWallets.set(game, next);
  game.setCosmeticEntitlements(next);
  return previous.join('|') !== next.join('|');
}

/** Silent startup verification. An unavailable wallet leaves premium styles unequipped;
 * saved style IDs and redirect query strings never confer ownership. */
export async function restoreStoreEntitlements(game: Stichos, onChange: () => void): Promise<void> {
  const request = nextWalletRequest(game);
  let ids: string[] = [];
  try {
    const response = await fetch(`${storeOrigin()}/api/store/wallet`, {
      credentials: 'include',
      signal: AbortSignal.timeout(8000),
    });
    const wallet = response.ok ? await response.json() : null;
    if (
      Array.isArray(wallet?.entitlements) &&
      wallet.entitlements.every((id: unknown) => typeof id === 'string')
    )
      ids = wallet.entitlements;
  } catch {
    /* Startup remains quiet and the unverified base outfit remains playable. */
  }
  if (walletRequests.get(game) === request && applyWallet(game, ids)) onChange();
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function parseCatalog(raw: unknown): Catalog {
  if (!raw || typeof raw !== 'object') throw Error('The outfit catalog is unavailable.');
  const data = raw as Record<string, unknown>;
  if (
    typeof data.enabled !== 'boolean' ||
    typeof data.testMode !== 'boolean' ||
    !Array.isArray(data.skins)
  )
    throw Error('The outfit catalog is unavailable.');
  const skins: unknown[] = data.skins;
  return {
    enabled: data.enabled,
    testMode: data.testMode,
    skins: premium.map((style) => {
      const row = skins.find(
        (skin: unknown) =>
          skin && typeof skin === 'object' && (skin as CatalogSkin).id === style.id,
      ) as CatalogSkin | undefined;
      const valid = row && formatStorePrice(row.amount, row.currency) !== null;
      return {
        id: style.id,
        amount: valid ? row!.amount : null,
        currency: valid ? row!.currency : null,
        available: !!valid && row!.available === true,
      };
    }),
  };
}

/** The mount owns its contents. Entitlements are received only from the credentialed server wallet.
 * onChange saves/refreshes after an equip action or entitlement change. No return query grants items. */
export async function mountStore(
  container: HTMLElement,
  game: Stichos,
  onChange: () => void,
): Promise<void> {
  const token = Symbol('store');
  mounted.set(container, token);
  const current = () => mounted.get(container) === token && container.isConnected;
  const origin = storeOrigin();
  let catalog: Catalog | null = null;
  let entitlements = verifiedWallets.get(game) ?? [];
  let csrf = '',
    busy = false,
    loaded = false,
    notice = 'Checking the outfit catalog and your browser wallet…';
  let problem = false;

  const request = async (path: string, init: RequestInit = {}) => {
    let response: Response;
    try {
      response = await fetch(`${origin}/api/store/${path}`, {
        ...init,
        credentials: 'include',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw Error('The outfit service could not be reached. Refresh when it is available.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw Error(
        typeof data?.error === 'string'
          ? data.error.slice(0, 240)
          : 'The outfit service is temporarily unavailable.',
      );
    return data;
  };
  const setWallet = (ids: string[]) => {
    const changed = applyWallet(game, ids);
    entitlements = verifiedWallets.get(game)!;
    return changed;
  };
  const button = (label: string, key: string, action: () => void, disabled = false) => {
    const node = element('button', 's-store-button', label);
    node.type = 'button';
    node.dataset.storeAction = key;
    node.disabled = disabled;
    node.addEventListener('click', action);
    return node;
  };
  const render = () => {
    if (!current()) return;
    const focused = container.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.storeAction
      : undefined;
    const root = element('section', 's-store');
    root.setAttribute('aria-label', 'Premium outfits');
    const head = element('div', 's-store-heading');
    const titles = element('div', '');
    titles.append(
      element('p', 's-store-eyebrow', 'THE CLOTHIER'),
      element('h3', '', 'Cloth for another life'),
    );
    head.append(titles);
    if (catalog?.testMode) head.append(element('span', 's-store-mode', 'Test mode'));
    root.append(
      head,
      element(
        'p',
        's-store-intro',
        'Outfits change colors, hats and cloaks. Every body keeps its own strength and skills.',
      ),
    );
    const status = element('p', `s-store-status${problem ? ' is-error' : ''}`, notice);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.append(status);
    const grid = element('div', 's-store-grid');
    for (const style of premium) {
      const row = catalog?.skins.find((skin) => skin.id === style.id);
      const owned = entitlements.includes(style.id);
      const equipped = game.progression.equippedStyles[game.bodyId] === style.id && owned;
      const card = element('article', `s-store-card${equipped ? ' is-equipped' : ''}`);
      const canvas = element('canvas', 's-store-preview');
      canvas.width = 252;
      canvas.height = 160;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${style.name}, front and back outfit preview`);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const look = previewCosmetic(game.player.appearance, style.id);
      drawHumanoid(ctx, { ...look, weapon: 'none' }, 84, 142, 2.6, 2, 0, false);
      ctx.globalAlpha = 0.78;
      drawHumanoid(ctx, { ...look, weapon: 'none' }, 178, 142, 2.3, 0, 0, false);
      ctx.globalAlpha = 1;
      card.append(
        canvas,
        element('h4', '', style.name),
        element('p', 's-store-description', style.description),
      );
      const cost = row ? formatStorePrice(row.amount, row.currency) : null;
      card.append(
        element(
          'p',
          's-store-price',
          owned ? 'Owned by this browser wallet' : (cost ?? 'Purchases are not configured'),
        ),
      );
      if (owned)
        card.append(
          button(
            equipped ? 'Worn by this body' : 'Wear this outfit',
            `equip:${style.id}`,
            () => {
              const result = game.progress({ kind: 'equip-style', styleId: style.id });
              notice = result.message;
              problem = !result.ok;
              render();
              if (result.ok) onChange();
            },
            busy || equipped,
          ),
        );
      else
        card.append(
          button(
            busy
              ? 'Please wait…'
              : catalog?.enabled && row?.available && csrf
                ? `Buy${catalog.testMode ? ' · test checkout' : ''}`
                : 'Unavailable',
            `buy:${style.id}`,
            () => {
              void checkout(style.id);
            },
            busy || !catalog?.enabled || !row?.available || !csrf,
          ),
        );
      grid.append(card);
    }
    root.append(grid);
    const footer = element('div', 's-store-footer');
    footer.append(
      button(
        busy ? 'Checking…' : 'Refresh owned outfits',
        'refresh',
        () => {
          void refresh();
        },
        busy,
      ),
    );
    footer.append(
      element(
        'p',
        '',
        'A purchase opens Stripe Checkout. Outfits appear here after payment is verified. This browser wallet is separate from your game save; keep its cookies to retain access.',
      ),
    );
    root.append(footer);
    container.replaceChildren(root);
    if (focused)
      [...container.querySelectorAll<HTMLButtonElement>('[data-store-action]')]
        .find((node) => node.dataset.storeAction === focused && !node.disabled)
        ?.focus({ preventScroll: true });
  };
  const refresh = async () => {
    if (busy || !current()) return;
    busy = true;
    notice = 'Checking the outfit catalog and your browser wallet…';
    problem = false;
    render();
    const walletRequest = nextWalletRequest(game);
    const [prices, wallet] = await Promise.allSettled([
      request('catalog').then(parseCatalog),
      request('wallet'),
    ]);
    if (!current()) return;
    busy = false;
    loaded = true;
    catalog = prices.status === 'fulfilled' ? prices.value : null;
    let changed = false;
    if (
      wallet.status === 'fulfilled' &&
      typeof wallet.value?.csrf === 'string' &&
      wallet.value.csrf.length >= 16 &&
      Array.isArray(wallet.value.entitlements) &&
      wallet.value.entitlements.every((id: unknown) => typeof id === 'string')
    ) {
      csrf = wallet.value.csrf;
      if (walletRequests.get(game) === walletRequest)
        changed = setWallet(wallet.value.entitlements);
    } else {
      csrf = '';
      if (walletRequests.get(game) === walletRequest) changed = setWallet([]);
    }
    problem = prices.status === 'rejected' || !csrf;
    notice = problem
      ? 'The store is unavailable. Your save and earned outfits are unaffected; refresh to retry.'
      : !catalog!.enabled
        ? 'Purchases are disabled in this build. You can preview the outfits and refresh any already-owned styles.'
        : catalog!.testMode
          ? 'Test checkout is enabled. These are server-configured test prices; no live payment is being offered.'
          : 'Choose an outfit to continue to secure payment. The final total is shown at checkout.';
    render();
    if (changed) onChange();
  };
  const checkout = async (skinId: string) => {
    if (busy || !loaded || !csrf || !catalog?.enabled || !current()) return;
    const row = catalog.skins.find((skin) => skin.id === skinId);
    if (!row?.available) return;
    busy = true;
    notice = 'Preparing secure checkout…';
    problem = false;
    render();
    try {
      const result = await request('checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Verso-CSRF': csrf },
        body: JSON.stringify({ skinId }),
      });
      if (!current()) return;
      if (result?.owned === true) {
        busy = false;
        await refresh();
        return;
      }
      const url = hostedCheckoutUrl(result?.url);
      if (!url)
        throw Error(
          'The payment service returned an invalid checkout link. No payment was opened.',
        );
      location.assign(url);
    } catch (error) {
      if (!current()) return;
      busy = false;
      problem = true;
      notice = error instanceof Error ? error.message : 'Checkout could not be opened.';
      render();
    }
  };
  render();
  await refresh();
}
