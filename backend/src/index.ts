import express from "express";
import cors from "cors";
import helmet from "helmet";
import pino from "pino";
import { Connection } from "@solana/web3.js";
import { getDb } from "./db/schema";
import { EventListener } from "./services/event-listener";
import { WebhookService } from "./services/webhook";
import { apiKeyAuth } from "./middleware/auth";
import { statusRouter } from "./routes/status";
import { eventsRouter } from "./routes/events";
import { webhooksRouter } from "./routes/webhooks";

const PORT = Number(process.env.PORT) || 3001;
const RPC_URL = process.env.RPC_URL || "http://localhost:8899";

const logger = pino({ transport: { target: "pino-pretty" } });
const connection = new Connection(RPC_URL, "confirmed");

// Initialize DB
getDb();
logger.info("SQLite database initialized");

// Services
const webhookService = new WebhookService(logger);
const eventListener = new EventListener(connection, logger);

// Express app
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(apiKeyAuth);

// Health endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", rpc: RPC_URL, uptime: process.uptime() });
});

// Routes
app.use("/api", statusRouter(connection));
app.use("/api", eventsRouter());
app.use("/api", webhooksRouter(webhookService));

// Start
eventListener.start();

app.listen(PORT, () => {
  logger.info(`SSS Backend running on port ${PORT}`);
  logger.info(`RPC endpoint: ${RPC_URL}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  eventListener.stop();
  process.exit(0);
});
