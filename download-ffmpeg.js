import https from 'https';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { Extract } from 'unzipper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const binDir = path.join(__dirname, 'bin');
const isWin = process.platform === 'win32';
const FFMPEG_EXE = path.join(binDir, isWin ? 'ffmpeg.exe' : 'ffmpeg');
const FFPROBE_EXE = path.join(binDir, isWin ? 'ffprobe.exe' : 'ffprobe');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      // Handle all redirect status codes
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Failed to download: ${response.statusCode}`));
      }

      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;
      let lastPercent = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const percent = Math.floor((downloadedBytes / totalBytes) * 100);
        if (percent > lastPercent && percent % 10 === 0) {
          console.log(`  Downloaded: ${percent}%`);
          lastPercent = percent;
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('  ✓ Download complete');
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(Extract({ path: destDir }))
      .on('close', resolve)
      .on('error', reject);
  });
}

function extractTarXz(tarPath, destDir) {
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xJf', tarPath, '-C', destDir]);
    tar.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });
    tar.on('error', reject);
  });
}

async function setupWindows() {
  const zipPath = path.join(binDir, 'ffmpeg.zip');
  console.log('Downloading FFmpeg for Windows...');
  await downloadFile('https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', zipPath);

  console.log('Extracting ffmpeg...');
  await extractZip(zipPath, binDir);

  const items = fs.readdirSync(binDir);
  const ffmpegFolder = items.find(item =>
    item.startsWith('ffmpeg-') && fs.statSync(path.join(binDir, item)).isDirectory()
  );

  if (ffmpegFolder) {
    const ffmpegBinPath = path.join(binDir, ffmpegFolder, 'bin');
    for (const file of ['ffmpeg.exe', 'ffprobe.exe']) {
      const src = path.join(ffmpegBinPath, file);
      const dest = path.join(binDir, file);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
      }
    }
    fs.rmSync(path.join(binDir, ffmpegFolder), { recursive: true, force: true });
  }

  fs.unlinkSync(zipPath);
}

async function setupMac() {
  console.log('Downloading FFmpeg for macOS...');
  for (const name of ['ffmpeg', 'ffprobe']) {
    const zipPath = path.join(binDir, `${name}.zip`);
    await downloadFile(`https://evermeet.cx/ffmpeg/getrelease/${name}/zip`, zipPath);

    console.log(`Extracting ${name}...`);
    await extractZip(zipPath, binDir);
    fs.unlinkSync(zipPath);

    const dest = path.join(binDir, name);
    if (fs.existsSync(dest)) {
      fs.chmodSync(dest, 0o755);
    }
  }
}

async function setupLinux() {
  const archMap = { x64: 'amd64', arm64: 'arm64' };
  const arch = archMap[process.arch];

  if (!arch) {
    console.log(`Unsupported Linux architecture: ${process.arch}. Skipping FFmpeg download - install it via your system package manager.`);
    return;
  }

  console.log(`Downloading FFmpeg for Linux (${arch})...`);
  const tarPath = path.join(binDir, 'ffmpeg.tar.xz');
  await downloadFile(`https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${arch}-static.tar.xz`, tarPath);

  console.log('Extracting ffmpeg...');
  await extractTarXz(tarPath, binDir);

  const items = fs.readdirSync(binDir);
  const ffmpegFolder = items.find(item =>
    item.startsWith('ffmpeg-') && item.endsWith('-static') && fs.statSync(path.join(binDir, item)).isDirectory()
  );

  if (ffmpegFolder) {
    const extractedDir = path.join(binDir, ffmpegFolder);
    for (const file of ['ffmpeg', 'ffprobe']) {
      const src = path.join(extractedDir, file);
      const dest = path.join(binDir, file);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        fs.chmodSync(dest, 0o755);
      }
    }
    fs.rmSync(extractedDir, { recursive: true, force: true });
  }

  fs.unlinkSync(tarPath);
}

async function main() {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (fs.existsSync(FFMPEG_EXE) && fs.existsSync(FFPROBE_EXE)) {
    console.log('✓ FFmpeg already exists');
    return;
  }

  try {
    if (process.platform === 'win32') {
      await setupWindows();
    } else if (process.platform === 'darwin') {
      await setupMac();
    } else if (process.platform === 'linux') {
      await setupLinux();
    } else {
      console.log(`FFmpeg auto-download is not supported on ${process.platform}. Please install ffmpeg manually.`);
      return;
    }
    console.log('✓ FFmpeg extracted successfully');
  } catch (error) {
    console.error('Failed to download/extract FFmpeg:', error.message);
    // Not critical - yt-dlp can work without ffmpeg for some videos
    console.log('Note: Some videos may require manual ffmpeg installation');
  }
}

main().catch((err) => {
  console.error('FFmpeg download error:', err.message);
  console.log('Continuing without FFmpeg - some features may be limited');
  // Don't exit with error - make it non-fatal
});
