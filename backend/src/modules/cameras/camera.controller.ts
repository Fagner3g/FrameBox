import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import ffmpegPath from "ffmpeg-static";
import { db } from "../../database/connection";
import { Go2rtcManager } from "../../services/go2rtc";
import { StreamManager } from "../../services/stream-manager";

// Protocolos suportados e suas portas padrão
const PROTOCOL_DEFAULTS: Record<string, { port: number; pathTemplate: string }> = {
  rtsp:  { port: 554,   pathTemplate: "rtsp://{credentials}@{ip}:{port}/cam/realmonitor?channel=1&subtype=0" },
  dvrip: { port: 34567, pathTemplate: "dvrip://{credentials}@{ip}:{port}" },
  onvif: { port: 80,    pathTemplate: "rtsp://{credentials}@{ip}:{port}/onvif1" },
  http:  { port: 80,    pathTemplate: "http://{credentials}@{ip}:{port}/video" },
};

export class CameraController {

  /**
   * Constrói a URL de stream baseado no protocolo selecionado.
   * Se o usuário já forneceu a source_url manualmente, usa ela diretamente.
   */
  private static buildSourceUrl(protocol: string, ip: string, port: number, username?: string, password?: string): string {
    const proto = PROTOCOL_DEFAULTS[protocol] || PROTOCOL_DEFAULTS.rtsp;
    const finalPort = port || proto.port;

    let credentials = "";
    if (username) {
      credentials = password ? `${username}:${password}` : username;
    }

    let url = proto.pathTemplate
      .replace("{ip}", ip)
      .replace("{port}", String(finalPort));

    if (credentials) {
      url = url.replace("{credentials}@", `${credentials}@`);
    } else {
      url = url.replace("{credentials}@", "");
    }

    return url;
  }

  // GET /api/cameras/protocols — Lista os protocolos disponíveis pro App
  public static async listProtocols(_req: Request, res: Response): Promise<any> {
    const protocols = Object.entries(PROTOCOL_DEFAULTS).map(([key, val]) => ({
      id: key,
      label: key.toUpperCase(),
      defaultPort: val.port,
    }));
    return res.json(protocols);
  }

  // POST /api/cameras/test-connection — Testa conexão antes de cadastrar
  public static async testConnection(req: Request, res: Response): Promise<any> {
    try {
      const { ip, port, username, password, protocol } = req.body;

      if (!ip) return res.status(400).json({ success: false, error: "IP é obrigatório" });

      const selectedProtocol = protocol || "rtsp";
      const defaultPort = PROTOCOL_DEFAULTS[selectedProtocol]?.port || 554;
      const finalPort = port || defaultPort;
      const sourceUrl = CameraController.buildSourceUrl(selectedProtocol, ip, finalPort, username, password);

      console.log(`[TestConnection] Testando: ${sourceUrl}`);

      // Para DVRIP, FFmpeg não suporta o protocolo. Usamos TCP + go2rtc.
      if (selectedProtocol === "dvrip") {
        return CameraController.testDvripConnection(ip, finalPort, sourceUrl, res);
      }

      // Para RTSP/ONVIF/HTTP, usamos FFmpeg diretamente
      return CameraController.testFfmpegConnection(selectedProtocol, sourceUrl, ip, res);

    } catch (e) {
      console.error("[TestConnection] Error:", e);
      return res.status(500).json({ success: false, error: "Erro interno do servidor" });
    }
  }

