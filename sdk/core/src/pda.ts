import { PublicKey } from "@solana/web3.js";
import { SSS_TOKEN_PROGRAM_ID } from "./types";

const STABLECOIN_SEED = Buffer.from("stablecoin");
const ROLE_SEED = Buffer.from("role");
const MINTER_SEED = Buffer.from("minter");
const BLACKLIST_SEED = Buffer.from("blacklist");

export function findStablecoinPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [STABLECOIN_SEED, mint.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findRolePDA(
  stablecoin: PublicKey,
  holder: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, stablecoin.toBuffer(), holder.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findMinterPDA(
  stablecoin: PublicKey,
  minter: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINTER_SEED, stablecoin.toBuffer(), minter.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findBlacklistPDA(
  stablecoin: PublicKey,
  address: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, stablecoin.toBuffer(), address.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}
