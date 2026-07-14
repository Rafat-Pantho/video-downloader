import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { showToast } from './Toast';
import Spinner from './Spinner';
import './Initialization.css';

// Human-friendly names for the files the backend reports progress on.
const FILE_LABELS = {
  'yt-dlp': 'yt-dlp',
  ffmpeg: 'FFmpeg',
  ffprobe: 'FFprobe',
};

const STATUS_LABELS = {
  downloading: 'Downloading',
  extracting: 'Extracting',
  finished: 'Finished',
  error: 'Error',
};

/**
 * Full-screen gatekeeper shown before the main UI whenever yt-dlp/ffmpeg
 * aren't present yet. Checks readiness on mount; if binaries are missing it
 * drives the backend's download flow and mirrors its progress here.
 */
function Initialization({ onReady }) {
  const [phase, setPhase] = useState('checking'); // checking | setting-up | error
  const [file, setFile] = useState('');
  const [status, setStatus] = useState('downloading');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  // Guards against onReady firing twice (once from the "finished" event and
  // once from the invoke() promise resolving) — StrictMode-safe too.
  const readyFired = useRef(false);

  const fireReady = () => {
    if (readyFired.current) return;
    readyFired.current = true;
    showToast('Dependencies ready — enjoy!', 'success');
    // Small delay so the "Finished" state is actually visible for a beat
    // instead of flashing straight to the main UI.
    setTimeout(onReady, 500);
  };

  const runSetup = async () => {
    setPhase('setting-up');
    setErrorMessage('');
    try {
      const result = await invoke('setup_dependencies');
      if (!result.success) {
        setPhase('error');
        setErrorMessage(result.error || 'Setup failed for an unknown reason.');
      }
      // On success the "finished" dependency-setup-event already triggered
      // fireReady(); nothing further to do here.
    } catch (err) {
      setPhase('error');
      setErrorMessage(String(err));
    }
  };

  useEffect(() => {
    let unlisten;

    (async () => {
      unlisten = await listen('dependency-setup-event', (event) => {
        const payload = event.payload || {};
        if (payload.status === 'error') {
          setPhase('error');
          setErrorMessage(payload.message || 'Setup failed for an unknown reason.');
          return;
        }
        if (payload.file) setFile(payload.file);
        setStatus(payload.status);
        setProgress(payload.progress || 0);
        if (payload.status === 'finished') {
          fireReady();
        }
      });

      const check = await invoke('check_dependencies');
      if (check.ready) {
        fireReady();
        return;
      }
      await runSetup();
    })();

    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fileLabel = FILE_LABELS[file] || file || 'dependencies';
  const statusLabel = STATUS_LABELS[status] || 'Downloading';

  return (
    <div className="init-screen">
      <div className="init-card">
        <div className={`init-icon ${phase === 'error' ? 'init-icon-error' : ''}`}>
          {phase === 'error' ? (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          ) : (
            <Spinner size={40} />
          )}
        </div>

        {phase === 'error' ? (
          <>
            <h1>Setup Failed</h1>
            <p className="init-subtext">
              We couldn't finish setting up yt-dlp/FFmpeg. Check your internet connection and try again.
            </p>
            <div className="init-error-detail">{errorMessage}</div>
            <button className="btn btn-primary" onClick={runSetup} style={{ marginTop: '20px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              Retry
            </button>
          </>
        ) : (
          <>
            <h1>Setting Up Video Downloader</h1>
            <p className="init-subtext">
              {phase === 'checking'
                ? 'Checking for required components...'
                : `${statusLabel} ${fileLabel}...`}
            </p>

            <div className="init-progress-container">
              <div className="init-progress-bar">
                <div className="init-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="init-progress-label">
                {phase === 'checking' ? '' : `${Math.round(progress)}%`}
              </span>
            </div>

            <p className="init-hint">
              This only happens once — yt-dlp and FFmpeg are downloaded and stored locally so future
              launches start instantly.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default Initialization;
