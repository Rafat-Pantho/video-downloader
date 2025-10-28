import React, { useState, useEffect } from 'react';
import './HomePage.css';

const { ipcRenderer } = window.require('electron');

function HomePage() {
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState('');
  const [filename, setFilename] = useState('');
  const [format, setFormat] = useState('mp4');
  const [quality, setQuality] = useState('best');
  const [status, setStatus] = useState({ message: '', type: '' });
  const [videoInfo, setVideoInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [downloadedPath, setDownloadedPath] = useState('');
  const [downloadedSize, setDownloadedSize] = useState('');

  useEffect(() => {
    // Set default folder
    const os = window.require('os');
    const path = window.require('path');
    setFolder(path.join(os.homedir(), 'Downloads'));

    // Listen for progress
    ipcRenderer.on('download-progress', (event, data) => {
      setProgress(data.progress);
    });

    return () => {
      ipcRenderer.removeAllListeners('download-progress');
    };
  }, []);

  const showStatus = (message, type) => {
    setStatus({ message, type });
    setTimeout(() => setStatus({ message: '', type: '' }), 5000);
  };

  const handleFetchInfo = async () => {
    if (!url.trim()) {
      showStatus('Please enter a video URL', 'error');
      return;
    }

    showStatus('Fetching video information...', 'info');
    const result = await ipcRenderer.invoke('get-video-info', url);

    if (result.success) {
      setVideoInfo(result);
      setFilename(result.title);
      showStatus('Video information loaded successfully', 'success');
    } else {
      showStatus(result.error || 'Failed to fetch video info', 'error');
      setFilename(result.title || 'video');
    }
  };

  const handleSelectFolder = async () => {
    const result = await ipcRenderer.invoke('select-folder');
    if (result) {
      setFolder(result);
    }
  };

  const handleDownload = async () => {
    if (!filename.trim()) {
      showStatus('Please enter a filename', 'error');
      return;
    }

    setDownloading(true);
    setCompleted(false);
    setProgress(0);
    showStatus('Starting download...', 'info');

    const result = await ipcRenderer.invoke('download-video', {
      url,
      folder,
      filename,
      format,
      quality
    });

    setDownloading(false);

    if (result.success) {
      setCompleted(true);
      setDownloadedPath(result.path);
      setDownloadedSize(result.size || 'Unknown');
      showStatus('Download completed successfully!', 'success');
    } else if (result.needsLogin) {
      const shouldLogin = window.confirm(result.error + '\n\nWould you like to login now?');
      if (shouldLogin) {
        const loginResult = await ipcRenderer.invoke('open-login-window', result.url);
        if (loginResult.success) {
          showStatus('Login window opened. Please login, then close the window and try downloading again.', 'info');
        }
      } else {
        showStatus(result.error, 'error');
      }
    } else {
      showStatus(result.error || 'Download failed', 'error');
    }
  };

  const handleOpenFolder = () => {
    ipcRenderer.invoke('open-folder', folder);
  };

  const handleReset = () => {
    setUrl('');
    setVideoInfo(null);
    setFilename('');
    setCompleted(false);
    setProgress(0);
    setDownloadedPath('');
    setDownloadedSize('');
    showStatus('Ready for a new download', 'info');
  };

  return (
    <div className="home-page">
      <div className="page-header">
        <h1>Download Videos</h1>
        <p>Enter a video URL to get started</p>
      </div>

      {status.message && (
        <div className={`status-message status-${status.type} fade-in`}>
          {status.message}
        </div>
      )}

      <div className="card">
        <h2>Video URL</h2>
        <div className="input-group">
          <input
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleFetchInfo()}
          />
        </div>
        <button className="btn btn-primary" onClick={handleFetchInfo}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Fetch Info
        </button>
      </div>

      {videoInfo && (
        <div className="card fade-in">
          <h2>Video Information</h2>
          <div className="video-info">
            {videoInfo.thumbnail && (
              <img src={videoInfo.thumbnail} alt="Thumbnail" className="video-thumbnail" />
            )}
            <div className="video-details">
              <div className="detail-row">
                <strong>Title:</strong>
                <span>{videoInfo.title}</span>
              </div>
              <div className="detail-row">
                <strong>Duration:</strong>
                <span>{videoInfo.duration}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!completed && videoInfo && (
        <div className="card fade-in">
          <h2>Download Settings</h2>
          
          <div className="input-group">
            <label>Save Location</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={folder}
                readOnly
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary" onClick={handleSelectFolder}>
                Browse
              </button>
            </div>
          </div>

          <div className="input-group">
            <label>Filename</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Enter filename"
            />
          </div>

          <div className="settings-row">
            <div className="input-group">
              <label>Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="mp4">MP4 (Recommended)</option>
                <option value="mkv">MKV</option>
                <option value="webm">WebM</option>
                <option value="avi">AVI</option>
              </select>
            </div>

            <div className="input-group">
              <label>Quality</label>
              <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                <option value="best">Best Available</option>
                <option value="1080p">1080p Full HD</option>
                <option value="720p">720p HD</option>
                <option value="480p">480p SD</option>
                <option value="audio">Audio Only</option>
              </select>
            </div>
          </div>

          <button 
            className="btn btn-success" 
            onClick={handleDownload}
            disabled={downloading}
            style={{ width: '100%', marginTop: '12px' }}
          >
            {downloading ? 'Downloading...' : 'Download Video'}
          </button>
        </div>
      )}

      {downloading && (
        <div className="card fade-in">
          <h2>Download Progress</h2>
          <div className="progress-container">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}>
                {Math.round(progress)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {completed && (
        <div className="card fade-in">
          <h2>Download Complete</h2>
          <div className="complete-info">
            <div className="detail-row">
              <strong>Saved to:</strong>
              <span className="path-text">{downloadedPath}</span>
            </div>
            <div className="detail-row">
              <strong>File size:</strong>
              <span>{downloadedSize} MB</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button className="btn btn-primary" onClick={handleOpenFolder}>
              Open Folder
            </button>
            <button className="btn btn-secondary" onClick={handleReset}>
              Download Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomePage;
