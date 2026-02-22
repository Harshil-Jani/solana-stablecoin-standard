import { PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as crypto from "crypto";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { loadKeypair, getConnection, PROGRAM_ID, STABLECOIN_SEED, MINTER_SEED } from "../config";

function disc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export const command = "minters";
export const describe = "Update minter quota (authority only)";

export function builder(yargs: Argv) {
  return yargs
    .option("mint", { alias: "m", type: "string", demandOption: true, description: "Mint address" })
    .option("minter", { type: "string", demandOption: true, description: "Minter public key" })
    .option("quota", { type: "string", demandOption: true, description: "Minting quota (base units)" });
}

export async function handler(argv: ArgumentsCamelCase) {
  const connection = getConnection(argv["rpc-url"] as string);
  const authority = loadKeypair(argv.keypair as string);
  const mintPubkey = new PublicKey(argv.mint as string);
  const minterPubkey = new PublicKey(argv.minter as string);
  const programId = new PublicKey(PROGRAM_ID);

  const [stablecoinPda] = PublicKey.findProgramAddressSync([STABLECOIN_SEED, mintPubkey.toBuffer()], programId);
  const [minterInfoPda] = PublicKey.findProgramAddressSync([MINTER_SEED, stablecoinPda.toBuffer(), minterPubkey.toBuffer()], programId);

  const quotaBuf = Buffer.alloc(8);
  quotaBuf.writeBigUInt64LE(BigInt(argv.quota as string));
  const data = Buffer.concat([disc("update_minter"), quotaBuf]);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: stablecoinPda, isSigner: false, isWritable: false },
      { pubkey: minterInfoPda, isSigner: false, isWritable: true },
      { pubkey: minterPubkey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [authority]);

  console.log(`\nMinter quota updated!`);
  console.log(`  Minter: ${minterPubkey.toBase58()}`);
  console.log(`  Quota:  ${argv.quota}`);
  console.log(`  Tx:     ${sig}`);
}
