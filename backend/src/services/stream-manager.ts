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
  
  private constructor() {}

  public static getInstance(): StreamManager {
    if (!StreamManager.instance) {
      StreamManager.instance = new StreamManager();
    }
    return StreamManager.instance;
  }

  public startAllActive(): void {
    const cameras = db.prepare("SELECT id FROM cameras WHERE enabled = 1").all() as { id: string }[];
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

    // go2rtc automatically maps rtsp stream at this specific local port based on camera ID
    const rtspSrc = `rtsp://127.0.0.1:8554/${cameraId}`;
    const m3u8Path = path.join(liveDir, "stream.m3u8");
    // strftime template path for recordings (YYYY-MM-DD_HH.mp4)
    const mp4TimestampPath = path.join(recDir, "%Y-%m-%d_%H.mp4");

    const args = [
      "-y", // overwrite outputs automatically
      "-rtsp_transport", "tcp",
      "-i", rtspSrc,
      
      // -- Output 1: HLS Live --
      "-c:v", "copy",
      "-c:a", "copy",
      "-f", "hls",
      "-hls_time", String(config.HLS_SEGMENT_DURATION),
      "-hls_list_size", "30",
      "-hls_flags", "delete_segments",
      m3u8Path,
      
      // -- Output 2: Record MP4 (Hourly Segments) --
      "-c:v", "copy",
      "-c:a", "copy",
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
