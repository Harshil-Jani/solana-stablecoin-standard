/**
 * Example 6: Create an SSS-2 Compliant Stablecoin
 * ==================================================
 *
 * WHAT:  Initialize a fully compliant SSS-2 stablecoin with all Token-2022 extensions.
 * WHEN:  When you need regulatory compliance — KYC gating, sanctions screening,
 *        law enforcement seizure, and audit trails.
 * WHY:   SSS-2 is designed for USDC/USDT-class stablecoins that must satisfy
 *        FATF travel rule, AML/KYC requirements, and sanctions compliance.
 *
 * SSS-2 enables three additional Token-2022 extensions over SSS-1:
 *
 *   1. PermanentDelegate — Allows seizing tokens from ANY account without
 *      the owner's signature. Used for court-ordered asset recovery.
 *
 *   2. TransferHook — Calls the sss-transfer-hook program on EVERY transfer.
 *      The hook checks if sender or receiver is blacklisted, and blocks
 *      the transfer if either is. This cannot be bypassed.
 *
 *   3. DefaultAccountState (Frozen) — Every new token account starts frozen.
 *      Users must pass KYC before a pauser thaws their account. This is
 *      the strongest KYC gate — no tokens can move until you approve them.
 *
 * SSS-2 also adds two new roles:
 *   - Blacklister: manages the on-chain blacklist
 *   - Seizer: can seize tokens using permanent delegate authority
 *
 * Run: npx tsx examples/6-sss2-compliant.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  SolanaStablecoin,
  RoleManager,
  ComplianceModule,
  sss2Preset,
} from "@stbr/sss-sdk";

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");

  const authority = Keypair.generate();
  const sig = await connection.requestAirdrop(authority.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig);

  // ── Create SSS-2 stablecoin ──────────────────────────────────────────
  // sss2Preset() sets:
  //   enablePermanentDelegate: true   → seizure capability
  //   enableTransferHook: true        → blacklist enforcement on every transfer
  //   defaultAccountFrozen: true      → KYC gate (all accounts start frozen)
  //
  // Compare with sss1Preset() which sets all three to false.
  const { stablecoin, mint, txSig } = await SolanaStablecoin.create(
    connection,
    authority,
    sss2Preset({
      name: "Regulated Dollar",
      symbol: "rUSD",
      decimals: 6,
      uri: "https://example.com/regulated-metadata.json",
    })
  );

  console.log("SSS-2 Compliant Stablecoin Created!");
  console.log("  Mint:           ", mint.publicKey.toBase58());
  console.log("  Stablecoin PDA: ", stablecoin.stablecoinPDA.toBase58());
  console.log("  Transaction:    ", txSig);

  // ── Set up compliance team ───────────────────────────────────────────
  // In production, these would be separate operators — often different
  // departments (operations, compliance, legal) with their own keypairs.
  const blacklister = Keypair.generate();
  const seizer = Keypair.generate();
  const pauser = Keypair.generate();
  const minter = Keypair.generate();

  for (const kp of [blacklister, seizer, pauser, minter]) {
    const s = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(s);
  }

  const roleManager = new RoleManager(connection, stablecoin.stablecoinPDA);

  // Blacklister: manages the sanctions/blacklist
  await roleManager.updateRoles(authority, blacklister.publicKey, {
    isMinter: false, isBurner: false, isPauser: false,
    isBlacklister: true,  // SSS-2 only
    isSeizer: false,
  });

  // Seizer: can seize assets (law enforcement cooperation)
  await roleManager.updateRoles(authority, seizer.publicKey, {
    isMinter: false, isBurner: false, isPauser: false,
    isBlacklister: false,
    isSeizer: true,       // SSS-2 only
  });

  // Pauser: handles KYC thaw + emergency freeze
  await roleManager.updateRoles(authority, pauser.publicKey, {
    isMinter: false, isBurner: false,
    isPauser: true,       // Thaws accounts after KYC
    isBlacklister: false, isSeizer: false,
  });

  // Minter: creates new supply
  await roleManager.updateRoles(authority, minter.publicKey, {
    isMinter: true, isBurner: false, isPauser: false,
    isBlacklister: false, isSeizer: false,
  });
  await roleManager.updateMinter(authority, minter.publicKey, BigInt(1_000_000_000));

  console.log("\nCompliance team configured:");
  console.log("  Blacklister:", blacklister.publicKey.toBase58());
  console.log("  Seizer:     ", seizer.publicKey.toBase58());
  console.log("  Pauser/KYC: ", pauser.publicKey.toBase58());
  console.log("  Minter:     ", minter.publicKey.toBase58());

  // ── Feature gating ──────────────────────────────────────────────────
  // SSS-2 instructions (blacklist, seize) check the StablecoinState to
  // verify that `enable_permanent_delegate` and `enable_transfer_hook`
  // are both true. If you try to call these on an SSS-1 stablecoin,
  // you'll get a `ComplianceNotEnabled` error.
  //
  // This means the same sss-token program handles both SSS-1 and SSS-2.
  // The preset determines which features are available at init time.
  console.log("\nThe stablecoin is ready for compliance operations.");
  console.log("See examples 7-9 for KYC, blacklist, and seizure workflows.");
}

main().catch(console.error);
