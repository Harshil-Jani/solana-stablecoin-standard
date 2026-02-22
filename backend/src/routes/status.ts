import { Router } from "express";
import { Connection, PublicKey } from "@solana/web3.js";

const STABLECOIN_SEED = Buffer.from("stablecoin");
const PROGRAM_ID = new PublicKey("2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ");

export function statusRouter(connection: Connection): Router {
  const router = Router();

  router.get("/status/:mint", async (req, res) => {
    try {
      const mint = new PublicKey(req.params.mint);
      const [stablecoinPda] = PublicKey.findProgramAddressSync(
        [STABLECOIN_SEED, mint.toBuffer()],
        PROGRAM_ID
      );

      const info = await connection.getAccountInfo(stablecoinPda);
      if (!info) {
        res.status(404).json({ error: "Stablecoin not found" });
        return;
      }

      const data = info.data;
      let offset = 8;

      const authority = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
      const mintAddr = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;

      const nameLen = data.readUInt32LE(offset); offset += 4;
      const name = data.subarray(offset, offset + nameLen).toString("utf-8"); offset += nameLen;

      const symbolLen = data.readUInt32LE(offset); offset += 4;
      const symbol = data.subarray(offset, offset + symbolLen).toString("utf-8"); offset += symbolLen;

      const uriLen = data.readUInt32LE(offset); offset += 4;
      const uri = data.subarray(offset, offset + uriLen).toString("utf-8"); offset += uriLen;

      const decimals = data.readUInt8(offset); offset += 1;
      const enablePermanentDelegate = data.readUInt8(offset) === 1; offset += 1;
      const enableTransferHook = data.readUInt8(offset) === 1; offset += 1;
      const defaultAccountFrozen = data.readUInt8(offset) === 1; offset += 1;
      const paused = data.readUInt8(offset) === 1; offset += 1;
      const totalMinted = data.readBigUInt64LE(offset).toString(); offset += 8;
      const totalBurned = data.readBigUInt64LE(offset).toString(); offset += 8;

      res.json({
        mint: mintAddr.toBase58(),
        authority: authority.toBase58(),
        name,
        symbol,
        uri,
        decimals,
        preset: enablePermanentDelegate && enableTransferHook ? "SSS-2" : "SSS-1",
        paused,
        totalMinted,
        totalBurned,
        supply: (BigInt(totalMinted) - BigInt(totalBurned)).toString(),
        enablePermanentDelegate,
        enableTransferHook,
        defaultAccountFrozen,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
