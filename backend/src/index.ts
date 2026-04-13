import express from 'express';
import { runMigrations } from './database/migrator';
import { config } from './config';
import { Go2rtcManager } from './services/go2rtc';

const app = express();

// Initialize the database and run migrations before doing anything else
runMigrations();

app.get('/', (req, res) => {
  res.send('FrameBox Backend is running!');
});

app.listen(config.PORT, async () => {
  console.log(`✅ FrameBox Backend rodando na porta ${config.PORT}`);
  
  // Iniciar o processo do go2rtc
  await Go2rtcManager.getInstance().start();
});
