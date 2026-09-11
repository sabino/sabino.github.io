# Store and home-art verification

The storefront passed 16 checks in an isolated Chromium document using the current served development modules. The fixture replaces store HTTP responses locally; it makes no Stripe request and tests no real payment. The three outfit previews use the actual cached humanoid renderer.

Run `node scripts/browser-store-check.mjs <workspace-CDP-endpoint> http://127.0.0.1:4173` after opening the isolated Agent Workspace browser. The script creates and closes its own browser context. Evidence is saved under `.dream-loop/stichos-progression/`: `store-desktop.png`, `store-mobile.png`, `home-furniture.png`, and `store-results.json`.

Verified behavior:

- Disabled configuration shows previews with unavailable purchase controls and no invented prices. A success query alone grants nothing.
- Catalog and wallet requests include browser credentials. An actual Buy click submits only the product ID and CSRF token. A deceptive checkout hostname is refused; the pure protocol tests also cover credentials, insecure URLs, and nonstandard ports.
- An already-owned checkout response triggers a wallet refresh. Verified ownership equips the current body through the progression adapter. Startup wallet refresh restores or revokes ownership silently; offline verification leaves premium appearance unavailable.
- Recovery generation requires an explicit click and initially masks the returned code. Restore rejects malformed codes before HTTP, clears the input on success, applies only the returned wallet, and uses its rotated CSRF token afterward. No code enters the URL or local storage. The private download's text was inspected in memory; no real recovery credential or downloaded file was created by this fixture.
- The store has no horizontal overflow at 390 CSS pixels. Desktop and mobile screenshots were visually inspected.

The separate 15 focused unit checks cover profession effects, body-specific upgrades, housing costs and furniture effects, timed crops and finite inventory, cosmetic ownership, exact checkout-origin validation, and server minor-unit price display. Currency formatting follows [Stripe's currency rules](https://docs.stripe.com/currencies#special-cases), including JPY and the ISK/UGX/HUF/TWD exceptions.

The home-art placement tests inspect actual house footprints across generations 1–3 and several seeds. Furniture and crop anchors stay on interior floor tiles and leave the central north/south doorway aisle clear. Crop appearance follows saved simulation time. The contact sheet verifies generated Canvas2D furniture and growth-stage assets; it is not evidence of an end-to-end home-purchase gameplay route.

Actual HTTP billing, signature, durable fulfillment, refund, and recovery verification belongs to the server suite described in [PAYMENTS.md](PAYMENTS.md). Physical installation, production billing activation, and real-money transactions are not claimed by these frontend checks.
