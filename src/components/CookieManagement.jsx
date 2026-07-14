import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { showToast } from './Toast';
import { confirmDialog } from './ConfirmDialog';
import Spinner from './Spinner';
import './CookieManagement.css';

// Quick-access logins for the platforms most people need; yt-dlp itself
// supports hundreds more, which is what the "Custom Login" box below is for.
// Each gets a subtle brand-tinted accent so the three read as distinct,
// premium shortcuts rather than identical generic buttons.
const QUICK_LOGIN_SITES = [
  {
    label: 'YouTube',
    url: 'https://accounts.google.com/ServiceLogin?continue=https://www.youtube.com/',
    color: '#ef4444',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 8.5s-.2-1.6-.8-2.3c-.8-.9-1.7-.9-2.1-1C16.3 5 12 5 12 5h0s-4.3 0-7.1.2c-.4 0-1.3.1-2.1 1-.6.7-.8 2.3-.8 2.3S1.8 10.4 1.8 12.3v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.8 2.3c.8.9 1.9.9 2.4 1 1.7.2 7.3.2 7.3.2s4.3 0 7.1-.2c.4 0 1.3-.1 2.1-1 .6-.7.8-2.3.8-2.3s.2-1.9.2-3.8v-1.8c0-1.9-.2-3.8-.2-3.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M9.8 15.3V8.7l5.7 3.3-5.7 3.3Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: 'Facebook',
    url: 'https://www.facebook.com/login/',
    color: '#3b82f6',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 8.5h2V5.4c-.35-.05-1.5-.15-2.85-.15C11.6 5.25 10 6.9 10 9.6v2.4H7.5v3.5H10V22h3.5v-6.5h2.85l.45-3.5H13.5V9.9c0-1 .3-1.4 1.5-1.4Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: 'Instagram',
    url: 'https://www.instagram.com/accounts/login/',
    color: '#ec4899',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8"/>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8"/>
        <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/>
      </svg>
    ),
  },
];

