import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Extract } from 'unzipper';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FFMPEG_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
const binDir = path.join(__dirname, 'bin');
const FFMPEG_EXE = path.join(binDir, 'ffmpeg.exe');
const FFPROBE_EXE = path.join(binDir, 'ffprobe.exe');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
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

async function extractFFmpeg(zipPath) {
  return new Promise((resolve, reject) => {
    console.log('Extracting ffmpeg...');
    
    fs.createReadStream(zipPath)
      .pipe(Extract({ path: binDir }))
      .on('close', () => {
        // Find the extracted folder
        const items = fs.readdirSync(binDir);
        const ffmpegFolder = items.find(item => item.startsWith('ffmpeg-') && fs.statSync(path.join(binDir, item)).isDirectory());
        
        if (ffmpegFolder) {
          const ffmpegBinPath = path.join(binDir, ffmpegFolder, 'bin');
          
          // Move ffmpeg.exe and ffprobe.exe to bin root
          const files = ['ffmpeg.exe', 'ffprobe.exe'];
          for (const file of files) {
            const src = path.join(ffmpegBinPath, file);
            const dest = path.join(binDir, file);
            if (fs.existsSync(src)) {
              fs.renameSync(src, dest);
            }
          }
          
          // Clean up extracted folder
          fs.rmSync(path.join(binDir, ffmpegFolder), { recursive: true, force: true });
        }
        
        // Remove zip file
        fs.unlinkSync(zipPath);
        
        console.log('✓ FFmpeg extracted successfully');
        resolve();
      })
      .on('error', reject);
  });
}

async function downloadFFmpeg() {
  const zipPath = path.join(binDir, 'ffmpeg.zip');
  
  console.log('Downloading FFmpeg (this may take a few minutes)...');
  try {
    await downloadFile(FFMPEG_URL, zipPath);
    await extractFFmpeg(zipPath);
  } catch (error) {
    console.error('Failed to download/extract FFmpeg:', error.message);
    // Not critical - yt-dlp can work without ffmpeg for some videos
    console.log('Note: Some videos may require manual ffmpeg installation');
  }
}

async function main() {
  // Create bin directory if it doesn't exist
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Check if ffmpeg already exists
  if (fs.existsSync(FFMPEG_EXE) && fs.existsSync(FFPROBE_EXE)) {
    console.log('✓ FFmpeg already exists');
    return;
  }

  await downloadFFmpeg();
}

// Only run if we're on Windows and ffmpeg doesn't exist
if (process.platform === 'win32') {
  main().catch((err) => {
    console.error('FFmpeg download error:', err.message);
    console.log('Continuing without FFmpeg - some features may be limited');
    // Don't exit with error - make it non-fatal
  });
} else {
  console.log('FFmpeg auto-download is only supported on Windows');
  console.log('On Linux/macOS, FFmpeg will be installed via CI package managers or system packages');
}
