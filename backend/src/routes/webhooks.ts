import { Router } from "express";
import { WebhookService } from "../services/webhook";

export function webhooksRouter(webhookService: WebhookService): Router {
  const router = Router();

  router.get("/webhooks", (_req, res) => {
    res.json({ webhooks: webhookService.list() });
  });

  router.post("/webhooks", (req, res) => {
    const { url, events, secret } = req.body;
    if (!url || !events || !Array.isArray(events)) {
      res.status(400).json({ error: "url and events[] are required" });
      return;
    }
    const id = webhookService.register(url, events, secret);
    res.status(201).json({ id, url, events });
  });

  router.delete("/webhooks/:id", (req, res) => {
    webhookService.remove(Number(req.params.id));
    res.json({ deleted: true });
  });

  return router;
}
