import type { Stichos } from './session.ts';
import { drawHumanoid } from './art.ts';
import { COSMETICS, previewCosmetic } from './progression.ts';
import { formatStorePrice, hostedCheckoutUrl } from './store-protocol.ts';
import { configuredStoreOrigin } from './hosting.ts';
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

const storeOrigin = configuredStoreOrigin;
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
  const origin = storeOrigin();
  if (!origin) {
    if (applyWallet(game, [])) onChange();
    return;
  }
  let ids: string[] = [];
  try {
    const response = await fetch(`${origin}/api/store/wallet`, {
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
  let recoveryConfigured = false,
    generatedCode = '',
    restoreDraft = '',
    revealCode = false;

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
          owned ? 'Owned by this browser wallet' : (cost ?? 'Currently unavailable'),
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
    if (!origin) {
      container.replaceChildren(root);
      return;
    }
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
        'A purchase opens Stripe Checkout. Outfits appear here after payment is verified. Paid ownership belongs to your browser wallet, separately from your game save.',
      ),
    );
    root.append(footer);
    const wallet = element('section', 's-store-wallet');
    wallet.setAttribute('aria-label', 'Wallet recovery');
    wallet.append(element('h4', '', 'Keep your wardrobe safe'));
    wallet.append(
      element(
        'p',
        '',
        recoveryConfigured
          ? 'This wallet has a recovery code. Keep it privately; anyone with the code can restore this wardrobe. Generating a new code replaces the previous one.'
          : 'Save a private recovery code before clearing browser cookies or changing devices. It restores paid outfits; your game save remains separate.',
      ),
    );
    wallet.append(
      button(
        recoveryConfigured ? 'Replace recovery code' : 'Generate recovery code',
        'recovery',
        () => {
          void recoverWallet('recovery');
        },
        busy || !csrf,
      ),
    );
    if (generatedCode) {
      const generated = element('div', 's-store-recovery-code');
      const codeLabel = element('label', '', 'Your private recovery code');
      const code = element('input', '');
      code.type = revealCode ? 'text' : 'password';
      code.readOnly = true;
      code.value = generatedCode;
      code.autocomplete = 'off';
      code.spellcheck = false;
      code.dataset.storeAction = 'recovery-code';
      codeLabel.append(code);
      generated.append(codeLabel);
      generated.append(
        button(revealCode ? 'Hide code' : 'Show code', 'reveal-code', () => {
          revealCode = !revealCode;
          render();
        }),
      );
      generated.append(
        button('Download private code', 'download-code', () => {
          const blob = new Blob(
            [
              `Stichos wallet recovery\n\n${generatedCode}\n\nKeep this code private. Anyone with it can restore your wardrobe. Restoring signs out the previous wallet session. This is not your game save.\n`,
            ],
            { type: 'text/plain;charset=utf-8' },
          );
          const url = URL.createObjectURL(blob),
            link = document.createElement('a');
          link.href = url;
          link.download = 'stichos-wallet-recovery.txt';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }),
      );
      generated.append(
        element(
          'p',
          '',
          'Save this code now. It disappears when this shop closes and cannot be shown again.',
        ),
      );
      wallet.append(generated);
    }
    const restore = element('form', 's-store-restore');
    const label = element('label', '', 'Restore another wallet');
    const input = element('input', '');
    input.type = 'password';
    input.value = restoreDraft;
    input.placeholder = 'VR1-…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 80;
    input.dataset.storeAction = 'restore-code';
    input.disabled = busy || !csrf;
    input.addEventListener('input', () => {
      restoreDraft = input.value;
    });
    label.append(input);
    restore.append(label);
    const submit = button(
      'Restore wallet',
      'restore-wallet',
      () => {
        void recoverWallet('recover');
      },
      busy || !csrf,
    );
    restore.append(submit);
    restore.addEventListener('submit', (event) => {
      event.preventDefault();
      void recoverWallet('recover');
    });
    restore.append(
      element(
        'p',
        '',
        'Restoring signs out the previous wallet session. Your current wardrobe is replaced here; save its recovery code first if you want to return to it.',
      ),
    );
    wallet.append(restore);
    root.append(wallet);
    container.replaceChildren(root);
    if (focused)
      [...container.querySelectorAll<HTMLButtonElement>('[data-store-action]')]
        .find((node) => node.dataset.storeAction === focused && !node.disabled)
        ?.focus({ preventScroll: true });
  };
  const refresh = async () => {
    if (busy || !current()) return;
    if (!origin) {
      catalog = {
        enabled: false,
        testMode: false,
        skins: premium.map((style) => ({
          id: style.id,
          amount: null,
          currency: null,
          available: false,
        })),
      };
      loaded = true;
      problem = false;
      notice =
        'Cosmetic purchases are not active on this edition. Preview the outfits here; earned clothing is available in Life → Clothing.';
      render();
      return;
    }
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
      recoveryConfigured = wallet.value.recoveryConfigured === true;
      if (walletRequests.get(game) === walletRequest)
        changed = setWallet(wallet.value.entitlements);
    } else {
      csrf = '';
      if (walletRequests.get(game) === walletRequest) changed = setWallet([]);
    }
    entitlements = verifiedWallets.get(game) ?? [];
    problem = prices.status === 'rejected' || !csrf;
    notice = problem
      ? 'The store is unavailable. Your save and earned outfits are unaffected; refresh to retry.'
      : !catalog!.enabled
        ? 'Purchases are disabled for now. Preview the outfits or restore any styles you already own.'
        : catalog!.testMode
          ? 'Test checkout is enabled. These are test prices; no live payment is being offered.'
          : 'Choose an outfit to continue to secure payment. The final total is shown at checkout.';
    render();
    if (changed) onChange();
  };
  const recoverWallet = async (path: 'recovery' | 'recover') => {
    if (busy || !csrf || !current()) return;
    const code = restoreDraft.trim();
    if (path === 'recover' && !/^VR1-[a-f0-9]{64}$/.test(code)) {
      problem = true;
      notice = 'Enter the complete recovery code from your private backup.';
      render();
      return;
    }
    busy = true;
    problem = false;
    notice =
      path === 'recovery' ? 'Preparing a private recovery code…' : 'Verifying your recovery code…';
    render();
    const walletRequest = nextWalletRequest(game);
    try {
      const result = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Verso-CSRF': csrf },
        body: JSON.stringify(path === 'recover' ? { recoveryCode: code } : {}),
      });
      if (!current() || walletRequests.get(game) !== walletRequest) return;
      if (
        typeof result?.csrf !== 'string' ||
        result.csrf.length < 16 ||
        !Array.isArray(result.entitlements) ||
        !result.entitlements.every((id: unknown) => typeof id === 'string') ||
        (path === 'recovery' && !/^VR1-[a-f0-9]{64}$/.test(result.recoveryCode))
      )
        throw Error('The wallet response could not be verified. Refresh before trying again.');
      csrf = result.csrf;
      recoveryConfigured = result.recoveryConfigured === true;
      const changed = setWallet(result.entitlements);
      generatedCode = path === 'recovery' ? result.recoveryCode : '';
      revealCode = false;
      if (path === 'recover') restoreDraft = '';
      busy = false;
      notice =
        path === 'recovery'
          ? 'Save your private recovery code now. The previous recovery code no longer works.'
          : 'Your wardrobe was restored. The previous wallet session is signed out.';
      render();
      if (changed) onChange();
    } catch (error) {
      if (!current()) return;
      busy = false;
      problem = true;
      notice = error instanceof Error ? error.message : 'The wallet could not be restored.';
      render();
    }
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
