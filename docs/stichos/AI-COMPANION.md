# Optional local Codex companion

This release detects a locally installed Codex and its authentication mode. **It does not generate NPC dialogue.** The ordinary authored and procedural conversations remain the playable dialogue system.

## Verified support and the boundary

OpenAI documents a native Codex App Server for client integrations, using stdio, Unix sockets or WebSockets. The current documentation calls App Server experimental and says its command and WebSocket transport are not supported for production workloads. We did not find a documented Codex WebAssembly distribution that runs inside a game browser. [Official App Server documentation](https://learn.chatgpt.com/docs/app-server).

Codex supports managed ChatGPT authentication for subscription access, separately from API-key authentication. This does not turn an arbitrary game website into a ChatGPT OAuth client or grant it a browser API for the subscription. The companion lets the installed Codex manage authentication; it never reads an authentication file or exports the account's credentials. [Official authentication documentation](https://learn.chatgpt.com/docs/auth).

The reviewed CLI was `codex-cli 0.154.0`. Its generated App Server schema exposes thread configuration, sandbox policies and dynamic tools, but the reviewed contract did not establish a complete denial of every model tool. A read-only sandbox can still permit filesystem reads. Disabling a shell feature alone does not establish the absence of other tools or connectors. The companion therefore has **no inference adapter, thread-start method or turn-start method**. Future CLI versions do not automatically unlock it. [Official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

This is a deliberate capability check, not a working AI character advertised behind a setup requirement. Enabling NPC inference would require a separately reviewed, enforceable conversation-only interface. Player text must never be relayed to an unrestricted local coding agent. No subscription use, model output, latency or generation cost was tested here.

## Local setup

1. Install Codex CLI through the official instructions and sign in with `codex login`. The subscription and workspace must allow Codex access. Do not copy ChatGPT cookies or OAuth tokens into the game.
2. From the game's source directory, run:

   ```sh
   node server/ai-companion.mjs
   ```

3. The terminal prints a local address and a random pairing code. Paste the code into the game's optional companion panel. Keep it out of URLs, screenshots and shared messages.
4. The browser may ask permission to reach a service on the same computer. Allow it only for the game you opened. The default service listens on `127.0.0.1:4176`; it is not a LAN or public server.
5. Pairing displays installed/version/authentication status and the explicit unavailable reason. **Even a successful ChatGPT sign-in does not enable NPC inference in this release.** Stop the companion with Ctrl+C when finished.

The hosted game cannot start a native process on the player's computer. A phone cannot use another computer's localhost endpoint. The companion has to run on the same computer as the browser; the rest of the game does not require it.

## Integration contract

`src/stichos/ai-companion.ts` exports `AICompanion`, `AICompanionStatus`, `AICompanionError` and `NPCQuestion`.

```ts
const companion = new AICompanion(); // No request or background inference.
const status = await companion.pair(codeFromTerminal);
// status.chatAvailable === false; display status.reason and setup instructions.
await companion.disconnect();
```

`status()` reads capability metadata. `ask(question)` accepts a bounded named-resident question and small game-context record, then receives the explicit `tool_isolation_unverified` error. It cannot relay JSON-RPC methods, tool names, commands, file paths or model configuration. Display returned strings as text, never as executable HTML. There are no gameplay mutation instructions in the response contract.

Pairing uses `POST /api/ai/pair` with a JSON body. Subsequent requests use an independently generated bearer capability in the `Authorization` header. The browser keeps that capability only in the client instance; there is no local-storage, cookie or URL credential. The companion keeps hashed capabilities, binds them to the exact requesting origin, expires them after thirty minutes, and bounds the session count and request rates. It accepts only loopback connections and exact local Host headers. Default allowed origins are `https://sabino.pro` and localhost development/preview origins on ports 4173 and 4174.

The local account probe starts its own stdio App Server in an empty temporary directory, sends only `initialize`, `initialized` and `account/read` with `refreshToken:false`, then terminates that process. It suppresses stderr, strips account email and all credential fields, and terminates on any unexpected server request. It does not connect to the user's existing daemon, list threads or read conversation history. Probe results are cached briefly; messages submitted to the disabled chat endpoint never reach Codex.

## Validation

Four focused tests pass with a real ephemeral loopback server and a mocked App Server:

- Pairing, memory-only header capabilities, redacted account status, and hostile NPC messages that still cannot invoke inference.
- Exact Host/origin enforcement, origin-bound capabilities, forbidden query credentials, request size bounds, expiration and an eight-session limit.
- The exact read-only RPC sequence, immediate termination on a simulated command-approval request, and missing-CLI behavior.
- Browser endpoint restrictions and rejection of arbitrary context, method, path and command fields.

A separate read-only probe of the installed CLI returned `{installed:true, version:"0.154.0", auth:"chatgpt"}`. No actual model turn or billable generation was performed. Run the mock suite with:

```sh
node --experimental-strip-types --test tests/stichos-ai-companion.test.ts
```
