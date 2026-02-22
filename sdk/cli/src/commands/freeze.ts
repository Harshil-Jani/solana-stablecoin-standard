import { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as crypto from "crypto";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { loadKeypair, getConnection, PROGRAM_ID, TOKEN_2022_PROGRAM_ID, STABLECOIN_SEED, ROLE_SEED } from "../config";

function disc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export const command = "freeze";
export const describe = "Freeze or thaw a token account";

export function builder(yargs: Argv) {
  return yargs
    .option("mint", { alias: "m", type: "string", demandOption: true, description: "Mint address" })
    .option("account", { type: "string", demandOption: true, description: "Token account to freeze/thaw" })
    .option("thaw", { type: "boolean", default: false, description: "Thaw instead of freeze" });
}

export async function handler(argv: ArgumentsCamelCase) {
  const connection = getConnection(argv["rpc-url"] as string);
  const authority = loadKeypair(argv.keypair as string);
  const mintPubkey = new PublicKey(argv.mint as string);
  const programId = new PublicKey(PROGRAM_ID);
  const isThaw = argv.thaw as boolean;

  const [stablecoinPda] = PublicKey.findProgramAddressSync([STABLECOIN_SEED, mintPubkey.toBuffer()], programId);
  const [rolePda] = PublicKey.findProgramAddressSync([ROLE_SEED, stablecoinPda.toBuffer(), authority.publicKey.toBuffer()], programId);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: stablecoinPda, isSigner: false, isWritable: false },
      { pubkey: rolePda, isSigner: false, isWritable: false },
      { pubkey: mintPubkey, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(argv.account as string), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(TOKEN_2022_PROGRAM_ID), isSigner: false, isWritable: false },
    ],
    programId,
    data: disc(isThaw ? "thaw_account" : "freeze_account"),
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [authority]);

  console.log(`\nAccount ${isThaw ? "thawed" : "frozen"}!`);
  console.log(`  Account: ${argv.account}`);
  console.log(`  Tx:      ${sig}`);
}
