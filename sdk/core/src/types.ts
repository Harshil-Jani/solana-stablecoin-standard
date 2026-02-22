import { PublicKey } from "@solana/web3.js";

// ── Program IDs ──────────────────────────────────────────────────────

export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ"
);
export const SSS_HOOK_PROGRAM_ID = new PublicKey(
  "F2of7agMFET8v3verXe3e6Hmfd71t833RjPxEjs5wRdd"
);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

// ── On-chain Account Types ──────────────────────────────────────────

export interface StablecoinState {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  paused: boolean;
  totalMinted: bigint;
  totalBurned: bigint;
  maxSupply: bigint;
  bump: number;
}

export interface RoleFlags {
  isMinter: boolean;
  isBurner: boolean;
  isPauser: boolean;
  isBlacklister: boolean;
  isSeizer: boolean;
}

export interface RoleAccount {
  stablecoin: PublicKey;
  holder: PublicKey;
  roles: RoleFlags;
  bump: number;
}

export interface MinterInfo {
  stablecoin: PublicKey;
  minter: PublicKey;
  quota: bigint;
  mintedAmount: bigint;
  epochDuration: bigint;
  epochStart: bigint;
  mintedThisEpoch: bigint;
  bump: number;
}

export interface BlacklistEntry {
  stablecoin: PublicKey;
  address: PublicKey;
  reason: string;
  blacklistedAt: bigint;
  blacklistedBy: PublicKey;
  bump: number;
}

// ── Initialization Config ───────────────────────────────────────────

export interface StablecoinConfig {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  maxSupply?: bigint;
}

// ── Governance Types ──────────────────────────────────────────────

export enum InstructionType {
  Pause = 0,
  Unpause = 1,
  UpdateRoles = 2,
  UpdateMinter = 3,
  TransferAuthority = 4,
  AddToBlacklist = 5,
  RemoveFromBlacklist = 6,
  UpdateSupplyCap = 7,
  ConfigureTransferLimits = 8,
}

export interface MultisigConfig {
  stablecoin: PublicKey;
  signers: PublicKey[];
  threshold: number;
  proposalCount: bigint;
  bump: number;
}

export interface Proposal {
  stablecoin: PublicKey;
  proposalId: bigint;
  proposer: PublicKey;
  instructionType: InstructionType;
  data: Uint8Array;
  approvals: boolean[];
  approvalCount: number;
  executed: boolean;
  cancelled: boolean;
  createdAt: bigint;
  bump: number;
}

export interface TimelockConfig {
  stablecoin: PublicKey;
  delay: bigint;
  enabled: boolean;
  bump: number;
}

export interface TimelockOperation {
  stablecoin: PublicKey;
  opId: bigint;
  opType: InstructionType;
  data: Uint8Array;
  eta: bigint;
  proposer: PublicKey;
  executed: boolean;
  cancelled: boolean;
  bump: number;
}

export interface TransferLimitConfig {
  stablecoin: PublicKey;
  maxPerTx: bigint;
  maxPerDay: bigint;
  dailyTransferred: bigint;
  dayStart: bigint;
  bump: number;
}

// ── Event Types ─────────────────────────────────────────────────────

export type StablecoinEvent =
  | { type: "StablecoinInitialized"; stablecoin: PublicKey; mint: PublicKey; authority: PublicKey; name: string; symbol: string; isSss2: boolean; timestamp: bigint }
  | { type: "TokensMinted"; stablecoin: PublicKey; minter: PublicKey; recipient: PublicKey; amount: bigint; totalMinted: bigint; timestamp: bigint }
  | { type: "TokensBurned"; stablecoin: PublicKey; burner: PublicKey; amount: bigint; totalBurned: bigint; timestamp: bigint }
  | { type: "AccountFrozen"; stablecoin: PublicKey; account: PublicKey; frozenBy: PublicKey; timestamp: bigint }
  | { type: "AccountThawed"; stablecoin: PublicKey; account: PublicKey; thawedBy: PublicKey; timestamp: bigint }
  | { type: "StablecoinPaused"; stablecoin: PublicKey; pausedBy: PublicKey; timestamp: bigint }
  | { type: "StablecoinUnpaused"; stablecoin: PublicKey; unpausedBy: PublicKey; timestamp: bigint }
  | { type: "RolesUpdated"; stablecoin: PublicKey; holder: PublicKey; roles: RoleFlags; updatedBy: PublicKey; timestamp: bigint }
  | { type: "MinterUpdated"; stablecoin: PublicKey; minter: PublicKey; newQuota: bigint; updatedBy: PublicKey; timestamp: bigint }
  | { type: "AuthorityTransferred"; stablecoin: PublicKey; previousAuthority: PublicKey; newAuthority: PublicKey; timestamp: bigint }
  | { type: "AddedToBlacklist"; stablecoin: PublicKey; address: PublicKey; reason: string; blacklistedBy: PublicKey; timestamp: bigint }
  | { type: "RemovedFromBlacklist"; stablecoin: PublicKey; address: PublicKey; removedBy: PublicKey; timestamp: bigint }
  | { type: "TokensSeized"; stablecoin: PublicKey; from: PublicKey; to: PublicKey; amount: bigint; seizedBy: PublicKey; timestamp: bigint };
