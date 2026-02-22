import { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as crypto from "crypto";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { loadKeypair, getConnection, PROGRAM_ID, TOKEN_2022_PROGRAM_ID, STABLECOIN_SEED, ROLE_SEED, MINTER_SEED } from "../config";

function disc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export const command = "mint";
export const describe = "Mint tokens to a recipient";

export function builder(yargs: Argv) {
  return yargs
    .option("mint", { alias: "m", type: "string", demandOption: true, description: "Mint address" })
    .option("to", { type: "string", demandOption: true, description: "Recipient token account" })
    .option("amount", { type: "string", demandOption: true, description: "Amount (base units)" });
}

export async function handler(argv: ArgumentsCamelCase) {
  const connection = getConnection(argv["rpc-url"] as string);
  const minter = loadKeypair(argv.keypair as string);
  const mintPubkey = new PublicKey(argv.mint as string);
  const programId = new PublicKey(PROGRAM_ID);

  const [stablecoinPda] = PublicKey.findProgramAddressSync([STABLECOIN_SEED, mintPubkey.toBuffer()], programId);
  const [rolePda] = PublicKey.findProgramAddressSync([ROLE_SEED, stablecoinPda.toBuffer(), minter.publicKey.toBuffer()], programId);
  const [minterInfoPda] = PublicKey.findProgramAddressSync([MINTER_SEED, stablecoinPda.toBuffer(), minter.publicKey.toBuffer()], programId);

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(BigInt(argv.amount as string));
  const data = Buffer.concat([disc("mint_tokens"), amountBuf]);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: minter.publicKey, isSigner: true, isWritable: false },
      { pubkey: stablecoinPda, isSigner: false, isWritable: true },
      { pubkey: rolePda, isSigner: false, isWritable: false },
      { pubkey: minterInfoPda, isSigner: false, isWritable: true },
      { pubkey: mintPubkey, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(argv.to as string), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(TOKEN_2022_PROGRAM_ID), isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [minter]);

  console.log(`\nTokens minted!`);
  console.log(`  Amount: ${argv.amount}`);
  console.log(`  To:     ${argv.to}`);
  console.log(`  Tx:     ${sig}`);
}