/** Best-effort short label for the login hint text; never throws. */
function labelForUrl(url) {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function CookieManagement() {
  const [cookies, setCookies] = useState([]);
  const [selectedCookies, setSelectedCookies] = useState([]);
  const [editingCookie, setEditingCookie] = useState(null);
  const [loginStatus, setLoginStatus] = useState({ loggedIn: false, domains: [], cookieCount: 0 });
  const [loading, setLoading] = useState(true);
  const [loginWindowOpen, setLoginWindowOpen] = useState(false);
  const [loginLabel, setLoginLabel] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    (async () => {
      await Promise.all([loadCookies(), loadLoginStatus()]);
      setLoading(false);
    })();

    // Refresh automatically when the backend captures cookies from the login window.
    const unlistenPromises = [
      listen('cookies-updated', (event) => {
        loadCookies();
        loadLoginStatus();
        const count = event.payload && event.payload.count;
        if (count) {
          showToast(`Captured ${count} cookie(s) from your login session`, 'success');
        }
      }),
      // Fires once the login window is actually gone, however it was closed
      // (the "Close Login Window" button, or the user closing it via the OS).
      listen('login-window-closed', () => {
        setLoginWindowOpen(false);
        setLoginLabel('');
      }),
    ];

    return () => {
      unlistenPromises.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, []);

  const loadLoginStatus = async () => {
    const result = await invoke('check_login_status');
    if (result.success) {
      setLoginStatus(result);
    }
  };

  const loadCookies = async () => {
    const result = await invoke('load_cookies');
    if (result.success && result.content) {
      // Parse cookies from Netscape format
      const lines = result.content.split('\n');
      const parsedCookies = lines
        .filter(line => line.trim() && !line.startsWith('#'))
        .map((line, index) => {
          const parts = line.split('\t');
          if (parts.length >= 7) {
            return {
              id: index,
              domain: parts[0],
              flag: parts[1],
              path: parts[2],
              secure: parts[3],
              expiration: parts[4],
              name: parts[5],
              value: parts[6]
            };
          }
          return null;
        })
        .filter(cookie => cookie !== null);

      setCookies(parsedCookies);
    } else {
      setCookies([]);
    }
  };

  const saveCookies = async (updatedCookies) => {
    // Convert back to Netscape format
    let cookieContent = '# Netscape HTTP Cookie File\n';
    cookieContent += '# This file was generated by Video Downloader. Edit at your own risk.\n\n';

    updatedCookies.forEach(cookie => {
      cookieContent += `${cookie.domain}\t${cookie.flag}\t${cookie.path}\t${cookie.secure}\t${cookie.expiration}\t${cookie.name}\t${cookie.value}\n`;
    });

    const result = await invoke('save_cookies', { cookiesContent: cookieContent });
    if (result.success) {
      await loadCookies();
      await loadLoginStatus();
      return true;
    }
    return false;
  };

  const handleDeleteAll = async () => {
    const confirmed = await confirmDialog('Are you sure you want to delete ALL cookies? This cannot be undone.', {
      title: 'Delete all cookies?',
      confirmText: 'Delete All',
      danger: true,
    });
    if (!confirmed) return;

    const result = await invoke('clear_cookies');
    if (result.success) {
      setCookies([]);
      setSelectedCookies([]);
      await loadLoginStatus();
      showToast('All cookies deleted successfully', 'success');
    } else {
      showToast('Failed to delete cookies', 'error');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedCookies.length === 0) {
      showToast('Please select cookies to delete', 'error');
      return;
    }

    const confirmed = await confirmDialog(`Delete ${selectedCookies.length} selected cookie(s)?`, {
      title: 'Delete selected cookies?',
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    const updatedCookies = cookies.filter(cookie => !selectedCookies.includes(cookie.id));
    const success = await saveCookies(updatedCookies);

    if (success) {
      setSelectedCookies([]);
      showToast(`${selectedCookies.length} cookie(s) deleted successfully`, 'success');
    } else {
      showToast('Failed to delete cookies', 'error');
    }
  };

  const handleDeleteOne = async (id) => {
    const confirmed = await confirmDialog('Delete this cookie?', {
      title: 'Delete cookie?',
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    const updatedCookies = cookies.filter(cookie => cookie.id !== id);
    const success = await saveCookies(updatedCookies);

    if (success) {
      showToast('Cookie deleted successfully', 'success');
    } else {
      showToast('Failed to delete cookie', 'error');
    }
  };

  const handleEditCookie = (cookie) => {
    setEditingCookie({ ...cookie });
  };

  const handleSaveEdit = async () => {
    if (!editingCookie) return;

    const updatedCookies = cookies.map(cookie =>
      cookie.id === editingCookie.id ? editingCookie : cookie
    );

    const success = await saveCookies(updatedCookies);

    if (success) {
      setEditingCookie(null);
      showToast('Cookie updated successfully', 'success');
    } else {
      showToast('Failed to update cookie', 'error');
    }
  };

  const handleSelectCookie = (id) => {
    setSelectedCookies(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedCookies.length === cookies.length) {
      setSelectedCookies([]);
    } else {
      setSelectedCookies(cookies.map(c => c.id));
    }
  };

  const handleLogin = async (url, label) => {
    setLoggingIn(true);
    try {
      const result = await invoke('open_login_window', { url });
      if (result.success) {
        setLoginWindowOpen(true);
        setLoginLabel(label || labelForUrl(url));
        showToast('Login window opened. Sign in, then click "I\'ve Finished Logging In".', 'info');
      } else {
        showToast(result.error || 'Failed to open login window', 'error');
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleCustomLogin = async () => {
    if (!customUrl.trim()) {
      showToast('Please enter a URL', 'error');
      return;
    }
    await handleLogin(customUrl.trim());
  };

  // Explicit confirmation step: let the user finish signing in (and let the
  // page fully redirect/settle) before we snapshot the webview's cookies,
  // rather than racing a fixed timeout against the login flow.
  const handleFinishedLogin = async () => {
    setCapturing(true);
    try {
      const result = await invoke('capture_login_cookies');
      if (result.success) {
        await loadCookies();
        await loadLoginStatus();
        if (result.count > 0) {
          showToast(`Captured ${result.count} cookie(s) for ${result.domains.join(', ') || 'your session'}`, 'success');
        } else {
          showToast('No cookies found yet — finish logging in, then try again', 'warning');
        }
      } else {
        showToast(result.error || 'Failed to capture cookies', 'error');
      }
    } finally {
      setCapturing(false);
    }
  };

  const handleCloseLoginWindow = async () => {
    await invoke('close_login_window');
    setLoginWindowOpen(false);
    setLoginLabel('');
    await loadCookies();
    await loadLoginStatus();
  };

  return (
    <div className="cookie-management">
      <div className="page-header">
        <h1>Cookie Management</h1>
        <p>Manage your saved login cookies</p>
      </div>

      <div className="card">
        <h2>Login Status</h2>
        <div className="login-status-card">
          <div className="status-info">
            <div className={`status-badge ${loginStatus.loggedIn ? 'logged-in' : ''}`}>
              {loginStatus.loggedIn ? `Logged in (${loginStatus.cookieCount} cookies)` : 'Not logged in'}
            </div>
            {loginStatus.domains && loginStatus.domains.length > 0 && (
              <div className="domain-badges">
                {loginStatus.domains.map((domain, idx) => (
                  <span key={idx} className="domain-badge">{domain}</span>
                ))}
              </div>
            )}
            {loginWindowOpen && (
              <p className="login-hint">
                Finish logging in to {loginLabel || 'the site'} in the popup window, then confirm below.
              </p>
            )}
          </div>

          {loginWindowOpen ? (
            <div className="login-followup">
              <button className="btn btn-success" onClick={handleFinishedLogin} disabled={capturing}>
                {capturing ? <Spinner size={16} /> : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                )}
                I've Finished Logging In
              </button>
              <button className="btn btn-secondary" onClick={handleCloseLoginWindow}>
                Close Login Window
              </button>
            </div>
          ) : (
            <div className="quick-login-grid">
              {QUICK_LOGIN_SITES.map((site) => (
                <button
                  key={site.label}
                  className="quick-login-btn"
                  style={{ '--site-color': site.color }}
                  onClick={() => handleLogin(site.url, site.label)}
                  disabled={loggingIn}
                >
                  <span className="quick-login-icon">
                    {loggingIn ? <Spinner size={18} /> : site.icon}
                  </span>
                  <span className="quick-login-label">{site.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!loginWindowOpen && (
          <div className="custom-login">
            <label htmlFor="custom-login-url">Custom Login</label>
            <p className="login-hint">
              yt-dlp supports hundreds of sites — paste any login page (e.g. tiktok.com/login) to sign in there too.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="custom-login-url"
                type="text"
                placeholder="e.g. https://www.tiktok.com/login"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !loggingIn && handleCustomLogin()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary" onClick={handleCustomLogin} disabled={loggingIn}>
                {loggingIn ? <Spinner size={16} /> : 'Go'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Cookies ({cookies.length})</h2>
          <div className="action-buttons">
            {cookies.length > 0 && (
              <>
                <button className="btn btn-secondary" onClick={handleSelectAll}>
                  {selectedCookies.length === cookies.length ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleDeleteSelected}
                  disabled={selectedCookies.length === 0}
                >
                  Delete Selected ({selectedCookies.length})
                </button>
                <button className="btn btn-danger" onClick={handleDeleteAll}>
                  Delete All
                </button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <Spinner size={18} />
            <span>Loading cookies...</span>
          </div>
        ) : cookies.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p>No cookies found</p>
            <p className="empty-subtitle">Click "Login" above to save your login session</p>
          </div>
        ) : (
          <div className="cookie-list">
            {cookies.map(cookie => (
              <div key={cookie.id} className={`cookie-item ${selectedCookies.includes(cookie.id) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedCookies.includes(cookie.id)}
                  onChange={() => handleSelectCookie(cookie.id)}
                  className="cookie-checkbox"
                />
                <div className="cookie-info">
                  <div className="cookie-name">{cookie.name}</div>
                  <div className="cookie-domain">{cookie.domain}</div>
                  <div className="cookie-path">{cookie.path}</div>
                </div>
                <div className="cookie-actions">
                  <button
                    className="btn-icon btn-icon-edit"
                    onClick={() => handleEditCookie(cookie)}
                    title="Edit"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M18.5 2.5C18.8978 2.10217 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.10217 21.5 2.5C21.8978 2.89782 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.10217 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button
                    className="btn-icon btn-icon-delete"
                    onClick={() => handleDeleteOne(cookie.id)}
                    title="Delete"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingCookie && (
        <div className="modal-overlay" onClick={() => setEditingCookie(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Cookie</h2>
            <div className="input-group">
              <label>Name</label>
              <input
                type="text"
                value={editingCookie.name}
                onChange={(e) => setEditingCookie({...editingCookie, name: e.target.value})}
              />
            </div>
            <div className="input-group">
              <label>Value</label>
              <input
                type="text"
                value={editingCookie.value}
                onChange={(e) => setEditingCookie({...editingCookie, value: e.target.value})}
              />
            </div>
            <div className="input-group">
              <label>Domain</label>
              <input
                type="text"
                value={editingCookie.domain}
                onChange={(e) => setEditingCookie({...editingCookie, domain: e.target.value})}
              />
            </div>
            <div className="input-group">
              <label>Path</label>
              <input
                type="text"
                value={editingCookie.path}
                onChange={(e) => setEditingCookie({...editingCookie, path: e.target.value})}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-success" onClick={handleSaveEdit}>
                Save Changes
              </button>
              <button className="btn btn-secondary" onClick={() => setEditingCookie(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CookieManagement;
