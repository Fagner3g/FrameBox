import cron from "node-cron";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { db } from "../database/connection";

export class StorageCleanup {
  private static instance: StorageCleanup;

  private constructor() {}

  public static getInstance(): StorageCleanup {
    if (!StorageCleanup.instance) {
      StorageCleanup.instance = new StorageCleanup();
    }
    return StorageCleanup.instance;
  }

  public startJob(): void {
    console.log(`[StorageCleanup] Scheduled to run daily at 03:00 AM (Retention: ${config.RETENTION_DAYS} days)`);
    
    // Roda todo dia às 03:00 da manhã
    cron.schedule("0 3 * * *", () => {
      this.runCleanup();
    });
  }

  public runCleanup(): void {
    console.log("[StorageCleanup] Running scheduled cleanup job...");
    
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - config.RETENTION_DAYS);

    let deletedDiskFiles = 0;

    // 1. Limpeza Física no Disco
    if (fs.existsSync(config.RECORDINGS_PATH)) {
      const cameraDirs = fs.readdirSync(config.RECORDINGS_PATH);

      for (const camNode of cameraDirs) {
        const camPath = path.join(config.RECORDINGS_PATH, camNode);
        if (!fs.statSync(camPath).isDirectory()) continue;

        const files = fs.readdirSync(camPath);
        for (const file of files) {
          if (!file.endsWith(".mp4")) continue;

          const filePath = path.join(camPath, file);
          const stats = fs.statSync(filePath);
          
          // Se for mais velho que os dias de retenção
          if (stats.mtime < thresholdDate) {
            try {
              fs.unlinkSync(filePath);
              deletedDiskFiles++;
            } catch (err) {
              console.error(`[StorageCleanup] Failed to delete file ${filePath}:`, err);
            }
          }
        }
      }
    }
    
    console.log(`[StorageCleanup] Cleaned ${deletedDiskFiles} old video files from disk.`);

    // 2. Sincronização do Banco de Dados
    try {
      // Deleta metadados de vídeos super antigos. 
      // OBS: Estamos assumindo que DATETIME('now', '-X days') no SQLite será o limite.
      const deleteStmt = db.prepare("DELETE FROM recordings WHERE created_at < datetime('now', ?)");
      const result = deleteStmt.run(`-${config.RETENTION_DAYS} days`);
      console.log(`[StorageCleanup] Cleaned ${result.changes} old recording metadata rows from database.`);
    } catch (dbErr) {
      console.error(`[StorageCleanup] Failed to clean database metadata:`, dbErr);
    }
  }
}
