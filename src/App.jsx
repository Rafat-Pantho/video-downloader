import React, { useState } from 'react';
import Navigation from './components/Navigation';
import HomePage from './components/HomePage';
import CookieManagement from './components/CookieManagement';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [navVisible, setNavVisible] = useState(true);

  return (
    <div className="app-container">
      <Navigation 
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        visible={navVisible}
        toggleNav={() => setNavVisible(!navVisible)}
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
    </div>
  );
}

export default App;
