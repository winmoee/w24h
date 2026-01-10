# Vercel Blob Upload Setup Guide

This guide explains how to configure the screenshot app to upload images to Vercel Blob Storage via the Python backend.

## Prerequisites

1. **Vercel Account**: You need a Vercel account with a project set up
2. **Python Backend**: Your Python FastAPI backend should be running (port 8000)
3. **Vercel Blob**: Enable Vercel Blob Storage in your Vercel project and get your token

## Setup Steps

### 1. Configure Vercel Blob Token

#### a. Add BLOB_READ_WRITE_TOKEN to .env

The `.env` file should be in `/Users/frankwin/Desktop/w24h/my-c1-app/.env`

Add your token:
```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_your_token_here
```

**To get your token:**
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Look for `BLOB_READ_WRITE_TOKEN` or create it
4. Copy the token value to your local `.env` file

### 2. Python Backend Endpoint

The upload endpoint is created at:
- **File**: `/my-c1-project/backend/main.py`
- **Endpoint**: `POST /api/screenshot-upload`
- **URL**: `http://localhost:8000/api/screenshot-upload`

### 3. Install Python Dependencies

Make sure `httpx` and `python-dotenv` are installed:

```bash
cd /Users/frankwin/Desktop/w24h/my-c1-app
source myenv/bin/activate
cd my-c1-project/backend
pip install httpx python-dotenv
```

Or if using requirements.txt:
```bash
pip install -r requirements.txt
```

### 4. Start Python Backend

```bash
cd /Users/frankwin/Desktop/w24h/my-c1-app/my-c1-project/backend
source ../../myenv/bin/activate  # Activate virtual environment
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend should be running on `http://localhost:8000`

### 5. Configure Electron App

The Electron app is already configured to use `http://localhost:8000/api/screenshot-upload` by default.

To change it, set the environment variable:

**macOS/Linux:**
```bash
export VERCEL_BLOB_UPLOAD_URL="http://localhost:8000/api/screenshot-upload"
cd screenshot-app-electron-master
npm start
```

**Or edit `src/main.js` directly:**
```javascript
const VERCEL_BLOB_UPLOAD_URL = 'http://localhost:8000/api/screenshot-upload';
```

### 6. Test the Upload

1. Make sure Python backend is running on port 8000
2. Start the Electron app
3. Take a screenshot (manual: `Cmd+Y` / `Ctrl+Y` or wait 1 minute for automatic)
4. Check the console logs - you should see:
   - `[RENDERER] Step 7: Starting upload to backend...`
   - `[RENDERER] ✓ Screenshot uploaded successfully`
   - `[RENDERER] Blob URL: https://...`

5. Check your Python backend logs for:
   - `[SERVER] Loaded .env from: ...`
   - `[SERVER] Uploading to Vercel Blob: screenshots/...`
   - `[SERVER] ✓ Screenshot uploaded successfully to Vercel Blob`

## Security Notes

⚠️ **Important**: The current setup allows all uploads. For production, you should:

1. **Add Authentication**: Modify `onBeforeGenerateToken` in `/api/screenshot-upload/route.ts` to verify:
   - API keys
   - JWT tokens
   - Session cookies
   - User permissions

2. **Rate Limiting**: Implement rate limiting to prevent abuse

3. **File Size Limits**: Add file size restrictions in `onBeforeGenerateToken`

## Troubleshooting

### "Failed to import @vercel/blob/client"
- Make sure `@vercel/blob` is installed: `npm install @vercel/blob`
- Check that you're using version `^2.0.0` or higher

### "Upload URL not configured"
- Set the `VERCEL_BLOB_UPLOAD_URL` environment variable
- Or edit `main.js` directly to set the URL

### "Invalid upload path" error
- The pathname must start with `screenshots/`
- This is enforced in the API route for security

### Upload succeeds but file doesn't appear
- Check Vercel Blob dashboard
- Verify `BLOB_READ_WRITE_TOKEN` is set correctly
- Check server logs for errors in `onUploadCompleted`

## Disable Uploads

To disable Vercel uploads (only save locally):
- Set `VERCEL_BLOB_UPLOAD_URL=null` or don't set it
- Or comment out the upload code in `capture.js`

## Next Steps

1. **Store blob URLs in database**: Implement the TODO in `onUploadCompleted` callback
2. **Add user authentication**: Link uploads to specific users
3. **Create a gallery view**: Build a UI to view uploaded screenshots
4. **Add metadata**: Store additional info like device, timestamp, etc.

