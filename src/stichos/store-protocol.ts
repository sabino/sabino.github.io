/** Stripe amounts are minor units. ISK/UGX retain two API decimals; HUF/TWD charges
 * also support two decimals. https://docs.stripe.com/currencies#special-cases */
export function formatStorePrice(
  amount: unknown,
  currency: unknown,
  locale?: string,
): string | null {
  if (
    !Number.isSafeInteger(amount) ||
    (amount as number) < 0 ||
    typeof currency !== 'string' ||
    !/^[a-z]{3}$/i.test(currency)
  )
    return null;
  try {
    const code = currency.toUpperCase();
    const base = new Intl.NumberFormat(locale, { style: 'currency', currency: code });
    const fraction = ['ISK', 'UGX', 'HUF', 'TWD'].includes(code)
      ? 2
      : (base.resolvedOptions().maximumFractionDigits ?? 2);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: fraction,
    }).format((amount as number) / 10 ** fraction);
  } catch {
    return null;
  }
}

/** Accept only the payment provider's exact hosted checkout origin, without credentials. */
export function hostedCheckoutUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'checkout.stripe.com' &&
      !url.port &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
