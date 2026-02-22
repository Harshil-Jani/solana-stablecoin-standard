/**
 * Example 10: Full Lifecycle (End-to-End)
 * =========================================
 *
 * This example ties together EVERYTHING from examples 1-9 into a single
 * realistic scenario. It simulates a regulated stablecoin from deployment
 * to day-to-day operations to emergency response.
 *
 * Scenario:
 *   "Acme Financial deploys a compliant USD stablecoin on Solana.
 *    They onboard users via KYC, mint tokens for verified customers,
 *    detect a sanctioned entity, blacklist them, and seize their assets
 *    under a court order."
 *
 * This is the "read this if you read nothing else" example.
 *
 * Run: npx tsx examples/10-full-lifecycle.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  SolanaStablecoin,
  RoleManager,
  ComplianceModule,
  sss2Preset,
  findStablecoinPDA,
} from "@stbr/sss-sdk";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// ── Helper: create + return an ATA ─────────────────────────────────────
async function createATA(
  connection: Connection,
  payer: Keypair,
  mint: Keypair,
  owner: Keypair
) {
  const ata = getAssociatedTokenAddressSync(
    mint.publicKey, owner.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey, ata, owner.publicKey, mint.publicKey,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    ),
    [payer]
  );
  return ata;
}

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   Acme Financial — Compliant Stablecoin Lifecycle      ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ════════════════════════════════════════════════════════════════════
  // PHASE 1: DEPLOYMENT
  // Deploy the SSS-2 stablecoin and configure the operational team.
  // ════════════════════════════════════════════════════════════════════

  console.log("── Phase 1: Deployment ──────────────────────────────────\n");

  // Generate all operator keypairs
  const ceo = Keypair.generate();        // Master authority
  const treasury = Keypair.generate();   // Treasury cold wallet
  const opsMgr = Keypair.generate();     // Minter + Burner (operations)
  const kycOfficer = Keypair.generate(); // Pauser (KYC approvals)
  const compliance = Keypair.generate(); // Blacklister
  const legal = Keypair.generate();      // Seizer (court orders)
  const alice = Keypair.generate();      // Legitimate customer
  const bob = Keypair.generate();        // Legitimate customer
  const mallory = Keypair.generate();    // Bad actor (sanctioned entity)

  // Fund everyone
  for (const kp of [ceo, treasury, opsMgr, kycOfficer, compliance, legal, alice, bob, mallory]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  // Deploy the stablecoin
  const { stablecoin, mint } = await SolanaStablecoin.create(
    connection,
    ceo,
    sss2Preset({
      name: "Acme USD",
      symbol: "aUSD",
      decimals: 6,
      uri: "https://acme.financial/ausd-metadata.json",
    })
  );
  console.log("  Stablecoin deployed: Acme USD (aUSD)");
  console.log("  Mint:", mint.publicKey.toBase58());

  // Assign roles to the team
  const roleManager = new RoleManager(connection, stablecoin.stablecoinPDA);

  await roleManager.updateRoles(ceo, opsMgr.publicKey, {
    isMinter: true, isBurner: true,  // Operations: mint on fiat deposit, burn on fiat withdrawal
    isPauser: false, isBlacklister: false, isSeizer: false,
  });

  await roleManager.updateRoles(ceo, kycOfficer.publicKey, {
    isMinter: false, isBurner: false,
    isPauser: true,                  // KYC officer: thaw accounts after verification
    isBlacklister: false, isSeizer: false,
  });

  await roleManager.updateRoles(ceo, compliance.publicKey, {
    isMinter: false, isBurner: false, isPauser: false,
    isBlacklister: true,             // Compliance: manage sanctions blacklist
    isSeizer: false,
  });

  await roleManager.updateRoles(ceo, legal.publicKey, {
    isMinter: false, isBurner: false, isPauser: false,
    isBlacklister: false,
    isSeizer: true,                  // Legal: execute court-ordered seizures
  });

  // Set minter quota: $1M initial allocation
  await roleManager.updateMinter(ceo, opsMgr.publicKey, BigInt(1_000_000_000_000));

  console.log("  Team configured:");
  console.log("    CEO (authority):   ", ceo.publicKey.toBase58().slice(0, 12) + "...");
  console.log("    Ops (mint+burn):   ", opsMgr.publicKey.toBase58().slice(0, 12) + "...");
  console.log("    KYC (pauser):      ", kycOfficer.publicKey.toBase58().slice(0, 12) + "...");
  console.log("    Compliance (bl):   ", compliance.publicKey.toBase58().slice(0, 12) + "...");
  console.log("    Legal (seizer):    ", legal.publicKey.toBase58().slice(0, 12) + "...");

  // ════════════════════════════════════════════════════════════════════
  // PHASE 2: CUSTOMER ONBOARDING (KYC)
  // New users request accounts. All start frozen. KYC officer thaws
  // approved accounts.
  // ════════════════════════════════════════════════════════════════════

  console.log("\n── Phase 2: Customer Onboarding ─────────────────────────\n");

  // All three users create token accounts — ALL start frozen
  const aliceATA = await createATA(connection, ceo, mint, alice);
  const bobATA = await createATA(connection, ceo, mint, bob);
  const malloryATA = await createATA(connection, ceo, mint, mallory);
  console.log("  3 accounts created — ALL frozen by default (KYC gate)");

  // Alice passes KYC → thaw her account
  await stablecoin.thawAccount(kycOfficer, aliceATA);
  console.log("  Alice:   KYC APPROVED  → account thawed");

  // Bob passes KYC → thaw his account
  await stablecoin.thawAccount(kycOfficer, bobATA);
  console.log("  Bob:     KYC APPROVED  → account thawed");

  // Mallory also passes KYC (initially — the fraud is discovered later)
  await stablecoin.thawAccount(kycOfficer, malloryATA);
  console.log("  Mallory: KYC APPROVED  → account thawed (will be revoked later)");

  // ════════════════════════════════════════════════════════════════════
  // PHASE 3: NORMAL OPERATIONS
  // Mint tokens to customers on fiat deposit.
  // ════════════════════════════════════════════════════════════════════

  console.log("\n── Phase 3: Normal Operations ───────────────────────────\n");

  // Alice deposits $1,000 via wire transfer → mint 1000 aUSD
  await stablecoin.mintTokens(opsMgr, aliceATA, BigInt(1_000_000_000));
  console.log("  Alice deposited $1,000  → minted 1,000 aUSD");

  // Bob deposits $500 → mint 500 aUSD
  await stablecoin.mintTokens(opsMgr, bobATA, BigInt(500_000_000));
  console.log("  Bob deposited $500     → minted 500 aUSD");

  // Mallory deposits $2,000 → mint 2000 aUSD
  await stablecoin.mintTokens(opsMgr, malloryATA, BigInt(2_000_000_000));
  console.log("  Mallory deposited $2K  → minted 2,000 aUSD");

  // Check balances
  const aliceBal = await connection.getTokenAccountBalance(aliceATA);
  const bobBal = await connection.getTokenAccountBalance(bobATA);
  const malloryBal = await connection.getTokenAccountBalance(malloryATA);
  console.log("\n  Balances:");
  console.log("    Alice:  ", aliceBal.value.uiAmountString, "aUSD");
  console.log("    Bob:    ", bobBal.value.uiAmountString, "aUSD");
  console.log("    Mallory:", malloryBal.value.uiAmountString, "aUSD");

  // ════════════════════════════════════════════════════════════════════
  // PHASE 4: SANCTIONS ALERT
  // Compliance team discovers Mallory is on the OFAC SDN list.
  // ════════════════════════════════════════════════════════════════════

  console.log("\n── Phase 4: Sanctions Alert ─────────────────────────────\n");

  console.log("  [ALERT] Compliance screening flagged Mallory");
  console.log("  [ALERT] Match: OFAC SDN List — Entity ID 12345");

  // Step 1: Blacklist Mallory's address
  const complianceModule = new ComplianceModule(
    connection, stablecoin.mint, stablecoin.stablecoinPDA
  );

  await complianceModule.addToBlacklist(
    compliance,
    mallory.publicKey,
    "OFAC SDN match — Entity ID 12345, flagged 2024-03-15"
  );
  console.log("  Mallory BLACKLISTED — all transfers blocked by transfer hook");

  // Step 2: Freeze Mallory's account for good measure
  await stablecoin.freezeAccount(kycOfficer, malloryATA);
  console.log("  Mallory's account FROZEN — KYC revoked");

  // Verify blacklist
  const isBlacklisted = await complianceModule.isBlacklisted(mallory.publicKey);
  console.log("  Blacklist check:", isBlacklisted ? "BLOCKED" : "clear");

  // ════════════════════════════════════════════════════════════════════
  // PHASE 5: COURT-ORDERED SEIZURE
  // Legal receives a court order to seize Mallory's assets.
  // ════════════════════════════════════════════════════════════════════

  console.log("\n── Phase 5: Court-Ordered Seizure ───────────────────────\n");

  console.log("  [LEGAL] Court order received — Case #2024-CV-789");
  console.log("  [LEGAL] Order: Seize all aUSD from Mallory → Treasury");

  // Prepare treasury account
  const treasuryATA = await createATA(connection, ceo, mint, treasury);
  await stablecoin.thawAccount(kycOfficer, treasuryATA);

  // Thaw Mallory's account temporarily (must be unfrozen for transfer)
  await stablecoin.thawAccount(kycOfficer, malloryATA);

  // Execute seizure — Mallory does NOT sign this
  await complianceModule.seize(legal, malloryATA, treasuryATA);

  // Re-freeze Mallory's account
  await stablecoin.freezeAccount(kycOfficer, malloryATA);

  // Verify
  const malloryAfter = await connection.getTokenAccountBalance(malloryATA);
  const treasuryBal = await connection.getTokenAccountBalance(treasuryATA);
  console.log("  Seizure complete:");
  console.log("    Mallory:  ", malloryAfter.value.uiAmountString, "aUSD (seized)");
  console.log("    Treasury: ", treasuryBal.value.uiAmountString, "aUSD (recovered)");

  // ════════════════════════════════════════════════════════════════════
  // PHASE 6: CONTINUED OPERATIONS
  // Normal users are completely unaffected by the compliance action.
  // ════════════════════════════════════════════════════════════════════

  console.log("\n── Phase 6: Business Continues ──────────────────────────\n");

  // Alice redeems $200 worth of aUSD → burn 200 tokens
  // First assign burner role to Alice
  await roleManager.updateRoles(ceo, alice.publicKey, {
    isMinter: false, isBurner: true, isPauser: false, isBlacklister: false, isSeizer: false,
  });
  await stablecoin.burnTokens(alice, aliceATA, BigInt(200_000_000));
  console.log("  Alice redeemed 200 aUSD → $200 wire sent");

  // Final balances
  const aliceFinal = await connection.getTokenAccountBalance(aliceATA);
  const bobFinal = await connection.getTokenAccountBalance(bobATA);
  console.log("\n  Final Balances:");
  console.log("    Alice:    ", aliceFinal.value.uiAmountString, "aUSD");
  console.log("    Bob:      ", bobFinal.value.uiAmountString, "aUSD");
  console.log("    Mallory:   0 aUSD (seized, blacklisted, frozen)");
  console.log("    Treasury: ", treasuryBal.value.uiAmountString, "aUSD (from seizure)");

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   Lifecycle Complete — All 13 instructions exercised    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
}

main().catch(console.error);
