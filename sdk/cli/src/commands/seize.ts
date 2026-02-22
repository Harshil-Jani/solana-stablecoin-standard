import { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as crypto from "crypto";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { loadKeypair, getConnection, PROGRAM_ID, TOKEN_2022_PROGRAM_ID, STABLECOIN_SEED, ROLE_SEED } from "../config";

function disc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export const command = "seize";
export const describe = "Seize tokens from an account via permanent delegate (SSS-2)";

export function builder(yargs: Argv) {
  return yargs
    .option("mint", { alias: "m", type: "string", demandOption: true, description: "Mint address" })
    .option("source", { type: "string", demandOption: true, description: "Source token account" })
    .option("destination", { type: "string", demandOption: true, description: "Destination token account" });
}

export async function handler(argv: ArgumentsCamelCase) {
  const connection = getConnection(argv["rpc-url"] as string);
  const seizer = loadKeypair(argv.keypair as string);
  const mintPubkey = new PublicKey(argv.mint as string);
  const programId = new PublicKey(PROGRAM_ID);

  const [stablecoinPda] = PublicKey.findProgramAddressSync([STABLECOIN_SEED, mintPubkey.toBuffer()], programId);
  const [rolePda] = PublicKey.findProgramAddressSync([ROLE_SEED, stablecoinPda.toBuffer(), seizer.publicKey.toBuffer()], programId);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: seizer.publicKey, isSigner: true, isWritable: false },
      { pubkey: stablecoinPda, isSigner: false, isWritable: false },
      { pubkey: rolePda, isSigner: false, isWritable: false },
      { pubkey: mintPubkey, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(argv.source as string), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(argv.destination as string), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(TOKEN_2022_PROGRAM_ID), isSigner: false, isWritable: false },
    ],
    programId,
    data: disc("seize"),
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [seizer]);

  console.log(`\nTokens seized!`);
  console.log(`  Source:      ${argv.source}`);
  console.log(`  Destination: ${argv.destination}`);
  console.log(`  Tx:          ${sig}`);
}
