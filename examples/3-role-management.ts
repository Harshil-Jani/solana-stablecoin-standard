/**
 * Example 3: Role Management
 * ===========================
 *
 * WHAT:  Assign and manage RBAC roles for multi-operator stablecoin teams.
 * WHEN:  After initialization, when setting up your operational team.
 * WHY:   Role-based access control ensures no single person has total power.
 *        A minter can't freeze accounts, a pauser can't mint tokens, etc.
 *
 * The 6 roles and their capabilities:
 * ┌──────────────────┬──────────────────────────────────────────────────┐
 * │ Role             │ What they can do                                │
 * ├──────────────────┼──────────────────────────────────────────────────┤
 * │ Master Authority │ Assign roles, set quotas, transfer authority    │
 * │ Minter           │ Mint tokens up to their assigned quota          │
 * │ Burner           │ Burn tokens from their own token account        │
 * │ Pauser           │ Freeze/thaw accounts, pause/unpause operations  │
 * │ Blacklister      │ Add/remove addresses from blacklist (SSS-2)     │
 * │ Seizer           │ Seize tokens via permanent delegate (SSS-2)     │
 * └──────────────────┴──────────────────────────────────────────────────┘
 *
 * IMPORTANT: Only the master authority can assign roles. Roles are stored
 * in a PDA per (stablecoin, holder) — so one wallet can hold different
 * roles on different stablecoins.
 *
 * Run: npx tsx examples/3-role-management.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  SolanaStablecoin,
  RoleManager,
  sss1Preset,
  type RoleFlags,
} from "@stbr/sss-sdk";

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");

  // ── Setup ────────────────────────────────────────────────────────────
  const authority = Keypair.generate();
  const operator1 = Keypair.generate(); // Will be: minter + burner
  const operator2 = Keypair.generate(); // Will be: pauser only
  const operator3 = Keypair.generate(); // Will be: minter only (separate quota)

  for (const kp of [authority, operator1, operator2, operator3]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  const { stablecoin } = await SolanaStablecoin.create(
    connection,
    authority,
    sss1Preset({ name: "Multi-Op USD", symbol: "mUSD" })
  );

  const roleManager = new RoleManager(connection, stablecoin.stablecoinPDA);

  // ── Scenario 1: Combined roles ──────────────────────────────────────
  // A single operator can hold multiple roles. This is common for smaller
  // teams where one person handles both minting (creating new supply on
  // fiat deposit) and burning (destroying supply on fiat redemption).
  await roleManager.updateRoles(authority, operator1.publicKey, {
    isMinter: true,
    isBurner: true,    // Same person can mint AND burn
    isPauser: false,
    isBlacklister: false,
    isSeizer: false,
  });
  console.log("Operator 1 (minter + burner):", operator1.publicKey.toBase58());

  // ── Scenario 2: Isolated pauser ─────────────────────────────────────
  // The pauser role is critical for emergencies. Often assigned to a
  // security team member who can freeze accounts or halt operations
  // without having the power to mint or move tokens.
  await roleManager.updateRoles(authority, operator2.publicKey, {
    isMinter: false,
    isBurner: false,
    isPauser: true,    // Can only pause/unpause and freeze/thaw
    isBlacklister: false,
    isSeizer: false,
  });
  console.log("Operator 2 (pauser only):    ", operator2.publicKey.toBase58());

  // ── Scenario 3: Separate minter with its own quota ──────────────────
  // Multiple minters can coexist, each with their own independent quota.
  // This is how exchanges or payment processors work — each partner
  // gets a minting allocation, tracked independently on-chain.
  await roleManager.updateRoles(authority, operator3.publicKey, {
    isMinter: true,
    isBurner: false,
    isPauser: false,
    isBlacklister: false,
    isSeizer: false,
  });

  // Set different quotas for each minter
  const QUOTA_OP1 = BigInt(100_000_000); // 100 tokens for operator 1
  const QUOTA_OP3 = BigInt(50_000_000);  // 50 tokens for operator 3

  await roleManager.updateMinter(authority, operator1.publicKey, QUOTA_OP1);
  await roleManager.updateMinter(authority, operator3.publicKey, QUOTA_OP3);
  console.log("Operator 3 (minter, 50 quota):", operator3.publicKey.toBase58());

  // ── Scenario 4: Revoke a role ────────────────────────────────────────
  // To revoke roles, simply update with the flags set to false.
  // The RoleAccount PDA still exists on-chain, but all flags are false,
  // so the operator can't perform any privileged actions.
  await roleManager.updateRoles(authority, operator1.publicKey, {
    isMinter: false,   // Revoked — can no longer mint
    isBurner: true,    // Still a burner
    isPauser: false,
    isBlacklister: false,
    isSeizer: false,
  });
  console.log("\nOperator 1 minter role revoked — can only burn now");

  // ── Scenario 5: Increase an existing quota ──────────────────────────
  // Quotas can be updated at any time by the authority. This doesn't
  // reset the minted amount — it just changes the ceiling.
  // If operator3 has minted 30 tokens, changing quota to 80 means
  // they can mint 50 more (80 - 30 already minted).
  const NEW_QUOTA = BigInt(80_000_000); // Increase from 50 to 80 tokens
  await roleManager.updateMinter(authority, operator3.publicKey, NEW_QUOTA);
  console.log("Operator 3 quota increased from 50 to 80 tokens");

  // ── Role architecture summary ────────────────────────────────────────
  console.log("\n=== Final Role Configuration ===");
  console.log("Authority:  ALL (master) — can assign roles, quotas, transfer authority");
  console.log("Operator 1: BURNER only  — minter revoked, can still redeem tokens");
  console.log("Operator 2: PAUSER only  — emergency freeze/thaw, pause/unpause");
  console.log("Operator 3: MINTER only  — 80 token quota, independent from operator 1");
}

main().catch(console.error);
