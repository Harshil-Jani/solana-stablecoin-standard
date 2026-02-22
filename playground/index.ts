/**
 * SSS SDK Playground
 *
 * Interactive script that walks through the full SSS feature set.
 * Run against localnet or devnet:
 *
 *   npx ts-node index.ts              # localnet (default)
 *   CLUSTER=devnet npx ts-node index.ts  # devnet
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import * as crypto from "crypto";

// ── Config ────────────────────────────────────────────────────────────

const CLUSTER = process.env.CLUSTER || "localnet";
const RPC_URL = CLUSTER === "devnet"
  ? "https://api.devnet.solana.com"
  : "http://localhost:8899";

const SSS_TOKEN_PROGRAM_ID = new PublicKey("2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ");
const SSS_HOOK_PROGRAM_ID = new PublicKey("F2of7agMFET8v3verXe3e6Hmfd71t833RjPxEjs5wRdd");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// ── Helpers ───────────────────────────────────────────────────────────

function disc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function str(s: string): Buffer {
  const bytes = Buffer.from(s, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

function u64(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return buf;
}

function findPDA(seeds: Buffer[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, SSS_TOKEN_PROGRAM_ID);
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 SSS SDK Playground (${CLUSTER})\n`);
  const connection = new Connection(RPC_URL, "confirmed");

  // Generate keypairs
  const authority = Keypair.generate();
  const minter = Keypair.generate();
  const recipient = Keypair.generate();
  const mintKeypair = Keypair.generate();

  // Fund accounts
  console.log("Funding accounts...");
  for (const kp of [authority, minter, recipient]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  // ── Step 1: Initialize Stablecoin ─────────────────────────────────
  console.log("\n[1] Initialize SSS-1 Stablecoin");
  const [stablecoinPDA] = findPDA([Buffer.from("stablecoin"), mintKeypair.publicKey.toBuffer()]);
  const [authorityRole] = findPDA([Buffer.from("role"), stablecoinPDA.toBuffer(), authority.publicKey.toBuffer()]);

  const initData = Buffer.concat([
    disc("initialize"),
    str("Playground USD"),
    str("pUSD"),
    str(""),
    Buffer.from([6]),    // decimals
    Buffer.from([0]),    // permanent delegate
    Buffer.from([0]),    // transfer hook
    Buffer.from([0]),    // default frozen
    u64(BigInt(1_000_000_000_000)), // max supply: 1M tokens (6 decimals)
  ]);

  const initIx = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: stablecoinPDA, isSigner: false, isWritable: true },
      { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: authorityRole, isSigner: false, isWritable: true },
      { pubkey: SSS_HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: initData,
  });

  const initSig = await sendAndConfirmTransaction(connection, new Transaction().add(initIx), [authority, mintKeypair]);
  console.log(`  Mint: ${mintKeypair.publicKey.toBase58()}`);
  console.log(`  PDA:  ${stablecoinPDA.toBase58()}`);
  console.log(`  Tx:   ${initSig}`);

  // ── Step 2: Assign Minter Role ────────────────────────────────────
  console.log("\n[2] Assign minter role");
  const [minterRole] = findPDA([Buffer.from("role"), stablecoinPDA.toBuffer(), minter.publicKey.toBuffer()]);

  const rolesData = Buffer.concat([
    disc("update_roles"),
    Buffer.from([1, 1, 0, 0, 0]), // minter + burner
  ]);

  const rolesIx = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: stablecoinPDA, isSigner: false, isWritable: false },
      { pubkey: minterRole, isSigner: false, isWritable: true },
      { pubkey: minter.publicKey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: rolesData,
  });
  await sendAndConfirmTransaction(connection, new Transaction().add(rolesIx), [authority]);
  console.log(`  Minter: ${minter.publicKey.toBase58()}`);

  // ── Step 3: Set Minter Quota ──────────────────────────────────────
  console.log("\n[3] Set minter quota (500k tokens, 1-hour epoch)");
  const [minterInfo] = findPDA([Buffer.from("minter"), stablecoinPDA.toBuffer(), minter.publicKey.toBuffer()]);

  const quotaData = Buffer.concat([
    disc("update_minter"),
    u64(BigInt(500_000_000_000)), // 500k tokens
    Buffer.from([1]),             // Some
    (() => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(3600)); return b; })(), // 1 hour epoch
  ]);

  const quotaIx = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: stablecoinPDA, isSigner: false, isWritable: false },
      { pubkey: minterInfo, isSigner: false, isWritable: true },
      { pubkey: minter.publicKey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: quotaData,
  });
  await sendAndConfirmTransaction(connection, new Transaction().add(quotaIx), [authority]);
  console.log("  Quota set successfully");

  // ── Step 4: Mint Tokens ───────────────────────────────────────────
  console.log("\n[4] Mint 1000 tokens to recipient");
  const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress } = await import("@solana/spl-token");

  const recipientATA = await getAssociatedTokenAddress(
    mintKeypair.publicKey, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID
  );

  const createAtaIx = createAssociatedTokenAccountInstruction(
    authority.publicKey, recipientATA, recipient.publicKey, mintKeypair.publicKey, TOKEN_2022_PROGRAM_ID
  );

  const mintData = Buffer.concat([disc("mint_tokens"), u64(BigInt(1_000_000_000))]);
  const mintIx = new TransactionInstruction({
    keys: [
      { pubkey: minter.publicKey, isSigner: true, isWritable: false },
      { pubkey: stablecoinPDA, isSigner: false, isWritable: true },
      { pubkey: minterRole, isSigner: false, isWritable: false },
      { pubkey: minterInfo, isSigner: false, isWritable: true },
      { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: true },
      { pubkey: recipientATA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: mintData,
  });

  await sendAndConfirmTransaction(connection, new Transaction().add(createAtaIx), [authority]);
  const mintSig = await sendAndConfirmTransaction(connection, new Transaction().add(mintIx), [minter]);
  const balance = await connection.getTokenAccountBalance(recipientATA);
  console.log(`  Recipient: ${recipient.publicKey.toBase58()}`);
  console.log(`  Balance:   ${balance.value.uiAmountString} pUSD`);
  console.log(`  Tx:        ${mintSig}`);

  // ── Step 5: Pause / Unpause ───────────────────────────────────────
  console.log("\n[5] Pause and unpause");
  const pauseIx = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: stablecoinPDA, isSigner: false, isWritable: true },
      { pubkey: authorityRole, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: disc("pause"),
  });
  await sendAndConfirmTransaction(connection, new Transaction().add(pauseIx), [authority]);
  console.log("  Paused");

  const unpauseIx = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: stablecoinPDA, isSigner: false, isWritable: true },
      { pubkey: authorityRole, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: disc("unpause"),
  });
  await sendAndConfirmTransaction(connection, new Transaction().add(unpauseIx), [authority]);
  console.log("  Unpaused");

  // ── Step 6: Update Supply Cap ─────────────────────────────────────
  console.log("\n[6] Update supply cap to 2M tokens");
  const supplyCapData = Buffer.concat([disc("update_supply_cap"), u64(BigInt(2_000_000_000_000))]);
  const supplyCapIx = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: stablecoinPDA, isSigner: false, isWritable: true },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: supplyCapData,
  });
  await sendAndConfirmTransaction(connection, new Transaction().add(supplyCapIx), [authority]);
  console.log("  Supply cap updated to 2,000,000 pUSD");

  console.log("\n✅ Playground complete! All features exercised successfully.\n");
}

main().catch((err) => {
  console.error("Playground failed:", err);
  process.exit(1);
});
