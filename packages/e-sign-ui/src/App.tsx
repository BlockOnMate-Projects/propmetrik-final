import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import propmetrikAuth, { initAuth, isAuthenticated, getUserInfo } from './propmetrik-auth';
import Dashboard from './pages/Dashboard';
import Agreements from './pages/Agreements';
import Templates from './pages/Templates';
import Reports from './pages/Reports';
import SignaturePage from './pages/SignaturePage';
import './App.css';

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (initialized) return;
    
    setInitialized(true);
    
    // Initialize PROPMETRIK authentication
    const hasToken = initAuth();
    
    if (hasToken && isAuthenticated()) {
      const userInfo = getUserInfo();
      console.log('✅ User authenticated via PROPMETRIK');
      console.log('User info:', userInfo);
      setAuthenticated(true);
      setLoading(false);
    } else {
      console.log('❌ Not authenticated - waiting for PROPMETRIK token...');
      // In embedded mode, we wait for token from parent
      // Set a timeout to show error if no token received
      const timeout = setTimeout(() => {
        if (!isAuthenticated()) {
          console.error('No authentication token received from PROPMETRIK');
          setLoading(false);
        }
      }, 5000);
      
      // Listen for token updates
      const checkAuth = setInterval(() => {
        if (isAuthenticated()) {
          clearTimeout(timeout);
          clearInterval(checkAuth);
          setAuthenticated(true);
          setLoading(false);
          console.log('✅ Received auth token from PROPMETRIK');
        }
      }, 100);
      
      return () => {
        clearTimeout(timeout);
        clearInterval(checkAuth);
      };
    }
  }, [initialized]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Loading PROPMETRIK E-Signature...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="app-loading">
        <div className="card">
          <h2>Authentication Required</h2>
          <p>Please access E-Sign through PROPMETRIK.</p>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '1rem' }}>
            E-Sign requires a valid PROPMETRIK session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agreements" element={<Agreements />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/sign/:accessToken" element={<SignaturePage />} />
          <Route path="/oauth2callback" element={<Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