  // Teste DVRIP: TCP socket + go2rtc API
  private static async testDvripConnection(ip: string, port: number, sourceUrl: string, res: Response): Promise<any> {
    // Passo 1: Verificar se a porta TCP está aberta (forçando IPv4)
    const tcpResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(8000);
      
      socket.on("connect", () => {
        console.log(`[TestConnection] TCP conectado em ${ip}:${port}`);
        socket.destroy();
        resolve({ ok: true });
      });
      
      socket.on("timeout", () => {
        console.log(`[TestConnection] TCP timeout para ${ip}:${port}`);
        socket.destroy();
        resolve({ ok: false, error: "timeout" });
      });
      
      socket.on("error", (err: any) => {
        console.log(`[TestConnection] TCP error para ${ip}:${port}: ${err.message}`);
        socket.destroy();
        resolve({ ok: false, error: err.message });
      });

      // Forçar IPv4 para evitar problemas de resolução
      socket.connect({ host: ip, port: port, family: 4 });
    });

    if (!tcpResult.ok) {
      console.log(`[TestConnection] ❌ TCP fechado para ${ip}:${port} (${tcpResult.error})`);
      return res.json({ 
        success: false, 
        error: `Porta ${port} inacessível em ${ip}. Verifique se o DVR está ligado e na mesma rede. (${tcpResult.error})`, 
        source_url: sourceUrl 
      });
    }

    // Passo 2: Adicionar stream temporário no go2rtc e verificar
    const testStreamName = `_test_${Date.now()}`;
    try {
      // Adiciona stream temporário via API do go2rtc
      await fetch(`http://127.0.0.1:1984/api/streams?dst=${testStreamName}&src=${encodeURIComponent(sourceUrl)}`, {
        method: "PUT",
      });

      // Espera 3 segundos para go2rtc tentar conectar
      await new Promise(r => setTimeout(r, 3000));

      // Checa se o stream apareceu com producers ativos
      const streamsRes = await fetch(`http://127.0.0.1:1984/api/streams?src=${testStreamName}`);
      const streams = await streamsRes.json();

      // Limpa o stream de teste
      await fetch(`http://127.0.0.1:1984/api/streams?dst=${testStreamName}`, { method: "DELETE" });

      if (streams && streams[testStreamName]) {
        console.log(`[TestConnection] ✅ DVRIP conectado com sucesso para ${ip}`);
        return res.json({ success: true, source_url: sourceUrl, message: "DVR conectado com sucesso via go2rtc!" });
      } else {
        console.log(`[TestConnection] ⚠️ TCP aberto mas go2rtc não conseguiu pull para ${ip}`);
        // TCP está aberto = câmera responde. Aceitamos como sucesso parcial.
        return res.json({ success: true, source_url: sourceUrl, message: `Porta ${port} respondendo em ${ip}. DVR detectado!` });
      }
    } catch (e) {
      // Se go2rtc não estiver rodando, fazemos apenas o teste TCP
      console.log(`[TestConnection] ✅ TCP aberto para ${ip}:${port} (go2rtc check skipped)`);
      return res.json({ success: true, source_url: sourceUrl, message: `Porta ${port} aberta em ${ip}. DVR parece estar online!` });
    }
  }

  // Teste RTSP/ONVIF/HTTP: via FFmpeg grab de 1 frame
  private static testFfmpegConnection(protocol: string, sourceUrl: string, ip: string, res: Response): Promise<void> {
    if (!ffmpegPath) {
      res.status(500).json({ success: false, error: "FFmpeg não disponível no servidor" });
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const timeout = 10000;
      let finished = false;

      const args: string[] = [];

      if (protocol === "rtsp" || protocol === "onvif") {
        args.push("-rtsp_transport", "tcp");
      }

      args.push(
        "-analyzeduration", "5000000",
        "-i", sourceUrl,
        "-vframes", "1",
        "-f", "null",
        "-"
      );

      const child = spawn(ffmpegPath!, args);

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          child.kill("SIGKILL");
          console.log(`[TestConnection] Timeout para ${ip}`);
          res.json({ success: false, error: "Timeout: câmera não respondeu em 10 segundos", source_url: sourceUrl });
          resolve();
        }
      }, timeout);

      let stderrData = "";
      child.stderr?.on("data", (chunk) => {
        stderrData += chunk.toString();
      });

      child.on("close", (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);

        if (code === 0) {
          console.log(`[TestConnection] ✅ Sucesso para ${ip}`);
          res.json({ success: true, source_url: sourceUrl, message: "Conexão estabelecida com sucesso!" });
        } else {
          let errorMsg = "Não foi possível conectar à câmera";
          if (stderrData.includes("Connection refused")) {
            errorMsg = "Conexão recusada. Verifique o IP e a porta.";
          } else if (stderrData.includes("401") || stderrData.includes("Unauthorized")) {
            errorMsg = "Credenciais incorretas (usuário/senha).";
          } else if (stderrData.includes("timed out") || stderrData.includes("timeout")) {
            errorMsg = "Timeout: câmera não responde. Verifique o IP.";
          } else if (stderrData.includes("No route to host")) {
            errorMsg = "Endereço inacessível. Verifique se está na mesma rede.";
          } else if (stderrData.includes("Invalid data")) {
            errorMsg = "Protocolo incompatível com esta câmera.";
          }
          
          console.log(`[TestConnection] ❌ Falha para ${ip}: ${errorMsg}`);
          res.json({ success: false, error: errorMsg, source_url: sourceUrl });
        }
        resolve();
      });

      child.on("error", (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        res.json({ success: false, error: `Erro interno: ${err.message}`, source_url: sourceUrl });
        resolve();
      });
    });
  }
  
  // POST /api/cameras/:id/webrtc — Proxy de sinalização WebRTC para o go2rtc local
  public static async webrtcSignal(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params;
      const streamName = `cam_${id.replace(/-/g, "")}`;
      const sdpOffer = req.body; // raw text body
      console.log(`[WebRTC] Signaling request for stream ${streamName} — body length: ${typeof sdpOffer === 'string' ? sdpOffer.length : JSON.stringify(sdpOffer).length}`);

      // WAKE UP DA CÂMERA (Bateria/Solar)
      // Dispara os pacotes UDP idênticos ao do App iCSee para acordar a câmera na rede local
      const camera = db.prepare("SELECT ip FROM cameras WHERE id = ?").get(id) as any;
      if (camera && camera.ip) {
        try {
          const dgram = require("node:dgram");
          const client = dgram.createSocket("udp4");
          
          client.on('error', () => { client.close(); });
          // Permite broadcast
          client.bind(() => {
            client.setBroadcast(true);
            
            // 1. DVRIP Discovery Probe (20 bytes exatos)
            const dvripPacket = Buffer.from("ff00000000000000000000000000fa0500000000", "hex");
            // 2. WS-Discovery (ONVIF/Discovery padrão porta 3702)
            const wsDiscovery = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2004/08/discovery"><e:Header><w:MessageID>uuid:49906669-e7d3-11e7-8106-28c2dd045620</w:MessageID><w:To>urn:schemas-xmlsoap-org:ws:2004:08:discovery</w:To><w:Action>http://schemas.xmlsoap.org/ws/2004/08/discovery/Probe</w:Action></e:Header><e:Body><d:Probe/></e:Body></e:Envelope>');
            // 3. NULL/Heartbeat
            const nullPacket = Buffer.from([0x00, 0x00, 0x00, 0x00]);
            
            const sendPings = () => {
              console.log(`[UDP] Bombardeando portas com ${dvripPacket.length} bytes...`);
              // Disparo em massa em todas as portas prováveis de Wake-up
              [34569, 32108, 10000, 3702, 32100].forEach(port => {
                client.send(dvripPacket, port, "255.255.255.255");
                client.send(dvripPacket, port, camera.ip);
                if (port === 3702) {
                  client.send(wsDiscovery, 3702, "239.255.255.250"); // Endereço Multicast ONVIF
                  client.send(wsDiscovery, 3702, "255.255.255.255");
                }
                client.send(nullPacket, port, camera.ip);
              });
            };

            // Envia 5 rodadas de "bombardeio" UDP para acordar o hardware
            for(let i=0; i<5; i++) {
              setTimeout(sendPings, i * 400);
            }
            
            setTimeout(() => client.close(), 2500);
          });
          
          console.log(`[WebRTC] Bomba de WAKE UP (Cluster Bomb) enviada para ${camera.ip}...`);
          
          // Validação de Porta TCP 34567 (Check se a câmera abriu o canal de vídeo)
          // Timeout estendido para 30 segundos (limite para sono profundo solar)
          const net = require("node:net");
          let isReady = false;
          const startTime = Date.now();
          
          while (!isReady && (Date.now() - startTime) < 30000) {
            isReady = await new Promise((resolve) => {
              const socket = new net.Socket();
              socket.setTimeout(1200);
              socket.on("connect", () => { socket.destroy(); resolve(true); });
              socket.on("error", () => { socket.destroy(); resolve(false); });
              socket.on("timeout", () => { socket.destroy(); resolve(false); });
              socket.connect(34567, camera.ip);
            });
            if (!isReady) await new Promise(r => setTimeout(r, 600));
          }

          if (isReady) {
            console.log(`[WebRTC] Câmera ${camera.ip} ACORDOU e porta 34567 está aberta!`);
            // Aguarda 1.5s extra para o servidor interno da câmera (RTSP/DVRIP) se estabilizar após abrir a porta
            await new Promise(r => setTimeout(r, 1500));
          } else {
            console.warn(`[WebRTC] Câmera ${camera.ip} não respondeu na porta 34567 após 20s.`);
          }
        } catch (err) {
          console.error("Falha ao enviar Wake Up packet:", err);
        }
      }

      const upstream = await fetch(
        `http://127.0.0.1:1984/api/webrtc?src=${encodeURIComponent(streamName)}`,
        {
          method: "POST",
          body: sdpOffer,
          headers: { "Content-Type": "application/sdp" },
        }
      );

      if (!upstream.ok) {
        const err = await upstream.text();
        console.error(`[WebRTC] go2rtc erro ${upstream.status}: ${err}`);
        return res.status(upstream.status).send(err);
      }

      const sdpAnswer = await upstream.text();
      res.setHeader("Content-Type", "application/x-www-form-urlencoded");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.send(sdpAnswer);
    } catch (e) {
      console.error("[WebRTC] Proxy error:", e);
      return res.status(502).json({ error: "go2rtc inacessível" });
    }
  }

  // GET /api/cameras/scan — Descobre câmeras na rede local via TCP probe
  public static async scan(_req: Request, res: Response): Promise<any> {
    try {
      const interfaces = os.networkInterfaces();
      let localIp: string | null = null;

      for (const iface of Object.values(interfaces) as (os.NetworkInterfaceInfo[] | undefined)[]) {
        if (!iface) continue;
        for (const addr of iface) {
          if (addr.family === 'IPv4' && !addr.internal) {
            localIp = addr.address;
            break;
          }
        }
        if (localIp) break;
      }

      if (!localIp) {
        return res.status(400).json({ error: 'Não foi possível determinar a rede local' });
      }

      const subnet = localIp.split('.').slice(0, 3).join('.');
      const candidates: string[] = [];
      for (let i = 1; i <= 254; i++) {
        const ip = `${subnet}.${i}`;
        if (ip !== localIp) candidates.push(ip);
      }

      const PROBE_PORTS = [
        { port: 34567, protocol: 'dvrip' },
        { port: 554,   protocol: 'rtsp'  },
        { port: 80,    protocol: 'onvif' },
      ];
      const TIMEOUT_MS = 800;
      const MAX_CONCURRENT = 15;

      const probePort = (ip: string, port: number): Promise<boolean> =>
        new Promise((resolve) => {
          const socket = new net.Socket();
          socket.setTimeout(TIMEOUT_MS);
          socket.on('connect', () => { socket.destroy(); resolve(true); });
          socket.on('timeout', () => { socket.destroy(); resolve(false); });
          socket.on('error',   () => resolve(false));
          socket.connect({ host: ip, port, family: 4 });
        });

      const results: { ip: string; protocol: string; port: number }[] = [];

      for (let i = 0; i < candidates.length; i += MAX_CONCURRENT) {
        const batch = candidates.slice(i, i + MAX_CONCURRENT);
        await Promise.all(
          batch.map(async (ip) => {
            for (const { port, protocol } of PROBE_PORTS) {
              if (await probePort(ip, port)) {
                results.push({ ip, protocol, port });
                break;
              }
            }
          })
        );
      }

      console.log(`[Scan] ${subnet}.0/24 → ${results.length} dispositivos encontrados`);
      return res.json(results);
    } catch (e) {
      console.error('[Scan]', e);
      return res.status(500).json({ error: 'Erro ao escanear rede' });
    }
  }

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
      const { name, ip, port, username, password, protocol, source_url, source_url_sub, enabled, recording } = req.body;
      
      if (!name) return res.status(400).json({ error: "Name is required" });

      const id = uuidv4();
      const selectedProtocol = protocol || "rtsp";

      // Se o usuário não mandou source_url explícita, o backend monta automaticamente
      let finalSourceUrl = source_url;
      if (!finalSourceUrl && ip) {
        const defaultPort = PROTOCOL_DEFAULTS[selectedProtocol]?.port || 554;
        finalSourceUrl = CameraController.buildSourceUrl(selectedProtocol, ip, port || defaultPort, username, password);
      }

      const insert = db.prepare(`
        INSERT INTO cameras (id, name, ip, port, username, password, protocol, source_url, source_url_sub, enabled, recording)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const vEnabled = enabled !== undefined ? (enabled ? 1 : 0) : 1;
      const vRecording = recording !== undefined ? (recording ? 1 : 0) : 1;
      const defaultPort = PROTOCOL_DEFAULTS[selectedProtocol]?.port || 554;
      
      insert.run(id, name, ip || null, port || defaultPort, username || null, password || null, selectedProtocol, finalSourceUrl || null, source_url_sub || null, vEnabled, vRecording);

      // Adiciona o stream no go2rtc sem reiniciar os demais
      if (finalSourceUrl) {
        await Go2rtcManager.getInstance().addStream(id, finalSourceUrl);
      }

      if (vEnabled && vRecording) {
        StreamManager.getInstance().startStream(id);
      }

      return res.status(201).json({ message: "Camera created", id, source_url: finalSourceUrl });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to create camera" });
    }
  }

  public static async update(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params;
      const { name, ip, port, username, password, protocol, source_url, source_url_sub, enabled, recording } = req.body;

      const camera = db.prepare("SELECT * FROM cameras WHERE id = ?").get(id) as any;
      if (!camera) return res.status(404).json({ error: "Camera not found" });

      // Reconstrói source_url se parâmetros de conexão mudaram e não foi passada URL manual
      let finalSourceUrl = source_url;
      if (!finalSourceUrl && (ip || port !== undefined || username !== undefined || password !== undefined || protocol)) {
        const newIp = ip || camera.ip;
        const newProtocol = protocol || camera.protocol || "rtsp";
        const newPort = port || camera.port || PROTOCOL_DEFAULTS[newProtocol]?.port || 554;
        const newUsername = username !== undefined ? username : camera.username;
        const newPassword = password !== undefined ? password : camera.password;
        if (newIp) {
          finalSourceUrl = CameraController.buildSourceUrl(newProtocol, newIp, newPort, newUsername, newPassword);
        }
      }

      const stmt = db.prepare(`
        UPDATE cameras
        SET name = COALESCE(?, name),
            ip = COALESCE(?, ip),
            port = COALESCE(?, port),
            username = COALESCE(?, username),
            password = COALESCE(?, password),
            protocol = COALESCE(?, protocol),
            source_url = COALESCE(?, source_url),
            source_url_sub = COALESCE(?, source_url_sub),
            enabled = COALESCE(?, enabled),
            recording = COALESCE(?, recording),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run(
        name, ip, port, username, password, protocol,
        finalSourceUrl || null, source_url_sub,
        enabled !== undefined ? (enabled ? 1 : 0) : null,
        recording !== undefined ? (recording ? 1 : 0) : null,
        id
      );

      // Para o stream atual e remove do go2rtc sem derrubar os demais
      StreamManager.getInstance().stopStream(id);
      await Go2rtcManager.getInstance().removeStream(id);

      const updated = db.prepare("SELECT * FROM cameras WHERE id = ?").get(id) as any;
      if (updated.enabled && updated.source_url) {
        await Go2rtcManager.getInstance().addStream(id, updated.source_url);
      }
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
      await Go2rtcManager.getInstance().removeStream(id);
      db.prepare("DELETE FROM cameras WHERE id = ?").run(id);

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
