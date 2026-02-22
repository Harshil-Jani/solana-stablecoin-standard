/**
 * Example 7: KYC Workflow (Default-Frozen Accounts)
 * ====================================================
 *
 * WHAT:  Demonstrate the KYC gate using Token-2022's DefaultAccountState extension.
 * WHEN:  SSS-2 stablecoins use this pattern — every new token account starts frozen.
 * WHY:   Regulators require Know Your Customer verification before users can hold
 *        or transact with regulated stablecoins. Default-frozen accounts enforce
 *        this at the protocol level — no KYC, no tokens, no exceptions.
 *
 * The flow:
 *   1. User creates a token account → it's FROZEN by default
 *   2. User submits KYC documents (off-chain)
 *   3. Compliance team verifies identity (off-chain)
 *   4. Pauser calls thawAccount() → account is now active
 *   5. User can now send, receive, and hold tokens
 *
 * If KYC is later revoked (e.g., identity fraud), the pauser can freeze
 * the account again, effectively banning the user from the token ecosystem.
 *
 * Run: npx tsx examples/7-kyc-workflow.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  SolanaStablecoin,
  RoleManager,
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

  // ── Setup: SSS-2 stablecoin ──────────────────────────────────────────
  const authority = Keypair.generate();
  const pauser = Keypair.generate();   // KYC approver
  const minter = Keypair.generate();
  const alice = Keypair.generate();    // New user requesting access
  const bob = Keypair.generate();      // Another user (already KYC'd)

  for (const kp of [authority, pauser, minter, alice, bob]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  const { stablecoin, mint } = await SolanaStablecoin.create(
    connection,
    authority,
    sss2Preset({ name: "KYC Dollar", symbol: "kUSD" })
  );

  const roleManager = new RoleManager(connection, stablecoin.stablecoinPDA);
  await roleManager.updateRoles(authority, pauser.publicKey, {
    isMinter: false, isBurner: false, isPauser: true, isBlacklister: false, isSeizer: false,
  });
  await roleManager.updateRoles(authority, minter.publicKey, {
    isMinter: true, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: false,
  });
  await roleManager.updateMinter(authority, minter.publicKey, BigInt(100_000_000));
  console.log("SSS-2 stablecoin deployed with KYC gate enabled\n");

  // ── Step 1: Alice creates a token account ────────────────────────────
  // Because defaultAccountFrozen=true, this account is IMMEDIATELY frozen.
  // Alice cannot receive or send any tokens until the pauser thaws it.
  const aliceATA = getAssociatedTokenAddressSync(
    mint.publicKey, alice.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        alice.publicKey, aliceATA, alice.publicKey, mint.publicKey,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    ),
    [alice]
  );
  console.log("Step 1: Alice created token account (FROZEN by default)");
  console.log("        ATA:", aliceATA.toBase58());

  // ── Step 2: Try to mint to Alice — FAILS ─────────────────────────────
  // This demonstrates the KYC gate in action. Even though the minter has
  // quota and Alice's account exists, Token-2022 blocks the operation
  // because the destination account is frozen.
  try {
    await stablecoin.mintTokens(minter, aliceATA, BigInt(10_000_000));
    console.log("ERROR: should not reach here");
  } catch (err) {
    console.log("Step 2: Mint to frozen account BLOCKED (KYC not complete)");
  }

  // ── Step 3: Off-chain KYC verification ───────────────────────────────
  // In a real system, this is where your compliance pipeline kicks in:
  //   - Alice submits ID documents via your web portal
  //   - Your compliance provider (Jumio, Onfido, etc.) verifies identity
  //   - Your backend receives a webhook confirming KYC pass
  //   - Your backend calls the pauser to thaw Alice's account
  console.log("Step 3: [Off-chain] Alice submits KYC documents...");
  console.log("        [Off-chain] Compliance team verifies identity...");
  console.log("        [Off-chain] KYC APPROVED");

  // ── Step 4: Pauser thaws Alice's account (KYC approved) ──────────────
  // This is the on-chain action that completes the KYC flow.
  // Only the pauser (or authority) can call this.
  const thawTx = await stablecoin.thawAccount(pauser, aliceATA);
  console.log("Step 4: Pauser thawed Alice's account:", thawTx.slice(0, 20) + "...");

  // ── Step 5: Mint to Alice — now it works ─────────────────────────────
  await stablecoin.mintTokens(minter, aliceATA, BigInt(10_000_000));
  const balance = await connection.getTokenAccountBalance(aliceATA);
  console.log("Step 5: Minted 10 tokens to Alice — balance:", balance.value.uiAmountString);

  // ── Bonus: Revoke KYC ────────────────────────────────────────────────
  // If Alice is later found to have provided fraudulent documents, the
  // pauser can re-freeze her account. This immediately blocks all token
  // movement to/from that account.
  console.log("\n--- KYC Revocation Scenario ---");
  const freezeTx = await stablecoin.freezeAccount(pauser, aliceATA);
  console.log("KYC revoked — Alice's account re-frozen:", freezeTx.slice(0, 20) + "...");
  console.log("Alice still holds 10 tokens but cannot move them.");
  console.log("A seizer could later transfer them to treasury if needed (see example 9).");
}

main().catch(console.error);
