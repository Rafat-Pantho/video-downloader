import React, { useState, useEffect } from 'react';
import './HomePage.css';

const { ipcRenderer } = window.require('electron');

function HomePage() {
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState('');
  const [filename, setFilename] = useState('');
  const [format, setFormat] = useState('mp4');
  const [audioFormat, setAudioFormat] = useState('mp3');
  const [quality, setQuality] = useState('');
  const [availableQualities, setAvailableQualities] = useState([]);
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

      // Qualities are included in the same response
      if (result.qualities && result.qualities.length > 0) {
        setAvailableQualities(result.qualities);
        setQuality(result.qualities[0].value);
      } else {
        // Fallback: show all tiers if detection fails
        setAvailableQualities([
          { value: '1080p', label: '1080p (Full HD) (Best Quality)', isBest: true },
          { value: '720p', label: '720p (HD)' },
          { value: '480p', label: '480p (SD)' },
        ]);
        setQuality('1080p');
      }
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
      format: quality === 'audio' ? audioFormat : format,
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
    setQuality('');
    setAvailableQualities([]);
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
        <h2>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          Video URL
        </h2>
        <div className="input-group">
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="url"
              placeholder="Paste video URL here (YouTube, Facebook, etc.)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleFetchInfo()}
              style={{ flex: 1 }}
            />
            <button 
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setUrl(text);
                } catch (err) {
                  showStatus('Failed to read clipboard', 'error');
                }
              }}
              title="Paste from clipboard"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>
            </button>
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleFetchInfo} style={{ width: '100%' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          Fetch Video Info
        </button>
      </div>

      {videoInfo && (
        <div className="card fade-in">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
            Video Information
          </h2>
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
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download Settings
          </h2>
          
          <div className="input-group">
            <label>Save Location</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={folder}
                readOnly
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary" onClick={handleSelectFolder} title="Browse folder">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
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
              <label>{quality === 'audio' ? 'Audio Format' : 'Video Format'}</label>
              {quality === 'audio' ? (
                <select value={audioFormat} onChange={(e) => setAudioFormat(e.target.value)}>
                  <option value="mp3">MP3 (Recommended)</option>
                  <option value="m4a">M4A (AAC)</option>
                  <option value="opus">Opus</option>
                  <option value="flac">FLAC (Lossless)</option>
                  <option value="wav">WAV (Uncompressed)</option>
                </select>
              ) : (
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="mp4">MP4 (Recommended)</option>
                  <option value="mkv">MKV</option>
                  <option value="webm">WebM</option>
                  <option value="avi">AVI</option>
                </select>
              )}
            </div>

            <div className="input-group">
              <label>Quality</label>
              <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                {availableQualities.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
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
            {downloading ? 'Downloading...' : quality === 'audio' ? 'Download Audio' : 'Download Video'}
          </button>
        </div>
      )}

      {downloading && (
        <div className="card fade-in">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin">
              <line x1="12" y1="2" x2="12" y2="6"></line>
              <line x1="12" y1="18" x2="12" y2="22"></line>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
              <line x1="2" y1="12" x2="6" y2="12"></line>
              <line x1="18" y1="12" x2="22" y2="12"></line>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
            Download Progress
          </h2>
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
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--success)' }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            Download Complete
          </h2>
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
            <button className="btn btn-primary" onClick={handleOpenFolder} style={{ flex: 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              Open Folder
            </button>
            <button className="btn btn-secondary" onClick={handleReset} style={{ flex: 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              Download Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomePage;
