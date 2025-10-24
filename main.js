import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execPromise = promisify(exec);

// Disable GPU cache to prevent cache errors
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Get bundled yt-dlp path
function getYtDlpPath() {
  // In production, use bundled yt-dlp
  if (app.isPackaged) {
    const ytdlpPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'yt-dlp.exe');
    if (fs.existsSync(ytdlpPath)) {
      return ytdlpPath;
    }
  }
  
  // In development, use bin folder
  const devPath = path.join(__dirname, 'bin', 'yt-dlp.exe');
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  
  // Fallback to system yt-dlp
  return 'yt-dlp';
}

// Get bundled ffmpeg path
function getFFmpegPath() {
  // In production
  if (app.isPackaged) {
    const ffmpegPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(ffmpegPath)) {
      return path.dirname(ffmpegPath);
    }
  }
  
  // In development
  const devPath = path.join(__dirname, 'bin', 'ffmpeg.exe');
  if (fs.existsSync(devPath)) {
    return path.dirname(devPath);
  }
  
  // Fallback to system PATH
  return null;
}

const YTDLP_PATH = getYtDlpPath();
const FFMPEG_DIR = getFFmpegPath();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#1e1e1e',
    show: false,
    autoHideMenuBar: true
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

// Check yt-dlp installation
ipcMain.handle('check-ytdlp', async () => {
  try {
    const { stdout } = await execPromise(`"${YTDLP_PATH}" --version`);
    return { installed: true, version: stdout.trim() };
  } catch (error) {
    return { installed: false, version: null };
  }
});

// Install yt-dlp (not needed with bundled version, but kept for compatibility)
ipcMain.handle('install-ytdlp', async () => {
  // Since we bundle yt-dlp, just check if it exists
  if (fs.existsSync(YTDLP_PATH)) {
    return { success: true };
  }
  return { success: false, error: 'Bundled yt-dlp not found' };
});

// Get video info
ipcMain.handle('get-video-info', async (event, url) => {
  try {
    // Use spawn instead of exec to handle stderr warnings properly
    const result = await new Promise((resolve, reject) => {
      const childProcess = spawn(YTDLP_PATH, [
        '--no-playlist',  // Only get info for single video, not entire playlist
        '--no-warnings',  // Reduce noise from warnings
        '--get-title', 
        '--get-duration', 
        '--get-thumbnail', 
        url
      ], {
        timeout: 60000,  // Increased to 60 seconds for slower platforms
        env: { ...process.env, PATH: `${FFMPEG_DIR};${process.env.PATH}` }
      });
      
      let stdout = '';
      let stderr = '';
      
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      childProcess.on('close', (code) => {
        // YouTube warnings are sent to stderr but don't indicate failure
        // Only reject if exit code is non-zero AND we got no stdout
        if (code !== 0 && !stdout.trim()) {
          // Provide better error messages based on the error content
          let errorMsg = stderr || `Process exited with code ${code}`;
          if (stderr.includes('Cannot parse data')) {
            errorMsg = 'Unable to extract video info. The platform may require login or the link may be invalid.';
          } else if (stderr.includes('Unsupported URL')) {
            errorMsg = 'This URL is not supported by yt-dlp.';
          } else if (stderr.includes('Video unavailable')) {
            errorMsg = 'This video is unavailable or private.';
          } else if (stderr.includes('This video requires payment')) {
            errorMsg = 'This video requires payment to access.';
          }
          reject(new Error(errorMsg));
        } else {
          resolve({ stdout, stderr });
        }
      });
      
      childProcess.on('error', reject);
    });
    
    const lines = result.stdout.trim().split('\n');
    return {
      success: true,
      title: lines[0]?.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100) || 'video',
      duration: lines[1] || 'Unknown',
      thumbnail: lines[2] || null
    };
  } catch (error) {
    return {
      success: false,
      title: generateRandomName(),
      error: error.message
    };
  }
});

// Select folder dialog
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: path.join(os.homedir(), 'Downloads')
  });
  
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

// Download video
ipcMain.handle('download-video', async (event, { url, folder, filename, format, quality }) => {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(folder, `${filename}.%(ext)s`);
    
    // Build format string based on quality
    let formatString;
    switch(quality) {
      case 'best':
        formatString = 'bestvideo+bestaudio/best';
        break;
      case '1080p':
        formatString = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
        break;
      case '720p':
        formatString = 'bestvideo[height<=720]+bestaudio/best[height<=720]';
        break;
      case '480p':
        formatString = 'bestvideo[height<=480]+bestaudio/best[height<=480]';
        break;
      case 'audio':
        formatString = 'bestaudio/best';
        break;
      default:
        formatString = 'bestvideo+bestaudio/best';
    }
    
    const args = [
      '--format', formatString,
      '--merge-output-format', format,
      '--output', outputPath,
      '--no-playlist',
      '--progress',
      '--newline',
      // Force ffmpeg to merge video and audio
      '--postprocessor-args', 'ffmpeg:-c copy',
      // Embed metadata
      '--embed-metadata',
      // Prefer formats that don't need merging, but merge if needed
      '--prefer-free-formats',
      url
    ];

    // Set ffmpeg location if we have bundled version
    const spawnOptions = {};
    if (FFMPEG_DIR) {
      spawnOptions.env = {
        ...process.env,
        PATH: `${FFMPEG_DIR};${process.env.PATH}`
      };
    }

    const ytdlp = spawn(YTDLP_PATH, args, spawnOptions);
    let lastProgress = 0;

    ytdlp.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text.includes('[download]') && text.includes('%')) {
        const match = text.match(/(\d+\.?\d*)%/);
        if (match) {
          const progress = parseFloat(match[1]);
          if (progress > lastProgress) {
            lastProgress = progress;
            event.sender.send('download-progress', { progress, message: text });
          }
        }
      }
    });

    ytdlp.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('ERROR')) {
        event.sender.send('download-error', text);
      }
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        const finalPath = path.join(folder, `${filename}.${format}`);
        let size = null;
        if (fs.existsSync(finalPath)) {
          size = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(2);
        }
        resolve({ success: true, path: finalPath, size });
      } else {
        resolve({ 
          success: false, 
          error: 'Download failed. The video may be unavailable, private, or restricted.' 
        });
      }
    });

    ytdlp.on('error', (err) => {
      resolve({ 
        success: false, 
        error: 'Failed to run yt-dlp. Make sure it is installed.' 
      });
    });
  });
});

// Open folder in explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    if (process.platform === 'win32') {
      exec(`explorer "${folderPath}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${folderPath}"`);
    } else {
      exec(`xdg-open "${folderPath}"`);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Helper function
function generateRandomName() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
