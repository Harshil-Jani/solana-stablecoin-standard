import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  findStablecoinPDA,
  findRolePDA,
  findMinterPDA,
  findBlacklistPDA,
  anchorDiscriminator,
  buildInitializeIx,
  buildUpdateRolesIx,
  buildUpdateMinterIx,
  buildMintTokensIx,
  buildThawAccountIx,
  buildAddToBlacklistIx,
  createTokenAccount,
} from "./helpers";

// Helper: find extra-account-meta-list PDA for the hook program
function findExtraAccountMetaListPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    SSS_HOOK_PROGRAM_ID
  );
}

// Helper: build the initialize_extra_account_meta_list instruction
function buildInitExtraAccountMetaListIx(
  authority: PublicKey,
  extraAccountMetaList: PublicKey,
  mint: PublicKey,
  sssTokenProgramId: PublicKey,
): TransactionInstruction {
  const data = Buffer.concat([
    anchorDiscriminator("initialize_extra_account_meta_list"),
    sssTokenProgramId.toBuffer(),
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: extraAccountMetaList, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SSS_HOOK_PROGRAM_ID,
    data,
  });
}

// Helper: build a transfer_checked instruction with extra accounts for the hook
async function buildTransferCheckedWithHookIx(
  connection: Connection,
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: bigint,
  decimals: number,
): Promise<TransactionInstruction> {
  const { createTransferCheckedWithTransferHookInstruction } = await import("@solana/spl-token");
  return await createTransferCheckedWithTransferHookInstruction(
    connection,
    source,
    mint,
    destination,
    authority,
    amount,
    decimals,
    undefined,
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
}

describe("SSS-2 Transfer Hook: Blacklist Enforcement", () => {
  const connection = new Connection("http://localhost:8899", "confirmed");
  let authority: Keypair;
  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let blacklisterKeypair: Keypair;
  let senderKeypair: Keypair;
  let receiverKeypair: Keypair;

  before(async () => {
    authority = Keypair.generate();
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    blacklisterKeypair = Keypair.generate();
    senderKeypair = Keypair.generate();
    receiverKeypair = Keypair.generate();

    for (const kp of [authority, minterKeypair, blacklisterKeypair, senderKeypair, receiverKeypair]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    }

    // Initialize SSS-2 stablecoin (full compliance)
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const ix = buildInitializeIx(
      authority.publicKey, stablecoinPDA, mintKeypair.publicKey, authorityRole,
      SSS_HOOK_PROGRAM_ID,
      { name: "Hook Test", symbol: "HOOK", uri: "", decimals: 6, enablePermanentDelegate: true, enableTransferHook: true, defaultAccountFrozen: true }
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(ix), [authority, mintKeypair]);

    // Initialize extra account meta list for the transfer hook
    const [extraMetaList] = findExtraAccountMetaListPDA(mintKeypair.publicKey);
    const metaIx = buildInitExtraAccountMetaListIx(authority.publicKey, extraMetaList, mintKeypair.publicKey, SSS_TOKEN_PROGRAM_ID);
    await sendAndConfirmTransaction(connection, new Transaction().add(metaIx), [authority]);

    // Setup roles
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildUpdateRolesIx(authority.publicKey, stablecoinPDA, minterRole, minterKeypair.publicKey, {
        isMinter: true, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: false,
      })
    ), [authority]);

    const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildUpdateRolesIx(authority.publicKey, stablecoinPDA, blRole, blacklisterKeypair.publicKey, {
        isMinter: false, isBurner: false, isPauser: false, isBlacklister: true, isSeizer: false,
      })
    ), [authority]);

    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildUpdateMinterIx(authority.publicKey, stablecoinPDA, minterInfo, minterKeypair.publicKey, BigInt(100_000_000))
    ), [authority]);

    // Create + thaw + fund sender account
    const senderATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, senderKeypair.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, senderATA)
    ), [authority]);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildMintTokensIx(minterKeypair.publicKey, stablecoinPDA, minterRole, minterInfo, mintKeypair.publicKey, senderATA, BigInt(10_000_000))
    ), [minterKeypair]);

    // Create + thaw receiver account
    const receiverATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, receiverKeypair.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, receiverATA)
    ), [authority]);
  });

  it("blacklisted source transfer fails", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
    const [blacklistEntry] = findBlacklistPDA(stablecoinPDA, senderKeypair.publicKey);

    // Blacklist sender
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildAddToBlacklistIx(blacklisterKeypair.publicKey, stablecoinPDA, blRole, blacklistEntry, senderKeypair.publicKey, "Test blacklist")
    ), [blacklisterKeypair]);

    // Try transfer from blacklisted sender
    const { getAssociatedTokenAddress } = await import("@solana/spl-token");
    const senderATA = await getAssociatedTokenAddress(mintKeypair.publicKey, senderKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const receiverATA = await getAssociatedTokenAddress(mintKeypair.publicKey, receiverKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID);

    try {
      const transferIx = await buildTransferCheckedWithHookIx(connection, senderATA, mintKeypair.publicKey, receiverATA, senderKeypair.publicKey, BigInt(1000), 6);
      await sendAndConfirmTransaction(connection, new Transaction().add(transferIx), [senderKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("Error");
    }
  });

  it("blacklisted destination transfer fails", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);

    // Blacklist receiver
    const [receiverBlEntry] = findBlacklistPDA(stablecoinPDA, receiverKeypair.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildAddToBlacklistIx(blacklisterKeypair.publicKey, stablecoinPDA, blRole, receiverBlEntry, receiverKeypair.publicKey, "Dest blacklist")
    ), [blacklisterKeypair]);

    // Use a non-blacklisted sender (authority)
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    const authATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, authority.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, authATA)
    ), [authority]);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildMintTokensIx(minterKeypair.publicKey, stablecoinPDA, minterRole, minterInfo, mintKeypair.publicKey, authATA, BigInt(5000))
    ), [minterKeypair]);

    const { getAssociatedTokenAddress } = await import("@solana/spl-token");
    const receiverATA = await getAssociatedTokenAddress(mintKeypair.publicKey, receiverKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID);

    try {
      const transferIx = await buildTransferCheckedWithHookIx(connection, authATA, mintKeypair.publicKey, receiverATA, authority.publicKey, BigInt(1000), 6);
      await sendAndConfirmTransaction(connection, new Transaction().add(transferIx), [authority]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("Error");
    }
  });

  it("transfer succeeds when neither party is blacklisted", async () => {
    // Fresh keypairs with no blacklist entries
    const newSender = Keypair.generate();
    const newReceiver = Keypair.generate();
    const sig1 = await connection.requestAirdrop(newSender.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig1);
    const sig2 = await connection.requestAirdrop(newReceiver.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig2);

    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    const sATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, newSender.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, sATA)
    ), [authority]);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildMintTokensIx(minterKeypair.publicKey, stablecoinPDA, minterRole, minterInfo, mintKeypair.publicKey, sATA, BigInt(5000))
    ), [minterKeypair]);

    const rATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, newReceiver.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, rATA)
    ), [authority]);

    // Transfer should succeed
    const transferIx = await buildTransferCheckedWithHookIx(connection, sATA, mintKeypair.publicKey, rATA, newSender.publicKey, BigInt(1000), 6);
    await sendAndConfirmTransaction(connection, new Transaction().add(transferIx), [newSender]);

    const balance = await connection.getTokenAccountBalance(rATA);
    expect(Number(balance.value.amount)).to.equal(1000);
  });
});
