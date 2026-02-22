/**
 * Example 9: Seize Assets (Permanent Delegate)
 * ===============================================
 *
 * WHAT:  Transfer the full balance of any token account to a treasury — without
 *        the account owner's consent or signature.
 * WHEN:  Court orders, law enforcement requests, or regulatory seizure actions.
 * WHY:   Regulated stablecoins must cooperate with legal authorities. The
 *        permanent delegate extension makes this possible on-chain.
 *
 * How seizure works:
 *   1. The stablecoin PDA is set as the permanent delegate at init time.
 *   2. Token-2022's permanent delegate can call transfer_checked on behalf
 *      of any token account owner — without their signature.
 *   3. The sss-token program uses invoke_signed() to sign as the PDA,
 *      acting as the delegate, and moves ALL tokens to the treasury.
 *
 * IMPORTANT:
 *   - Only the `isSeizer` role can call seize()
 *   - Seizure always transfers the FULL balance (no partial seizure)
 *   - A TokensSeized event is emitted with full audit details
 *   - This is an SSS-2-only feature (requires enablePermanentDelegate=true)
 *
 * Run: npx tsx examples/9-seize-assets.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  SolanaStablecoin,
  RoleManager,
  ComplianceModule,
  sss2Preset,
} from "@stbr/sss-sdk";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");

  // ── Setup: Create SSS-2 stablecoin with full team ────────────────────
  const authority = Keypair.generate();
  const seizer = Keypair.generate();
  const minter = Keypair.generate();
  const pauser = Keypair.generate();
  const criminal = Keypair.generate();   // Bad actor whose funds will be seized

  for (const kp of [authority, seizer, minter, pauser, criminal]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  const { stablecoin, mint } = await SolanaStablecoin.create(
    connection,
    authority,
    sss2Preset({ name: "Seizure Demo", symbol: "SEIZE" })
  );

  const roleManager = new RoleManager(connection, stablecoin.stablecoinPDA);

  // Assign seizer role (only this role can seize assets)
  await roleManager.updateRoles(authority, seizer.publicKey, {
    isMinter: false, isBurner: false, isPauser: false, isBlacklister: false,
    isSeizer: true,
  });
  await roleManager.updateRoles(authority, minter.publicKey, {
    isMinter: true, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: false,
  });
  await roleManager.updateRoles(authority, pauser.publicKey, {
    isMinter: false, isBurner: false, isPauser: true, isBlacklister: false, isSeizer: false,
  });
  await roleManager.updateMinter(authority, minter.publicKey, BigInt(100_000_000));
  console.log("SSS-2 stablecoin with seizer role ready\n");

  // ── Step 1: Criminal accumulates tokens ──────────────────────────────
  // (Simulate normal activity before the crime is discovered)
  const criminalATA = getAssociatedTokenAddressSync(
    mint.publicKey, criminal.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey, criminalATA, criminal.publicKey, mint.publicKey,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    ),
    [authority]
  );

  // Thaw the criminal's account (they passed KYC initially)
  await stablecoin.thawAccount(pauser, criminalATA);

  // Mint tokens to the criminal (simulating legitimate-looking activity)
  await stablecoin.mintTokens(minter, criminalATA, BigInt(50_000_000));
  const beforeBalance = await connection.getTokenAccountBalance(criminalATA);
  console.log("Step 1: Criminal holds", beforeBalance.value.uiAmountString, "tokens");

  // ── Step 2: Crime discovered — prepare treasury ──────────────────────
  // In production, the treasury is a dedicated cold wallet controlled
  // by the legal team or a court-appointed receiver.
  const treasuryATA = getAssociatedTokenAddressSync(
    mint.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey, treasuryATA, authority.publicKey, mint.publicKey,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    ),
    [authority]
  );
  // Treasury needs to be thawed too (default frozen in SSS-2)
  await stablecoin.thawAccount(pauser, treasuryATA);
  console.log("Step 2: Treasury account prepared:", treasuryATA.toBase58().slice(0, 12) + "...");

  // ── Step 3: Seize all tokens ─────────────────────────────────────────
  // The seizer calls seize() which:
  //   1. Reads the source account's full balance
  //   2. Calls Token-2022's transfer_checked via invoke_signed
  //   3. The stablecoin PDA signs as the permanent delegate
  //   4. Token-2022 transfers ALL tokens without the criminal's signature
  //   5. Emits TokensSeized event with: from, to, amount, seizedBy, timestamp
  //
  // The criminal does NOT sign this transaction and cannot block it.
  console.log("\nStep 3: Seizing assets...");
  const compliance = new ComplianceModule(
    connection,
    stablecoin.mint,
    stablecoin.stablecoinPDA
  );

  const seizeTx = await compliance.seize(seizer, criminalATA, treasuryATA);
  console.log("  Seizure tx:", seizeTx.slice(0, 20) + "...");

  // ── Step 4: Verify results ───────────────────────────────────────────
  const criminalAfter = await connection.getTokenAccountBalance(criminalATA);
  const treasuryAfter = await connection.getTokenAccountBalance(treasuryATA);
  console.log("\nStep 4: Results");
  console.log("  Criminal balance:", criminalAfter.value.uiAmountString, "(should be 0)");
  console.log("  Treasury balance:", treasuryAfter.value.uiAmountString, "(should be 50)");

  console.log("\n=== Seizure Summary ===");
  console.log("- Permanent delegate transfers tokens WITHOUT owner's signature");
  console.log("- Always seizes the FULL balance — no partial seizures");
  console.log("- TokensSeized event provides full audit trail");
  console.log("- Only the isSeizer role can perform this action");
  console.log("- Only works on SSS-2 stablecoins (enablePermanentDelegate=true)");
}

main().catch(console.error);
