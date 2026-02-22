/**
 * Example 4: Freeze Accounts & Pause Operations
 * ================================================
 *
 * WHAT:  Freeze individual token accounts and globally pause minting/burning.
 * WHEN:  During security incidents, compliance investigations, or emergencies.
 * WHY:   Two levels of emergency controls:
 *
 *        1. FREEZE (surgical) — Block a single account from sending/receiving.
 *           The account's tokens still exist, but can't move. Reversible via thaw.
 *           Use case: Suspicious activity on one account, pending investigation.
 *
 *        2. PAUSE (global) — Halt ALL minting and burning across the stablecoin.
 *           Existing transfers between unfrozen accounts still work (Token-2022
 *           transfers are not gated by the program). Reversible via unpause.
 *           Use case: Critical bug found, market emergency, regulatory order.
 *
 * Both require the `isPauser` role (or master authority).
 *
 * Run: npx tsx examples/4-freeze-and-pause.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  SolanaStablecoin,
  RoleManager,
  sss1Preset,
} from "@stbr/sss-sdk";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");

  // ── Setup ────────────────────────────────────────────────────────────
  const authority = Keypair.generate();
  const pauser = Keypair.generate();
  const minter = Keypair.generate();
  const user = Keypair.generate();

  for (const kp of [authority, pauser, minter, user]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  const { stablecoin, mint } = await SolanaStablecoin.create(
    connection,
    authority,
    sss1Preset({ name: "Safe USD", symbol: "sUSD" })
  );

  const roleManager = new RoleManager(connection, stablecoin.stablecoinPDA);

  // Assign roles
  await roleManager.updateRoles(authority, pauser.publicKey, {
    isMinter: false, isBurner: false, isPauser: true, isBlacklister: false, isSeizer: false,
  });
  await roleManager.updateRoles(authority, minter.publicKey, {
    isMinter: true, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: false,
  });
  await roleManager.updateMinter(authority, minter.publicKey, BigInt(100_000_000));

  // Create and fund user's token account
  const userATA = getAssociatedTokenAddressSync(
    mint.publicKey, user.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey, userATA, user.publicKey, mint.publicKey,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    ),
    [authority]
  );
  await stablecoin.mintTokens(minter, userATA, BigInt(50_000_000));
  console.log("Setup complete — user has 50 tokens\n");

  // ── Demo 1: Freeze a single account ─────────────────────────────────
  // Freezing uses Token-2022's native freeze authority (the stablecoin PDA).
  // The frozen account cannot send OR receive tokens until thawed.
  //
  // This is the pauser's most common action — react to a flagged account
  // without disrupting everyone else.
  console.log("=== Freezing user's account ===");
  const freezeTx = await stablecoin.freezeAccount(pauser, userATA);
  console.log("Account frozen:", freezeTx);

  // Attempting to mint to a frozen account will fail
  try {
    await stablecoin.mintTokens(minter, userATA, BigInt(1_000_000));
    console.log("ERROR: should not reach here");
  } catch (err) {
    console.log("Mint to frozen account failed (expected)");
  }

  // ── Demo 2: Thaw the account ────────────────────────────────────────
  // After investigation clears the account, the pauser thaws it.
  // Tokens are immediately accessible again.
  console.log("\n=== Thawing user's account ===");
  const thawTx = await stablecoin.thawAccount(pauser, userATA);
  console.log("Account thawed:", thawTx);

  // Now minting works again
  await stablecoin.mintTokens(minter, userATA, BigInt(1_000_000));
  const balance = await connection.getTokenAccountBalance(userATA);
  console.log("Mint after thaw succeeded — balance:", balance.value.uiAmountString);

  // ── Demo 3: Pause all operations ────────────────────────────────────
  // Pausing sets a boolean flag in the StablecoinState PDA. Every mint
  // and burn instruction checks this flag first.
  //
  // IMPORTANT: Pause does NOT freeze transfers. Token-2022 transfers
  // happen outside the sss-token program, so they can't be blocked by
  // program-level pause. For transfer blocking, use SSS-2 blacklist.
  console.log("\n=== Pausing stablecoin ===");
  const pauseTx = await stablecoin.pause(pauser);
  console.log("Stablecoin paused:", pauseTx);

  // All minting is now blocked
  try {
    await stablecoin.mintTokens(minter, userATA, BigInt(1_000_000));
    console.log("ERROR: should not reach here");
  } catch (err) {
    console.log("Mint while paused failed (expected)");
  }

  // ── Demo 4: Unpause ──────────────────────────────────────────────────
  console.log("\n=== Unpausing stablecoin ===");
  const unpauseTx = await stablecoin.unpause(pauser);
  console.log("Stablecoin unpaused:", unpauseTx);

  // Operations resume
  await stablecoin.mintTokens(minter, userATA, BigInt(1_000_000));
  const finalBalance = await connection.getTokenAccountBalance(userATA);
  console.log("Mint after unpause succeeded — balance:", finalBalance.value.uiAmountString);

  console.log("\n=== Summary ===");
  console.log("Freeze/Thaw: Surgical — targets one account, blocks all token movement");
  console.log("Pause/Unpause: Global — blocks minting and burning for everyone");
}

main().catch(console.error);
