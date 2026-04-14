import { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config";

export class RecordingController {
  
  // GET /api/recordings/calendar/:cameraId
  public static async getCalendar(req: Request, res: Response): Promise<any> {
    try {
      const { cameraId } = req.params;
      const camDir = path.join(config.RECORDINGS_PATH, cameraId as string);

      if (!fs.existsSync(camDir)) {
        return res.json([]); // Nenhuma gravação nesta câmera
      }

      const files = fs.readdirSync(camDir);
      const datesSet = new Set<string>();

      for (const file of files) {
        if (!file.endsWith(".mp4")) continue;
        // filename is YYYY-MM-DD_HH.mp4
        const datePart = file.split("_")[0];
        if (datePart && datePart.length === 10) {
          datesSet.add(datePart);
        }
      }

      // Ordenar do mais novo pro mais velho
      const uniqueDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a));
      return res.json(uniqueDates);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to fetch calendar dates" });
    }
  }

  // GET /api/recordings?cameraId=...&date=YYYY-MM-DD
  public static async list(req: Request, res: Response): Promise<any> {
    try {
      const { cameraId, date } = req.query;

      if (!cameraId || !date) {
        return res.status(400).json({ error: "cameraId and date are required" });
      }

      const camDir = path.join(config.RECORDINGS_PATH, cameraId as string);

      if (!fs.existsSync(camDir)) {
        return res.json([]);
      }

      const files = fs.readdirSync(camDir);
      const recordings: any[] = [];

      for (const file of files) {
        if (!file.endsWith(".mp4")) continue;
        if (!file.startsWith(date as string)) continue;

        const filePath = path.join(camDir, file);
        const stats = fs.statSync(filePath);

        // Filtra gravações que falharam/foram interrompidas (menos de 100KB)
        // Isso remove o "lixo" gerado por tentativas de conexão falhas.
        if (stats.size < 102400) continue; 

        // Extrai a hora: 17 do arquivo 2026-04-14_17.mp4
        const hh = file.split("_")[1].replace(".mp4", "");

        recordings.push({
          id: file, 
          cameraId,
          date,
          hour: hh,
          size_bytes: stats.size,
          created_at: stats.mtime,
          url: `/api/recordings/${cameraId}/stream/${file}` 
        });
      }

      recordings.sort((a, b) => a.hour.localeCompare(b.hour));

      return res.json(recordings);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to list recordings" });
    }
  }

  // DELETE /api/recordings/:cameraId/:filename
  public static async delete(req: Request, res: Response): Promise<any> {
    try {
      const { cameraId, filename } = req.params;
      const filePath = path.join(config.RECORDINGS_PATH, cameraId, filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return res.json({ message: "Recording deleted" });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to delete recording" });
    }
  }

  // GET /api/recordings/:cameraId/stream/:filename
  // Rota especializada para streaming nativo em players como AVFoundation/ExoPlayer
  public static async stream(req: Request, res: Response): Promise<any> {
    try {
      const { cameraId, filename } = req.params;
      const filePath = path.join(config.RECORDINGS_PATH, cameraId, filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }

      // res.sendFile é mágico: Quando o celular/web requisita um offset de bytes específico
      // no header "Range", o sendFile corta o arquivo exatamente onde deve usando Status 206.
      res.sendFile(filePath);
    } catch (e) {
      console.error(e);
      // Se não enviou o header ainda, tratar
      if (!res.headersSent) {
        return res.status(500).json({ error: "Failed to stream recording" });
      }
    }
  }
}
