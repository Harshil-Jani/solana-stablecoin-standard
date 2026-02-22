import { Connection, PublicKey } from "@solana/web3.js";
import { insertEvent } from "../db/schema";
import type { WebhookService } from "./webhook";

const PROGRAM_ID = new PublicKey("2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ");

export class EventListener {
  private subscriptionId: number | null = null;

  constructor(
    private connection: Connection,
    private logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
    private webhookService?: WebhookService,
  ) {}

  start(): void {
    this.logger.info("Starting event listener for program:", PROGRAM_ID.toBase58());

    this.subscriptionId = this.connection.onLogs(
      PROGRAM_ID,
      (logInfo) => {
        try {
          this.processLog(logInfo);
        } catch (err) {
          this.logger.error("Error processing log:", err);
        }
      },
      "confirmed"
    );
  }

  stop(): void {
    if (this.subscriptionId !== null) {
      this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
      this.logger.info("Event listener stopped");
    }
  }

  private processLog(logInfo: { signature: string; err: object | null; logs: string[] }): void {
    if (logInfo.err) return;

    for (const log of logInfo.logs) {
      if (!log.startsWith("Program data:")) continue;

      const base64Data = log.replace("Program data: ", "");
      const eventType = this.detectEventType(logInfo.logs);

      if (eventType) {
        const payload = { raw: base64Data, logs: logInfo.logs };
        insertEvent(
          eventType,
          PROGRAM_ID.toBase58(),
          payload,
          logInfo.signature,
          0,
          Math.floor(Date.now() / 1000)
        );
        this.logger.info(`Event captured: ${eventType} (${logInfo.signature})`);

        // Dispatch to registered webhooks
        if (this.webhookService) {
          this.webhookService
            .dispatch(eventType, { ...payload, signature: logInfo.signature })
            .catch((err) => this.logger.error("Webhook dispatch error:", err));
        }
      }
    }
  }

  private detectEventType(logs: string[]): string | null {
    const logText = logs.join(" ");
    if (logText.includes("StablecoinInitialized")) return "StablecoinInitialized";
    if (logText.includes("TokensMinted")) return "TokensMinted";
    if (logText.includes("TokensBurned")) return "TokensBurned";
    if (logText.includes("AccountFrozen")) return "AccountFrozen";
    if (logText.includes("AccountThawed")) return "AccountThawed";
    if (logText.includes("StablecoinPaused")) return "StablecoinPaused";
    if (logText.includes("StablecoinUnpaused")) return "StablecoinUnpaused";
    if (logText.includes("RolesUpdated")) return "RolesUpdated";
    if (logText.includes("MinterUpdated")) return "MinterUpdated";
    if (logText.includes("AuthorityTransferred")) return "AuthorityTransferred";
    if (logText.includes("AddedToBlacklist")) return "AddedToBlacklist";
    if (logText.includes("RemovedFromBlacklist")) return "RemovedFromBlacklist";
    if (logText.includes("TokensSeized")) return "TokensSeized";
    return null;
  }
}
