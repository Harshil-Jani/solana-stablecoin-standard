# Devnet Deployment Guide

Deploy SSS (Solana Stablecoin Standard) programs to Solana devnet.

## Prerequisites

- [Solana CLI](https://docs.solana.com/cli/install) (`>= 1.18`)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (`>= 0.30`)
- A devnet keypair with SOL for deployment fees

## Quick Start

```bash
# 1. Configure for devnet
solana config set --url devnet

# 2. Create or use an existing keypair
solana-keygen new -o ~/.config/solana/devnet.json
solana config set --keypair ~/.config/solana/devnet.json

# 3. Fund the deployer
solana airdrop 5 --url devnet

# 4. Deploy (builds + deploys both programs)
npx ts-node scripts/devnet-deploy.ts
```

## Automated Script

The `scripts/devnet-deploy.ts` script handles the full flow:

```bash
# Full build + deploy
npx ts-node scripts/devnet-deploy.ts

# Skip build (if already built)
npx ts-node scripts/devnet-deploy.ts --skip-build

# Use a specific keypair
npx ts-node scripts/devnet-deploy.ts --keypair ~/.config/solana/devnet.json
```

## Program IDs

| Program | ID |
|---------|-----|
| `sss_token` | `2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ` |
| `sss_transfer_hook` | `F2of7agMFET8v3verXe3e6Hmfd71t833RjPxEjs5wRdd` |

These are configured in `Anchor.toml` under `[programs.devnet]`.

## Manual Deployment

```bash
# Build programs
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show 2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ --url devnet
solana program show F2of7agMFET8v3verXe3e6Hmfd71t833RjPxEjs5wRdd --url devnet
```

## Using the SDK on Devnet

```typescript
import { Connection } from "@solana/web3.js";
import { SolanaStablecoin, sss2Preset } from "@sss/core";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const { stablecoin, mint, txSig } = await SolanaStablecoin.create(
  connection,
  authority,
  sss2Preset({ name: "My Devnet USD", symbol: "dUSD" })
);

console.log("Stablecoin created:", txSig);
console.log("Mint:", mint.publicKey.toBase58());
```

## Troubleshooting

**Insufficient funds**: Run `solana airdrop 5 --url devnet` (max 5 SOL per request).

**Program already deployed**: If the program IDs are already occupied, you need to use `anchor upgrade` instead of `anchor deploy`.

**Build fails**: Ensure `cargo build-sbf` is available (`solana-cli >= 1.18`).
