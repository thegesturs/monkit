# Feature: Frontend deploy (publish dApp)

## Why

A deployed contract that no one can interact with isn't a dApp. We close the loop with one-click publish of the frontend to a shareable URL.

## Targets

### IPFS via web3.storage (default)

- User adds a web3.storage token in Settings (one-time). Stored in keychain.
- `vite build` (or `next build && next export`) produces a static `dist/`.
- Tarball uploaded to web3.storage; CID returned.
- Gateway URL: `https://<cid>.ipfs.w3s.link/`.
- QR code rendered in-app.

### Vercel CLI (optional)

If `vercel` is on PATH, "Publish to Vercel" appears as an additional option. We shell out to `vercel deploy --prod` and surface the returned URL.

### Local preview

`vite preview` / `next start` runnable from the frontend panel — opens in the in-app browser tab. No publish, just smoke-test.

## Build detection

`monad.config.json.frontendDir` declares the dir. The app checks `package.json` scripts:

- `build` script present → run `<pkg-manager> run build`.
- Output dir auto-detected: `dist`, `build`, `out`, `.next` (export mode), `.next` (server mode — error: "Next.js server mode can't be published to IPFS; switch to `output: export`.").

## UX

- "Publish" button in Deploy panel.
- Pre-publish checklist modal:
  - Active network for `addresses.ts` (default: testnet, since publishing local-only addresses is pointless).
  - Target (IPFS / Vercel).
  - Estimated build time (last build's wall clock).
- On click: build runs in terminal pane (streaming), upload progress shown.
- Success: URL + QR + "Copy link" + "Open" buttons.

## MCP tool

`monad_publish(projectPath, network, target)` → returns URL. Permission card always required (writes to a public network).

## Out of scope

- Custom domains / DNS — defer.
- ENS contenthash publishing — Phase 7 follow-up.
- Multi-region static hosting — defer.
- SSR-only deploys (Next server) — explicit error, recommend export mode.

## Related decisions

- [0006-ipfs-vs-static-host.md](../decisions/0006-ipfs-vs-static-host.md)
