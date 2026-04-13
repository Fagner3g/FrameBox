import path from "node:path";

export const config = {
  PORT: process.env.PORT || 3000,
  DB_PATH: process.env.DB_PATH || path.join(process.cwd(), "..", "storage", "framebox.db"),
  STORAGE_PATH: process.env.STORAGE_PATH || path.join(process.cwd(), "..", "storage"),
  LIVE_PATH: process.env.LIVE_PATH || path.join(process.cwd(), "..", "storage", "live"),
  RECORDINGS_PATH: process.env.RECORDINGS_PATH || path.join(process.cwd(), "..", "storage", "recordings"),
  RETENTION_DAYS: Number(process.env.RETENTION_DAYS) || 30,
  HLS_SEGMENT_DURATION: Number(process.env.HLS_SEGMENT_DURATION) || 2,
  JWT_SECRET: process.env.JWT_SECRET || "super-secret-default-key-change-it",
};
