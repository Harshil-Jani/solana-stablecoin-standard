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
import { SSS_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "./types";
import { findRolePDA, findBlacklistPDA } from "./pda";

function anchorDisc(name: string): Buffer {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

/**
 * SSS-2 compliance operations: blacklist management and asset seizure.
 */
export class ComplianceModule {
  constructor(
    public connection: Connection,
    public mint: PublicKey,
    public stablecoinPDA: PublicKey
  ) {}

  /**
   * Add an address to the blacklist (blacklister role required).
   */
  async addToBlacklist(
    blacklister: Keypair,
    address: PublicKey,
    reason: string
  ): Promise<string> {
    const [role] = findRolePDA(this.stablecoinPDA, blacklister.publicKey);
    const [blacklistEntry] = findBlacklistPDA(this.stablecoinPDA, address);

    const reasonBytes = Buffer.from(reason, "utf-8");
    const data = Buffer.concat([
      anchorDisc("add_to_blacklist"),
      Buffer.from(new Uint32Array([reasonBytes.length]).buffer),
      reasonBytes,
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: blacklister.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: role, isSigner: false, isWritable: false },
        { pubkey: blacklistEntry, isSigner: false, isWritable: true },
        { pubkey: address, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [blacklister]);
  }

  /**
   * Remove an address from the blacklist.
   */
  async removeFromBlacklist(
    blacklister: Keypair,
    address: PublicKey
  ): Promise<string> {
    const [role] = findRolePDA(this.stablecoinPDA, blacklister.publicKey);
    const [blacklistEntry] = findBlacklistPDA(this.stablecoinPDA, address);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: blacklister.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: role, isSigner: false, isWritable: false },
        { pubkey: blacklistEntry, isSigner: false, isWritable: true },
        { pubkey: address, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data: anchorDisc("remove_from_blacklist"),
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [blacklister]);
  }

  /**
   * Seize all tokens from a blacklisted account (seizer role required).
   * Uses the permanent delegate authority on the mint.
   */
  async seize(
    seizer: Keypair,
    sourceTokenAccount: PublicKey,
    destinationTokenAccount: PublicKey
  ): Promise<string> {
    const [role] = findRolePDA(this.stablecoinPDA, seizer.publicKey);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: seizer.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: role, isSigner: false, isWritable: false },
        { pubkey: this.mint, isSigner: false, isWritable: false },
        { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
        { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data: anchorDisc("seize"),
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [seizer]);
  }

  /**
   * Check if an address is blacklisted by looking up the PDA.
   */
  async isBlacklisted(address: PublicKey): Promise<boolean> {
    const [blacklistPDA] = findBlacklistPDA(this.stablecoinPDA, address);
    const info = await this.connection.getAccountInfo(blacklistPDA);
    return info !== null && info.data.length > 0;
  }
}
