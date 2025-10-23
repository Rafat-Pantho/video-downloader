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
    const { stdout } = await execPromise('yt-dlp --version');
    return { installed: true, version: stdout.trim() };
  } catch (error) {
    return { installed: false, version: null };
  }
});

// Install yt-dlp
ipcMain.handle('install-ytdlp', async () => {
  try {
    await execPromise('python -m pip install -U yt-dlp');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get video info
ipcMain.handle('get-video-info', async (event, url) => {
  try {
    const { stdout } = await execPromise(`yt-dlp --get-title --get-duration --get-thumbnail "${url}"`, { 
      timeout: 30000 
    });
    const lines = stdout.trim().split('\n');
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
      url
    ];

    const ytdlp = spawn('yt-dlp', args);
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
