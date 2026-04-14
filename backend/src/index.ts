import express from 'express';
import path from 'node:path';
import { runMigrations } from './database/migrator';
import { config } from './config';
import { Go2rtcManager } from './services/go2rtc';
import { StreamManager } from './services/stream-manager';
import { StorageCleanup } from './services/storage-cleanup';
import authRoutes from './modules/auth/auth.routes';
import cameraRoutes from './modules/cameras/camera.routes';
import recordingRoutes from './modules/recordings/recording.routes';
import { authMiddleware } from './modules/auth/auth.middleware';

const app = express();

// Middlewares globais
app.use(express.json());

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/cameras', authMiddleware, cameraRoutes);
app.use('/api/recordings', authMiddleware, recordingRoutes);

// Servidor de estáticos abertos para o HLS streaming (ao vivo) local network
app.use('/live', express.static(config.LIVE_PATH));

// Assets estáticos do backend (ex: hls.min.js para o player mobile offline)
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// Initialize the database and run migrations before doing anything else
runMigrations();

app.get('/', (req, res) => {
  res.send('FrameBox Backend is running!');
});

app.get('/test', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'test-stream.html'));
});

app.listen(config.PORT, async () => {
  console.log(`✅ FrameBox Backend rodando na porta ${config.PORT}`);

  // Limpeza de Disco
  StorageCleanup.getInstance().startJob();

  // Quando go2rtc cair e reiniciar automaticamente, relança os streams FFmpeg
  Go2rtcManager.getInstance().setOnRestartCallback(() => {
    StreamManager.getInstance().startAllActive();
  });

  // Iniciar go2rtc (Ponte DVRIP/RTSP -> RTSP local)
  const go2rtcOk = await Go2rtcManager.getInstance().start();

  if (go2rtcOk) {
    // Iniciar gravação FFmpeg de todas as câmeras ativas
    StreamManager.getInstance().startAllActive();
  } else {
    console.error("[Startup] go2rtc não iniciou. Streams FFmpeg não serão iniciados agora.");
    console.error("[Startup] O watchdog tentará reiniciar go2rtc automaticamente.");
  }
});
