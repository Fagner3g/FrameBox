# FrameBox — Sistema Self-Hosted de Gravação de Câmeras IP

Substituir a dependência de cloud pago (iCSee/Yoosee) por um servidor próprio que captura, armazena e serve as gravações das suas câmeras IP, com um app mobile para visualização.

## Arquitetura Geral

```mermaid
graph LR
    subgraph Rede Local
        CAM1[📷 Câmera 1<br/>RTSP] --> SERVER
        CAM2[📷 Câmera 2<br/>RTSP] --> SERVER
        CAM3[📷 Câmera N<br/>RTSP] --> SERVER
    end

    subgraph Servidor FrameBox
        SERVER[Node.js Backend] --> FFMPEG[FFmpeg Workers]
        FFMPEG --> HLS[HLS Segments<br/>.ts + .m3u8]
        FFMPEG --> RECORDINGS[Gravações<br/>MP4 por hora]
        SERVER --> DB[(SQLite)]
        SERVER --> API[REST API]
    end

    subgraph Mobile
        APP[React Native App] --> API
        APP --> HLS
    end
```

---

## Decisões Técnicas

### Como capturar o vídeo das câmeras iCSee/Yoosee

As câmeras iCSee/Yoosee suportam **RTSP** e **ONVIF**. O fluxo RTSP é o caminho mais direto:

```
rtsp://admin:<senha>@<IP>:554/onvif1          (stream principal HD)
rtsp://admin:<senha>@<IP>:554/onvif2          (stream secundário SD)
```

> [!IMPORTANT]
> É necessário habilitar RTSP/ONVIF nas configurações da câmera pelo app iCSee. O usuário pode precisar usar o **ONVIF Device Manager** (Windows) para descobrir as URLs exatas dos streams, pois variam conforme o fabricante do hardware.

### Estratégia de gravação

O **FFmpeg** consome o stream RTSP e gera dois outputs simultâneos:

1. **Live HLS** — Segmentos curtos (2s) para visualização ao vivo no app, com janela deslizante (últimos 30 segmentos mantidos).
2. **Gravação contínua em MP4** — Arquivos por hora (`2026-04-13_17.mp4`), organizados por câmera e data, para acesso posterior.

Isso usa `codec copy` (sem re-encoding), mantendo qualidade original e **uso mínimo de CPU**.

### Por que não usar Frigate/Shinobi/ZoneMinder?

Construir do zero nos dá:
- **Controle total** sobre a API e o formato de armazenamento
- **App mobile customizado** integrado nativamente
- **Leveza** — sem dependências pesadas como Docker, MQTT, Home Assistant
- **Aprendizado** — o objetivo é ter seu próprio sistema

> [!NOTE]
> Se no futuro quiser adicionar detecção de movimento/objetos com IA, a arquitetura permite integrar modelos como TensorFlow Lite ou Coral TPU como módulo.

---

## Stack Tecnológico

| Componente | Tecnologia | Justificativa |
|:---|:---|:---|
| **Backend** | Node.js + Express | Leve, async, ideal para gerenciar processos FFmpeg |
| **Gravação** | FFmpeg (child process) | Padrão da indústria para RTSP → HLS/MP4 |
| **Banco de dados** | SQLite (via better-sqlite3) | Zero config, perfeito para metadados de câmeras e gravações |
| **Autenticação** | JWT | Segurança simples e stateless |
| **App Mobile** | React Native (Expo) | Cross-platform, DX excelente |
| **Player de vídeo** | react-native-video | Suporte nativo a HLS no iOS (AVFoundation) e Android (ExoPlayer) |
| **Linguagem** | TypeScript | Type safety em ambos os projetos |

---

## Estrutura do Projeto

