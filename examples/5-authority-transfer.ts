/**
 * Example 5: Authority Transfer
 * ==============================
 *
 * WHAT:  Transfer master authority from one keypair to another.
 * WHEN:  During governance transitions — moving from a hot wallet to a
 *        multisig, from a founding team to a DAO, or key rotation.
 * WHY:   The master authority controls all role assignments and quotas.
 *        Transferring it is the most sensitive operation on a stablecoin.
 *
 * IMPORTANT SAFETY NOTES:
 *   - This is a ONE-WAY operation. The old authority loses ALL control.
 *   - The new authority does NOT need to sign — they're assigned passively.
 *   - If you transfer to the wrong address, you lose the stablecoin forever.
 *   - In production, double-check the new authority address before calling.
 *   - Consider using a Squads multisig as the new authority for shared control.
 *
 * Run: npx tsx examples/5-authority-transfer.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  SolanaStablecoin,
  RoleManager,
  sss1Preset,
} from "@stbr/sss-sdk";

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");

  // ── Setup ────────────────────────────────────────────────────────────
  const oldAuthority = Keypair.generate();
  const newAuthority = Keypair.generate();
  const minter = Keypair.generate();

  for (const kp of [oldAuthority, newAuthority, minter]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  const { stablecoin } = await SolanaStablecoin.create(
    connection,
    oldAuthority,
    sss1Preset({ name: "Transfer Demo", symbol: "XFER" })
  );
  console.log("Stablecoin created with old authority:", oldAuthority.publicKey.toBase58());

  // ── Step 1: Verify old authority can manage roles ────────────────────
  const roleManager = new RoleManager(connection, stablecoin.stablecoinPDA);
  await roleManager.updateRoles(oldAuthority, minter.publicKey, {
    isMinter: true, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: false,
  });
  console.log("Old authority assigned minter role — working correctly\n");

  // ── Step 2: Transfer authority ───────────────────────────────────────
  // After this call, oldAuthority is permanently locked out.
  // The StablecoinState PDA's `authority` field is updated to newAuthority.
  console.log("Transferring authority...");
  console.log("  From:", oldAuthority.publicKey.toBase58());
  console.log("  To:  ", newAuthority.publicKey.toBase58());

  const txSig = await stablecoin.transferAuthority(
    oldAuthority,
    newAuthority.publicKey
  );
  console.log("  Tx:  ", txSig);

  // ── Step 3: Verify old authority is locked out ───────────────────────
  try {
    await roleManager.updateRoles(oldAuthority, minter.publicKey, {
      isMinter: false, isBurner: false, isPauser: false, isBlacklister: false, isSeizer: false,
    });
    console.log("ERROR: old authority should be rejected");
  } catch (err) {
    console.log("\nOld authority rejected (expected) — no longer has permission");
  }

  // ── Step 4: Verify new authority works ───────────────────────────────
  // The new authority can now manage all roles and quotas.
  await roleManager.updateRoles(newAuthority, minter.publicKey, {
    isMinter: true, isBurner: true, isPauser: false, isBlacklister: false, isSeizer: false,
  });
  console.log("New authority successfully updated roles!");

  console.log("\n=== Authority Transfer Complete ===");
  console.log("The old keypair has zero control over the stablecoin.");
  console.log("The new keypair is now the sole master authority.");
}

main().catch(console.error);
