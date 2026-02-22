import { PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as crypto from "crypto";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { loadKeypair, getConnection, PROGRAM_ID, STABLECOIN_SEED, ROLE_SEED } from "../config";

function disc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export const command = "roles";
export const describe = "Update roles for an account (authority only)";

export function builder(yargs: Argv) {
  return yargs
    .option("mint", { alias: "m", type: "string", demandOption: true, description: "Mint address" })
    .option("holder", { type: "string", demandOption: true, description: "Role holder public key" })
    .option("minter", { type: "boolean", default: false })
    .option("burner", { type: "boolean", default: false })
    .option("pauser", { type: "boolean", default: false })
    .option("blacklister", { type: "boolean", default: false })
    .option("seizer", { type: "boolean", default: false });
}

export async function handler(argv: ArgumentsCamelCase) {
  const connection = getConnection(argv["rpc-url"] as string);
  const authority = loadKeypair(argv.keypair as string);
  const mintPubkey = new PublicKey(argv.mint as string);
  const holderPubkey = new PublicKey(argv.holder as string);
  const programId = new PublicKey(PROGRAM_ID);

  const [stablecoinPda] = PublicKey.findProgramAddressSync([STABLECOIN_SEED, mintPubkey.toBuffer()], programId);
  const [rolePda] = PublicKey.findProgramAddressSync([ROLE_SEED, stablecoinPda.toBuffer(), holderPubkey.toBuffer()], programId);

  const data = Buffer.concat([
    disc("update_roles"),
    Buffer.from([
      argv.minter ? 1 : 0,
      argv.burner ? 1 : 0,
      argv.pauser ? 1 : 0,
      argv.blacklister ? 1 : 0,
      argv.seizer ? 1 : 0,
    ]),
  ]);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: stablecoinPda, isSigner: false, isWritable: false },
      { pubkey: rolePda, isSigner: false, isWritable: true },
      { pubkey: holderPubkey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [authority]);

  console.log(`\nRoles updated for ${holderPubkey.toBase58()}`);
  console.log(`  Minter: ${!!argv.minter}, Burner: ${!!argv.burner}, Pauser: ${!!argv.pauser}`);
  console.log(`  Blacklister: ${!!argv.blacklister}, Seizer: ${!!argv.seizer}`);
  console.log(`  Tx: ${sig}`);
}
