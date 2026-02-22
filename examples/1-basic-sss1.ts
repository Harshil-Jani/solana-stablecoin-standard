/**
 * Example 1: Create a Basic SSS-1 Stablecoin
 * ============================================
 *
 * WHAT:  Initialize an SSS-1 (minimal) stablecoin on Solana.
 * WHEN:  Use SSS-1 when you need a basic stablecoin without compliance features —
 *        perfect for DAO treasuries, internal tokens, or ecosystem settlement.
 * WHY:   SSS-1 gives you mint/burn, freeze/thaw, and pause controls without the
 *        overhead of transfer hooks, blacklists, or permanent delegates.
 *
 * Token-2022 extensions enabled: MintCloseAuthority (only)
 *
 * Run: npx tsx examples/1-basic-sss1.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaStablecoin, sss1Preset } from "@stbr/sss-sdk";

async function main() {
  // ── Step 1: Connect to the Solana cluster ────────────────────────────
  // Use "http://localhost:8899" for local development (solana-test-validator)
  // Use "https://api.devnet.solana.com" for devnet testing
  const connection = new Connection("http://localhost:8899", "confirmed");

  // ── Step 2: Generate or load the authority keypair ───────────────────
  // The authority is the master admin — they can assign roles, transfer
  // authority, and manage the stablecoin. In production, this would be
  // loaded from a secure keystore, not generated on the fly.
  const authority = Keypair.generate();

  // Fund the authority (only needed on localnet/devnet)
  const airdropSig = await connection.requestAirdrop(
    authority.publicKey,
    5 * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropSig);
  console.log("Authority funded:", authority.publicKey.toBase58());

  // ── Step 3: Create the stablecoin ────────────────────────────────────
  // sss1Preset() returns the default SSS-1 config. You override only
  // the fields you care about — name, symbol, decimals, metadata URI.
  //
  // Under the hood, this:
  //   1. Generates a new mint keypair
  //   2. Derives the StablecoinState PDA from ["stablecoin", mint]
  //   3. Derives the authority's RoleAccount PDA from ["role", stablecoin, authority]
  //   4. Sends the `initialize` instruction with Token-2022 MintCloseAuthority extension
  //   5. Returns the SolanaStablecoin instance for further operations
  const { stablecoin, mint, txSig } = await SolanaStablecoin.create(
    connection,
    authority,
    sss1Preset({
      name: "My DAO Token",
      symbol: "DAO",
      decimals: 6, // 6 decimals = 1 token = 1_000_000 units (USDC-style)
      uri: "https://example.com/dao-metadata.json",
    })
  );

  console.log("Stablecoin created!");
  console.log("  Mint address:      ", mint.publicKey.toBase58());
  console.log("  Stablecoin PDA:    ", stablecoin.stablecoinPDA.toBase58());
  console.log("  Transaction:       ", txSig);

  // ── Step 4: Load an existing stablecoin ──────────────────────────────
  // If you already know the mint address, you can reconnect to the
  // stablecoin without re-initializing. This is how your frontend or
  // backend services will typically interact with the SDK.
  const loaded = SolanaStablecoin.load(connection, mint.publicKey);
  console.log("\nLoaded existing stablecoin:", loaded.mint.toBase58());

  // ── What's next? ─────────────────────────────────────────────────────
  // Now you need to:
  //   1. Assign roles (see example 3: role-management.ts)
  //   2. Set minter quotas (see example 2: mint-and-burn.ts)
  //   3. Start minting tokens to recipients
  //
  // The authority automatically gets all roles on initialization, but
  // in production you'd delegate to separate operator keypairs.
}

main().catch(console.error);
