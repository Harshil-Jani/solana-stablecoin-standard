import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { SSS_TOKEN_PROGRAM_ID, InstructionType } from "./types";
import {
  findMultisigPDA,
  findProposalPDA,
  findTimelockConfigPDA,
  findTimelockPDA,
  findTransferLimitPDA,
} from "./pda";
import { anchorDisc, serializeU64, serializeI64 } from "./utils";

/**
 * Governance module: multisig, timelock, and transfer limit operations.
 *
 * Covers SSS Features 5, 6, and 10:
 *  - Multi-sig authority (create multisig, proposals, approvals, execution)
 *  - Time-locked operations (configure, propose, execute, cancel)
 *  - Transfer limits (configure per-tx and daily caps)
 */
export class GovernanceModule {
  constructor(
    public connection: Connection,
    public stablecoinPDA: PublicKey
  ) {}

  // ── Multi-sig (Feature 5) ─────────────────────────────────────────

  /**
   * Create a multisig governance configuration (authority-only).
   * @param signers  Up to 10 signer pubkeys
   * @param threshold  Number of approvals required to execute proposals
   */
  async createMultisig(
    authority: Keypair,
    signers: PublicKey[],
    threshold: number
  ): Promise<string> {
    const [multisigPDA] = findMultisigPDA(this.stablecoinPDA);

    // Borsh Vec<Pubkey>: 4-byte LE length + N * 32 bytes
    const signersBuf = Buffer.concat([
      Buffer.from(new Uint32Array([signers.length]).buffer),
      ...signers.map((s) => s.toBuffer()),
    ]);

    const data = Buffer.concat([
      anchorDisc("create_multisig"),
      signersBuf,
      Buffer.from([threshold]),
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: multisigPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }

  /**
   * Create a multisig proposal (proposer must be a registered signer).
   * The proposer auto-approves the proposal.
   */
  async createProposal(
    proposer: Keypair,
    instructionType: InstructionType,
    opData: Buffer
  ): Promise<{ txSig: string; proposalId: bigint }> {
    const [multisigPDA] = findMultisigPDA(this.stablecoinPDA);

    // Fetch current proposal count to derive the proposal PDA
    const multisigInfo = await this.connection.getAccountInfo(multisigPDA);
    if (!multisigInfo) throw new Error("Multisig not initialized");

    // proposal_count is at offset 8 (discriminator) + 32 (stablecoin) + 4+N*32 (signers vec) + 1 (threshold)
    // Simpler: read the last 8+1 bytes before bump. We'll derive from the data.
    // Actually, for Borsh: disc(8) + stablecoin(32) + vec_len(4) + signers(N*32) + threshold(1) + proposal_count(8) + bump(1)
    const rawData = multisigInfo.data;
    const vecLen = rawData.readUInt32LE(8 + 32);
    const countOffset = 8 + 32 + 4 + vecLen * 32 + 1;
    const proposalCount = rawData.readBigUInt64LE(countOffset);

    const [proposalPDA] = findProposalPDA(this.stablecoinPDA, proposalCount);

    // Borsh: instruction_type as u8 enum + data as Vec<u8>
    const dataBuf = Buffer.concat([
      anchorDisc("create_proposal"),
      Buffer.from([instructionType]),
      Buffer.from(new Uint32Array([opData.length]).buffer),
      opData,
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: proposer.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: multisigPDA, isSigner: false, isWritable: true },
        { pubkey: proposalPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data: dataBuf,
    });

    const tx = new Transaction().add(ix);
    const txSig = await sendAndConfirmTransaction(this.connection, tx, [proposer]);
    return { txSig, proposalId: proposalCount };
  }

  /**
   * Approve a multisig proposal (must be a registered signer).
   */
  async approveProposal(
    signer: Keypair,
    proposalId: bigint
  ): Promise<string> {
    const [multisigPDA] = findMultisigPDA(this.stablecoinPDA);
    const [proposalPDA] = findProposalPDA(this.stablecoinPDA, proposalId);

    const data = Buffer.concat([
      anchorDisc("approve_proposal"),
      serializeU64(proposalId),
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: multisigPDA, isSigner: false, isWritable: false },
        { pubkey: proposalPDA, isSigner: false, isWritable: true },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [signer]);
  }

  /**
   * Execute a multisig proposal once threshold is reached (must be a registered signer).
   */
  async executeProposal(
    executor: Keypair,
    proposalId: bigint
  ): Promise<string> {
    const [multisigPDA] = findMultisigPDA(this.stablecoinPDA);
    const [proposalPDA] = findProposalPDA(this.stablecoinPDA, proposalId);

    const data = Buffer.concat([
      anchorDisc("execute_proposal"),
      serializeU64(proposalId),
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: executor.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: true },
        { pubkey: multisigPDA, isSigner: false, isWritable: false },
        { pubkey: proposalPDA, isSigner: false, isWritable: true },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [executor]);
  }

  // ── Timelock (Feature 6) ──────────────────────────────────────────

  /**
   * Configure timelock parameters (authority-only).
   * @param delay  Timelock delay in seconds (must be >= 0)
   * @param enabled  Whether timelock is active
   */
  async configureTimelock(
    authority: Keypair,
    delay: bigint,
    enabled: boolean
  ): Promise<string> {
    const [timelockConfigPDA] = findTimelockConfigPDA(this.stablecoinPDA);

    const data = Buffer.concat([
      anchorDisc("configure_timelock"),
      serializeI64(delay),
      Buffer.from([enabled ? 1 : 0]),
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: timelockConfigPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }

  /**
   * Propose a timelocked operation (authority-only).
   * The operation becomes executable after the configured delay elapses.
   */
  async proposeTimelocked(
    authority: Keypair,
    opId: bigint,
    opType: InstructionType,
    opData: Buffer
  ): Promise<string> {
    const [timelockConfigPDA] = findTimelockConfigPDA(this.stablecoinPDA);
    const [timelockPDA] = findTimelockPDA(this.stablecoinPDA, opId);

    const data = Buffer.concat([
      anchorDisc("propose_timelocked"),
      serializeU64(opId),
      Buffer.from([opType]),
      Buffer.from(new Uint32Array([opData.length]).buffer),
      opData,
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: timelockConfigPDA, isSigner: false, isWritable: false },
        { pubkey: timelockPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }

  /**
   * Execute a timelocked operation after its delay has elapsed (authority-only).
   */
  async executeTimelocked(
    executor: Keypair,
    opId: bigint
  ): Promise<string> {
    const [timelockPDA] = findTimelockPDA(this.stablecoinPDA, opId);

    const data = Buffer.concat([
      anchorDisc("execute_timelocked"),
      serializeU64(opId),
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: executor.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: true },
        { pubkey: timelockPDA, isSigner: false, isWritable: true },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [executor]);
  }

  /**
   * Cancel a pending timelocked operation (authority-only).
   */
  async cancelTimelocked(
    authority: Keypair,
    opId: bigint
  ): Promise<string> {
    const [timelockPDA] = findTimelockPDA(this.stablecoinPDA, opId);

    const data = Buffer.concat([
      anchorDisc("cancel_timelocked"),
      serializeU64(opId),
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: timelockPDA, isSigner: false, isWritable: true },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }

  // ── Transfer Limits (Feature 10) ──────────────────────────────────

  /**
   * Configure transfer limits (authority-only, SSS-2 tokens only).
   * @param maxPerTx  Maximum tokens per single transaction (0 = no limit)
   * @param maxPerDay  Maximum tokens per day (0 = no limit)
   */
  async configureTransferLimits(
    authority: Keypair,
    maxPerTx: bigint,
    maxPerDay: bigint
  ): Promise<string> {
    const [transferLimitPDA] = findTransferLimitPDA(this.stablecoinPDA);

    const data = Buffer.concat([
      anchorDisc("configure_transfer_limits"),
      serializeU64(maxPerTx),
      serializeU64(maxPerDay),
    ]);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.stablecoinPDA, isSigner: false, isWritable: false },
        { pubkey: transferLimitPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [authority]);
  }
}
