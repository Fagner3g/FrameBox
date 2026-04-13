import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { db } from "../../database/connection";
import { Go2rtcManager } from "../../services/go2rtc";
import { StreamManager } from "../../services/stream-manager";

export class CameraController {
  
  public static async list(req: Request, res: Response): Promise<any> {
    try {
      const cameras = db.prepare("SELECT * FROM cameras").all();
      return res.json(cameras);
    } catch (e) {
      return res.status(500).json({ error: "Failed to list cameras" });
    }
  }

  public static async get(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params;
      const camera = db.prepare("SELECT * FROM cameras WHERE id = ?").get(id);
      if (!camera) return res.status(404).json({ error: "Camera not found" });
      return res.json(camera);
    } catch (e) {
      return res.status(500).json({ error: "Failed to load camera" });
    }
  }

  public static async create(req: Request, res: Response): Promise<any> {
    try {
      const { name, ip, port, username, password, source_url, source_url_sub, enabled, recording } = req.body;
      
      if (!name) return res.status(400).json({ error: "Name is required" });

      const id = uuidv4();
      const insert = db.prepare(`
        INSERT INTO cameras (id, name, ip, port, username, password, source_url, source_url_sub, enabled, recording)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const vEnabled = enabled !== undefined ? (enabled ? 1 : 0) : 1;
      const vRecording = recording !== undefined ? (recording ? 1 : 0) : 1;
      
      insert.run(id, name, ip || null, port || 34567, username || null, password || null, source_url || null, source_url_sub || null, vEnabled, vRecording);

      // Reinicia o Go2RTC para ler o yaml novo com a camera fresquinha
      await Go2rtcManager.getInstance().generateConfig();
      Go2rtcManager.getInstance().stop();
      await Go2rtcManager.getInstance().start();

      if (vEnabled && vRecording) {
        StreamManager.getInstance().startStream(id);
      }

      return res.status(201).json({ message: "Camera created", id });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to create camera" });
    }
  }

  public static async update(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params;
      const { name, ip, port, username, password, source_url, source_url_sub, enabled, recording } = req.body;

      const camera = db.prepare("SELECT * FROM cameras WHERE id = ?").get(id);
      if (!camera) return res.status(404).json({ error: "Camera not found" });

      const stmt = db.prepare(`
        UPDATE cameras 
        SET name = COALESCE(?, name),
            ip = COALESCE(?, ip),
            port = COALESCE(?, port),
            username = COALESCE(?, username),
            password = COALESCE(?, password),
            source_url = COALESCE(?, source_url),
            source_url_sub = COALESCE(?, source_url_sub),
            enabled = COALESCE(?, enabled),
            recording = COALESCE(?, recording),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run(name, ip, port, username, password, source_url, source_url_sub, 
               enabled !== undefined ? (enabled ? 1 : 0) : null, 
               recording !== undefined ? (recording ? 1 : 0) : null, id);

      // Paraliza eventuais transmissões ativas desta câmera
      StreamManager.getInstance().stopStream(id);
      
      Go2rtcManager.getInstance().stop();
      await Go2rtcManager.getInstance().start();

      const updated = db.prepare("SELECT * FROM cameras WHERE id = ?").get(id) as any;
      if (updated.enabled && updated.recording) {
        StreamManager.getInstance().startStream(id);
      }

      return res.json({ message: "Camera updated successfully" });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to update camera" });
    }
  }

  public static async delete(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params;
      
      StreamManager.getInstance().stopStream(id);
      db.prepare("DELETE FROM cameras WHERE id = ?").run(id);

      Go2rtcManager.getInstance().stop();
      await Go2rtcManager.getInstance().start();

      return res.json({ message: "Camera deleted successfully" });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to delete camera" });
    }
  }

  public static async startRecording(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params;
      db.prepare("UPDATE cameras SET recording = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      StreamManager.getInstance().startStream(id);
      return res.json({ message: "Recording started" });
    } catch (e) {
      return res.status(500).json({ error: "Failed to start recording" });
    }
  }

  public static async stopRecording(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params;
      db.prepare("UPDATE cameras SET recording = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      StreamManager.getInstance().stopStream(id);
      return res.json({ message: "Recording stopped" });
    } catch (e) {
      return res.status(500).json({ error: "Failed to stop recording" });
    }
  }

  public static async snapshot(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params;
      const camera = db.prepare("SELECT * FROM cameras WHERE id = ?").get(id) as any;
      if (!camera) return res.status(404).json({ error: "Camera not found" });

      if (!ffmpegPath) return res.status(500).json({ error: "FFmpeg not available" });

      // Lê diretamente da conexão local em loopback criada pelo go2rtc. 
      // Mas se ela estiver desabilitada, a porta não foi aberta, tentamos buscar a imagem na unha direto na rede local (DVR).
      const rtspSrc = camera.enabled 
        ? `rtsp://127.0.0.1:8554/${id}` 
        : (camera.source_url || `dvrip://${camera.username}:${camera.password}@${camera.ip}:${camera.port}`);

      res.setHeader('Content-Type', 'image/jpeg');

      // Faz spawn de FFmpeg forçando a extrair EXATAMENTE UM frame com qualidade aceitável
      const child = spawn(ffmpegPath, [
        "-rtsp_transport", "tcp",
        "-i", rtspSrc,
        "-vframes", "1",
        "-q:v", "2",
        "-f", "image2",
        "pipe:1"  // Jogar o JPEG cru montado diretamente na saída (stdout) 
      ]);

      // Engata (pipe) a saída do FFmpeg no corpo da Response para o Client Mobile e web ver com o menor delay absurdo
      child.stdout.pipe(res);

      child.on("error", (err) => {
        console.error("FFmpeg snapshot capture error:", err);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });

    } catch (e) {
      console.error(e);
      if (!res.headersSent) {
         res.status(500).json({ error: "Failed to generate snapshot" });
      }
    }
  }
}
