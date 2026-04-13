import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { db } from "../database/connection";

export class Go2rtcManager {
  private static instance: Go2rtcManager;
  private process: ChildProcess | null = null;
  private readonly binPath: string;
  private readonly configPath: string;

  private constructor() {
    this.binPath = path.join(process.cwd(), "bin", process.platform === "win32" ? "go2rtc.exe" : "go2rtc");
    this.configPath = path.join(config.STORAGE_PATH, "go2rtc.yaml");
  }

  public static getInstance(): Go2rtcManager {
    if (!Go2rtcManager.instance) {
      Go2rtcManager.instance = new Go2rtcManager();
    }
    return Go2rtcManager.instance;
  }

  public async generateConfig(): Promise<void> {
    console.log("Generating go2rtc.yaml configuration...");
    
    // Buscar câmeras ativas
    const cameras = db.prepare("SELECT * FROM cameras WHERE enabled = 1").all() as any[];

    // YAML base string (simplificado)
    let yamlContent = "streams:\n";
    
    // Se não tiver câmeras, colocamos uma stream de teste só pra não quebrar a sintaxe do yaml
    if (cameras.length === 0) {
      yamlContent += "  test: \"rtsp://example.com/test\"\n";
    }
    
    for (const cam of cameras) {
      let streamUrl = cam.source_url;
      
      // Se não tem URL direta mas tem IP, monta por DVRIP
      if (!streamUrl && cam.ip) {
        const user = cam.username || "admin";
        const pass = cam.password || "";
        const port = cam.port || 34567;
        const credentials = pass ? `${user}:${pass}` : user;
        streamUrl = `dvrip://${credentials}@${cam.ip}:${port}`;
      }
      
      if (streamUrl) {
        // As chaves no go2rtc.yaml definem o nome da stream (ex: stream camera-1)
        yamlContent += `  "${cam.id}": "${streamUrl}"\n`;
      }
    }

    if (!fs.existsSync(config.STORAGE_PATH)) {
      fs.mkdirSync(config.STORAGE_PATH, { recursive: true });
    }

    fs.writeFileSync(this.configPath, yamlContent, "utf-8");
    console.log("go2rtc.yaml generated successfully.");
  }

  public async start(): Promise<boolean> {
    if (this.process) {
      console.log("go2rtc is already running.");
      return true;
    }

    await this.generateConfig();

    console.log(`Starting go2rtc from ${this.binPath}...`);
    
    if (!fs.existsSync(this.binPath)) {
      console.error(`[Go2rtcManager] Binary not found at ${this.binPath}. Please run 'npm run postinstall' from backend directory.`);
      return false;
    }

    try {
      // Garantir permissão de execução (chmod +x)
      if (process.platform !== "win32") {
        fs.chmodSync(this.binPath, 0o755);
      }
    } catch (e) {
      console.warn("[Go2rtcManager] Could not set execute permissions on go2rtc binary:", e);
    }

    this.process = spawn(this.binPath, ["-config", this.configPath], {
      stdio: "pipe",
    });

    this.process.on("error", (error) => {
      console.error(`[Go2rtcManager] Failed to spawn go2rtc: ${error.message}`);
    });

    this.process.stderr?.on("data", (data) => {
      // Go2Rtc geralmente loga na stderr, vamos capturar logs de WARN/ERR/INF
      const logStr = data.toString().trim();
      if (logStr) {
        console.log(`[go2rtc] ${logStr}`);
      }
    });

    this.process.on("close", (code) => {
      console.log(`go2rtc process exited with code ${code}`);
      this.process = null;
    });

    // Validar subida com Health check
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (await this.healthCheck()) {
           console.log("go2rtc started successfully and is healthy!");
           return true; 
        }
    }
    
    console.error("Failed to start go2rtc (health check failed).");
    return false;
  }

  public stop(): void {
    if (this.process) {
      console.log("Stopping go2rtc process...");
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch("http://127.0.0.1:1984/api/streams");
      return res.ok;
    } catch (e) {
      return false;
    }
  }
}
