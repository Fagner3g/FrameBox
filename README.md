# FrameBox NVR 🎥
Um sistema NVR (Network Video Recorder) completo, moderno e leve, focado em alta performance e escalabilidade, composto por um Backend Node.js robusto e um App Mobile Bare React Native premium.

![Architecture](https://img.shields.io/badge/Architecture-Clean-blue) ![License](https://img.shields.io/badge/License-MIT-green)

## Visão Geral

O projeto **FrameBox** divide-se em duas camadas:
1. **Backend (NVR Engine):** Orquestra streams RTSP via `go2rtc`, agilizando conversão para HLS (baixa latência) via stream-buffers em memória, além de possuir um gravador DVR integrado que salva segmentos MP4 por hora e expurga dados antigos baseando-se nas regras de armazenamento. Tudo servido via API RESTful autenticada (Tokens JWT).
2. **Aplicativo Mobile:** React Native puro focando em fluidez e performance de decodificação. Interface escura, com paletas ciano futuristas. Suporte para gerir múltiplas câmeras simultâneas (Dashboard), ver captações ao vivo das câmeras, reproduzir gravações em timeline e lidar remotamente com a plataforma de modo criptografado.

---

## 🚀 Tecnologias Integradas

### Backend
* **Node.js + TSX:** Execução ultra rápida de TypeScript sem pré-compilação local.
* **FFmpeg + Go2rtc:** Processadores nativos binários manipulando os streams de vídeo (`memcpy`/`copy`) eliminando o peso de transcodificação de CPU. Retransmissão sub-segundo garantida.
* **Better-SQLite3:** Banco de dados veloz operando em modo WAL transacional.
* **Express & JWT:** RESTful API rígida e com autorização embarcada. 

### App Mobile
* **React Native CLI (Bare):** Liberdade total contra limitações para integração de dependências C++/Java/Objective-C para vídeos.
* **React Navigation (Native Stack & Bottom Tabs):** Navegação nativa respeitando heurística de iOS/Android.
* **React Native Video:** Reproduz HLS nativo `.m3u8` fluído e varre bytes nativamente (Byte-Range requests em MP4 para scrubbing perfeito de tempo).
* **Async Storage:** Para retenção de hostnames IPv4s locais e credenciais duráveis.

---

## 💻 Como Rodar o Projeto

### Rodando o Servidor (Backend)
Entre na pasta `backend`:
```bash
cd backend
npm install
npm run dev
```
> O servidor vai migrar o SQLite sozinho, criar a pasta `storage/` e instanciar a ponte Go2rtc! É só logar. (Acesse `http://localhost:3000/api/cameras`).

### Rodando o App (iOS / Android)
Entre na pasta `mobile`:
```bash
cd mobile
npm install

# Instalação das referências C++/Obj-C do iOS Core
cd ios && pod install && cd ..

# Rode pro emulador iOS ou Android:
npm run ios
# ou
npm run android
```

No App, ao iniciar a Tela de Login, basta colocar o `IP_DA_SUA_MAQUINA:3000` onde está rodando o backend.

---

## 📌 Funcionalidades Core
- [x] Conexões Estáveis via Watchdog FFmpeg (A câmera caiu? O sistema tenta reconectar até voltar).
- [x] Snapshots JPEGs nativos com 0 I/O no HD (Dumping de um T-Frame HLS direto no Http `res`).
- [x] Limpeza rotativa nativa: Expurga MPs gravados antigos todo dia meia noite sem travar Node Event Loop (`node-cron`).
- [x] Calendário Vivo: O Banco SQLite indexa o tamanho em bytes e exato momento das gravações que ocorreram num dia específico para busca veloz do lado do React Native.
- [x] View de Câmera Unificada (Live Player + Player de Playback de 24 horas transicionando ao toque do dedo).

<p align="center">Made with ❤️ for Surveillance Technology</p>
