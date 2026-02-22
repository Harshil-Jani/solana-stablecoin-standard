import { Router } from "express";
import { getEvents, getOperations } from "../db/schema";

export function eventsRouter(): Router {
  const router = Router();

  router.get("/events", (req, res) => {
    const { stablecoin, limit, offset } = req.query;
    const events = getEvents(
      stablecoin as string | undefined,
      Number(limit) || 50,
      Number(offset) || 0
    );
    res.json({ events, count: events.length });
  });

  router.get("/operations", (req, res) => {
    const { mint, limit, offset } = req.query;
    const operations = getOperations(
      mint as string | undefined,
      Number(limit) || 50,
      Number(offset) || 0
    );
    res.json({ operations, count: operations.length });
  });

  return router;
}
