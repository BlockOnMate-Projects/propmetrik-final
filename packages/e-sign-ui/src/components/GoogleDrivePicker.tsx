import { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { connectGoogleDrive } from '../api';
import { toast } from 'react-toastify';
import './GoogleDrivePicker.css';

interface GoogleDrivePickerProps {
  onFileSelected?: (fileId: string, fileName: string) => void;
}

function GoogleDrivePicker({ onFileSelected }: GoogleDrivePickerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if Google Drive is already connected
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      // You could add an API endpoint to check if user has valid Google tokens
      // For now, we'll assume not connected by default
      setIsConnected(false);
    } catch (error) {
      console.error('Failed to check Google Drive connection:', error);
    }
  };

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        // Send authorization code to backend
        await connectGoogleDrive(tokenResponse.access_token);
        setIsConnected(true);
        toast.success('Google Drive connected successfully!');
      } catch (error) {
        console.error('Failed to connect Google Drive:', error);
        toast.error('Failed to connect Google Drive. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    onError: (error) => {
      console.error('Google login failed:', error);
      toast.error('Google login failed. Please try again.');
    },
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    flow: 'implicit',
  });

  const openPicker = () => {
    if (!isConnected) {
      handleGoogleLogin();
      return;
    }

    // Load Google Picker API
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      (window as any).gapi.load('picker', () => {
        createPicker();
      });
    };
    document.body.appendChild(script);
  };

  const createPicker = () => {
    const google = (window as any).gapi;
    const googleAuth = (window as any).google;

    if (!google || !googleAuth) {
      toast.error('Failed to load Google Picker');
      return;
    }

    // Get OAuth token from your auth system
    // In production, you'd retrieve this from your backend
    const oauthToken = 'YOUR_OAUTH_TOKEN'; // This should come from your backend

    const picker = new googleAuth.picker.PickerBuilder()
      .addView(googleAuth.picker.ViewId.DOCS)
      .setOAuthToken(oauthToken)
      .setDeveloperKey('YOUR_DEVELOPER_KEY') // Add this to config
      .setCallback((data: any) => {
        if (data.action === googleAuth.picker.Action.PICKED) {
          const file = data.docs[0];
          if (onFileSelected) {
            onFileSelected(file.id, file.name);
          }
          toast.success(`Selected: ${file.name}`);
        }
      })
      .build();

    picker.setVisible(true);
  };

  return (
    <div className="google-drive-picker">
      <button
        onClick={openPicker}
        className="google-drive-btn"
        disabled={loading}
      >
        <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {loading ? 'Connecting...' : isConnected ? 'Select from Google Drive' : 'Connect Google Drive'}
      </button>
      {isConnected && (
        <p className="connection-status">✓ Google Drive connected</p>
      )}
    </div>
  );
}

export default GoogleDrivePicker;
