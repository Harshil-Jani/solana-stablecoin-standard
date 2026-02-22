/**
 * Example 2: Mint and Burn Tokens
 * ================================
 *
 * WHAT:  Mint tokens to a recipient and burn tokens from a burner's account.
 * WHEN:  After initializing a stablecoin and assigning minter/burner roles.
 * WHY:   Minting creates new supply (e.g., when fiat is deposited), burning
 *        removes supply (e.g., when fiat is redeemed). Per-minter quotas
 *        prevent any single operator from minting beyond their limit.
 *
 * Key concepts:
 *   - Minters need the `isMinter` role AND a quota set via RoleManager
 *   - Minting is quota-enforced: each minter tracks minted vs. allowed
 *   - Burners need the `isBurner` role — they burn from their OWN account
 *   - Both operations are blocked when the stablecoin is paused
 *
 * Run: npx tsx examples/2-mint-and-burn.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  SolanaStablecoin,
  RoleManager,
  sss1Preset,
} from "@stbr/sss-sdk";

// Helper: create an associated token account for Token-2022 mints.
// In production, use @solana/spl-token's getOrCreateAssociatedTokenAccount.
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");

  // ── Setup: Create stablecoin + keypairs ──────────────────────────────
  const authority = Keypair.generate();
  const minter = Keypair.generate();
  const burner = Keypair.generate();
  const recipient = Keypair.generate();

  // Fund all accounts
  for (const kp of [authority, minter, burner, recipient]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  // Create the stablecoin
  const { stablecoin, mint } = await SolanaStablecoin.create(
    connection,
    authority,
    sss1Preset({ name: "Example USD", symbol: "eUSD" })
  );
  console.log("Stablecoin created:", mint.publicKey.toBase58());

  // ── Step 1: Assign the minter role ───────────────────────────────────
  // The authority must explicitly grant the `isMinter` role to any keypair
  // that will mint tokens. This is a security boundary — even if someone
  // has the minter's private key, they can't mint without an on-chain role.
  const roleManager = new RoleManager(connection, stablecoin.stablecoinPDA);

  await roleManager.updateRoles(authority, minter.publicKey, {
    isMinter: true,    // Can mint tokens
    isBurner: false,   // Cannot burn
    isPauser: false,   // Cannot pause/unpause
    isBlacklister: false,
    isSeizer: false,
  });
  console.log("Minter role assigned to:", minter.publicKey.toBase58());

  // ── Step 2: Set the minter's quota ───────────────────────────────────
  // Quotas are denominated in the smallest unit (like lamports for SOL).
  // With 6 decimals: 10_000_000 = 10.000000 tokens.
  //
  // The minter can mint multiple times up to this limit. Once reached,
  // the authority must increase the quota or assign a new minter.
  const TEN_TOKENS = BigInt(10_000_000); // 10 tokens with 6 decimals
  await roleManager.updateMinter(authority, minter.publicKey, TEN_TOKENS);
  console.log("Quota set: 10 tokens");

  // ── Step 3: Create a token account for the recipient ─────────────────
  // Token-2022 requires an explicit token account. The associated token
  // account (ATA) is derived from the owner + mint — it's deterministic.
  const recipientATA = getAssociatedTokenAddressSync(
    mint.publicKey,
    recipient.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const createAtaIx = createAssociatedTokenAccountInstruction(
    authority.publicKey,    // payer
    recipientATA,          // the ATA to create
    recipient.publicKey,   // owner of the ATA
    mint.publicKey,        // mint
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(createAtaIx),
    [authority]
  );
  console.log("Recipient token account:", recipientATA.toBase58());

  // ── Step 4: Mint tokens ──────────────────────────────────────────────
  // The minter signs the transaction. The program checks:
  //   1. The minter has `isMinter` role in their RoleAccount PDA
  //   2. The minter has a MinterInfo PDA with sufficient remaining quota
  //   3. The stablecoin is not paused
  //
  // On success, the mint's supply increases and the minter's `minted_amount`
  // is incremented on-chain, enforcing the quota for future mints.
  const FIVE_TOKENS = BigInt(5_000_000); // 5.000000 tokens
  const mintTx = await stablecoin.mintTokens(minter, recipientATA, FIVE_TOKENS);
  console.log("\nMinted 5 tokens to recipient:", mintTx);

  // Check balance
  const balance = await connection.getTokenAccountBalance(recipientATA);
  console.log("Recipient balance:", balance.value.uiAmountString, balance.value.uiAmount);

  // ── Step 5: Burn tokens ──────────────────────────────────────────────
  // Burning destroys tokens, reducing the supply. Key difference from minting:
  //   - The burner burns from their OWN token account (not someone else's)
  //   - This models real-world stablecoin redemption: the issuer buys back
  //     tokens and burns them when fiat is withdrawn
  //
  // First, make the recipient also a burner so they can redeem:
  await roleManager.updateRoles(authority, recipient.publicKey, {
    isMinter: false,
    isBurner: true,    // Can now burn from their own account
    isPauser: false,
    isBlacklister: false,
    isSeizer: false,
  });

  const TWO_TOKENS = BigInt(2_000_000); // 2.000000 tokens
  const burnTx = await stablecoin.burnTokens(recipient, recipientATA, TWO_TOKENS);
  console.log("Burned 2 tokens:", burnTx);

  // Check updated balance
  const newBalance = await connection.getTokenAccountBalance(recipientATA);
  console.log("Recipient balance after burn:", newBalance.value.uiAmountString);

  // ── Quota enforcement demo ───────────────────────────────────────────
  // The minter already minted 5 tokens out of a 10-token quota.
  // Minting 6 more tokens would exceed the quota and fail.
  try {
    const SIX_TOKENS = BigInt(6_000_000);
    await stablecoin.mintTokens(minter, recipientATA, SIX_TOKENS);
    console.log("ERROR: should not reach here");
  } catch (err) {
    console.log("\nQuota exceeded (expected):", (err as Error).message.slice(0, 80));
  }

  // But minting 5 more tokens is within quota:
  await stablecoin.mintTokens(minter, recipientATA, FIVE_TOKENS);
  const finalBalance = await connection.getTokenAccountBalance(recipientATA);
  console.log("Final balance (5 minted - 2 burned + 5 minted = 8):", finalBalance.value.uiAmountString);
}

main().catch(console.error);
