import React from 'react';
import './Navigation.css';

function Navigation({ currentPage, setCurrentPage, visible, toggleNav }) {
  return (
    <nav className={`navigation ${!visible ? 'hidden' : ''}`}>
      <div className="nav-header">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#ffffff" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h1>Video Downloader</h1>
        <span className="version">v3.3.0</span>
      </div>

      <div className="nav-items">
        <button 
          className={`nav-item ${currentPage === 'home' ? 'active' : ''}`}
          onClick={() => setCurrentPage('home')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 22V12H15V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Home</span>
        </button>

        <button 
          className={`nav-item ${currentPage === 'cookies' ? 'active' : ''}`}
          onClick={() => setCurrentPage('cookies')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 8C12.5523 8 13 7.55228 13 7C13 6.44772 12.5523 6 12 6C11.4477 6 11 6.44772 11 7C11 7.55228 11.4477 8 12 8Z" fill="currentColor"/>
            <path d="M9 12C9.55228 12 10 11.5523 10 11C10 10.4477 9.55228 10 9 10C8.44772 10 8 10.4477 8 11C8 11.5523 8.44772 12 9 12Z" fill="currentColor"/>
            <path d="M16 13C16.5523 13 17 12.5523 17 12C17 11.4477 16.5523 11 16 11C15.4477 11 15 11.4477 15 12C15 12.5523 15.4477 13 16 13Z" fill="currentColor"/>
            <path d="M12 17C12.5523 17 13 16.5523 13 16C13 15.4477 12.5523 15 12 15C11.4477 15 11 15.4477 11 16C11 16.5523 11.4477 17 12 17Z" fill="currentColor"/>
          </svg>
          <span>Cookie Management</span>
        </button>
      </div>

      <div className="nav-footer">
        <div className="footer-item">
          <span>Powered by yt-dlp</span>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;
