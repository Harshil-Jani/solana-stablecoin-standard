# SDK Reference

## Installation

```bash
yarn add @stbr/sss-sdk
```

## Quick Start

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { SolanaStablecoin, sss1Preset, sss2Preset, RoleManager, ComplianceModule } from "@stbr/sss-sdk";

const connection = new Connection("http://localhost:8899", "confirmed");
const authority = Keypair.generate();

// Create an SSS-1 stablecoin
const { stablecoin, mint } = await SolanaStablecoin.create(
  connection,
  authority,
  sss1Preset({ name: "My USD", symbol: "MUSD" })
);

// Or SSS-2 for full compliance
const { stablecoin: compliant } = await SolanaStablecoin.create(
  connection,
  authority,
  sss2Preset({ name: "Compliant USD", symbol: "cUSD" })
);
```

## Classes

### SolanaStablecoin

Main entry point for stablecoin operations.

| Method | Description |
|--------|-------------|
| `create(connection, authority, config)` | Create new stablecoin (static) |
| `load(connection, mint)` | Load existing stablecoin (static) |
| `mintTokens(minter, recipient, amount)` | Mint tokens |
| `burnTokens(burner, account, amount)` | Burn tokens |
| `freezeAccount(authority, account)` | Freeze a token account |
| `thawAccount(authority, account)` | Thaw a token account |
| `pause(authority)` | Pause stablecoin |
| `unpause(authority)` | Unpause stablecoin |
| `transferAuthority(authority, newAuthority)` | Transfer master authority |

### RoleManager

```typescript
const roles = new RoleManager(connection, stablecoin.stablecoinPDA);
await roles.updateRoles(authority, holder, {
  isMinter: true, isBurner: false, isPauser: false,
  isBlacklister: false, isSeizer: false,
});
await roles.updateMinter(authority, holder, 1_000_000n);
```

### ComplianceModule (SSS-2)

```typescript
const compliance = new ComplianceModule(connection, mint, stablecoinPDA);
await compliance.addToBlacklist(blacklister, address, "Sanctions");
await compliance.seize(seizer, sourceAccount, treasuryAccount);
const blocked = await compliance.isBlacklisted(address);
```

## Presets

| Preset | Permanent Delegate | Transfer Hook | Default Frozen |
|--------|-------------------|---------------|----------------|
| `sss1Preset()` | false | false | false |
| `sss2Preset()` | true | true | true |

## PDA Helpers

```typescript
import { findStablecoinPDA, findRolePDA, findMinterPDA, findBlacklistPDA } from "@stbr/sss-sdk";

const [stablecoinPDA, bump] = findStablecoinPDA(mintPublicKey);
```