```
c:\www\FrameBox\
├── backend\
│   ├── src\
│   │   ├── index.ts                 # Entry point
│   │   ├── config.ts                # Configurações (porta, paths, retenção)
│   │   ├── database\
│   │   │   ├── schema.ts            # Schema SQLite
│   │   │   └── connection.ts        # Singleton do banco
│   │   ├── modules\
│   │   │   ├── cameras\
│   │   │   │   ├── camera.routes.ts
│   │   │   │   ├── camera.controller.ts
│   │   │   │   ├── camera.service.ts
│   │   │   │   └── camera.types.ts
│   │   │   ├── recordings\
│   │   │   │   ├── recording.routes.ts
│   │   │   │   ├── recording.controller.ts
│   │   │   │   ├── recording.service.ts
│   │   │   │   └── recording.types.ts
│   │   │   └── auth\
│   │   │       ├── auth.routes.ts
│   │   │       ├── auth.controller.ts
│   │   │       └── auth.middleware.ts
│   │   ├── services\
│   │   │   ├── stream-manager.ts    # Gerencia processos FFmpeg por câmera
│   │   │   ├── recorder.ts          # Gravação contínua MP4
│   │   │   └── storage-cleanup.ts   # Limpeza por retenção
│   │   └── utils\
│   │       ├── ffmpeg.ts            # Helpers FFmpeg
│   │       └── logger.ts            # Winston logger
│   ├── storage\                     # Gerado em runtime
│   │   ├── live\                    # HLS live segments
│   │   │   └── camera-{id}\
│   │   │       ├── stream.m3u8
│   │   │       └── *.ts
│   │   └── recordings\             # Gravações permanentes
│   │       └── camera-{id}\
│   │           └── 2026-04-13\
│   │               ├── 17.mp4
│   │               └── 18.mp4
│   ├── package.json
│   └── tsconfig.json
│
└── mobile\                          # React Native (Expo)
    ├── app\                         # Expo Router (file-based routing)
    │   ├── (tabs)\
    │   │   ├── _layout.tsx
    │   │   ├── index.tsx            # Dashboard — grid de câmeras ao vivo
    │   │   ├── recordings.tsx       # Lista de gravações por câmera/data
    │   │   └── settings.tsx         # Config do servidor, câmeras
    │   ├── camera\
    │   │   └── [id].tsx             # Tela fullscreen de câmera ao vivo
    │   └── playback\
    │       └── [id].tsx             # Player de gravação com timeline
    ├── components\
    │   ├── CameraCard.tsx           # Preview da câmera no dashboard
    │   ├── VideoPlayer.tsx          # Wrapper do react-native-video
    │   ├── Timeline.tsx             # Barra de timeline por hora
    │   └── RecordingListItem.tsx
    ├── services\
    │   ├── api.ts                   # Client HTTP (axios)
    │   └── auth.ts                  # Gerenciamento de JWT
    ├── hooks\
    │   ├── useCameras.ts
    │   └── useRecordings.ts
    ├── package.json
    └── tsconfig.json
```

---

## Proposed Changes

### Backend — Core Server

#### [NEW] [package.json](file:///c:/www/FrameBox/backend/package.json)
Dependências: `express`, `better-sqlite3`, `jsonwebtoken`, `bcryptjs`, `cors`, `helmet`, `winston`, `node-cron`, `uuid`, `dotenv`. Dev: `typescript`, `tsx`, `@types/*`, `nodemon`.

#### [NEW] [index.ts](file:///c:/www/FrameBox/backend/src/index.ts)
- Inicializa Express com middlewares de segurança (CORS, Helmet)
- Registra rotas da API
- Inicializa banco de dados
- Inicia StreamManager para câmeras configuradas como "ativas"
- Agenda job de limpeza de storage via `node-cron`

#### [NEW] [config.ts](file:///c:/www/FrameBox/backend/src/config.ts)
- `STORAGE_PATH` — onde salvar gravações (default: `./storage`)
- `RETENTION_DAYS` — dias para manter gravações (default: 30)
- `HLS_SEGMENT_DURATION` — duração de segmentos HLS (default: 2s)
- `JWT_SECRET`, `PORT`, etc.

---

### Backend — Database

#### [NEW] [schema.ts](file:///c:/www/FrameBox/backend/src/database/schema.ts)

