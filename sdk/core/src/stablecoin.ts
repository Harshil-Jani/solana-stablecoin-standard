import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  type StablecoinConfig,
} from "./types";
import { findStablecoinPDA, findRolePDA, findMinterPDA } from "./pda";
import { anchorDisc, serializeString, serializeU64 } from "./utils";

/**
 * Main entry point for creating and managing SSS stablecoins.
 */
export class SolanaStablecoin {
  constructor(
    public connection: Connection,
    public mint: PublicKey,
    public stablecoinPDA: PublicKey
  ) {}

  /**
   * Create a new stablecoin mint and initialize the on-chain state.
   */
  static async create(
    connection: Connection,
    authority: Keypair,
    config: StablecoinConfig
  ): Promise<{ stablecoin: SolanaStablecoin; mint: Keypair; txSig: string }> {
    const mintKeypair = Keypair.generate();
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

    const data = Buffer.concat([
      anchorDisc("initialize"),
      serializeString(config.name),
      serializeString(config.symbol),
      serializeString(config.uri),
      Buffer.from([config.decimals]),
      Buffer.from([config.enablePermanentDelegate ? 1 : 0]),
      Buffer.from([config.enableTransferHook ? 1 : 0]),
      Buffer.from([config.defaultAccountFrozen ? 1 : 0]),
      serializeU64(config.maxSupply ?? BigInt(0)),
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: stablecoinPDA, isSigner: false, isWritable: true },
        { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: authorityRole, isSigner: false, isWritable: true },
        { pubkey: SSS_HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    const txSig = await sendAndConfirmTransaction(connection, tx, [
      authority,
      mintKeypair,
    ]);

    return {
      stablecoin: new SolanaStablecoin(connection, mintKeypair.publicKey, stablecoinPDA),
      mint: mintKeypair,
      txSig,
    };
  }

  /**
   * Load an existing stablecoin from its mint address.
   */
  static load(connection: Connection, mint: PublicKey): SolanaStablecoin {
    const [stablecoinPDA] = findStablecoinPDA(mint);
    return new SolanaStablecoin(connection, mint, stablecoinPDA);
  }

  /**
   * Mint tokens to a recipient's token account.
   */
  async mintTokens(
    minter: Keypair,
    recipientTokenAccount: PublicKey,
    amount: bigint
  ): Promise<string> {
    const [role] = findRolePDA(this.stablecoinPDA, minter.publicKey);
    const [minterInfo] = findMinterPDA(this.stablecoinPDA, minter.publicKey);

    const data = Buffer.concat([anchorDisc("mint_tokens"), serializeU64(amount)]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: minter.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: true },
        { pubkey: role, isSigner: false, isWritable: false },
        { pubkey: minterInfo, isSigner: false, isWritable: true },
        { pubkey: this.mint, isSigner: false, isWritable: true },
        { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [minter]);
  }

  /**
   * Burn tokens from the burner's own token account.
   */
  async burnTokens(
    burner: Keypair,
    burnerTokenAccount: PublicKey,
    amount: bigint
  ): Promise<string> {
    const [role] = findRolePDA(this.stablecoinPDA, burner.publicKey);

    const data = Buffer.concat([anchorDisc("burn_tokens"), serializeU64(amount)]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: burner.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: true },
        { pubkey: role, isSigner: false, isWritable: false },
        { pubkey: this.mint, isSigner: false, isWritable: true },
        { pubkey: burnerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [burner]);
  }

  /**
   * Freeze a token account (pauser role required).
   */
  async freezeAccount(
    authority: Keypair,
    targetTokenAccount: PublicKey
  ): Promise<string> {
    const [role] = findRolePDA(this.stablecoinPDA, authority.publicKey);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: role, isSigner: false, isWritable: false },
        { pubkey: this.mint, isSigner: false, isWritable: false },
        { pubkey: targetTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data: anchorDisc("freeze_account"),
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }

  /**
   * Thaw a frozen token account (pauser role required).
   */
  async thawAccount(
    authority: Keypair,
    targetTokenAccount: PublicKey
  ): Promise<string> {
    const [role] = findRolePDA(this.stablecoinPDA, authority.publicKey);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: role, isSigner: false, isWritable: false },
        { pubkey: this.mint, isSigner: false, isWritable: false },
        { pubkey: targetTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data: anchorDisc("thaw_account"),
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }

  /**
   * Pause the stablecoin (blocks minting and burning).
   */
  async pause(authority: Keypair): Promise<string> {
    const [role] = findRolePDA(this.stablecoinPDA, authority.publicKey);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: true },
        { pubkey: role, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data: anchorDisc("pause"),
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }

  /**
   * Unpause the stablecoin.
   */
  async unpause(authority: Keypair): Promise<string> {
    const [role] = findRolePDA(this.stablecoinPDA, authority.publicKey);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: true },
        { pubkey: role, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data: anchorDisc("unpause"),
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }

  /**
   * Step 1 of two-step authority transfer: set pending authority.
   * The new authority must call `acceptAuthority()` to finalize.
   */
  async transferAuthority(
    authority: Keypair,
    newAuthority: PublicKey
  ): Promise<string> {
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: true },
        { pubkey: newAuthority, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data: anchorDisc("transfer_authority"),
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }

  /**
   * Step 2 of two-step authority transfer: the pending authority accepts.
   * This proves the new authority controls the key, preventing lockout.
   */
  async acceptAuthority(newAuthority: Keypair): Promise<string> {
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: newAuthority.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: true },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data: anchorDisc("accept_authority"),
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [newAuthority]);
  }

  /**
   * Update the maximum supply cap (authority-only).
   * Set to 0 to remove the cap.
   */
  async updateSupplyCap(
    authority: Keypair,
    newMaxSupply: bigint
  ): Promise<string> {
    const data = Buffer.concat([
      anchorDisc("update_supply_cap"),
      serializeU64(newMaxSupply),
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: true },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }
}
