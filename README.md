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

## Local configuration

Batch Sender reads public configuration from Electron's per-user `config.json`. The app displays the exact location when a profile is not configured. Start from `config.example.json`.

Do not put a wallet secret in this file. Hot-wallet secret storage will use a Windows-protected mechanism and remain in the Electron main process.

## Development

```bash
npm install
npm run check
npm start
```
