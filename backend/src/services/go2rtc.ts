import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "../config";
import { db } from "../database/connection";

// Converte cameraId UUID para o nome de stream usado no go2rtc
function toStreamName(cameraId: string): string {
  return `cam_${cameraId.replace(/-/g, "")}`;
}

export class Go2rtcManager {
  private static instance: Go2rtcManager;
  private process: ChildProcess | null = null;
  private readonly binPath: string;
  private readonly configPath: string;
  private intentionalStop = false;
  // Callback acionado após restart automático para que index.ts possa reiniciar os streams
  private onRestartCallback?: () => void;

  private constructor() {
    this.binPath = path.join(process.cwd(), "bin", process.platform === "win32" ? "go2rtc.exe" : "go2rtc");
    this.configPath = path.join(config.STORAGE_PATH, "go2rtc.yaml");

    // Limpeza em caso de encerramento do processo
    const cleanup = () => {
      this.intentionalStop = true;
      if (this.process) {
        this.process.kill("SIGINT");
        this.process = null;
      }
    };
    process.once("exit", cleanup);
    process.once("SIGINT", () => { cleanup(); process.exit(0); });
    process.once("SIGTERM", () => { cleanup(); process.exit(0); });
    process.once("SIGUSR2", () => { cleanup(); process.exit(0); }); // Nodemon restart
  }

  public static getInstance(): Go2rtcManager {
    if (!Go2rtcManager.instance) {
      Go2rtcManager.instance = new Go2rtcManager();
    }
    return Go2rtcManager.instance;
  }

  /** Registra o callback a ser chamado após go2rtc reiniciar (ex: restartar streams FFmpeg). */
  public setOnRestartCallback(cb: () => void): void {
    this.onRestartCallback = cb;
  }

