import React, { useState, useEffect } from 'react';
import Navigation from './components/Navigation';
import HomePage from './components/HomePage';
import CookieManagement from './components/CookieManagement';
import UpdateNotification from './components/UpdateNotification';
import Initialization from './components/Initialization';
import { ToastContainer } from './components/Toast';
import { ConfirmDialogHost } from './components/ConfirmDialog';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [navVisible, setNavVisible] = useState(true);
  const [dependenciesReady, setDependenciesReady] = useState(false);
  // Theme is read from localStorage on first render so there's no flash to the
  // wrong theme (an inline script in index.html also applies it pre-mount).
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // Drive the whole palette off a single [data-theme] attribute on <html>, and
  // persist the choice. All CSS variables have a dark override keyed on it.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* localStorage may be unavailable; theme still applies for this session */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  if (!dependenciesReady) {
    return (
      <>
        <Initialization onReady={() => setDependenciesReady(true)} />
        <ToastContainer />
      </>
    );
  }

  return (
    <div className="app-container">
      <UpdateNotification />
      <Navigation
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        visible={navVisible}
        toggleNav={() => setNavVisible(!navVisible)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      
      {/* Toggle button - positioned outside main-content for proper placement */}
      <button 
        className={`nav-toggle ${!navVisible ? 'nav-hidden' : ''}`} 
        onClick={() => setNavVisible(!navVisible)}
        title={navVisible ? 'Hide menu' : 'Show menu'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {navVisible ? (
            <>
              <polyline points="15 18 9 12 15 6"></polyline>
            </>
          ) : (
            <>
              <polyline points="9 18 15 12 9 6"></polyline>
            </>
          )}
        </svg>
      </button>
      
      <div className={`main-content ${!navVisible ? 'full-width' : ''}`}>
        {currentPage === 'home' ? (
          <HomePage />
        ) : (
          <CookieManagement />
        )}
      </div>

      <ToastContainer />
      <ConfirmDialogHost />
    </div>
  );
}

export default App;
