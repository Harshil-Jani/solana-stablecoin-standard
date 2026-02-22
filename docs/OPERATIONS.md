# Operations Guide

## Local Development

### Prerequisites

- Rust 1.84+ (via rustup)
- Solana CLI 2.x
- Anchor CLI 0.31.x
- Node.js 20+
- Yarn 1.22+

### Build

```bash
# Build Solana programs
anchor build --no-idl

# Install TypeScript dependencies
yarn install

# Build SDK
cd sdk/core && yarn build

# Build CLI
cd sdk/cli && yarn build

# Build backend
cd backend && yarn build
```

### Test

```bash
# Start local validator
solana-test-validator --reset

# Run integration tests
anchor test --skip-build

# Or with ts-mocha directly
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.test.ts
```

### Run Backend

```bash
# With Docker (recommended)
docker compose up -d

# Or manually
cd backend && yarn dev
```

## Deployment

### Devnet

```bash
# Switch to devnet
solana config set --url devnet

# Build and deploy
anchor build --no-idl
anchor deploy --program-name sss_token --provider.cluster devnet
anchor deploy --program-name sss_transfer_hook --provider.cluster devnet
```

### Initialize a Stablecoin

```bash
# SSS-1
sss-token init --name "My USD" --symbol MUSD -u https://api.devnet.solana.com

# SSS-2
sss-token init --name "Compliant USD" --symbol cUSD --sss2 -u https://api.devnet.solana.com
```

## Monitoring

The backend provides:
- `/health` endpoint for uptime monitoring
- SQLite audit trail at `data/sss.sqlite`
- Webhook notifications for compliance events
- Pino structured logging (JSON in production, pretty in dev)

## Security Considerations

1. **Never commit private keys** — `.gitignore` covers `deploy-keypairs/` and `.env`
2. **Use hardware wallets** for authority keys in production
3. **Separate roles** — don't assign all roles to one key
4. **Monitor events** — use the backend webhook system for alerts
5. **Test on devnet** before any mainnet deployment
