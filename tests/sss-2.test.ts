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
  SSS_HOOK_PROGRAM_ID,
  findStablecoinPDA,
  findRolePDA,
  findMinterPDA,
  findBlacklistPDA,
  buildInitializeIx,
  buildUpdateRolesIx,
  buildUpdateMinterIx,
  buildMintTokensIx,
  buildAddToBlacklistIx,
  buildSeizeIx,
  buildThawAccountIx,
  createTokenAccount,
} from "./helpers";

describe("SSS-2: Compliant Stablecoin Lifecycle", () => {
  const connection = new Connection("http://localhost:8899", "confirmed");

  let authority: Keypair;
  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let blacklisterKeypair: Keypair;
  let seizerKeypair: Keypair;
  let userKeypair: Keypair;
  let badActorKeypair: Keypair;

  before(async () => {
    authority = Keypair.generate();
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    blacklisterKeypair = Keypair.generate();
    seizerKeypair = Keypair.generate();
    userKeypair = Keypair.generate();
    badActorKeypair = Keypair.generate();

    for (const kp of [authority, minterKeypair, blacklisterKeypair, seizerKeypair, userKeypair, badActorKeypair]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    }
  });

  it("initializes an SSS-2 stablecoin with all extensions", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

    const ix = buildInitializeIx(
      authority.publicKey,
      stablecoinPDA,
      mintKeypair.publicKey,
      authorityRole,
      SSS_HOOK_PROGRAM_ID,
      {
        name: "Compliant USD",
        symbol: "cUSD",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: true,
      }
    );

    const tx = new Transaction().add(ix);
    await sendAndConfirmTransaction(connection, tx, [authority, mintKeypair]);

    const info = await connection.getAccountInfo(stablecoinPDA);
    expect(info).to.not.be.null;
  });

  it("sets up compliance roles", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);

    // Assign minter
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(authority.publicKey, stablecoinPDA, minterRole, minterKeypair.publicKey, {
          isMinter: true, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: false,
        })
      ),
      [authority]
    );

    // Assign blacklister
    const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(authority.publicKey, stablecoinPDA, blRole, blacklisterKeypair.publicKey, {
          isMinter: false, isBurner: false, isPauser: false, isBlacklister: true, isSeizer: false,
        })
      ),
      [authority]
    );

    // Assign seizer
    const [szRole] = findRolePDA(stablecoinPDA, seizerKeypair.publicKey);
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateRolesIx(authority.publicKey, stablecoinPDA, szRole, seizerKeypair.publicKey, {
          isMinter: false, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: true,
        })
      ),
      [authority]
    );

    // Set minter quota
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        buildUpdateMinterIx(authority.publicKey, stablecoinPDA, minterInfo, minterKeypair.publicKey, BigInt(10_000_000))
      ),
      [authority]
    );
  });

  it("thaws user account (KYC approval) and mints tokens", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);

    // Create user ATA (will be frozen by default since defaultAccountFrozen=true)
    const userATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, userKeypair.publicKey);

    // Thaw account (KYC approved)
    const thawIx = buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, userATA);
    await sendAndConfirmTransaction(connection, new Transaction().add(thawIx), [authority]);

    // Mint to user
    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    const mintIx = buildMintTokensIx(
      minterKeypair.publicKey,
      stablecoinPDA,
      minterRole,
      minterInfo,
      mintKeypair.publicKey,
      userATA,
      BigInt(1_000_000)
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(mintIx), [minterKeypair]);

    const balance = await connection.getTokenAccountBalance(userATA);
    expect(balance.value.amount).to.equal("1000000");
  });

  it("adds bad actor to blacklist", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [blRole] = findRolePDA(stablecoinPDA, blacklisterKeypair.publicKey);
    const [blacklistEntry] = findBlacklistPDA(stablecoinPDA, badActorKeypair.publicKey);

    const ix = buildAddToBlacklistIx(
      blacklisterKeypair.publicKey,
      stablecoinPDA,
      blRole,
      blacklistEntry,
      badActorKeypair.publicKey,
      "Sanctions list match"
    );

    await sendAndConfirmTransaction(connection, new Transaction().add(ix), [blacklisterKeypair]);

    // Verify blacklist entry exists
    const info = await connection.getAccountInfo(blacklistEntry);
    expect(info).to.not.be.null;
    expect(info!.data.length).to.be.greaterThan(0);
  });

  it("seizes tokens from bad actor account", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const [szRole] = findRolePDA(stablecoinPDA, seizerKeypair.publicKey);

    // Create and fund bad actor ATA
    const badActorATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, badActorKeypair.publicKey);

    // Thaw and mint to bad actor (simulating pre-blacklist activity)
    const thawIx = buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, badActorATA);
    await sendAndConfirmTransaction(connection, new Transaction().add(thawIx), [authority]);

    const [minterRole] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    const mintIx = buildMintTokensIx(
      minterKeypair.publicKey,
      stablecoinPDA,
      minterRole,
      minterInfo,
      mintKeypair.publicKey,
      badActorATA,
      BigInt(500_000)
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(mintIx), [minterKeypair]);

    // Create treasury ATA for seized funds
    const treasuryATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, authority.publicKey);
    const thawTreasuryIx = buildThawAccountIx(authority.publicKey, stablecoinPDA, authorityRole, mintKeypair.publicKey, treasuryATA);
    await sendAndConfirmTransaction(connection, new Transaction().add(thawTreasuryIx), [authority]);

    // Seize tokens
    const seizeIx = buildSeizeIx(
      seizerKeypair.publicKey,
      stablecoinPDA,
      szRole,
      mintKeypair.publicKey,
      badActorATA,
      treasuryATA
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(seizeIx), [seizerKeypair]);

    // Verify bad actor balance is 0
    const badActorBalance = await connection.getTokenAccountBalance(badActorATA);
    expect(badActorBalance.value.amount).to.equal("0");

    // Verify treasury received the tokens
    const treasuryBalance = await connection.getTokenAccountBalance(treasuryATA);
    expect(Number(treasuryBalance.value.amount)).to.be.greaterThan(0);
  });
});
