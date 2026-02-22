import { Connection, PublicKey } from "@solana/web3.js";
import * as crypto from "crypto";
import { insertEvent, insertOperation } from "../db/schema";
import type { WebhookService } from "./webhook";

const PROGRAM_ID = new PublicKey("2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ");

// ── Event discriminator map ───────────────────────────────────────────
// Anchor events use sha256("event:<EventName>")[0..8] as discriminator

const EVENT_NAMES = [
  "StablecoinInitialized",
  "TokensMinted",
  "TokensBurned",
  "AccountFrozen",
  "AccountThawed",
  "StablecoinPaused",
  "StablecoinUnpaused",
  "RolesUpdated",
  "MinterUpdated",
  "AuthorityTransferred",
  "AddedToBlacklist",
  "RemovedFromBlacklist",
  "TokensSeized",
] as const;

type EventName = (typeof EVENT_NAMES)[number];

const DISCRIMINATOR_MAP = new Map<string, EventName>();
for (const name of EVENT_NAMES) {
  const hash = crypto.createHash("sha256").update(`event:${name}`).digest();
  const disc = hash.subarray(0, 8).toString("hex");
  DISCRIMINATOR_MAP.set(disc, name);
}

// ── Borsh deserialization helpers ─────────────────────────────────────

function readPubkey(data: Buffer, offset: number): [string, number] {
  const key = new PublicKey(data.subarray(offset, offset + 32));
  return [key.toBase58(), offset + 32];
}

function readU64(data: Buffer, offset: number): [string, number] {
  const val = data.readBigUInt64LE(offset);
  return [val.toString(), offset + 8];
}

function readI64(data: Buffer, offset: number): [string, number] {
  const val = data.readBigInt64LE(offset);
  return [val.toString(), offset + 8];
}

function readBool(data: Buffer, offset: number): [boolean, number] {
  return [data[offset] !== 0, offset + 1];
}

function readString(data: Buffer, offset: number): [string, number] {
  const len = data.readUInt32LE(offset);
  const str = data.subarray(offset + 4, offset + 4 + len).toString("utf-8");
  return [str, offset + 4 + len];
}

// ── Event decoders ────────────────────────────────────────────────────

interface DecodedEvent {
  type: EventName;
  fields: Record<string, unknown>;
}

function decodeEvent(name: EventName, data: Buffer): Record<string, unknown> {
  let offset = 0;
  const fields: Record<string, unknown> = {};

  switch (name) {
    case "StablecoinInitialized": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.mint, offset] = readPubkey(data, offset);
      [fields.authority, offset] = readPubkey(data, offset);
      [fields.name, offset] = readString(data, offset);
      [fields.symbol, offset] = readString(data, offset);
      [fields.is_sss2, offset] = readBool(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "TokensMinted": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.minter, offset] = readPubkey(data, offset);
      [fields.recipient, offset] = readPubkey(data, offset);
      [fields.amount, offset] = readU64(data, offset);
      [fields.total_minted, offset] = readU64(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "TokensBurned": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.burner, offset] = readPubkey(data, offset);
      [fields.amount, offset] = readU64(data, offset);
      [fields.total_burned, offset] = readU64(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "AccountFrozen": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.account, offset] = readPubkey(data, offset);
      [fields.frozen_by, offset] = readPubkey(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "AccountThawed": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.account, offset] = readPubkey(data, offset);
      [fields.thawed_by, offset] = readPubkey(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "StablecoinPaused": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.paused_by, offset] = readPubkey(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "StablecoinUnpaused": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.unpaused_by, offset] = readPubkey(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "RolesUpdated": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.holder, offset] = readPubkey(data, offset);
      [fields.is_minter, offset] = readBool(data, offset);
      [fields.is_burner, offset] = readBool(data, offset);
      [fields.is_pauser, offset] = readBool(data, offset);
      [fields.is_blacklister, offset] = readBool(data, offset);
      [fields.is_seizer, offset] = readBool(data, offset);
      [fields.updated_by, offset] = readPubkey(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "MinterUpdated": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.minter, offset] = readPubkey(data, offset);
      [fields.new_quota, offset] = readU64(data, offset);
      [fields.updated_by, offset] = readPubkey(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "AuthorityTransferred": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.previous_authority, offset] = readPubkey(data, offset);
      [fields.new_authority, offset] = readPubkey(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "AddedToBlacklist": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.address, offset] = readPubkey(data, offset);
      [fields.reason, offset] = readString(data, offset);
      [fields.blacklisted_by, offset] = readPubkey(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "RemovedFromBlacklist": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.address, offset] = readPubkey(data, offset);
      [fields.removed_by, offset] = readPubkey(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
    case "TokensSeized": {
      [fields.stablecoin, offset] = readPubkey(data, offset);
      [fields.from, offset] = readPubkey(data, offset);
      [fields.to, offset] = readPubkey(data, offset);
      [fields.amount, offset] = readU64(data, offset);
      [fields.seized_by, offset] = readPubkey(data, offset);
      [fields.timestamp, offset] = readI64(data, offset);
      break;
    }
  }

  return fields;
}

// ── Operation mapping ─────────────────────────────────────────────────

