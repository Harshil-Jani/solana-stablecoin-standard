import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as crypto from "crypto";
import { SSS_TOKEN_PROGRAM_ID, type RoleFlags } from "./types";
import { findRolePDA, findMinterPDA } from "./pda";

function anchorDisc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

/**
 * Manages RBAC role assignments and minter quotas.
 */
export class RoleManager {
  constructor(
    public connection: Connection,
    public stablecoinPDA: PublicKey
  ) {}

  /**
   * Assign or update roles for a holder (authority-only).
   */
  async updateRoles(
    authority: Keypair,
    holder: PublicKey,
    roles: RoleFlags
  ): Promise<string> {
    const [rolePDA] = findRolePDA(this.stablecoinPDA, holder);

    const data = Buffer.concat([
      anchorDisc("update_roles"),
      Buffer.from([
        roles.isMinter ? 1 : 0,
        roles.isBurner ? 1 : 0,
        roles.isPauser ? 1 : 0,
        roles.isBlacklister ? 1 : 0,
        roles.isSeizer ? 1 : 0,
      ]),
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: rolePDA, isSigner: false, isWritable: true },
        { pubkey: holder, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }

  /**
   * Set a minter's quota and optional epoch duration (authority-only).
   *
   * If epochDuration is provided and > 0, the minter's quota resets
   * every `epochDuration` seconds. Otherwise the quota is lifetime.
   */
  async updateMinter(
    authority: Keypair,
    minter: PublicKey,
    quota: bigint,
    epochDuration?: bigint
  ): Promise<string> {
    const [minterInfoPDA] = findMinterPDA(this.stablecoinPDA, minter);

    const quotaBuf = Buffer.alloc(8);
    quotaBuf.writeBigUInt64LE(quota);

    // Serialize epoch_duration as Borsh Option<i64>: 0 = None, 1 + i64 LE = Some
    let epochBuf: Buffer;
    if (epochDuration !== undefined) {
      epochBuf = Buffer.alloc(9);
      epochBuf.writeUInt8(1, 0);
      epochBuf.writeBigInt64LE(epochDuration, 1);
    } else {
      epochBuf = Buffer.alloc(1);
      epochBuf.writeUInt8(0, 0);
    }

    const data = Buffer.concat([anchorDisc("update_minter"), quotaBuf, epochBuf]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: minterInfoPDA, isSigner: false, isWritable: true },
        { pubkey: minter, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }
}
