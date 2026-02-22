/**
 * Self-contained demo that exercises the deployed SSS programs.
 * Uses direct SDK imports (relative) to avoid workspace resolution issues.
 */
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaStablecoin } from "./sdk/core/src/stablecoin";
import { RoleManager } from "./sdk/core/src/roles";
import { ComplianceModule } from "./sdk/core/src/compliance";
import { sss1Preset, sss2Preset } from "./sdk/core/src/presets";

const G = "\x1b[32m", C = "\x1b[36m", Y = "\x1b[33m", B = "\x1b[1m", N = "\x1b[0m";
const step = (s: string) => console.log(`${G}▸ ${s}${N}`);
const header = (s: string) => {
  console.log(`\n${B}${C}${"═".repeat(56)}${N}`);
  console.log(`${B}${C}  ${s}${N}`);
  console.log(`${B}${C}${"═".repeat(56)}${N}\n`);
};

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");

  // ═══════════════════════════════════════════════════════════
  // DEMO 1: SSS-1 Minimal Stablecoin
  // ═══════════════════════════════════════════════════════════
  header("Demo 1: Create SSS-1 Minimal Stablecoin");

  const authority = Keypair.generate();
  const sig = await connection.requestAirdrop(authority.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig);
  step("Authority funded: " + authority.publicKey.toBase58());

  const { stablecoin: sc1, mint: mint1, txSig: tx1 } = await SolanaStablecoin.create(
    connection, authority,
    sss1Preset({ name: "Demo USD", symbol: "dUSD", decimals: 6 })
  );
  step("SSS-1 stablecoin created!");
  console.log(`  Mint:           ${mint1.publicKey.toBase58()}`);
  console.log(`  Stablecoin PDA: ${sc1.stablecoinPDA.toBase58()}`);
  console.log(`  Transaction:    ${tx1}`);

  // ═══════════════════════════════════════════════════════════
  // DEMO 2: Role Management
  // ═══════════════════════════════════════════════════════════
  header("Demo 2: Multi-Operator Role Management");

  const minter = Keypair.generate();
  const pauser = Keypair.generate();
  for (const kp of [minter, pauser]) {
    const s = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(s);
  }

  const roleManager = new RoleManager(connection, sc1.stablecoinPDA);

  await roleManager.updateRoles(authority, minter.publicKey, {
    isMinter: true, isBurner: true, isPauser: false, isBlacklister: false, isSeizer: false,
  });
  step("Minter+Burner role assigned: " + minter.publicKey.toBase58().slice(0, 16) + "...");

  await roleManager.updateRoles(authority, pauser.publicKey, {
    isMinter: false, isBurner: false, isPauser: true, isBlacklister: false, isSeizer: false,
  });
  step("Pauser role assigned:        " + pauser.publicKey.toBase58().slice(0, 16) + "...");

  // Set minter quota: 100 tokens
  await roleManager.updateMinter(authority, minter.publicKey, BigInt(100_000_000));
  step("Minter quota set: 100 tokens");

  // ═══════════════════════════════════════════════════════════
  // DEMO 3: Pause / Unpause
  // ═══════════════════════════════════════════════════════════
  header("Demo 3: Emergency Pause / Unpause");

  const pauseTx = await sc1.pause(pauser);
  step("Stablecoin PAUSED (minting + burning blocked)");
  console.log(`  Transaction: ${pauseTx}`);

  const unpauseTx = await sc1.unpause(pauser);
  step("Stablecoin UNPAUSED (operations resumed)");
  console.log(`  Transaction: ${unpauseTx}`);

  // ═══════════════════════════════════════════════════════════
  // DEMO 4: Authority Transfer
  // ═══════════════════════════════════════════════════════════
  header("Demo 4: Authority Transfer");

  const newAuthority = Keypair.generate();
  const aSig = await connection.requestAirdrop(newAuthority.publicKey, 5 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(aSig);

  step("Transferring authority...");
  console.log(`  From: ${authority.publicKey.toBase58().slice(0, 16)}...`);
  console.log(`  To:   ${newAuthority.publicKey.toBase58().slice(0, 16)}...`);
  const xferTx = await sc1.transferAuthority(authority, newAuthority.publicKey);
  step("Authority transferred! Old authority locked out.");
  console.log(`  Transaction: ${xferTx}`);

  // ═══════════════════════════════════════════════════════════
  // DEMO 5: SSS-2 Compliant Stablecoin
  // ═══════════════════════════════════════════════════════════
  header("Demo 5: Create SSS-2 Compliant Stablecoin");

  const authority2 = Keypair.generate();
  const sig2 = await connection.requestAirdrop(authority2.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig2);

  const { stablecoin: sc2, mint: mint2, txSig: tx2 } = await SolanaStablecoin.create(
    connection, authority2,
    sss2Preset({ name: "Compliant Dollar", symbol: "cUSD", decimals: 6 })
  );
  step("SSS-2 stablecoin created with ALL extensions!");
  console.log(`  Mint:                ${mint2.publicKey.toBase58()}`);
  console.log(`  PermanentDelegate:   ✓ (seizure enabled)`);
  console.log(`  TransferHook:        ✓ (blacklist enforcement)`);
  console.log(`  DefaultAccountState: ✓ (accounts start frozen — KYC gate)`);
  console.log(`  Transaction:         ${tx2}`);

  // ═══════════════════════════════════════════════════════════
  // DEMO 6: Compliance Roles + Blacklist
  // ═══════════════════════════════════════════════════════════
  header("Demo 6: Compliance — Blacklist a Sanctioned Address");

  const blacklister = Keypair.generate();
  const suspect = Keypair.generate();
  for (const kp of [blacklister, suspect]) {
    const s = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(s);
  }

  const roleManager2 = new RoleManager(connection, sc2.stablecoinPDA);
  await roleManager2.updateRoles(authority2, blacklister.publicKey, {
    isMinter: false, isBurner: false, isPauser: false, isBlacklister: true, isSeizer: false,
  });
  step("Blacklister role assigned");

  const compliance = new ComplianceModule(connection, sc2.mint, sc2.stablecoinPDA);

  // Check before
  const before = await compliance.isBlacklisted(suspect.publicKey);
  step(`Before: isBlacklisted = ${before}`);

  // Blacklist
  await compliance.addToBlacklist(blacklister, suspect.publicKey, "OFAC SDN match — Entity 12345");
  step("Address BLACKLISTED — all transfers blocked by transfer hook");

  // Check after
  const after = await compliance.isBlacklisted(suspect.publicKey);
  step(`After:  isBlacklisted = ${after}`);

  // Remove
  await compliance.removeFromBlacklist(blacklister, suspect.publicKey);
  const final = await compliance.isBlacklisted(suspect.publicKey);
  step(`Removed: isBlacklisted = ${final} (false positive resolved)`);

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  console.log(`\n${B}${G}${"═".repeat(56)}${N}`);
  console.log(`${B}${G}  All 6 demos completed successfully!${N}`);
  console.log(`${B}${G}  Programs: sss-token + sss-transfer-hook${N}`);
  console.log(`${B}${G}  Features exercised: init, roles, quotas, pause,${N}`);
  console.log(`${B}${G}  authority transfer, SSS-2 compliance, blacklist${N}`);
  console.log(`${B}${G}${"═".repeat(56)}${N}\n`);
}

main().catch(console.error);
