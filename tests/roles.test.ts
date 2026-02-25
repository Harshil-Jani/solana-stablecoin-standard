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
  createTokenAccount,
} from "./helpers";

describe("Role-Based Access Control", () => {
  const connection = new Connection("http://localhost:8899", "confirmed");
  let authority: Keypair;
  let mintKeypair: Keypair;
  let minterKeypair: Keypair;
  let recipientKeypair: Keypair;

  before(async () => {
    authority = Keypair.generate();
    mintKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    recipientKeypair = Keypair.generate();

    for (const kp of [authority, minterKeypair, recipientKeypair]) {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    }

    // Initialize stablecoin
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [authorityRole] = findRolePDA(stablecoinPDA, authority.publicKey);
    const ix = buildInitializeIx(
      authority.publicKey, stablecoinPDA, mintKeypair.publicKey, authorityRole,
      SSS_HOOK_PROGRAM_ID,
      { name: "Role Test", symbol: "ROLE", uri: "", decimals: 6, enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false }
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(ix), [authority, mintKeypair]);
  });

  it("grant and exercise minter role", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [role] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    // Grant minter role
    const grantIx = buildUpdateRolesIx(authority.publicKey, stablecoinPDA, role, minterKeypair.publicKey, {
      isMinter: true, isBurner: true, isPauser: true, isBlacklister: false, isSeizer: false,
    });
    await sendAndConfirmTransaction(connection, new Transaction().add(grantIx), [authority]);

    // Set quota
    const quotaIx = buildUpdateMinterIx(authority.publicKey, stablecoinPDA, minterInfo, minterKeypair.publicKey, BigInt(1_000_000));
    await sendAndConfirmTransaction(connection, new Transaction().add(quotaIx), [authority]);

    // Mint tokens
    const recipientATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, recipientKeypair.publicKey);
    const mintIx = buildMintTokensIx(
      minterKeypair.publicKey, stablecoinPDA, role, minterInfo,
      mintKeypair.publicKey, recipientATA, BigInt(500)
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(mintIx), [minterKeypair]);

    const balance = await connection.getTokenAccountBalance(recipientATA);
    expect(Number(balance.value.amount)).to.equal(500);
  });

  it("revoked minter cannot mint", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [role] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    // Revoke minter role
    const revokeIx = buildUpdateRolesIx(authority.publicKey, stablecoinPDA, role, minterKeypair.publicKey, {
      isMinter: false, isBurner: true, isPauser: true, isBlacklister: false, isSeizer: false,
    });
    await sendAndConfirmTransaction(connection, new Transaction().add(revokeIx), [authority]);

    // Try to mint — should fail
    const recipientATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, Keypair.generate().publicKey);
    const mintIx = buildMintTokensIx(
      minterKeypair.publicKey, stablecoinPDA, role, minterInfo,
      mintKeypair.publicKey, recipientATA, BigInt(100)
    );

    try {
      await sendAndConfirmTransaction(connection, new Transaction().add(mintIx), [minterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      // Anchor error 6000 = 0x1770 = Unauthorized (minter role revoked)
      expect(err.message).to.include("0x1770");
    }
  });

  it("quota enforcement (mint exceeds quota)", async () => {
    const [stablecoinPDA] = findStablecoinPDA(mintKeypair.publicKey);
    const [role] = findRolePDA(stablecoinPDA, minterKeypair.publicKey);
    const [minterInfo] = findMinterPDA(stablecoinPDA, minterKeypair.publicKey);

    // Re-grant minter role
    const grantIx = buildUpdateRolesIx(authority.publicKey, stablecoinPDA, role, minterKeypair.publicKey, {
      isMinter: true, isBurner: true, isPauser: true, isBlacklister: false, isSeizer: false,
    });
    await sendAndConfirmTransaction(connection, new Transaction().add(grantIx), [authority]);

    // Set quota to 100
    const quotaIx = buildUpdateMinterIx(authority.publicKey, stablecoinPDA, minterInfo, minterKeypair.publicKey, BigInt(100));
    await sendAndConfirmTransaction(connection, new Transaction().add(quotaIx), [authority]);

    // Try to mint 200 (exceeds quota of 100)
    const recipientATA = await createTokenAccount(connection, authority, mintKeypair.publicKey, authority.publicKey);
    const mintIx = buildMintTokensIx(
      minterKeypair.publicKey, stablecoinPDA, role, minterInfo,
      mintKeypair.publicKey, recipientATA, BigInt(200)
    );

    try {
      await sendAndConfirmTransaction(connection, new Transaction().add(mintIx), [minterKeypair]);
      expect.fail("Should have thrown");
    } catch (err: any) {
      // Anchor error 6005 = 0x1775 = QuotaExceeded
      expect(err.message).to.include("0x1775");
    }
  });
});
