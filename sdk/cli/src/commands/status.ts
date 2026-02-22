import { PublicKey } from "@solana/web3.js";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { getConnection, PROGRAM_ID, STABLECOIN_SEED } from "../config";

export const command = "status";
export const describe = "Display stablecoin status and metadata";

export function builder(yargs: Argv) {
  return yargs
    .option("mint", { alias: "m", type: "string", demandOption: true, description: "Mint address" });
}

export async function handler(argv: ArgumentsCamelCase) {
  const connection = getConnection(argv["rpc-url"] as string);
  const mintPubkey = new PublicKey(argv.mint as string);
  const programId = new PublicKey(PROGRAM_ID);

  const [stablecoinPda] = PublicKey.findProgramAddressSync([STABLECOIN_SEED, mintPubkey.toBuffer()], programId);
  const info = await connection.getAccountInfo(stablecoinPda);

  if (!info) {
    console.error("Stablecoin account not found. Is the mint address correct?");
    process.exit(1);
  }

  // Skip 8-byte discriminator, then decode fields
  const data = info.data;
  let offset = 8;

  const authority = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const mint = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;

  const nameLen = data.readUInt32LE(offset); offset += 4;
  const name = data.subarray(offset, offset + nameLen).toString("utf-8"); offset += nameLen;

  const symbolLen = data.readUInt32LE(offset); offset += 4;
  const symbol = data.subarray(offset, offset + symbolLen).toString("utf-8"); offset += symbolLen;

  const uriLen = data.readUInt32LE(offset); offset += 4;
  const uri = data.subarray(offset, offset + uriLen).toString("utf-8"); offset += uriLen;

  const decimals = data.readUInt8(offset); offset += 1;
  const enablePermanentDelegate = data.readUInt8(offset) === 1; offset += 1;
  const enableTransferHook = data.readUInt8(offset) === 1; offset += 1;
  const defaultAccountFrozen = data.readUInt8(offset) === 1; offset += 1;
  const paused = data.readUInt8(offset) === 1; offset += 1;
  const totalMinted = data.readBigUInt64LE(offset); offset += 8;
  const totalBurned = data.readBigUInt64LE(offset); offset += 8;

  const isSss2 = enablePermanentDelegate && enableTransferHook;

  console.log(`\n=== ${name} (${symbol}) ===`);
  console.log(`  Preset:     ${isSss2 ? "SSS-2 (Compliant)" : "SSS-1 (Minimal)"}`);
  console.log(`  Mint:       ${mint.toBase58()}`);
  console.log(`  Authority:  ${authority.toBase58()}`);
  console.log(`  Decimals:   ${decimals}`);
  console.log(`  URI:        ${uri || "(none)"}`);
  console.log(`  Paused:     ${paused}`);
  console.log(`  Minted:     ${totalMinted.toString()}`);
  console.log(`  Burned:     ${totalBurned.toString()}`);
  console.log(`  Supply:     ${(totalMinted - totalBurned).toString()}`);
  if (isSss2) {
    console.log(`  Permanent Delegate: true`);
    console.log(`  Transfer Hook:      true`);
    console.log(`  Default Frozen:     ${defaultAccountFrozen}`);
  }
}
