# ADR 0006 — Frontend publish target: IPFS vs. static host

## Status

Accepted. IPFS via web3.storage by default; Vercel CLI as an opt-in if present.

## Context

After deploying contracts, users want to share a working dApp URL. Options:

1. **IPFS via web3.storage** — content-addressed, censorship-resistant, "feels web3."
2. **Vercel / Netlify / Cloudflare Pages** — fast CDN, custom domains, but Web2.
3. **Self-hosted static** — out of scope; not a user-friendly default.
4. **GitHub Pages** — requires a repo + push; assumes git setup.

## Decision

Default to IPFS via web3.storage. Detect `vercel` on PATH; offer it as an additional one-click option. No other targets in 0.05.

## Why

- **IPFS matches the vibe.** Users building dApps expect an IPFS URL.
- **Free + immediate.** Users with a web3.storage token get instant shareable URLs.
- **Content addressing.** CIDs can be pinned to ENS contenthash later (Phase 7).
- **Vercel covers the "I want a fast CDN URL" case** without us building hosting.
- **GitHub Pages requires git assumptions** the rest of the app doesn't make.

## Trade-offs accepted

- web3.storage requires a token (one-time setup in Settings).
- IPFS gateway latencies are higher than CDN.
- Cold CIDs may take 10-30s to resolve on first visit.

## UX details

- First publish in a project prompts for web3.storage token if not configured.
- Token lives in keychain.
- Vercel option only appears if `vercel --version` succeeds (we don't bundle the CLI).
- Failure handling: if upload fails, build artifacts are kept in `dist/` and the user can retry.

## Future

- ENS contenthash one-click set after publish (Phase 7).
- Custom IPNS publish for stable URLs (Phase 7).
- Cloudflare Pages / Netlify if there's a clean CLI story.