interface OperationMapping {
  operation: string;
  actor: (f: Record<string, unknown>) => string;
  amount: (f: Record<string, unknown>) => string | undefined;
  target: (f: Record<string, unknown>) => string | undefined;
}

const OPERATION_MAP: Record<EventName, OperationMapping> = {
  StablecoinInitialized: {
    operation: "initialize",
    actor: (f) => f.authority as string,
    amount: () => undefined,
    target: () => undefined,
  },
  TokensMinted: {
    operation: "mint",
    actor: (f) => f.minter as string,
    amount: (f) => f.amount as string,
    target: (f) => f.recipient as string,
  },
  TokensBurned: {
    operation: "burn",
    actor: (f) => f.burner as string,
    amount: (f) => f.amount as string,
    target: () => undefined,
  },
  AccountFrozen: {
    operation: "freeze",
    actor: (f) => f.frozen_by as string,
    amount: () => undefined,
    target: (f) => f.account as string,
  },
  AccountThawed: {
    operation: "thaw",
    actor: (f) => f.thawed_by as string,
    amount: () => undefined,
    target: (f) => f.account as string,
  },
  StablecoinPaused: {
    operation: "pause",
    actor: (f) => f.paused_by as string,
    amount: () => undefined,
    target: () => undefined,
  },
  StablecoinUnpaused: {
    operation: "unpause",
    actor: (f) => f.unpaused_by as string,
    amount: () => undefined,
    target: () => undefined,
  },
  TokensSeized: {
    operation: "seize",
    actor: (f) => f.seized_by as string,
    amount: (f) => f.amount as string,
    target: (f) => f.from as string,
  },
  AddedToBlacklist: {
    operation: "blacklist_add",
    actor: (f) => f.blacklisted_by as string,
    amount: () => undefined,
    target: (f) => f.address as string,
  },
  RemovedFromBlacklist: {
    operation: "blacklist_remove",
    actor: (f) => f.removed_by as string,
    amount: () => undefined,
    target: (f) => f.address as string,
  },
  AuthorityTransferred: {
    operation: "transfer_authority",
    actor: (f) => f.previous_authority as string,
    amount: () => undefined,
    target: (f) => f.new_authority as string,
  },
  RolesUpdated: {
    operation: "update_roles",
    actor: (f) => f.updated_by as string,
    amount: () => undefined,
    target: (f) => f.holder as string,
  },
  MinterUpdated: {
    operation: "update_minter",
    actor: (f) => f.updated_by as string,
    amount: (f) => f.new_quota as string,
    target: (f) => f.minter as string,
  },
};

// ── EventListener class ───────────────────────────────────────────────

export class EventListener {
  private subscriptionId: number | null = null;

  constructor(
    private connection: Connection,
    private logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
    private webhookService?: WebhookService,
  ) {}

  start(): void {
    this.logger.info("Starting event listener for program:", PROGRAM_ID.toBase58());

    this.subscriptionId = this.connection.onLogs(
      PROGRAM_ID,
      (logInfo) => {
        try {
          this.processLog(logInfo);
        } catch (err) {
          this.logger.error("Error processing log:", err);
        }
      },
      "confirmed"
    );
  }

  stop(): void {
    if (this.subscriptionId !== null) {
      this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
      this.logger.info("Event listener stopped");
    }
  }

  private processLog(logInfo: { signature: string; err: object | null; logs: string[] }): void {
    if (logInfo.err) return;

    for (const log of logInfo.logs) {
      if (!log.startsWith("Program data:")) continue;

      const base64Data = log.replace("Program data: ", "").trim();
      const decoded = this.decodeAnchorEvent(base64Data);

      if (decoded) {
        const stablecoinKey = decoded.fields.stablecoin as string;

        // Insert event with decoded fields
        insertEvent(
          decoded.type,
          stablecoinKey,
          decoded.fields,
          logInfo.signature,
          0,
          Math.floor(Date.now() / 1000)
        );

        // Insert operation record
        const mapping = OPERATION_MAP[decoded.type];
        insertOperation(
          mapping.operation,
          stablecoinKey,
          mapping.actor(decoded.fields),
          logInfo.signature,
          mapping.amount(decoded.fields),
          mapping.target(decoded.fields)
        );

        this.logger.info(`Event captured: ${decoded.type} (${logInfo.signature})`);

        // Dispatch to registered webhooks
        if (this.webhookService) {
          this.webhookService
            .dispatch(decoded.type, { ...decoded.fields, signature: logInfo.signature })
            .catch((err: unknown) => this.logger.error("Webhook dispatch error:", err));
        }
      }
    }
  }

  private decodeAnchorEvent(base64Data: string): DecodedEvent | null {
    try {
      const buffer = Buffer.from(base64Data, "base64");
      if (buffer.length < 8) return null;

      const discriminator = buffer.subarray(0, 8).toString("hex");
      const eventName = DISCRIMINATOR_MAP.get(discriminator);
      if (!eventName) return null;

      const payload = buffer.subarray(8);
      const fields = decodeEvent(eventName, payload);

      return { type: eventName, fields };
    } catch {
      return null;
    }
  }
}
