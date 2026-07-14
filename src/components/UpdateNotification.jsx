import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './UpdateNotification.css';

function UpdateNotification() {
  const [update, setUpdate] = useState(null);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Check for updates on mount
    invoke('check_for_update').then((result) => {
      if (result && result.updateAvailable) {
        setUpdate(result);
        setVisible(true);

        // Auto-dismiss after 32 seconds
        const timer = setTimeout(() => {
          dismiss();
        }, 32000);

        return () => clearTimeout(timer);
      }
    });
  }, []);

  const dismiss = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, 400); // match CSS exit animation duration
  };

  const handleClick = () => {
    if (update && update.releaseUrl) {
      invoke('open_external', { url: update.releaseUrl });
    }
    dismiss();
  };

  if (!visible || !update) return null;

  return (
    <div className={`update-toast ${exiting ? 'toast-exit' : 'toast-enter'}`}>
      <div className="update-toast-content" onClick={handleClick}>
        <div className="update-toast-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </div>
        <div className="update-toast-text">
          <strong>Update Available</strong>
          <span>v{update.latestVersion} — Click to download</span>
        </div>
      </div>
      <button className="update-toast-close" onClick={(e) => { e.stopPropagation(); dismiss(); }} title="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}

export default UpdateNotification;
