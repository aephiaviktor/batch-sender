# Batch Sender

Standalone Electron app for sending batches of Star Atlas raw materials and components from one selected sender wallet to one recipient.

Users can add any number of Ledger hardware wallets and DPAPI-protected hot wallets.

Transactions are built, reviewed, signed, broadcast, and confirmed locally on the main Windows PC.

## Current foundation

- Sandboxed Electron renderer with context isolation and a narrow preload API
- Dynamic sender-wallet manager and local recipient address book
- Canonical raw-material/component allowlist
- SPL Token and Token-2022 balance discovery
- Exact `BigInt` amount parsing and fresh-balance preview validation
- Recipient ATA inspection with idempotent creation planning
- Deterministic serialized-size transaction splitting and fee/rent estimates
- Multi-Ledger address/path matching with common-path fallback scanning
- Multi-wallet Windows `safeStorage`/DPAPI-protected secret-key storage and signing
- Fresh blockhash per transaction, sequential broadcast/confirmation, and partial-result reporting
- Comma-formatted token table with search, `MAX`, and `Clear all`

The selected sender currently pays transaction fees and recipient ATA rent. Native Windows hardware and real-transfer verification are still required before release.

## Wallet setup

Open **Wallet settings** to configure the Solana RPC URL and Aephia API key. The dialog hides both values by default; use **Show sensitive** to reveal them temporarily. Aephia keys copied as a bare token, `Bearer …`, or `AEPHIA_API_KEY=…` are normalized before validation.

Use **Add wallet** in the sender selector for either wallet type. A connected Ledger supplies its public address and derivation path automatically. For a hot wallet, the app derives the public address from the entered secret key, sends the key once through the narrow preload API to the Electron main process, and stores only a Windows DPAPI-encrypted blob. Removing a hot wallet also removes its protected secret key after explicit confirmation.

## Development

```bash
npm install
npm run check
npm start
```

On Windows, after `npm ci` has been run once, double-click `launch-batch-sender.vbs` to start Batch Sender without keeping a terminal window open. A shortcut to this file can be placed on the desktop.

Double-click `create-desktop-shortcut.vbs` once to create a **Batch Sender** desktop shortcut with the Aephia app icon. The shortcut targets the terminal-free launcher and automatically uses the current checkout location.

The in-app updater checks the public `aephiaviktor/batch-sender` GitHub repository anonymously. Installing an update fast-forwards the local Git checkout, refreshes dependencies, and relaunches the app; no GitHub account or token is required.
