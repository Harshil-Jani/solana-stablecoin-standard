import { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as crypto from "crypto";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { loadKeypair, getConnection, PROGRAM_ID, STABLECOIN_SEED, ROLE_SEED } from "../config";

function disc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export const command = "pause";
export const describe = "Pause or unpause the stablecoin";

export function builder(yargs: Argv) {
  return yargs
    .option("mint", { alias: "m", type: "string", demandOption: true, description: "Mint address" })
    .option("unpause", { type: "boolean", default: false, description: "Unpause instead of pause" });
}

export async function handler(argv: ArgumentsCamelCase) {
  const connection = getConnection(argv["rpc-url"] as string);
  const authority = loadKeypair(argv.keypair as string);
  const mintPubkey = new PublicKey(argv.mint as string);
  const programId = new PublicKey(PROGRAM_ID);
  const isUnpause = argv.unpause as boolean;

  const [stablecoinPda] = PublicKey.findProgramAddressSync([STABLECOIN_SEED, mintPubkey.toBuffer()], programId);
  const [rolePda] = PublicKey.findProgramAddressSync([ROLE_SEED, stablecoinPda.toBuffer(), authority.publicKey.toBuffer()], programId);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: stablecoinPda, isSigner: false, isWritable: true },
      { pubkey: rolePda, isSigner: false, isWritable: false },
    ],
    programId,
    data: disc(isUnpause ? "unpause" : "pause"),
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [authority]);

  console.log(`\nStablecoin ${isUnpause ? "unpaused" : "paused"}!`);
  console.log(`  Mint: ${mintPubkey.toBase58()}`);
  console.log(`  Tx:   ${sig}`);
}
