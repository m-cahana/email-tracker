# Email Open Tracker

Self-hosted Gmail email open tracker. Two components: a Node.js pixel server and a Chrome extension that injects tracking pixels into Gmail compose windows.

## Server

### Local Development

```bash
cd server
npm install
DASHBOARD_PASSWORD=yourpassword node index.js
```

Visit `http://localhost:3000` to see the dashboard.

### Deploy to Fly.io

```bash
cd server
fly launch
fly volumes create tracker_data --region ord --size 1
fly secrets set DASHBOARD_PASSWORD=yourpassword DB_PATH=/data/tracker.db
fly deploy
```

### API

- `GET /t/:emailId` — Tracking pixel endpoint (returns 1x1 GIF)
- `POST /register` — Register a tracked email (requires `x-dashboard-password` header)
- `GET /api/emails` — Get all emails and stats (requires `x-dashboard-password` header)
- `GET /` — Dashboard UI

## Chrome Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension/` directory
4. Click the extension icon and configure:
   - **Server URL**: Your deployed server URL (e.g., `https://your-app.fly.dev`)
   - **Password**: Your dashboard password
   - **Enable tracking**: Toggle on

## How It Works

1. When you send an email in Gmail, the extension injects a 1x1 invisible tracking pixel
2. When the recipient opens the email, their email client loads the pixel image
3. The server logs the open with timestamp, IP, and user agent
4. View all opens on the dashboard

## Known Limitations

- **Gmail Image Proxy**: Gmail proxies images, so IP addresses will be Google's servers. The first open is still accurately detected.
- **Image blocking**: Some email clients block images by default — these opens won't be tracked.
- **DOM selectors**: Gmail's DOM structure may change, which could break the compose window detection.
