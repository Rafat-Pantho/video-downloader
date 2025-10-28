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
      
      <div className={`main-content ${!navVisible ? 'full-width' : ''}`}>
        <button className="nav-toggle" onClick={() => setNavVisible(!navVisible)}>
          {navVisible ? '◀' : '▶'}
        </button>
        
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
