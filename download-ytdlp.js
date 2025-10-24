import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const YTDLP_VERSION = 'latest';
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const YTDLP_PATH = path.join(__dirname, 'bin', 'yt-dlp.exe');

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
        console.log('✓ yt-dlp.exe downloaded successfully');
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

  // Check if yt-dlp.exe already exists
  if (fs.existsSync(YTDLP_PATH)) {
    console.log('✓ yt-dlp.exe already exists');
    return;
  }

  if (process.platform !== 'win32') {
    console.log('yt-dlp download is only for Windows builds');
    console.log('On Linux/macOS, yt-dlp will be installed via system packages');
    return;
  }

  console.log('Downloading yt-dlp.exe...');
  try {
    await downloadFile(YTDLP_URL, YTDLP_PATH);
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
