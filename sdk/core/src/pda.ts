import { PublicKey } from "@solana/web3.js";
import { SSS_TOKEN_PROGRAM_ID } from "./types";

const STABLECOIN_SEED = Buffer.from("stablecoin");
const ROLE_SEED = Buffer.from("role");
const MINTER_SEED = Buffer.from("minter");
const BLACKLIST_SEED = Buffer.from("blacklist");
const MULTISIG_SEED = Buffer.from("multisig");
const PROPOSAL_SEED = Buffer.from("proposal");
const TIMELOCK_CONFIG_SEED = Buffer.from("timelock_config");
const TIMELOCK_SEED = Buffer.from("timelock");
const TRANSFER_LIMIT_SEED = Buffer.from("transfer_limit");

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

export function findMultisigPDA(
  stablecoin: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MULTISIG_SEED, stablecoin.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findProposalPDA(
  stablecoin: PublicKey,
  proposalId: bigint
): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(proposalId);
  return PublicKey.findProgramAddressSync(
    [PROPOSAL_SEED, stablecoin.toBuffer(), idBuf],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findTimelockConfigPDA(
  stablecoin: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TIMELOCK_CONFIG_SEED, stablecoin.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findTimelockPDA(
  stablecoin: PublicKey,
  opId: bigint
): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(opId);
  return PublicKey.findProgramAddressSync(
    [TIMELOCK_SEED, stablecoin.toBuffer(), idBuf],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findTransferLimitPDA(
  stablecoin: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TRANSFER_LIMIT_SEED, stablecoin.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}
