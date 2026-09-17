# Daily Streak Lite (Base Mini App)

One simple loop:
1. Connect wallet
2. Run one `checkIn()` tx on Base Mainnet
3. Grow daily streak + total check-ins

## App Flow
- `POST /api/streak/prepare`: returns tx request for `checkIn()`
- Wallet submits tx to `DailyStreakLite` contract
- `POST /api/streak/onchain-execute`: verifies tx receipt + `CheckedIn` event
- `GET /api/streak/state`: returns wallet profile (with optional onchain sync)
- `GET /api/health`: returns app status + Redis connectivity status
- `POST /api/analytics/track`: receives offchain client analytics events
- `POST /api/webhook`: receives Base/Farcaster webhook events for analytics
- `GET /api/analytics/state`: returns aggregated analytics counters + recent events

## Contract
- Source: `contracts/DailyStreakLite.sol`
- Main function:
  - `checkIn()`
- View function:
  - `getStats(address)`
- Event:
  - `CheckedIn(address account, uint32 streak, uint64 totalCheckIns, uint64 day, uint64 nextCheckInAt)`

## Environment
- `APP_URL=https://daily-streak-lite.vercel.app`
- `ALLOWED_APP_HOSTS=daily-streak-lite.vercel.app` (optional allow-list for API host protection)
- `BASE_RPC_URL=https://mainnet.base.org`
- `CHECKIN_CONTRACT_ADDRESS=0x...` (deployed `DailyStreakLite` on Base Mainnet)
- `ANALYTICS_ADMIN_TOKEN=...` (optional; `GET /api/analytics/state` only returns
  wallet addresses, user agents and raw payloads when this token is sent as
  `x-admin-token` or `Authorization: Bearer ...`. Without it the response is aggregated + redacted.)
- `REDIS_URL=redis://...` or `REDIS_URL=rediss://...` (optional, for persistent storage)
  - Do not include extra quotes in Vercel value field.

## Commands
```bash
npm run build
npm run smoke
```
