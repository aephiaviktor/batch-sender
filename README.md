# Batch Sender

Standalone Electron app for sending batches of Star Atlas raw materials and components from one selected sender wallet to one recipient.

Sender profiles:

- MUD Ledger
- ONI Ledger
- USTUR Ledger
- GM Market Bot hot wallet

Transactions are built, reviewed, signed, broadcast, and confirmed locally on the main Windows PC.

## Current foundation

- Sandboxed Electron renderer with context isolation and a narrow preload API
- Four-profile sender selector and local recipient address book
- Canonical raw-material/component allowlist
- SPL Token and Token-2022 balance discovery
- Exact `BigInt` amount parsing and fresh-balance preview validation
- Recipient ATA inspection with idempotent creation planning
- Deterministic serialized-size transaction splitting and fee/rent estimates
- Multi-Ledger address/path matching with common-path fallback scanning
- Windows `safeStorage`/DPAPI-protected GM hot-wallet import and signing
- Fresh blockhash per transaction, sequential broadcast/confirmation, and partial-result reporting
- Comma-formatted token table with search, `MAX`, and `Clear all`

The selected sender currently pays transaction fees and recipient ATA rent. Native Windows hardware and real-transfer verification are still required before release.

## Wallet setup

Open **Wallet settings** inside the app to configure the Solana RPC URL, optionally use the shared RPC Limiter, add the three Ledger public addresses, and add the GM Market Bot public address. Ledger derivation paths are detected automatically when signing. These public settings are stored locally in Electron's per-user data folder.

The settings dialog hides the Aephia API key and RPC URL by default; use **Show sensitive** to reveal them temporarily. Aephia keys copied as a bare token, `Bearer …`, or `AEPHIA_API_KEY=…` are normalized before validation. The app accepts the API's successful HTTP 200 and 204 validation responses.

Do not enter a wallet secret in Wallet settings. The GM hot-wallet signing key has a separate native file-import flow, is protected by Windows DPAPI, and remains in the Electron main process.

## Development

```bash
npm install
npm run check
npm start
```

On Windows, after `npm ci` has been run once, double-click `launch-batch-sender.vbs` to start Batch Sender without keeping a terminal window open. A shortcut to this file can be placed on the desktop.

Double-click `create-desktop-shortcut.vbs` once to create a **Batch Sender** desktop shortcut with the Aephia app icon. The shortcut targets the terminal-free launcher and automatically uses the current checkout location.

The in-app updater checks the public `aephiaviktor/batch-sender` GitHub repository anonymously. Installing an update fast-forwards the local Git checkout, refreshes dependencies, and relaunches the app; no GitHub account or token is required.
