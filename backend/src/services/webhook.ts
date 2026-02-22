import { getDb } from "../db/schema";

interface WebhookConfig {
  id: number;
  url: string;
  events: string;
  active: number;
  secret: string | null;
}

export class WebhookService {
  private logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

  constructor(logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void }) {
    this.logger = logger;
  }

  async dispatch(eventType: string, payload: object): Promise<void> {
    const db = getDb();
    const webhooks = db.prepare(
      `SELECT * FROM webhooks WHERE active = 1`
    ).all() as WebhookConfig[];

    for (const webhook of webhooks) {
      const subscribedEvents = webhook.events.split(",").map((e) => e.trim());
      if (!subscribedEvents.includes("*") && !subscribedEvents.includes(eventType)) continue;

      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(webhook.secret ? { "X-Webhook-Secret": webhook.secret } : {}),
          },
          body: JSON.stringify({ event: eventType, data: payload, timestamp: Date.now() }),
        });

        if (!response.ok) {
          this.logger.error(`Webhook ${webhook.id} failed: ${response.status}`);
        } else {
          this.logger.info(`Webhook ${webhook.id} delivered: ${eventType}`);
        }
      } catch (err) {
        this.logger.error(`Webhook ${webhook.id} error:`, err);
      }
    }
  }

  register(url: string, events: string[], secret?: string): number {
    const db = getDb();
    const result = db.prepare(
      `INSERT INTO webhooks (url, events, secret) VALUES (?, ?, ?)`
    ).run(url, events.join(","), secret ?? null);
    return result.lastInsertRowid as number;
  }

  list() {
    const db = getDb();
    return db.prepare(`SELECT id, url, events, active FROM webhooks`).all();
  }

  remove(id: number): void {
    const db = getDb();
    db.prepare(`DELETE FROM webhooks WHERE id = ?`).run(id);
  }
}
