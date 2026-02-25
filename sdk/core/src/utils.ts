import * as crypto from "crypto";

/**
 * Compute the 8-byte Anchor instruction discriminator.
 * SHA-256("global:<instruction_name>")[0..8]
 */
export function anchorDisc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

/** Borsh-serialize a string: 4-byte LE length + UTF-8 bytes. */
export function serializeString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

/** Borsh-serialize a u64: 8-byte little-endian. */
export function serializeU64(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return buf;
}

/** Borsh-serialize an i64: 8-byte little-endian signed. */
export function serializeI64(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(n);
  return buf;
}
