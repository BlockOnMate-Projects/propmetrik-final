import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import keycloak from './keycloak';
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
    
    // Initialize Keycloak
    keycloak
      .init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
        checkLoginIframe: false,
        pkceMethod: 'S256',
        flow: 'standard',
      })
      .then((auth) => {
        if (!auth) {
          console.log('❌ Not authenticated - redirecting to login...');
          keycloak.login();
          return;
        }
        
        setAuthenticated(auth);
        setLoading(false);

        console.log('✅ User authenticated');
        console.log('User info:', keycloak.tokenParsed);
        console.log('Token available:', !!keycloak.token);
        console.log('Token (first 50 chars):', keycloak.token?.substring(0, 50));

        // Token refresh
        setInterval(() => {
          keycloak
            .updateToken(70)
            .then((refreshed) => {
              if (refreshed) {
                console.log('Token refreshed');
              }
            })
            .catch(() => {
              console.error('Failed to refresh token');
            });
        }, 60000); // Check every minute
      })
      .catch((error) => {
        console.error('Keycloak initialization failed:', error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Loading Cedyn E-Signature Platform...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="app-loading">
        <div className="card">
          <h2>Authentication Required</h2>
          <p>Please wait while we redirect you to login...</p>
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
