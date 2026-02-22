import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  SSS_HOOK_PROGRAM_ID,
  findStablecoinPDA,
  findRolePDA,
  findMinterPDA,
  buildInitializeIx,
  buildUpdateRolesIx,
  buildUpdateMinterIx,
  buildMintTokensIx,
  buildBurnTokensIx,
  buildPauseIx,
  buildUnpauseIx,
  buildFreezeAccountIx,
  createTokenAccount,
} from "./helpers";

describe("Edge Cases", () => {
  const connection = new Connection("http://localhost:8899", "confirmed");
  let authority: Keypair;
  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let nonMinter: Keypair;
  let recipientKeypair: Keypair;

  before(async () => {
    authority = Keypair.generate();
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    nonMinter = Keypair.generate();
    recipientKeypair = Keypair.generate();

    for (const kp of [authority, minterKeypair, nonMinter, recipientKeypair]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    }

    // Initialize stablecoin
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const ix = buildInitializeIx(
      authority.publicKey, stablecoinPDA, mintKeypair.publicKey, authorityRole,
      SSS_HOOK_PROGRAM_ID,
      { name: "Edge Test", symbol: "EDGE", uri: "", decimals: 6, enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false }
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(ix), [authority, mintKeypair]);

    // Setup minter
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildUpdateRolesIx(authority.publicKey, stablecoinPDA, minterRole, minterKeypair.publicKey, {
        isMinter: true, isBurner: true, isPauser: false, isBlacklister: false, isSeizer: false,
      })
    ), [authority]);

    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildUpdateMinterIx(authority.publicKey, stablecoinPDA, minterInfo, minterKeypair.publicKey, BigInt(10_000_000))
    ), [authority]);
  });

  it("mint when paused fails", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    const recipientATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, recipientKeypair.publicKey);

    // Pause
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildPauseIx(authority.publicKey, stablecoinPDA, authorityRole)
    ), [authority]);

    // Try mint
    try {
      await sendAndConfirmTransaction(connection, new Transaction().add(
        buildMintTokensIx(minterKeypair.publicKey, stablecoinPDA, minterRole, minterInfo, mintKeypair.publicKey, recipientATA, BigInt(1000))
      ), [minterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("Error");
    }

    // Unpause for subsequent tests
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildUnpauseIx(authority.publicKey, stablecoinPDA, authorityRole)
    ), [authority]);
  });

  it("burn when paused fails", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    // Mint some tokens first
    const minterATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, minterKeypair.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildMintTokensIx(minterKeypair.publicKey, stablecoinPDA, minterRole, minterInfo, mintKeypair.publicKey, minterATA, BigInt(1000))
    ), [minterKeypair]);

    // Pause
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildPauseIx(authority.publicKey, stablecoinPDA, authorityRole)
    ), [authority]);

    // Try burn
    try {
      await sendAndConfirmTransaction(connection, new Transaction().add(
        buildBurnTokensIx(minterKeypair.publicKey, stablecoinPDA, minterRole, mintKeypair.publicKey, minterATA, BigInt(500))
      ), [minterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("Error");
    }

    // Unpause
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildUnpauseIx(authority.publicKey, stablecoinPDA, authorityRole)
    ), [authority]);
  });

  it("zero amount mint fails", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    const recipientATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, authority.publicKey);

    try {
      await sendAndConfirmTransaction(connection, new Transaction().add(
        buildMintTokensIx(minterKeypair.publicKey, stablecoinPDA, minterRole, minterInfo, mintKeypair.publicKey, recipientATA, BigInt(0))
      ), [minterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("Error");
    }
  });

  it("freeze already-frozen account fails", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

    const targetATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, nonMinter.publicKey);

    // Freeze once
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildFreezeAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, targetATA)
    ), [authority]);

    // Freeze again — should fail (Token-2022 error)
    try {
      await sendAndConfirmTransaction(connection, new Transaction().add(
        buildFreezeAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, targetATA)
      ), [authority]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("Error");
    }
  });

  it("non-minter cannot mint", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);

    // Give nonMinter a role PDA but with no minter role
    const [nmRole] = findRolePDA(stablecoinPDA, nonMinter.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildUpdateRolesIx(authority.publicKey, stablecoinPDA, nmRole, nonMinter.publicKey, {
        isMinter: false, isBurner: true, isPauser: false, isBlacklister: false, isSeizer: false,
      })
    ), [authority]);

    const [nmMinterInfo] = findMinterPDA(stablecoinPDA, nonMinter.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(
      buildUpdateMinterIx(authority.publicKey, stablecoinPDA, nmMinterInfo, nonMinter.publicKey, BigInt(1_000_000))
    ), [authority]);

    const recipientATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, Keypair.generate().publicKey);

    try {
      await sendAndConfirmTransaction(connection, new Transaction().add(
        buildMintTokensIx(nonMinter.publicKey, stablecoinPDA, nmRole, nmMinterInfo, mintKeypair.publicKey, recipientATA, BigInt(100))
      ), [nonMinter]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("Error");
    }
  });
});
