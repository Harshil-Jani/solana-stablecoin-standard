# Architecture

## Overview

The Solana Stablecoin Standard (SSS) is a modular framework for issuing regulated stablecoins on Solana using Token-2022 extensions. It provides two preset configurations:

- **SSS-1 (Minimal)**: Basic mint/burn, freeze/thaw, pause controls
- **SSS-2 (Compliant)**: Full regulatory suite — permanent delegate seizure, transfer hook blacklist enforcement, default-frozen KYC gate

## System Components

```mermaid
flowchart TD
    CLI["<b>Admin CLI / SDK</b><br/>sss-token init | mint | burn | freeze | pause | status"]
    TOKEN["<b>sss-token Program</b> (Anchor)<br/>13 instructions · 4 PDA types · 6 roles<br/>Seeds: stablecoin, role, minter, blacklist"]
    T22["<b>Token-2022 Program</b><br/>MintTo · Burn · Freeze<br/>TransferChecked"]
    HOOK["<b>sss-transfer-hook</b><br/>Blacklist check on<br/>every transfer (SSS-2)"]

    CLI -- "TransactionInstruction" --> TOKEN
    TOKEN -- "CPI" --> T22
    TOKEN -- "Transfer Hook" --> HOOK
```

## PDA Account Layout

| PDA | Seeds | Size | Purpose |
|-----|-------|------|---------|
| `StablecoinState` | `["stablecoin", mint]` | 330 bytes | Config, operational state, authority |
| `RoleAccount` | `["role", stablecoin, holder]` | 78 bytes | Per-user role flags (5 bools) |
| `MinterInfo` | `["minter", stablecoin, minter]` | 89 bytes | Per-minter quota tracking |
| `BlacklistEntry` | `["blacklist", stablecoin, address]` | 217 bytes | Per-address blacklist (SSS-2) |

## Role-Based Access Control

| Role | Capabilities |
|------|-------------|
| Master Authority | Update roles, transfer authority, manage minters |
| Minter | Mint tokens up to assigned quota |
| Burner | Burn tokens from own account |
| Pauser | Pause/unpause, freeze/thaw accounts |
| Blacklister | Add/remove addresses from blacklist (SSS-2) |
| Seizer | Seize tokens via permanent delegate (SSS-2) |

## Feature Gating

SSS-2 instructions check `stablecoin.is_sss2()` (both `enable_permanent_delegate` and `enable_transfer_hook` must be `true`). If called on an SSS-1 stablecoin, they return `ComplianceNotEnabled`.

## Token-2022 Extensions Used

1. **MintCloseAuthority** — allows closing empty mints
2. **PermanentDelegate** (SSS-2) — enables seizure without owner consent
3. **TransferHook** (SSS-2) — calls `sss-transfer-hook` on every transfer
4. **DefaultAccountState** (SSS-2) — new accounts start frozen (KYC gate)

## Transfer Hook Flow

```mermaid
sequenceDiagram
    participant User
    participant Token2022 as Token-2022
    participant Hook as sss-transfer-hook
    participant Blacklist as Blacklist PDAs

    User->>Token2022: transfer_checked()
    Token2022->>Token2022: Resolve ExtraAccountMetaList PDA
    Token2022->>Hook: fallback() with extra accounts
    Hook->>Blacklist: Check source blacklist PDA
    Hook->>Blacklist: Check destination blacklist PDA
    alt Either is blacklisted
        Hook-->>Token2022: Error: Blacklisted
        Token2022-->>User: Transaction fails
    else Neither blacklisted
        Hook-->>Token2022: OK
        Token2022-->>User: Transfer succeeds
    end
```
