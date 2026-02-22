import { PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as crypto from "crypto";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { loadKeypair, getConnection, PROGRAM_ID, STABLECOIN_SEED, ROLE_SEED, BLACKLIST_SEED } from "../config";

function disc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export const command = "blacklist";
export const describe = "Add or remove address from blacklist (SSS-2)";

export function builder(yargs: Argv) {
  return yargs
    .option("mint", { alias: "m", type: "string", demandOption: true, description: "Mint address" })
    .option("action", { type: "string", choices: ["add", "remove"] as const, demandOption: true })
    .option("address", { type: "string", demandOption: true, description: "Address to blacklist" })
    .option("reason", { type: "string", default: "", description: "Reason for blacklisting" });
}

export async function handler(argv: ArgumentsCamelCase) {
  const connection = getConnection(argv["rpc-url"] as string);
  const blacklister = loadKeypair(argv.keypair as string);
  const mintPubkey = new PublicKey(argv.mint as string);
  const targetAddress = new PublicKey(argv.address as string);
  const programId = new PublicKey(PROGRAM_ID);
  const isAdd = argv.action === "add";

  const [stablecoinPda] = PublicKey.findProgramAddressSync([STABLECOIN_SEED, mintPubkey.toBuffer()], programId);
  const [rolePda] = PublicKey.findProgramAddressSync([ROLE_SEED, stablecoinPda.toBuffer(), blacklister.publicKey.toBuffer()], programId);
  const [blacklistPda] = PublicKey.findProgramAddressSync([BLACKLIST_SEED, stablecoinPda.toBuffer(), targetAddress.toBuffer()], programId);

  let data: Buffer;
  if (isAdd) {
    const reasonBytes = Buffer.from((argv.reason as string) || "", "utf-8");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(reasonBytes.length);
    data = Buffer.concat([disc("add_to_blacklist"), lenBuf, reasonBytes]);
  } else {
    data = disc("remove_from_blacklist");
  }

  const keys = [
    { pubkey: blacklister.publicKey, isSigner: true, isWritable: true },
    { pubkey: stablecoinPda, isSigner: false, isWritable: false },
    { pubkey: rolePda, isSigner: false, isWritable: false },
    { pubkey: blacklistPda, isSigner: false, isWritable: true },
    { pubkey: targetAddress, isSigner: false, isWritable: false },
    ...(isAdd ? [{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }] : []),
  ];

  const ix = new TransactionInstruction({ keys, programId, data });
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [blacklister]);

  console.log(`\nAddress ${isAdd ? "added to" : "removed from"} blacklist!`);
  console.log(`  Address: ${targetAddress.toBase58()}`);
  if (isAdd) console.log(`  Reason:  ${argv.reason || "(none)"}`);
  console.log(`  Tx:      ${sig}`);
}