```sql
CREATE TABLE cameras (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rtsp_url TEXT NOT NULL,
    rtsp_url_sub TEXT,          -- stream secundário (SD)
    enabled INTEGER DEFAULT 1,
    recording INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recordings (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL REFERENCES cameras(id),
    file_path TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_seconds INTEGER,
    file_size_bytes INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

### Backend — Stream Manager (núcleo do sistema)

#### [NEW] [stream-manager.ts](file:///c:/www/FrameBox/backend/src/services/stream-manager.ts)

Responsabilidade principal: gerenciar um processo FFmpeg por câmera.

**Fluxo por câmera:**
```
RTSP Input → FFmpeg → Output 1: HLS Live (segmentos de 2s, janela de 30)
                    → Output 2: MP4 gravação (segmentado por hora)
```

**Comando FFmpeg gerado:**
```bash
ffmpeg -rtsp_transport tcp -i "rtsp://admin:pass@192.168.1.100:554/onvif1" \
  -c:v copy -c:a copy \
  -f hls -hls_time 2 -hls_list_size 30 -hls_flags delete_segments \
    storage/live/camera-abc/stream.m3u8 \
  -c:v copy -c:a copy \
  -f segment -segment_time 3600 -reset_timestamps 1 \
  -strftime 1 \
    "storage/recordings/camera-abc/%Y-%m-%d/%H.mp4"
