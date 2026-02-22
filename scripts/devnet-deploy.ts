#!/usr/bin/env ts-node
/**
 * Devnet Deployment Script for SSS (Solana Stablecoin Standard)
 *
 * Usage:
 *   npx ts-node scripts/devnet-deploy.ts [--skip-build] [--keypair <path>]
 *
 * Prerequisites:
 *   1. Solana CLI installed: `solana --version`
 *   2. Anchor CLI installed: `anchor --version`
 *   3. Devnet SOL for deploy fees: `solana airdrop 5 --url devnet`
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
const ANCHOR_TOML = resolve(ROOT, "Anchor.toml");

function run(cmd: string, cwd = ROOT): string {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, { cwd, stdio: "inherit", encoding: "utf-8" }) as unknown as string;
}

function main() {
  const args = process.argv.slice(2);
  const skipBuild = args.includes("--skip-build");
  const keypairIdx = args.indexOf("--keypair");
  const keypairPath = keypairIdx >= 0 ? args[keypairIdx + 1] : undefined;

  console.log("=== SSS Devnet Deployment ===\n");

  // 1. Verify tooling
  console.log("[1/5] Checking prerequisites...");
  try {
    execSync("solana --version", { stdio: "pipe" });
    execSync("anchor --version", { stdio: "pipe" });
  } catch {
    console.error("ERROR: solana-cli and anchor-cli must be installed.");
    process.exit(1);
  }

  if (!existsSync(ANCHOR_TOML)) {
    console.error(`ERROR: Anchor.toml not found at ${ANCHOR_TOML}`);
    process.exit(1);
  }

  // 2. Switch to devnet
  console.log("[2/5] Configuring Solana CLI for devnet...");
  run("solana config set --url devnet");
  if (keypairPath) {
    run(`solana config set --keypair ${keypairPath}`);
  }

  // 3. Check balance
  console.log("[3/5] Checking deployer balance...");
  run("solana balance");

  // 4. Build programs
  if (!skipBuild) {
    console.log("[4/5] Building programs...");
    run("anchor build");
  } else {
    console.log("[4/5] Skipping build (--skip-build)");
  }

  // 5. Deploy
  console.log("[5/5] Deploying to devnet...");
  run("anchor deploy --provider.cluster devnet");

  console.log("\n=== Deployment Complete ===");
  console.log("Program IDs are configured in Anchor.toml [programs.devnet].");
  console.log("View on Solana Explorer:");
  console.log("  https://explorer.solana.com/address/2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ?cluster=devnet");
  console.log("  https://explorer.solana.com/address/F2of7agMFET8v3verXe3e6Hmfd71t833RjPxEjs5wRdd?cluster=devnet");
}

main();
