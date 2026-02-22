import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  SSS_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
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
  buildThawAccountIx,
  buildTransferAuthorityIx,
  createTokenAccount,
  SSS_HOOK_PROGRAM_ID,
} from "./helpers";

describe("SSS-1: Minimal Stablecoin Lifecycle", () => {
  const connection = new Connection("http://localhost:8899", "confirmed");

  let authority: Keypair;
  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let burnerKeypair: Keypair;
  let recipientKeypair: Keypair;
  let newAuthority: Keypair;

  before(async () => {
    authority = Keypair.generate();
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    burnerKeypair = Keypair.generate();
    recipientKeypair = Keypair.generate();
    newAuthority = Keypair.generate();

    // Airdrop SOL to all signers
    for (const kp of [authority, minterKeypair, burnerKeypair, recipientKeypair, newAuthority]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    }
  });

  it("initializes an SSS-1 stablecoin", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

    const ix = buildInitializeIx(
      authority.publicKey,
      stablecoinPDA,
      mintKeypair.publicKey,
      authorityRole,
      SSS_HOOK_PROGRAM_ID,
      {
        name: "Test USD",
        symbol: "TUSD",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      }
    );

    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [authority, mintKeypair]);
    expect(sig).to.be.a("string");

    // Verify account exists
    const info = await connection.getAccountInfo(stablecoinPDA);
    expect(info).to.not.be.null;
    expect(info!.owner.equals(SSS_TOKEN_PROGRAM_ID)).to.be.true;
  });

  it("assigns minter role", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);

    const ix = buildUpdateRolesIx(authority.publicKey, stablecoinPDA, minterRole, minterKeypair.publicKey, {
      isMinter: true,
      isBurner: false,
      isPauser: false,
      isBlacklister: false,
      isSeizer: false,
    });

    const tx = new Transaction().add(ix);
    await sendAndConfirmTransaction(connection, tx, [authority]);

    const info = await connection.getAccountInfo(minterRole);
    expect(info).to.not.be.null;
  });

  it("sets minter quota", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    const ix = buildUpdateMinterIx(
      authority.publicKey,
      stablecoinPDA,
      minterInfo,
      minterKeypair.publicKey,
      BigInt(1_000_000)
    );

    const tx = new Transaction().add(ix);
    await sendAndConfirmTransaction(connection, tx, [authority]);

    const info = await connection.getAccountInfo(minterInfo);
    expect(info).to.not.be.null;
  });

  it("mints tokens", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    const recipientATA = await createTokenAccount(
      connection,
      authority,
      mintKeypair.publicKey,
      recipientKeypair.publicKey
    );

    const ix = buildMintTokensIx(
      minterKeypair.publicKey,
      stablecoinPDA,
      minterRole,
      minterInfo,
      mintKeypair.publicKey,
      recipientATA,
      BigInt(500_000)
    );

    const tx = new Transaction().add(ix);
    await sendAndConfirmTransaction(connection, tx, [minterKeypair]);

    // Verify token balance
    const balance = await connection.getTokenAccountBalance(recipientATA);
    expect(balance.value.amount).to.equal("500000");
  });

  it("assigns burner role and burns tokens", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);

    // Grant burner + minter roles to burner so they can hold tokens
    const [burnerRole] = findRolePDA(stablecoinPDA, burnerKeypair.publicKey);
    const roleTx = new Transaction().add(
      buildUpdateRolesIx(authority.publicKey, stablecoinPDA, burnerRole, burnerKeypair.publicKey, {
        isMinter: true,
        isBurner: true,
        isPauser: false,
        isBlacklister: false,
        isSeizer: false,
      })
    );
    await sendAndConfirmTransaction(connection, roleTx, [authority]);

    // Create burner ATA and mint tokens to it
    const burnerATA = await createTokenAccount(
      connection,
      authority,
      mintKeypair.publicKey,
      burnerKeypair.publicKey
    );

    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    const mintIx = buildMintTokensIx(
      minterKeypair.publicKey,
      stablecoinPDA,
      minterRole,
      minterInfo,
      mintKeypair.publicKey,
      burnerATA,
      BigInt(100_000)
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(mintIx), [minterKeypair]);

    // Now burn
    const burnIx = buildBurnTokensIx(
      burnerKeypair.publicKey,
      stablecoinPDA,
      burnerRole,
      mintKeypair.publicKey,
      burnerATA,
      BigInt(50_000)
    );

    await sendAndConfirmTransaction(connection, new Transaction().add(burnIx), [burnerKeypair]);

    const balance = await connection.getTokenAccountBalance(burnerATA);
    expect(balance.value.amount).to.equal("50000");
  });

  it("pauses and unpause the stablecoin", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

    // Pause
    const pauseIx = buildPauseIx(authority.publicKey, stablecoinPDA, authorityRole);
    await sendAndConfirmTransaction(connection, new Transaction().add(pauseIx), [authority]);

    // Unpause
    const unpauseIx = buildUnpauseIx(authority.publicKey, stablecoinPDA, authorityRole);
    await sendAndConfirmTransaction(connection, new Transaction().add(unpauseIx), [authority]);
  });

  it("freezes and thaws a token account", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

    const recipientATA = await createTokenAccount(
      connection,
      authority,
      mintKeypair.publicKey,
      newAuthority.publicKey
    );

    // Freeze
    const freezeIx = buildFreezeAccountIx(
      authority.publicKey,
      stablecoinPDA,
      authorityRole,
      mintKeypair.publicKey,
      recipientATA
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(freezeIx), [authority]);

    // Thaw
    const thawIx = buildThawAccountIx(
      authority.publicKey,
      stablecoinPDA,
      authorityRole,
      mintKeypair.publicKey,
      recipientATA
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(thawIx), [authority]);
  });

  it("transfers authority", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);

    const ix = buildTransferAuthorityIx(authority.publicKey, stablecoinPDA, newAuthority.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(ix), [authority]);

    // Transfer back for further tests
    const ix2 = buildTransferAuthorityIx(newAuthority.publicKey, stablecoinPDA, authority.publicKey);
    await sendAndConfirmTransaction(connection, new Transaction().add(ix2), [newAuthority]);
  });
});
