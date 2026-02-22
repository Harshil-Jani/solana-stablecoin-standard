import { Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const DEFAULT_KEYPAIR_PATH = path.join(
  process.env.HOME || "~",
  ".config",
  "solana",
  "id.json"
);

export const PROGRAM_ID = "2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ";
export const HOOK_PROGRAM_ID = "F2of7agMFET8v3verXe3e6Hmfd71t833RjPxEjs5wRdd";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export const STABLECOIN_SEED = Buffer.from("stablecoin");
export const ROLE_SEED = Buffer.from("role");
export const MINTER_SEED = Buffer.from("minter");
export const BLACKLIST_SEED = Buffer.from("blacklist");

export function loadKeypair(keypairPath?: string): Keypair {
  const resolved = keypairPath || DEFAULT_KEYPAIR_PATH;
  const expanded = resolved.replace(/^~/, process.env.HOME || "~");
  const raw = fs.readFileSync(expanded, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export function getConnection(rpcUrl?: string): Connection {
  return new Connection(rpcUrl || "http://localhost:8899", "confirmed");
}

export const globalOptions = {
  keypair: { alias: "k" as const, type: "string" as const, description: "Path to keypair file", default: DEFAULT_KEYPAIR_PATH },
  "rpc-url": { alias: "u" as const, type: "string" as const, description: "Solana RPC URL", default: "http://localhost:8899" },
  mint: { alias: "m" as const, type: "string" as const, description: "Stablecoin mint address", demandOption: true as const },
};
