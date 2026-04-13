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
- [x] Implementar Singleton de conexão com SQLite (`better-sqlite3`)
- [x] Criar tabelas: `cameras` (com campos DVRIP), `recordings`, `users`
- [x] Implementar `Go2rtcManager`:
    - [x] Iniciar/parar processo go2rtc como child process
    - [x] Gerar `go2rtc.yaml` dinamicamente a partir das câmeras no banco
    - [x] Health check via API go2rtc (`localhost:1984`)
- [x] Implementar `StreamManager`:
    - [x] Lógica de spawn do processo FFmpeg
    - [x] Consumir RTSP do go2rtc (`rtsp://localhost:8554/camera-{id}`)
    - [x] Geração de HLS Live (segmentos de 2s)
    - [x] Geração de MP4 contínuo (segmentado por hora)
    - [x] Watchdog para auto-restart do stream
- [x] Implementar `StorageCleanup`:
    - [x] Job diário para remover arquivos antigos (retenção)
    - [x] Sincronização de limpeza no banco de dados

## 🌐 Fase 3: API REST (Backend)
- [x] Autenticação:
    - [x] Registro do primeiro usuário (Setup inicial)
    - [x] Login com JWT
    - [x] Middleware de proteção de rotas
- [x] Módulo de Câmeras:
    - [x] CRUD completo (Create, Read, Update, Delete)
    - [x] Início/Parada manual de gravação
    - [x] Endpoint de Snapshot (gerar JPEG via FFmpeg)
- [x] Módulo de Gravações:
    - [x] Listagem filtrada por câmera e data
    - [x] Stream de arquivo estático (.mp4) com suporte a Range
    - [x] Endpoint de calendário (datas com vídeo disponível)

## 📱 Fase 4: App Mobile (React Native CLI)
- [x] Setup Inicial:
    - [x] Inicializar projeto Bare React Native com TypeScript (`npx @react-native-community/cli init`)
    - [x] Configurar React Navigation (Stack/Tabs) e dependências nativas
- [x] UI/UX & Componentes:
    - [x] Criar Design System básico (cores, tipografia)
    - [x] Componente `CameraCard` (Preview + Status)
    - [x] Componente `VideoPlayer` (HLS e MP4)
- [x] Telas:
    - [x] Tela de Login/Configuração do Servidor
    - [x] Dashboard (Grid de câmeras ao vivo)
    - [x] Visualização Fullscreen (Live)
    - [x] Galeria de Gravações (Calendário + Lista)
    - [x] Player de Playback com Timeline

## ✨ Fase 5: Integração e Polimento
- [x] Testar fluxo "Ponta a Ponta" (Adicionar câmera -> Gravar -> Ver no App)
- [x] Refinar UI (Tratamento de conexões lentas e reconexão)
- [x] Otimização Final:
    - [x] Ajustar perfis de transcoding limitando CPU (Preset `ultrafast` em copy modes)
- [x] Arquivo final de documentação (`README.md` detalhado) (Docker ou Instalação Manual)

---

## 🛠️ Regras Técnicas Importantes
1. **Protocolo DVRIP**: As câmeras iCSee usam DVRIP (porta 34567), não RTSP. O go2rtc faz a ponte DVRIP → RTSP.
2. **Codec H265**: O stream principal é H265. Use `-c:v copy -c:a copy` no FFmpeg (sem re-encoding).
3. **Atomicidade**: Gravações devem ser salvas em blocos de 1 hora para evitar perda de dados em caso de crash.
4. **Segurança**: Nunca expor URLs DVRIP/RTSP no front-end; o backend deve intermediar via HLS ou snapshots.
5. **Mobile First**: O design deve ser focado em telas de celular, com suporte a modo landscape para o vídeo.
6. **Reconexão**: Wi-Fi das câmeras é instável. Watchdog com backoff exponencial é obrigatório.
