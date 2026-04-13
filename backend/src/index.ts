import express from 'express';
import { runMigrations } from './database/migrator';
import { config } from './config';
import { Go2rtcManager } from './services/go2rtc';
import { StreamManager } from './services/stream-manager';
import { StorageCleanup } from './services/storage-cleanup';
import authRoutes from './modules/auth/auth.routes';
import cameraRoutes from './modules/cameras/camera.routes';
import { authMiddleware } from './modules/auth/auth.middleware';

const app = express();

// Middlewares globais
app.use(express.json());

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/cameras', authMiddleware, cameraRoutes);

// Initialize the database and run migrations before doing anything else
runMigrations();

app.get('/', (req, res) => {
  res.send('FrameBox Backend is running!');
});

app.listen(config.PORT, async () => {
  console.log(`✅ FrameBox Backend rodando na porta ${config.PORT}`);
  
  // Iniciar CronJobs (Limpeza de Disco)
  StorageCleanup.getInstance().startJob();
  
  // Iniciar o processo do go2rtc (Ponte DVRIP -> RTSP)
  await Go2rtcManager.getInstance().start();
  
  // Iniciar a gravação (FFmpeg) de todas as câmeras habilitadas
  StreamManager.getInstance().startAllActive();
});
