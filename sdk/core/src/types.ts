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
