import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const binDir = path.join(__dirname, '../bin');

const VERSION = 'v1.9.14';
const GITHUB_RELEASES = `https://github.com/AlexxIT/go2rtc/releases/download/${VERSION}`;

function getGo2rtcBinaryName() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'win32') {
    return arch === 'arm64' ? 'go2rtc_win_arm64.zip' :
           arch === 'x64'   ? 'go2rtc_win64.zip' :
                             'go2rtc_win32.zip';
  }
  
  if (platform === 'linux') {
    return arch === 'arm64' ? 'go2rtc_linux_arm64' :
           arch === 'arm'   ? 'go2rtc_linux_arm' :
           arch === 'ia32'  ? 'go2rtc_linux_i386' :
           arch === 'mipsle'? 'go2rtc_linux_mipsel' :
                             'go2rtc_linux_amd64';
  }
  
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'go2rtc_mac_arm64.zip' :
                             'go2rtc_mac_amd64.zip';
  }

  throw new Error(`Plataforma não suportada pelo go2rtc: ${platform} ${arch}`);
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`Falha no download (Status: ${response.statusCode})`));
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    }).on('error', reject);
  });
}

function extractZip(zipPath: string, destPath: string) {
  // Solução simples via CLI nativo para evitar dependência extra
  console.log('Extraindo arquivo ZIP...');
  try {
    if (os.platform() === 'win32') {
      execSync(`powershell -command "Expand-Archive -Force '${zipPath}' '${path.dirname(destPath)}'"`);
      // O exe pode vir do lado de fora do zip ou dentro. No windows o powershell extrai no lugar certo
    } else {
      execSync(`unzip -o "${zipPath}" -d "${path.dirname(destPath)}"`);
    }
  } catch (error) {
    console.error('Falha ao extrair (certifique-se que o unzip está instalado no Linux/Mac).', error);
  }
}

async function main() {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const binaryName = getGo2rtcBinaryName();
  const downloadUrl = `${GITHUB_RELEASES}/${binaryName}`;
  const isZip = downloadUrl.endsWith('.zip');
  
  const exeName = os.platform() === 'win32' ? 'go2rtc.exe' : 'go2rtc';
  const finalDest = path.join(binDir, exeName);

  if (fs.existsSync(finalDest)) {
    console.log(`✅ go2rtc (${VERSION}) já está instalado em: ${finalDest}`);
    return;
  }

  console.log(`🔽 Baixando go2rtc para ${os.platform()} ${os.arch()}...`);
  console.log(`🔗 URL: ${downloadUrl}`);

  const tempDownloadPath = path.join(binDir, binaryName);

  try {
    await downloadFile(downloadUrl, tempDownloadPath);
    
    if (isZip) {
      extractZip(tempDownloadPath, finalDest);
      fs.unlinkSync(tempDownloadPath);
    } else {
      // É Linux, binário direto
      fs.renameSync(tempDownloadPath, finalDest);
      fs.chmodSync(finalDest, 0o755); // Dar permissão de execução
    }

    // Se o zip extraiu como `go2rtc` ou `go2rtc.exe` e precisa renomar extra
    const baseExtractedName = 'go2rtc_win64.exe'; // Às vezes o zip traz o nome assim, vamos tratar o nome certo
    if (fs.existsSync(path.join(binDir, 'go2rtc.exe'))) {
       // já tem o nome certo
    }
    
    console.log(`✅ go2rtc instalado com sucesso em: ${finalDest}`);
  } catch (err) {
    console.error('❌ Erro no download/instalação do go2rtc:', err);
    process.exit(1);
  }
}

main();
