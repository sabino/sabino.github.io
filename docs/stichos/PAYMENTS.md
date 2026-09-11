# Cosmetic checkout preparation

The requested real-money store is prepared with Stripe-hosted Checkout and a server-owned cosmetic catalog. **Payments are disabled in the supplied build. No real payment or Stripe account was used during development.** The three premium outfits change appearance only; strength, campaign progress, housing, and professions are not sold.

`server/payments.mjs` owns price lookup, checkout creation, browser wallets, signature verification, fulfillment and full-refund revocation. It is mounted beneath `/api/store/` by the local game server. Prices come from configured Stripe Price IDs, never from a submitted client amount. A success redirect does not grant an outfit. A signed, paid webhook must match a checkout created for the private wallet, its selected outfit, currency, and amount.

## Configuration

Copy [server/.env.example](../../server/.env.example) to a private `.env.local` and supply a Stripe account’s **test** key, webhook signing secret, and three active one-time Price IDs. Set `VERSO_PUBLIC_ORIGIN` to the game’s actual origin. The named prices are Aurora Mantle, Promethean Gold, and Sallas Silver; the amount and currency are read from Stripe. Secrets stay on the server.

To activate a configured test store, explicitly set `VERSO_PAYMENTS_ENABLED=true` and start the server with Node’s `--env-file=.env.local` option. Register or locally forward Stripe events to `/api/store/webhook`: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `charge.refunded`. Complete a test-mode Checkout and verify its webhook before considering live activation. A live key additionally requires an HTTPS public origin. This document does not claim that production billing has been activated or verified.

From the repository directory, the configured backend command is:

```sh
node --env-file=.env.local --experimental-strip-types server/index.mjs
```

Use the origin where the player actually opens the game. The example selects the production preview, `http://localhost:4174`; changing ports also changes the browser's game-save origin. Checkout return addresses are derived from this configured URL.

For public HTTPS hosting, [server/Caddyfile.example](../../server/Caddyfile.example) is a reviewable deployment template: static `dist/` files, `/api/store/*` HTTP requests and `/ws` WebSockets share one domain. Replace its domain and absolute file root, set `VERSO_PUBLIC_ORIGIN=https://YOUR-DOMAIN`, and bind the Node backend to loopback with `HOST=127.0.0.1` when it runs behind this proxy. The browser uses same-origin store requests and WSS on HTTPS. Caddy supports WebSocket upgrades through [reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy); mutually exclusive [handle routes](https://caddyserver.com/docs/caddyfile/directives/handle) keep API requests separate from static files. The template has not been deployed, and no public domain or certificate has been provisioned by this work.

## Ownership and persistence

An opaque, HttpOnly, SameSite wallet cookie identifies this browser; its credential is hashed in the server ledger. A separate CSRF token protects checkout and recovery requests. Purchased entitlements come from this wallet, not from game-save data. Repeated checkout clicks reuse a pending session, and repeated webhook events grant no additional outfit. Full refunds revoke the matching style, including refunds received before a delayed completion event.

A delayed confirmation can arrive while a replacement checkout is being created. The server rechecks committed ownership before returning the new payment link and attempts to expire other still-open sessions for that wallet and outfit. Expiration uses Stripe's [Checkout Session expiry endpoint](https://docs.stripe.com/api/checkout/sessions/expire). Cleanup failure preserves the paid entitlement and the pending order for retry, including after a server restart. This is best-effort prevention of redundant open checkouts; it cannot refund a charge from a session that has already completed.

The single-process ledger lives in `.verso-server/payments/wallets.json`, outside Git. Writes use a private temporary file and atomic rename. A storage write failure closes the store until the server is restarted after repair, preventing a nondurable unlock from being served. Keep this directory when updating the server and back it up before activating purchases.

The shop can issue a **private 256-bit recovery code**. Only its hash enters the ledger. Keep the downloaded code somewhere private: possession of it can restore the wallet in another browser. Generating a new code revokes the previous code. Restoring the wallet rotates its cookie and CSRF token, signing out the previous browser credential; it neither creates a purchase nor trusts a game save. Recovery is origin/CSRF protected and rate limited. There is no email, password, or support-based identity recovery in this build. Operating policies, backups and production deployment remain work for activation. The server is not designed for several processes writing the same JSON ledger.

## Verification and sources

Tests use a local mocked Stripe endpoint, actual HTTP requests, and real HMAC signatures. They cover the disabled store, CSRF/origin rejection, server-owned prices, concurrent retries, untrusted redirect data, mismatched or unsigned events, paid fulfillment, durable reload, and refunds arriving out of order. They make no external payment request.

The integration follows Stripe’s primary documentation for [hosted Checkout](https://docs.stripe.com/checkout/quickstart), [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create), and [raw-body webhook signatures](https://docs.stripe.com/webhooks/signature).

Recovery routes: `POST /api/store/recovery` with `{}` issues/rotates a code; `POST /api/store/recover` with `{ "recoveryCode": "…" }` restores the wallet. Both use the current browser wallet’s `X-Verso-CSRF` and return its new state. `GET /api/store/wallet` includes `recoveryConfigured`; plaintext recovery codes are never included in that GET response.
