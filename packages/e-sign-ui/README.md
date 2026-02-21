# E-Signature Platform Frontend

React TypeScript frontend for PROPMETRIK E-Signature Platform with Keycloak SSO and Google Drive integration.

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Running Keycloak instance
- Backend API running on port 8000

## Installation

```bash
cd frontend
npm install
```

## Environment Variables

Create a `.env.local` file:

```env
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=propmetrik
VITE_KEYCLOAK_CLIENT_ID=propmetrik-esign
VITE_API_BASE_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

## Development

```bash
npm run dev
```

Access at http://localhost:3000

## Production Build

```bash
npm run build
npm run preview
```

## Docker Build

```bash
docker build -t propmetrik-esign-frontend \
  --build-arg VITE_KEYCLOAK_URL=http://localhost:8080 \
  --build-arg VITE_KEYCLOAK_REALM=propmetrik \
  --build-arg VITE_KEYCLOAK_CLIENT_ID=propmetrik-esign \
  --build-arg VITE_API_BASE_URL=http://localhost:8000 \
  --build-arg VITE_GOOGLE_CLIENT_ID=your-google-client-id \
  .

docker run -p 3000:80 propmetrik-esign-frontend
```

## Features

- **Keycloak SSO**: Secure authentication with JWT tokens
- **Google Drive Integration**: Connect and select documents from Google Drive
- **Digital Signatures**: Sign documents with signature canvas
- **Dashboard**: View user info, status, and system health
- **Responsive Design**: Mobile-friendly interface
- **Dark Mode Support**: Automatic dark/light theme

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── GoogleDrivePicker.tsx    # Google Drive file picker
│   │   └── GoogleDrivePicker.css
│   ├── pages/
│   │   ├── Dashboard.tsx            # Main dashboard
│   │   ├── Dashboard.css
│   │   ├── SignaturePage.tsx        # Document signing
│   │   └── SignaturePage.css
│   ├── api.ts                       # API client with axios
│   ├── keycloak.ts                  # Keycloak instance
│   ├── config.ts                    # Environment configuration
│   ├── App.tsx                      # Main app component
│   ├── main.tsx                     # Entry point
│   └── index.css                    # Global styles
├── index.html
├── vite.config.ts
├── tsconfig.json
├── Dockerfile
├── nginx.conf
└── package.json
```

## API Integration

The frontend communicates with the backend API at `http://localhost:8000`:

- `GET /health` - System health check
- `GET /auth/test-keycloak` - Test Keycloak connection
- `GET /auth/me` - Get current user info
- `POST /google/connect` - Connect Google Drive
- `GET /documents` - List user documents
- `POST /signature-requests` - Create signature request
- `POST /signatures/{request_id}` - Submit signature

## Authentication Flow

1. User navigates to application
2. Keycloak redirects to login page
3. User authenticates with Keycloak
4. JWT token stored in Keycloak instance
5. API requests include JWT in Authorization header
6. Token automatically refreshed every 60 seconds

## Troubleshooting

### Keycloak Connection Issues
- Verify `VITE_KEYCLOAK_URL` matches your Keycloak instance
- Check Keycloak client ID matches `propmetrik-esign`
- Ensure Valid Redirect URIs includes `http://localhost:3000/*`

### API Connection Issues
- Verify backend is running on port 8000
- Check CORS settings in backend allow `http://localhost:3000`
- Review browser console for error messages

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check Node.js version: `node --version` (should be 18+)

## Google OAuth Setup

1. Create OAuth 2.0 credentials in Google Cloud Console
2. Add authorized redirect URI: `http://localhost:3000/oauth2callback`
3. Add `VITE_GOOGLE_CLIENT_ID` to `.env.local`
4. Configure backend with Google client secret

## Deployment

See `docker-compose.yml` in root directory for full deployment configuration with backend and database.

## License

Proprietary - PROPMETRIK
