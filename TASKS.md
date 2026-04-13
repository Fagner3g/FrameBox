# 📋 Checklist de Implementação - FrameBox

Este documento serve como a "fonte da verdade" para o progresso do desenvolvimento. Cada item deve ser marcado como concluído conforme avançamos.

## 🏗️ Fase 1: Setup e Infraestrutura Base
- [x] Inicializar pasta do projeto (`backend/`, `mobile/`, `storage/`)
- [x] Configurar TypeScript no Backend (tsconfig, scripts)
- [x] Configurar **Biome** para linting e formatação (unified config)
- [x] Definir variáveis de ambiente (.env.example)
- [x] Criar script `scripts/download-go2rtc.ts` para baixar binário do go2rtc (Cross-Platform) dinamicamente no `postinstall`
- [x] Validar FFmpeg (`ffmpeg-static` via npm) já instalado

## 🗄️ Fase 2: Backend Core & Banco de Dados
- [ ] Implementar Singleton de conexão com SQLite (`better-sqlite3`)
- [ ] Criar tabelas: `cameras` (com campos DVRIP), `recordings`, `users`
- [ ] Implementar `Go2rtcManager`:
    - [ ] Iniciar/parar processo go2rtc como child process
    - [ ] Gerar `go2rtc.yaml` dinamicamente a partir das câmeras no banco
    - [ ] Health check via API go2rtc (`localhost:1984`)
- [ ] Implementar `StreamManager`:
    - [ ] Lógica de spawn do processo FFmpeg
    - [ ] Consumir RTSP do go2rtc (`rtsp://localhost:8554/camera-{id}`)
    - [ ] Geração de HLS Live (segmentos de 2s)
    - [ ] Geração de MP4 contínuo (segmentado por hora)
    - [ ] Watchdog para auto-restart do stream
- [ ] Implementar `StorageCleanup`:
    - [ ] Job diário para remover arquivos antigos (retenção)
    - [ ] Sincronização de limpeza no banco de dados

## 🌐 Fase 3: API REST (Backend)
- [ ] Autenticação:
    - [ ] Registro do primeiro usuário (Setup inicial)
    - [ ] Login com JWT
    - [ ] Middleware de proteção de rotas
- [ ] Módulo de Câmeras:
    - [ ] CRUD completo (Create, Read, Update, Delete)
    - [ ] Início/Parada manual de gravação
    - [ ] Endpoint de Snapshot (gerar JPEG via FFmpeg)
- [ ] Módulo de Gravações:
    - [ ] Listagem filtrada por câmera e data
    - [ ] Stream de arquivo estático (.mp4) com suporte a Range
    - [ ] Endpoint de calendário (datas com vídeo disponível)

## 📱 Fase 4: App Mobile (Expo)
- [ ] Setup Inicial:
    - [ ] Inicializar projeto Expo com TypeScript
    - [ ] Configurar Expo Router e Navigation
- [ ] UI/UX & Componentes:
    - [ ] Criar Design System básico (cores, tipografia)
    - [ ] Componente `CameraCard` (Preview + Status)
    - [ ] Componente `VideoPlayer` (HLS e MP4)
- [ ] Telas:
    - [ ] Tela de Login/Configuração do Servidor
    - [ ] Dashboard (Grid de câmeras ao vivo)
    - [ ] Visualização Fullscreen (Live)
    - [ ] Galeria de Gravações (Calendário + Lista)
    - [ ] Player de Playback com Timeline

## ✨ Fase 5: Integração e Polimento
- [ ] Testar fluxo "Ponta a Ponta" (Adicionar câmera -> Gravar -> Ver no App)
- [ ] Otimização de performance no App (Lazy loading de streams)
- [ ] Tratamento de erros globais (Câmera offline, Server down)
- [ ] Documentação de Deploy (Docker ou Instalação Manual)

---

## 🛠️ Regras Técnicas Importantes
1. **Protocolo DVRIP**: As câmeras iCSee usam DVRIP (porta 34567), não RTSP. O go2rtc faz a ponte DVRIP → RTSP.
2. **Codec H265**: O stream principal é H265. Use `-c:v copy -c:a copy` no FFmpeg (sem re-encoding).
3. **Atomicidade**: Gravações devem ser salvas em blocos de 1 hora para evitar perda de dados em caso de crash.
4. **Segurança**: Nunca expor URLs DVRIP/RTSP no front-end; o backend deve intermediar via HLS ou snapshots.
5. **Mobile First**: O design deve ser focado em telas de celular, com suporte a modo landscape para o vídeo.
6. **Reconexão**: Wi-Fi das câmeras é instável. Watchdog com backoff exponencial é obrigatório.
