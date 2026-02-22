/**
 * Example 8: Blacklist Enforcement
 * ==================================
 *
 * WHAT:  Add and remove addresses from the on-chain blacklist.
 * WHEN:  When an address is flagged by sanctions screening (OFAC, EU, etc.),
 *        reported for fraud, or identified in criminal activity.
 * WHY:   The transfer hook checks the blacklist on EVERY transfer — this is
 *        the only way to truly prevent a blacklisted address from transacting.
 *        Freezing only blocks one token account; blacklisting blocks the
 *        address across ALL their token accounts.
 *
 * How it works (under the hood):
 *   1. Each blacklisted address gets its own PDA:
 *      Seeds: ["blacklist", stablecoin_pda, address]
 *   2. When anyone calls transfer_checked(), Token-2022 invokes the
 *      sss-transfer-hook program automatically.
 *   3. The hook checks if a blacklist PDA exists for the source AND
 *      destination addresses.
 *   4. If either PDA exists and has data → transfer is rejected.
 *
 * This cannot be bypassed — the hook is embedded in the mint at creation
 * time via the TransferHook extension.
 *
 * Run: npx tsx examples/8-blacklist.ts
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

  // ── Setup ────────────────────────────────────────────────────────────
  const authority = Keypair.generate();
  const blacklister = Keypair.generate();
  const suspectAddress = Keypair.generate();  // Address on sanctions list

  for (const kp of [authority, blacklister, suspectAddress]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  const { stablecoin } = await SolanaStablecoin.create(
    connection,
    authority,
    sss2Preset({ name: "Compliance USD", symbol: "cmpUSD" })
  );

  const roleManager = new RoleManager(connection, stablecoin.stablecoinPDA);
  await roleManager.updateRoles(authority, blacklister.publicKey, {
    isMinter: false, isBurner: false, isPauser: false,
    isBlacklister: true,
    isSeizer: false,
  });

  // ── Create the compliance module ─────────────────────────────────────
  // ComplianceModule wraps blacklist and seizure operations.
  // It needs the same connection + stablecoin PDA as the main class.
  const compliance = new ComplianceModule(
    connection,
    stablecoin.mint,
    stablecoin.stablecoinPDA
  );

  // ── Step 1: Check if address is blacklisted (it's not yet) ──────────
  const beforeCheck = await compliance.isBlacklisted(suspectAddress.publicKey);
  console.log("Before blacklisting:", suspectAddress.publicKey.toBase58().slice(0, 12) + "...");
  console.log("  Is blacklisted?", beforeCheck); // false

  // ── Step 2: Add to blacklist ─────────────────────────────────────────
  // The reason string is stored on-chain in the BlacklistEntry PDA.
  // This creates an audit trail — who was blacklisted, why, when, and
  // by whom — all verifiable on-chain.
  //
  // Common reasons in production:
  //   - "OFAC SDN list match"
  //   - "EU sanctions designation"
  //   - "Fraud investigation — case #12345"
  //   - "Law enforcement request — ref #ABC"
  const addTx = await compliance.addToBlacklist(
    blacklister,
    suspectAddress.publicKey,
    "OFAC SDN list match — 2024-03-15"
  );
  console.log("\nBlacklisted! Tx:", addTx.slice(0, 20) + "...");

  // ── Step 3: Verify blacklist status ──────────────────────────────────
  const afterCheck = await compliance.isBlacklisted(suspectAddress.publicKey);
  console.log("  Is blacklisted?", afterCheck); // true

  // At this point, ANY transfer_checked() involving this address will fail.
  // The transfer hook will detect the blacklist PDA and reject the transfer.
  // This applies regardless of which token account the address uses.

  // ── Step 4: Remove from blacklist (e.g., false positive resolved) ────
  // If the sanctions match was a false positive (name similarity, etc.),
  // the blacklister can remove the entry. The PDA is closed, and the
  // rent-exempt SOL is returned to the blacklister.
  const removeTx = await compliance.removeFromBlacklist(
    blacklister,
    suspectAddress.publicKey
  );
  console.log("\nRemoved from blacklist:", removeTx.slice(0, 20) + "...");

  const finalCheck = await compliance.isBlacklisted(suspectAddress.publicKey);
  console.log("  Is blacklisted?", finalCheck); // false

  console.log("\n=== Blacklist Summary ===");
  console.log("- Blacklisting blocks ALL transfers (send and receive)");
  console.log("- Enforced at Token-2022 level via transfer hook — cannot be bypassed");
  console.log("- Each entry stores: reason, timestamp, blacklisted_by");
  console.log("- Removal closes the PDA and refunds rent to the blacklister");
}

main().catch(console.error);
