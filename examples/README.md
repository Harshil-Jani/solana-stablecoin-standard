# SSS SDK Examples

Step-by-step examples for the Solana Stablecoin Standard SDK. Follow them in order — each one builds on concepts from the previous.

## Prerequisites

```bash
# Start a local Solana validator (required for all examples)
solana-test-validator

# In another terminal — install dependencies
yarn install && yarn build
```

## Examples

| # | File | What You'll Learn |
|---|------|-------------------|
| 1 | [basic-sss1.ts](./1-basic-sss1.ts) | Create your first stablecoin using the SSS-1 minimal preset |
| 2 | [mint-and-burn.ts](./2-mint-and-burn.ts) | Mint tokens with per-minter quotas and burn tokens |
| 3 | [role-management.ts](./3-role-management.ts) | Set up multi-operator teams with granular role assignments |
| 4 | [freeze-and-pause.ts](./4-freeze-and-pause.ts) | Emergency controls — freeze individual accounts, pause all operations |
| 5 | [authority-transfer.ts](./5-authority-transfer.ts) | Safely hand off master authority to a new keypair (governance transitions) |
| 6 | [sss2-compliant.ts](./6-sss2-compliant.ts) | Create a fully compliant SSS-2 stablecoin with all Token-2022 extensions |
| 7 | [kyc-workflow.ts](./7-kyc-workflow.ts) | Default-frozen KYC gate — thaw accounts only after verification |
| 8 | [blacklist.ts](./8-blacklist.ts) | Block sanctioned addresses from sending or receiving tokens |
| 9 | [seize-assets.ts](./9-seize-assets.ts) | Seize tokens from a bad actor using permanent delegate authority |
| 10 | [full-lifecycle.ts](./10-full-lifecycle.ts) | Complete end-to-end: deploy, configure roles, KYC, mint, blacklist, seize |

## Running an Example

```bash
# Run any example with ts-node (or npx tsx)
npx tsx examples/1-basic-sss1.ts

# Or run them all in sequence
for f in examples/*.ts; do echo "=== $f ===" && npx tsx "$f"; done
```

## Architecture Quick Reference

```
SolanaStablecoin          — Create, load, mint, burn, freeze, thaw, pause, unpause
├── RoleManager           — Assign roles (minter, burner, pauser, blacklister, seizer)
├── ComplianceModule      — Blacklist management + asset seizure (SSS-2 only)
└── Presets
    ├── sss1Preset()      — Minimal: no compliance extensions
    └── sss2Preset()      — Compliant: permanent delegate + transfer hook + default frozen
```