  /** Retorna o primeiro IP IPv4 não-loopback da máquina. */
  private getLocalIp(): string | null {
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces) as (os.NetworkInterfaceInfo[] | undefined)[]) {
      if (!iface) continue;
      for (const addr of iface) {
        if (addr.family === "IPv4" && !addr.internal) return addr.address;
      }
    }
    return null;
  }

  public async generateConfig(): Promise<void> {
    console.log("Generating go2rtc.yaml configuration...");

    const localIp = this.getLocalIp();
    const cameras = db.prepare("SELECT * FROM cameras WHERE enabled = 1").all() as any[];

    // Cabeçalho: habilita CORS na API e anuncia o IP LAN nos ICE candidates
    let yamlContent = "api:\n  cors: true\n\n";
    if (localIp) {
      yamlContent += `webrtc:\n  candidates:\n    - ${localIp}\n\n`;
    }
    yamlContent += "streams:\n";

    if (cameras.length === 0) {
      yamlContent += "  test: \"rtsp://example.com/test\"\n";
    }

    for (const cam of cameras) {
      let streamUrl = cam.source_url;

      if (!streamUrl && cam.ip) {
        const user = cam.username || "admin";
        const pass = cam.password || "";
        const port = cam.port || 34567;
        const credentials = pass ? `${user}:${pass}` : user;
        streamUrl = `dvrip://${credentials}@${cam.ip}:${port}`;
      }

      if (streamUrl) {
        const safeId = cam.id.replace(/-/g, "");
        const streamName = `cam_${safeId}`;
        const rawStreamName = `${streamName}_raw`;
        
        // 1. O stream _raw conecta direto no hardware (DVRIP/RTSP)
        yamlContent += `  ${rawStreamName}:\n`;
        yamlContent += `    - ${streamUrl}\n`;
        
        // 2. O stream principal linka com o raw via RTSP interno
        // Usar o URL RTSP interno resolve o erro "unsupported scheme" no go2rtc
        yamlContent += `  ${streamName}:\n`;
        yamlContent += `    - rtsp://127.0.0.1:8554/${rawStreamName}\n`;
        yamlContent += `    - "ffmpeg:rtsp://127.0.0.1:8554/${rawStreamName}#video=h264"\n`;
      }
    }

    if (!fs.existsSync(config.STORAGE_PATH)) {
      fs.mkdirSync(config.STORAGE_PATH, { recursive: true });
    }

    fs.writeFileSync(this.configPath, yamlContent, "utf-8");
    console.log("go2rtc.yaml generated successfully.");
  }

  public async start(): Promise<boolean> {
    this.intentionalStop = false;

    if (this.process) {
      console.log("[Go2rtcManager] Processo já está rodando (referência ativa).");
      return true;
    }

    // Se go2rtc já está rodando de uma execução anterior (ex: nodemon reiniciou o backend),
    // adotamos o processo existente em vez de tentar spawnar um novo e gerar conflito de porta.
    if (await this.healthCheck()) {
      console.log("[Go2rtcManager] go2rtc detectado rodando externamente. Adotando processo existente.");
      // Garantir que a config está atualizada no processo existente (via hot-reload de streams)
      await this.syncStreamsToRunning();
      return true;
    }

    await this.generateConfig();

    if (!fs.existsSync(this.binPath)) {
      console.error(`[Go2rtcManager] Binário não encontrado em ${this.binPath}. Execute 'npm run postinstall'.`);
      return false;
    }

    try {
      if (process.platform !== "win32") {
        fs.chmodSync(this.binPath, 0o755);
      }
    } catch (e) {
      console.warn("[Go2rtcManager] Não foi possível setar permissão de execução:", e);
    }

    console.log(`[Go2rtcManager] Iniciando go2rtc...`);
    this.process = spawn(this.binPath, ["-config", this.configPath], {
      stdio: "pipe",
    });

    this.process.on("error", (error) => {
      console.error(`[Go2rtcManager] Falha ao spawnar go2rtc: ${error.message}`);
      this.process = null;
    });

    this.process.stderr?.on("data", (data) => {
      const logStr = data.toString().trim();
      if (logStr) console.log(`[go2rtc] ${logStr}`);
    });

    this.process.on("close", (code) => {
      console.log(`[Go2rtcManager] go2rtc encerrou com código ${code}`);
      this.process = null;

      // Watchdog: reinicia automaticamente se não foi parado intencionalmente
      if (!this.intentionalStop) {
        const delay = 3000;
        console.log(`[Go2rtcManager] Reiniciando go2rtc em ${delay}ms...`);
        setTimeout(async () => {
          const ok = await this.start();
          if (ok && this.onRestartCallback) {
            console.log("[Go2rtcManager] go2rtc recuperado. Reiniciando streams FFmpeg...");
            this.onRestartCallback();
          }
        }, delay);
      }
    });

    // Health check com até 8 tentativas (go2rtc pode demorar um pouco para bindar as portas)
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (await this.healthCheck()) {
        console.log("[Go2rtcManager] go2rtc iniciado com sucesso!");
        return true;
      }
    }

    console.error("[Go2rtcManager] Falha no health check após 8s. go2rtc não respondeu.");
    return false;
  }

  public stop(): void {
    this.intentionalStop = true;
    if (this.process) {
      console.log("[Go2rtcManager] Parando go2rtc...");
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch("http://127.0.0.1:1984/api/streams");
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Sincroniza as câmeras do banco com um go2rtc já em execução (processo adotado).
   * Só adiciona streams que ainda não estão registrados para evitar entradas duplicadas.
   */
  private async syncStreamsToRunning(): Promise<void> {
    let existingStreams: Record<string, any> = {};
    try {
      const res = await fetch("http://127.0.0.1:1984/api/streams");
      existingStreams = await res.json();
    } catch {
      // se não conseguir listar, tenta adicionar tudo mesmo assim
    }

    const cameras = db.prepare("SELECT * FROM cameras WHERE enabled = 1").all() as any[];
    for (const cam of cameras) {
      const streamName = toStreamName(cam.id);
      // Só adiciona se o stream ainda não estiver registrado no go2rtc
      if (cam.source_url && !existingStreams[streamName]) {
        await this.addStream(cam.id, cam.source_url);
      }
    }
  }

  /**
   * Adiciona ou atualiza um stream no go2rtc sem reiniciar o processo.
   * Usa a API REST do go2rtc: PUT /api/streams?dst=<name>&src=<url>
   * Também adiciona fonte FFmpeg para transcodificar H265→H264 para WebRTC.
   */
  public async addStream(cameraId: string, sourceUrl: string): Promise<void> {
    const name = toStreamName(cameraId);
    const rawName = `${name}_raw`;
    try {
      // 1. Registra o stream RAW (Hardware)
      await fetch(
        `http://127.0.0.1:1984/api/streams?dst=${encodeURIComponent(rawName)}&src=${encodeURIComponent(sourceUrl)}`,
        { method: "PUT" }
      );

      // 2. Linka o principal ao RAW via RTSP interno
      const internalRtsp = `rtsp://127.0.0.1:8554/${rawName}`;
      await fetch(
        `http://127.0.0.1:1984/api/streams?dst=${encodeURIComponent(name)}&src=${encodeURIComponent(internalRtsp)}`,
        { method: "PUT" }
      );
      
      // 3. Adiciona a fonte FFmpeg transcodificada tb via RTSP interno
      const ffmpegSrc = `ffmpeg:${internalRtsp}#video=h264`;
      await fetch(
        `http://127.0.0.1:1984/api/streams?dst=${encodeURIComponent(name)}&src=${encodeURIComponent(ffmpegSrc)}`,
        { method: "PUT" }
      );
      
      console.log(`[Go2rtcManager] Stream adicionado: ${name} (Referenciando RAW via RTSP interno)`);
    } catch (e) {
      console.warn(`[Go2rtcManager] Falha ao adicionar stream ${name}:`, e);
    }
  }

  /**
   * Remove um stream do go2rtc sem reiniciar o processo.
   * Usa a API REST do go2rtc: DELETE /api/streams?dst=<name>
   */
  public async removeStream(cameraId: string): Promise<void> {
    const name = toStreamName(cameraId);
    try {
      await fetch(
        `http://127.0.0.1:1984/api/streams?dst=${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );
      console.log(`[Go2rtcManager] Stream removido: ${name}`);
    } catch (e) {
      console.warn(`[Go2rtcManager] Falha ao remover stream ${name}:`, e);
    }
  }
}
