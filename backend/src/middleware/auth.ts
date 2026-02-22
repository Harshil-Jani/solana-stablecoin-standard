import type { Request, Response, NextFunction } from "express";

const API_KEY = process.env.API_KEY || "dev-api-key";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Health endpoint is always public
  if (req.path === "/health") return next();

  const key = req.headers["x-api-key"] as string;
  if (!key || key !== API_KEY) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }
  next();
}
