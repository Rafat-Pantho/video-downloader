const { ipcRenderer } = require('electron');
const path = require('path');
const os = require('os');

// DOM Elements
const urlInput = document.getElementById('urlInput');
const fetchInfoBtn = document.getElementById('fetchInfoBtn');
const videoInfo = document.getElementById('videoInfo');
const videoThumbnail = document.getElementById('videoThumbnail');
const videoTitle = document.getElementById('videoTitle');
const videoDuration = document.getElementById('videoDuration');
const downloadSettings = document.getElementById('downloadSettings');
const folderInput = document.getElementById('folderInput');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const filenameInput = document.getElementById('filenameInput');
const formatSelect = document.getElementById('formatSelect');
const qualitySelect = document.getElementById('qualitySelect');
const downloadBtn = document.getElementById('downloadBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressMessage = document.getElementById('progressMessage');
const completeSection = document.getElementById('completeSection');
const completePath = document.getElementById('completePath');
const completeSize = document.getElementById('completeSize');
const openFolderBtn = document.getElementById('openFolderBtn');
const downloadAnotherBtn = document.getElementById('downloadAnotherBtn');
const ytdlpVersion = document.getElementById('ytdlpVersion');
const statusBanner = document.getElementById('statusBanner');
const statusMessage = document.getElementById('statusMessage');

let currentVideoUrl = '';
let currentFolder = '';
let downloadedFilePath = '';

// Initialize
async function init() {
  // Check yt-dlp
  const result = await ipcRenderer.invoke('check-ytdlp');
  
  if (result.installed) {
    ytdlpVersion.textContent = `yt-dlp ${result.version}`;
    showStatus('✅ yt-dlp is ready', 'success');
  } else {
    showStatus('⚠️ yt-dlp not found. Install it?', 'warning');
    
    const install = confirm('yt-dlp is not installed. Would you like to install it now?');
    if (install) {
      showStatus('📥 Installing yt-dlp...', 'info');
      const installResult = await ipcRenderer.invoke('install-ytdlp');
      
      if (installResult.success) {
        showStatus('✅ yt-dlp installed successfully!', 'success');
        const checkAgain = await ipcRenderer.invoke('check-ytdlp');
        if (checkAgain.installed) {
          ytdlpVersion.textContent = `yt-dlp ${checkAgain.version}`;
        }
      } else {
        showStatus('❌ Failed to install yt-dlp. Please install manually: pip install yt-dlp', 'error');
      }
    }
  }
  
  // Set default folder
  folderInput.value = path.join(os.homedir(), 'Downloads');
  currentFolder = folderInput.value;
}

// Show status banner
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusBanner.className = 'status-banner';
  
  if (type === 'error') {
    statusBanner.classList.add('error');
  } else if (type === 'success') {
    statusBanner.classList.add('success');
  } else if (type === 'warning') {
    statusBanner.classList.add('warning');
  }
  
  statusBanner.classList.remove('hidden');
  
  // Auto-hide success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusBanner.classList.add('hidden');
    }, 5000);
  }
}

// Close status banner
function closeStatus() {
  statusBanner.classList.add('hidden');
}

// Fetch video info
fetchInfoBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  
  if (!url) {
    showStatus('❌ Please enter a video URL', 'error');
    return;
  }
  
  if (!url.includes('http')) {
    showStatus('❌ Please enter a valid URL', 'error');
    return;
  }
  
  // Disable button and show loading
  fetchInfoBtn.disabled = true;
  fetchInfoBtn.innerHTML = '<span>⏳</span> Fetching...';
  
  try {
    const info = await ipcRenderer.invoke('get-video-info', url);
    
    if (info.success) {
      currentVideoUrl = url;
      
      // Show video info
      videoTitle.textContent = info.title;
      videoDuration.textContent = info.duration;
      
      if (info.thumbnail) {
        videoThumbnail.src = info.thumbnail;
      } else {
        videoThumbnail.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="112" viewBox="0 0 200 112"><rect fill="%232d2d30" width="200" height="112"/><text x="50%" y="50%" fill="%23a0a0a0" font-family="Arial" font-size="14" text-anchor="middle" dominant-baseline="middle">No thumbnail</text></svg>';
      }
      
      videoInfo.classList.remove('hidden');
      
      // Set filename
      filenameInput.value = info.title;
      
      // Show download settings
      downloadSettings.classList.remove('hidden');
      
      showStatus('✅ Video information retrieved successfully', 'success');
    } else {
      showStatus('❌ Failed to get video info: ' + (info.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showStatus('❌ Error: ' + error.message, 'error');
  } finally {
    fetchInfoBtn.disabled = false;
    fetchInfoBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Fetch Info';
  }
});

// Select folder
selectFolderBtn.addEventListener('click', async () => {
  const folder = await ipcRenderer.invoke('select-folder');
  
  if (folder) {
    folderInput.value = folder;
    currentFolder = folder;
  }
});

// Download video
downloadBtn.addEventListener('click', async () => {
  const filename = filenameInput.value.trim();
  
  if (!filename) {
    showStatus('❌ Please enter a filename', 'error');
    return;
  }
  
  if (!currentFolder) {
    showStatus('❌ Please select a download folder', 'error');
    return;
  }
  
  // Hide download settings and show progress
  downloadSettings.classList.add('hidden');
  progressSection.classList.remove('hidden');
  completeSection.classList.add('hidden');
  
  // Reset progress
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  progressMessage.textContent = 'Initializing download...';
  
  try {
    const result = await ipcRenderer.invoke('download-video', {
      url: currentVideoUrl,
      folder: currentFolder,
      filename: filename,
      format: formatSelect.value,
      quality: qualitySelect.value
    });
    
    if (result.success) {
      // Show complete section
      progressSection.classList.add('hidden');
      completeSection.classList.remove('hidden');
      
      downloadedFilePath = result.path;
      completePath.textContent = result.path;
      completeSize.textContent = result.size ? `${result.size} MB` : 'Unknown';
      
      showStatus('✅ Download completed successfully!', 'success');
    } else {
      progressSection.classList.add('hidden');
      downloadSettings.classList.remove('hidden');
      showStatus('❌ ' + result.error, 'error');
    }
  } catch (error) {
    progressSection.classList.add('hidden');
    downloadSettings.classList.remove('hidden');
    showStatus('❌ Download error: ' + error.message, 'error');
  }
});

// Listen for download progress
ipcRenderer.on('download-progress', (event, data) => {
  progressFill.style.width = data.progress + '%';
  progressText.textContent = Math.round(data.progress) + '%';
  progressMessage.textContent = data.message;
});

// Listen for download errors
ipcRenderer.on('download-error', (event, error) => {
  progressMessage.textContent = 'Error: ' + error;
});

// Open folder
openFolderBtn.addEventListener('click', async () => {
  if (downloadedFilePath) {
    const folder = path.dirname(downloadedFilePath);
    await ipcRenderer.invoke('open-folder', folder);
  }
});

// Download another video
downloadAnotherBtn.addEventListener('click', () => {
  // Reset form
  urlInput.value = '';
  filenameInput.value = '';
  currentVideoUrl = '';
  downloadedFilePath = '';
  
  // Hide sections
  videoInfo.classList.add('hidden');
  downloadSettings.classList.add('hidden');
  progressSection.classList.add('hidden');
  completeSection.classList.add('hidden');
  
  // Focus on URL input
  urlInput.focus();
  
  showStatus('✨ Ready for a new download', 'info');
});

// Enter key on URL input
urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    fetchInfoBtn.click();
  }
});

// Global close status function
window.closeStatus = closeStatus;

// Initialize on load
init();