```

**Funcionalidades:**
- `startStream(cameraId)` — Inicia FFmpeg, monitora saúde (stderr)
- `stopStream(cameraId)` — Mata processo FFmpeg gracefully
- `restartStream(cameraId)` — Stop + Start com backoff exponencial
- Auto-restart em caso de queda do stream (watchdog com retry)
- Status tracking (online/offline/error por câmera)

---

### Backend — API REST

#### Cameras
| Método | Rota | Descrição |
|:---|:---|:---|
| `GET` | `/api/cameras` | Lista todas as câmeras |
| `GET` | `/api/cameras/:id` | Detalhes + status do stream |
| `POST` | `/api/cameras` | Adiciona câmera (nome, RTSP URL) |
| `PUT` | `/api/cameras/:id` | Atualiza câmera |
| `DELETE` | `/api/cameras/:id` | Remove câmera e para stream |
| `POST` | `/api/cameras/:id/start` | Inicia gravação/stream |
| `POST` | `/api/cameras/:id/stop` | Para gravação/stream |
| `GET` | `/api/cameras/:id/snapshot` | Captura frame atual (thumbnail) |

#### Recordings
| Método | Rota | Descrição |
|:---|:---|:---|
| `GET` | `/api/recordings` | Lista gravações (filtro por câmera, data) |
| `GET` | `/api/recordings/:id/stream` | Serve arquivo MP4 (com range support) |
| `DELETE` | `/api/recordings/:id` | Remove gravação |
| `GET` | `/api/recordings/calendar/:cameraId` | Retorna datas com gravações disponíveis |

#### Live Stream
| Método | Rota | Descrição |
|:---|:---|:---|
| `GET` | `/live/:cameraId/stream.m3u8` | Playlist HLS ao vivo |
| `GET` | `/live/:cameraId/*.ts` | Segmentos HLS |

#### Auth
| Método | Rota | Descrição |
|:---|:---|:---|
| `POST` | `/api/auth/login` | Login → JWT |
| `POST` | `/api/auth/register` | Primeiro registro (setup) |

---

### Backend — Storage Cleanup

#### [NEW] [storage-cleanup.ts](file:///c:/www/FrameBox/backend/src/services/storage-cleanup.ts)
- Executa diariamente via `node-cron`
- Remove gravações mais antigas que `RETENTION_DAYS`
- Remove registros do banco junto com os arquivos
- Log de espaço liberado

---

### Mobile App — React Native (Expo)

#### [NEW] Dashboard (`app/(tabs)/index.tsx`)
- Grid responsivo (2 colunas) com preview de cada câmera
- Cada card mostra:
  - Thumbnail do último frame (via `/api/cameras/:id/snapshot`)
  - Nome da câmera
  - Indicador de status (🟢 online, 🔴 offline)
  - Toque para abrir stream ao vivo em tela cheia

#### [NEW] Camera Live (`app/camera/[id].tsx`)
- Player HLS fullscreen via `react-native-video`
- Source: `http://<server>/live/<cameraId>/stream.m3u8`
- Controles: mute/unmute, qualidade, snapshot
- Suporte a landscape/portrait

#### [NEW] Recordings (`app/(tabs)/recordings.tsx`)
- Seletor de câmera (dropdown)
- Calendário mostrando dias com gravações
- Lista de gravações do dia selecionado (por hora)
- Toque para abrir player de playback

#### [NEW] Playback (`app/playback/[id].tsx`)
- Player com controles (play/pause, seek, velocidade 1x/2x/4x)
- Timeline visual por hora do dia
- Troca fluida entre segmentos de hora

#### [NEW] Settings (`app/(tabs)/settings.tsx`)
- Configuração do endereço do servidor
- Gerenciamento de câmeras (adicionar/editar/remover)
- Teste de conexão RTSP
- Configuração de retenção

---

## User Review Required

> [!IMPORTANT]
> **Armazenamento e hardware do servidor**: Cada câmera em 1080p com codec H.264 consome aproximadamente **1-3 GB/dia** sem re-encoding. Com 30 dias de retenção e, por exemplo, 4 câmeras, espere usar **120-360 GB de disco**. Confirme que seu servidor tem espaço suficiente.

> [!WARNING]
> **FFmpeg como dependência**: O servidor precisa ter o FFmpeg instalado e acessível no PATH. Isso funciona bem em Linux, macOS e Windows. Caso prefira Docker, posso ajustar o plano para incluir um `Dockerfile`.

> [!IMPORTANT]
> **Acesso externo**: O plano atual assume acesso na **rede local**. Para acessar de fora de casa, seria necessário configurar VPN, port forwarding, ou um túnel como Cloudflare Tunnel. Quer que eu inclua isso no escopo?

---

## Open Questions

1. **Quantas câmeras** você pretende conectar inicialmente?
2. **Onde será o servidor?** Um PC dedicado, Raspberry Pi, NAS, ou uma máquina Windows que já roda 24/7?
3. **Acesso remoto**: Precisa acessar as câmeras de fora da rede local (fora de casa)?
4. **Docker**: Prefere rodar o backend em Docker ou diretamente na máquina?
5. **Expo ou React Native CLI**: Expo simplifica muito o desenvolvimento e build. Deseja usar Expo com **dev build** (permite native modules como `react-native-video`) ou prefere React Native CLI puro?

---

## Fases de Implementação

### Fase 1 — Backend Core (prioridade)
1. Setup do projeto, banco de dados, configuração
2. StreamManager + FFmpeg integration
3. API de câmeras + live HLS
4. API de gravações + serving MP4
5. Autenticação JWT
6. Storage cleanup

### Fase 2 — App Mobile
1. Setup Expo + navegação
2. Tela de login + conexão com servidor
3. Dashboard com grid de câmeras
4. Player ao vivo HLS
5. Lista e player de gravações
6. Configurações

### Fase 3 — Polish (futuro)
- Notificações push em caso de câmera offline
- Detecção de movimento (FFmpeg scene detection ou AI)
- Dashboard web complementar
- Backup automático para S3/Google Drive

---

## Verification Plan

### Automated Tests
- Testes unitários dos services (camera, recording, stream-manager) com mocks do FFmpeg
- Testes de integração da API REST com supertest
- `npm run build` sem erros de TypeScript

### Manual Verification
1. Adicionar uma câmera via API e confirmar que stream HLS é gerado
2. Abrir `stream.m3u8` no VLC para validar o live stream
3. Esperar 1+ hora e verificar que arquivo MP4 foi criado em `storage/recordings/`
4. Testar playback do MP4 via API (range request)
5. Abrir app mobile, ver dashboard com câmeras e reproduzir stream ao vivo
6. Navegar para gravações e reproduzir um arquivo gravado
