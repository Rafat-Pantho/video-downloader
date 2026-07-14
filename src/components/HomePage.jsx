import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { downloadDir } from '@tauri-apps/api/path';
import { showToast } from './Toast';
import { confirmDialog } from './ConfirmDialog';
import Spinner from './Spinner';
import './HomePage.css';

function HomePage() {
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState('');
  const [filename, setFilename] = useState('');
  const [format, setFormat] = useState('mp4');
  const [audioFormat, setAudioFormat] = useState('mp3');
  const [quality, setQuality] = useState('');
  const [availableQualities, setAvailableQualities] = useState([]);
  const [videoInfo, setVideoInfo] = useState(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [downloadedPath, setDownloadedPath] = useState('');
  const [downloadedSize, setDownloadedSize] = useState('');

  useEffect(() => {
    let unlisten;

    (async () => {
      // Set default folder to the user's Downloads directory
      try {
        setFolder(await downloadDir());
      } catch (err) {
        console.error('Failed to resolve download directory:', err);
      }

      // Listen for download progress events emitted from the Rust backend
      unlisten = await listen('download-progress', (event) => {
        setProgress(event.payload.progress);
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleFetchInfo = async () => {
    if (!url.trim()) {
      showToast('Please enter a video URL', 'error');
      return;
    }

    setFetchingInfo(true);
    try {
      const result = await invoke('get_video_info', { url });

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
        showToast('Video information loaded successfully', 'success');
      } else {
        showToast(result.error || 'Failed to fetch video info', 'error');
        setFilename(result.title || 'video');
        // Raw yt-dlp stderr for the actual reason (e.g. a rejected cookie) —
        // too verbose for a toast, but invaluable in devtools when debugging.
        if (result.stderr) {
          console.error('yt-dlp stderr:', result.stderr);
        }
      }
    } finally {
      setFetchingInfo(false);
    }
  };

  const handleSelectFolder = async () => {
    const result = await invoke('select_folder');
    if (result) {
      setFolder(result);
    }
  };

  const handleDownload = async () => {
    if (!filename.trim()) {
      showToast('Please enter a filename', 'error');
      return;
    }

    setDownloading(true);
    setCompleted(false);
    setProgress(0);

    const result = await invoke('download_video', {
      url,
      folder,
      filename,
      format: quality === 'audio' ? audioFormat : format,
      quality
    });

    setDownloading(false);

    // Raw yt-dlp stderr for the real failure reason (rejected/expired cookie,
    // "unable to load cookies" file-read error, bot-check, etc.) — too verbose
    // for a toast, but invaluable in devtools when a cookie'd download fails.
    if (!result.success && result.stderr) {
      console.error('yt-dlp download stderr:', result.stderr);
    }

    if (result.success) {
      setCompleted(true);
      setDownloadedPath(result.path);
      setDownloadedSize(result.size || 'Unknown');
      showToast('Download completed successfully!', 'success');
    } else if (result.needsLogin) {
      const shouldLogin = await confirmDialog(result.error, {
        title: 'Login required',
        confirmText: 'Login',
        cancelText: 'Not now',
      });
      if (shouldLogin) {
        // Open directly on the video's own URL — yt-dlp supports far more
        // sites than we could ever hardcode a dedicated login page for, so
        // the user logs in however that site itself prompts them to.
        const loginResult = await invoke('open_login_window', { url: result.url });
        if (loginResult.success) {
          showToast('Login window opened. Sign in, confirm on the Cookie Management page, then try downloading again.', 'info');
        } else {
          showToast(loginResult.error || 'Failed to open login window', 'error');
        }
      } else {
        showToast(result.error, 'error');
      }
    } else {
      showToast(result.error || 'Download failed', 'error');
    }
  };

  const handleOpenFolder = () => {
    invoke('open_folder', { folderPath: folder });
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
  };

  return (
    <div className="home-page">
      <div className="page-header">
        <h1>Download Videos</h1>
        <p>Enter a video URL to get started</p>
      </div>

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
              onKeyPress={(e) => e.key === 'Enter' && !fetchingInfo && handleFetchInfo()}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setUrl(text);
                } catch (err) {
                  showToast('Failed to read clipboard', 'error');
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
        <button className="btn btn-primary" onClick={handleFetchInfo} disabled={fetchingInfo} style={{ width: '100%' }}>
          {fetchingInfo ? <Spinner size={18} /> : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          )}
          {fetchingInfo ? 'Fetching...' : 'Fetch Video Info'}
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
              <button className="btn btn-secondary" onClick={handleSelectFolder} disabled={downloading} title="Browse folder">
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
              disabled={downloading}
            />
          </div>

          <div className="settings-row">
            <div className="input-group">
              <label>{quality === 'audio' ? 'Audio Format' : 'Video Format'}</label>
              {quality === 'audio' ? (
                <select value={audioFormat} onChange={(e) => setAudioFormat(e.target.value)} disabled={downloading}>
                  <option value="mp3">MP3 (Recommended)</option>
                  <option value="m4a">M4A (AAC)</option>
                  <option value="opus">Opus</option>
                  <option value="flac">FLAC (Lossless)</option>
                  <option value="wav">WAV (Uncompressed)</option>
                </select>
              ) : (
                <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={downloading}>
                  <option value="mp4">MP4 (Recommended)</option>
                  <option value="mkv">MKV</option>
                  <option value="webm">WebM</option>
                  <option value="any">Any (Best Quality, No Conversion)</option>
                </select>
              )}
            </div>

            <div className="input-group">
              <label>Quality</label>
              <select value={quality} onChange={(e) => setQuality(e.target.value)} disabled={downloading}>
                {availableQualities.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
                <option value="audio">Audio Only</option>
              </select>
            </div>
          </div>

          {/* The surrounding settings stay mounted and static; only this action
              region changes — the Download button morphs into a progress bar. */}
          {downloading ? (
            <div className="inline-progress">
              <div className="download-card-status">
                <span className="status-dot" />
                {progress === 0
                  ? 'Preparing download...'
                  : `${quality === 'audio' ? 'Extracting audio' : 'Downloading'} — ${Math.round(progress)}%`}
              </div>
              <div className="progress-container">
                <div className={`progress-bar ${progress === 0 ? 'indeterminate' : ''}`}>
                  {progress > 0 && (
                    <div className="progress-fill" style={{ width: `${progress}%` }}>
                      {Math.round(progress)}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-success"
              onClick={handleDownload}
              style={{ width: '100%', marginTop: '12px' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              {quality === 'audio' ? 'Download Audio' : 'Download Video'}
            </button>
          )}
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
