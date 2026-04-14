import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { config } from "../config";
import { db } from "../database/connection";

export class StreamManager {
  private static instance: StreamManager;
  // Map of cameraId -> running FFmpeg process
  private processes: Map<string, ChildProcess> = new Map();
  // Keep track of intentional stops to avoid auto-restarting
  private intentionalStops: Set<string> = new Set();
  
  private constructor() {
    // Garante que todos os processos FFmpeg são encerrados quando o Node.js sai
    // Isso evita processos órfãos ao reiniciar via nodemon ou Ctrl+C
    const cleanup = () => this.stopAll();
    process.once('exit',    cleanup);
    process.once('SIGINT',  () => { cleanup(); process.exit(0); });
    process.once('SIGTERM', () => { cleanup(); process.exit(0); });
  }

  public static getInstance(): StreamManager {
    if (!StreamManager.instance) {
      StreamManager.instance = new StreamManager();
    }
    return StreamManager.instance;
  }

  public startAllActive(): void {
    const cameras = db.prepare("SELECT id FROM cameras WHERE enabled = 1 AND recording = 1").all() as { id: string }[];
    console.log(`[StreamManager] Found ${cameras.length} active cameras to start streaming.`);
    for (const cam of cameras) {
      this.startStream(cam.id);
    }
  }

  public startStream(cameraId: string, retryCount = 0): void {
    if (this.processes.has(cameraId)) {
      console.log(`[StreamManager] Stream for camera ${cameraId} is already running.`);
      return;
    }

    if (!ffmpegPath) {
      console.error("[StreamManager] FFmpeg binary not found in ffmpeg-static!");
      return;
    }

    this.intentionalStops.delete(cameraId);

    // Ensure output directories exist
    const liveDir = path.join(config.LIVE_PATH, cameraId);
    const recDir = path.join(config.RECORDINGS_PATH, cameraId);

    if (!fs.existsSync(liveDir)) fs.mkdirSync(liveDir, { recursive: true });
    if (!fs.existsSync(recDir)) fs.mkdirSync(recDir, { recursive: true });

    const safeId = cameraId.replace(/-/g, "");
    const rtspSrc = `rtsp://127.0.0.1:8554/cam_${safeId}`;
    const m3u8Path = path.join(liveDir, "stream.m3u8");
    // Arquivo de inicialização fMP4 (necessário para HEVC em HLS no iOS)
    const fmp4InitPath = path.join(liveDir, "init.mp4");
    // strftime template path para gravações horárias
    const mp4TimestampPath = path.join(recDir, "%Y-%m-%d_%H.mp4");

    const args = [
      "-y",
      "-fflags", "+genpts",
      "-rtsp_transport", "tcp",
      "-i", rtspSrc,

      // -- Output: Gravação MP4 (segmentos por hora) — HEVC copy --
      // Mantém HEVC original sem re-encoding para economizar espaço em disco.
      // E converte pcm_alaw para aac pois MP4 não suporta pcm_alaw puro.
      "-c:v", "copy",
      "-tag:v", "hvc1",
      "-bsf:v", "hevc_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0",
      "-c:a", "aac",
      "-ar", "44100",
      "-af", "aresample=async=1",
      "-f", "segment",
      "-segment_time", "3600",
      "-reset_timestamps", "1",
      "-strftime", "1",
      mp4TimestampPath
    ];

    console.log(`[StreamManager] Spawning FFmpeg for camera ${cameraId}...`);
    
    const child = spawn(ffmpegPath, args, { stdio: "pipe" });
    this.processes.set(cameraId, child);

    child.stderr?.on("data", (data) => {
      // ffmpeg always logs to stderr. We will filter and only log explicit errors or warnings
      // to avoid flooding the application console.
      const str = data.toString().trim();
      if (str.toLowerCase().includes("error")) {
        console.error(`[FFmpeg-${cameraId} ERR]`, str);
      }
    });

    child.on("close", (code) => {
      console.log(`[StreamManager] FFmpeg for camera ${cameraId} exited with code ${code}`);
      this.processes.delete(cameraId);

      // Watchdog mechanism: If not stopped intentionally, restart!
      if (!this.intentionalStops.has(cameraId)) {
        // Exponential backoff logic
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 60000); // 1s, 2s, 4s... max 60s
        console.log(`[StreamManager] Watchdog: Restarting stream ${cameraId} in ${backoffMs}ms...`);
        setTimeout(() => {
          this.startStream(cameraId, retryCount + 1);
        }, backoffMs);
      }
    });
    
    child.on("error", (err) => {
      console.error(`[StreamManager] Failed to spawn FFmpeg: ${err.message}`);
    });
  }

  public stopStream(cameraId: string): void {
    const child = this.processes.get(cameraId);
    if (child) {
      console.log(`[StreamManager] Stopping stream ${cameraId}...`);
      this.intentionalStops.add(cameraId);
      // SIGINT is usually better for FFmpeg to allow it to close MP4 fragments gracefully
      child.kill("SIGINT"); 
      this.processes.delete(cameraId);
    }
  }

  public stopAll(): void {
    for (const [cameraId] of this.processes) {
      this.stopStream(cameraId);
    }
  }
}
