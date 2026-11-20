import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { registerSocialRoutes } from "./social";
import { registerAuthRoutes } from "./auth";
import { registerTimetableRoutes } from "./timetable";

export async function registerRoutes(app: Express): Promise<Server> {
  registerAuthRoutes(app);
  registerSocialRoutes(app);
  registerTimetableRoutes(app);
  const httpServer = createServer(app);
  return httpServer;
}
