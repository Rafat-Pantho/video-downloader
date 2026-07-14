import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pick the right release asset and local binary name for the current OS
function getYtDlpAsset() {
  switch (process.platform) {
    case 'win32':
      return {
        url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
        filename: 'yt-dlp.exe'
      };
    case 'darwin':
      return {
        url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
        filename: 'yt-dlp'
      };
    default:
      // Linux and other POSIX platforms
      return {
        url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
        filename: 'yt-dlp'
      };
  }
}

const { url: YTDLP_URL, filename: YTDLP_FILENAME } = getYtDlpAsset();
const YTDLP_PATH = path.join(__dirname, 'bin', YTDLP_FILENAME);

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Failed to download: ${response.statusCode}`));
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`✓ ${YTDLP_FILENAME} downloaded successfully`);
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  const binDir = path.join(__dirname, 'bin');

  // Create bin directory if it doesn't exist
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Check if the binary already exists
  if (fs.existsSync(YTDLP_PATH)) {
    console.log(`✓ ${YTDLP_FILENAME} already exists (delete bin/${YTDLP_FILENAME} to force re-download latest version)`);
    return;
  }

  console.log(`Downloading latest yt-dlp for ${process.platform}...`);
  try {
    await downloadFile(YTDLP_URL, YTDLP_PATH);
    if (process.platform !== 'win32') {
      fs.chmodSync(YTDLP_PATH, 0o755);
    }
  } catch (error) {
    console.error('Failed to download yt-dlp:', error.message);
    console.log('Continuing without yt-dlp - it may need to be installed manually');
    // Don't exit with error - make it non-fatal
  }
}

main().catch((err) => {
  console.error('yt-dlp download error:', err.message);
  console.log('Continuing without yt-dlp - some features may be limited');
  // Don't exit with error
});
