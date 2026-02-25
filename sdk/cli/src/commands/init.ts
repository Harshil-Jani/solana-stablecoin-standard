import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as crypto from "crypto";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { loadKeypair, getConnection, PROGRAM_ID, HOOK_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, STABLECOIN_SEED, ROLE_SEED } from "../config";

function disc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function str(s: string): Buffer {
  const b = Buffer.from(s, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length);
  return Buffer.concat([len, b]);
}

export const command = "init";
export const describe = "Initialize a new stablecoin";

export function builder(yargs: Argv) {
  return yargs
    .option("name", { type: "string", demandOption: true, description: "Token name (max 32 chars)" })
    .option("symbol", { type: "string", demandOption: true, description: "Token symbol (max 10 chars)" })
    .option("uri", { type: "string", default: "", description: "Metadata URI" })
    .option("decimals", { type: "number", default: 6, description: "Token decimals" })
    .option("sss2", { type: "boolean", default: false, description: "Enable SSS-2 compliance (permanent delegate + transfer hook + frozen accounts)" });
}

export async function handler(argv: ArgumentsCamelCase) {
  const connection = getConnection(argv["rpc-url"] as string);
  const authority = loadKeypair(argv.keypair as string);
  const mintKeypair = Keypair.generate();
  const programId = new PublicKey(PROGRAM_ID);
  const isSss2 = argv.sss2 as boolean;

  const [stablecoinPda] = PublicKey.findProgramAddressSync([STABLECOIN_SEED, mintKeypair.publicKey.toBuffer()], programId);
  const [authorityRole] = PublicKey.findProgramAddressSync([ROLE_SEED, stablecoinPda.toBuffer(), authority.publicKey.toBuffer()], programId);

  // max_supply: u64 (0 = no cap)
  const maxSupplyBuf = Buffer.alloc(8);
  maxSupplyBuf.writeBigUInt64LE(BigInt(0));

  const data = Buffer.concat([
    disc("initialize"),
    str(argv.name as string),
    str(argv.symbol as string),
    str(argv.uri as string),
    Buffer.from([argv.decimals as number]),
    Buffer.from([isSss2 ? 1 : 0]),
    Buffer.from([isSss2 ? 1 : 0]),
    Buffer.from([isSss2 ? 1 : 0]),
    maxSupplyBuf,
  ]);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: stablecoinPda, isSigner: false, isWritable: true },
      { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: authorityRole, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(HOOK_PROGRAM_ID), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(TOKEN_2022_PROGRAM_ID), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [authority, mintKeypair]);

  console.log(`\nStablecoin initialized!`);
  console.log(`  Preset:     ${isSss2 ? "SSS-2 (Compliant)" : "SSS-1 (Minimal)"}`);
  console.log(`  Mint:       ${mintKeypair.publicKey.toBase58()}`);
  console.log(`  Stablecoin: ${stablecoinPda.toBase58()}`);
  console.log(`  Authority:  ${authority.publicKey.toBase58()}`);
  console.log(`  Tx:         ${sig}`);
}
