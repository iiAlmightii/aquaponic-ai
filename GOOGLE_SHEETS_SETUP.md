# Google Sheets Sync Setup Guide

This guide walks you through enabling financial planning data sync with Google Sheets in AquaponicAI.

## Overview

The Google Sheets integration allows you to:
- **Push** financial planning inputs from the app to a Google Sheet
- **Pull** calculations and edits from the Google Sheet back into the app
- Maintain a centralised financial audit log
- Share financial projections with stakeholders in real-time

The feature uses **Google Cloud service accounts** for secure, headless access to your spreadsheet (no login required from users).

---

## Prerequisites

- A **Google Cloud Project** (free tier works fine)
- A **Google Sheet** (will be created or reused)
- Access to your **Google Cloud console**
- AquaponicAI backend running locally or in Docker

---

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the **Project** dropdown at the top
3. Click **NEW PROJECT**
4. Enter a project name (e.g., "AquaponicAI Finance")
5. Click **CREATE**
6. Wait for the project to be created, then select it from the dropdown

---

## Step 2: Enable Google Sheets API

1. In the Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for **"Google Sheets API"**
3. Click on it and press **ENABLE**
4. Wait for the API to be enabled (you'll see "API enabled" message)

---

## Step 3: Create a Service Account

1. In Google Cloud Console, go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **Service Account**
3. Fill in:
   - **Service account name**: `aquaponic-ai` (or any name)
   - **Service account ID**: auto-filled
   - **Description**: `AquaponicAI Finance Sync` (optional)
4. Click **CREATE AND CONTINUE**
5. On "Grant this service account access to project" (optional):
   - Skip by clicking **CONTINUE**
6. On "Grant users access to this service account" (optional):
   - Skip by clicking **DONE**

---

## Step 4: Create and Download the Service Account Key

1. You're now back on **Credentials** page
2. Under **Service Accounts**, click on the service account you just created
3. Go to the **KEYS** tab
4. Click **ADD KEY** → **Create new key**
5. Choose **JSON** format
6. Click **CREATE**
7. A JSON file will auto-download (e.g., `aquaponic-ai-xxxxx.json`)
   - **Save this file safely** — it contains credentials
   - **Never commit it to git**
8. Click **Close**

---

## Step 5: Copy Service Account Email

The service account email is needed to share the Google Sheet.

1. On the **Service Accounts** page, click your service account
2. On the **DETAILS** tab, you'll see **Email** (looks like: `aquaponic-ai@PROJECT_ID.iam.gserviceaccount.com`)
3. **Copy this email** — you'll need it in Step 7

---

## Step 6: Create or Prepare Your Google Sheet

You can either:

### Option A: Use an Existing Sheet
If you have a Google Sheet, just note its **Spreadsheet ID**:
- Open the sheet in your browser
- The URL looks like: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0`
- Copy the `SPREADSHEET_ID` part

### Option B: Create a New Sheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Click **+ Blank spreadsheet**
3. Right-click **Sheet1** tab → **Rename** → name it `Inputs`
4. Copy the Spreadsheet ID from the URL
5. Right-click the **Inputs** tab and select **Insert sheet below** to add more tabs (see below)

### Required Tabs
Your Google Sheet **must have these tabs** (create them if they don't exist):
- **Inputs** — financial input parameters
- **Assumptions** — discount rate and other assumptions
- **AuditLog** — record of all syncs and changes
- **Summary** — aggregated financial metrics
- **Projections** — month-by-month cash flow projections

To add tabs:
1. Right-click a sheet tab
2. Select **Insert sheet below** (or above)
3. Enter the exact tab name
4. Click **CREATE**

---

## Step 7: Share the Sheet with the Service Account

1. Open your Google Sheet
2. Click **Share** (top-right)
3. In the "Add people and groups" field, paste the service account email from Step 5
4. Give **Editor** permissions (needed to write data)
5. Uncheck "Notify people"
6. Click **Share**

---

## Step 8: Configure Environment Variables

Open your `.env` file in the project root. Add or update the following variables:

### Option A: Using Full Service Account JSON (Recommended)

1. Open the JSON key file you downloaded in Step 4 with a text editor
2. Copy the entire JSON content
3. In your `.env` file, add:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=YOUR_SPREADSHEET_ID
GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'
```

Replace `YOUR_SPREADSHEET_ID` with the ID from Step 6.

**Important**: The JSON must be a single-line string enclosed in single quotes (with double quotes inside).

### Option B: Split Environment Variables

1. Open the JSON key file from Step 4
2. Extract these fields:
   - `private_key` (looks like `-----BEGIN PRIVATE KEY-----\n...`)
   - `project_id`
   - `private_key_id`
   - `client_email`
   - `client_id`

3. In your `.env` file, add:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=YOUR_SPREADSHEET_ID
GOOGLE_SHEETS_CLIENT_EMAIL=aquaponic-ai@YOUR_PROJECT.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nXXXXXX\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_PROJECT_ID=YOUR_PROJECT_ID
GOOGLE_SHEETS_PRIVATE_KEY_ID=YOUR_KEY_ID
GOOGLE_SHEETS_CLIENT_ID=YOUR_CLIENT_ID
```

**Important**: The `GOOGLE_SHEETS_PRIVATE_KEY` must have literal `\n` characters (not actual newlines).

---

## Step 9: Enable Frontend UI (Optional)

To show the "Sync to Google Sheets" button in the frontend:

In your `.env` file, ensure:

```env
VITE_GOOGLE_SHEETS_ENABLED=true
```

---

## Step 10: Test the Setup

### If Running with Docker

1. Restart the backend service:
   ```bash
   docker compose down
   docker compose up -d --build
   ```

2. Check logs for errors:
   ```bash
   docker compose logs -f backend
   ```

3. Look for messages about Google Sheets initialization

### If Running Locally

1. Save the `.env` file
2. Restart your backend server
3. Check console for any error messages

---

## Step 11: Test the Sync Feature

1. Open the AquaponicAI app (`http://localhost:3001` or `http://localhost`)
2. Go to the Financial Planning section
3. Link a session to a farm if needed
4. Click the **"Sync to Google Sheets"** button (Sync to Google Sheets icon)
5. Check your Google Sheet — you should see data appearing in the **Inputs** tab

### Expected Behavior

**First sync:**
- New rows appear in the **Inputs**, **Assumptions**, **Summary**, and **Projections** tabs
- An audit log entry appears in the **AuditLog** tab

**Subsequent syncs:**
- Data rows are updated with new values
- **state_version** increments by 1
- **updated_at** timestamp updates

---

## Troubleshooting

### Error: "Google Sheets service account credentials are missing"

**Cause**: Environment variables not set or keys are invalid

**Fix**:
1. Double-check your `.env` file has all required variables
2. Verify JSON is properly formatted (Option A) or split fields are correct (Option B)
3. Ensure no trailing spaces or newlines in env values
4. Restart the backend service
5. Check logs: `docker compose logs backend`

### Error: "GOOGLE_SHEETS_SPREADSHEET_ID is required"

**Cause**: Missing or empty spreadsheet ID

**Fix**:
1. Double-check your spreadsheet ID in `.env`
2. Verify it's the correct ID from your Google Sheet URL
3. Don't include `gid` parameter

### Error: "Permission denied" or "404 Not Found"

**Cause**: 
- Sheet not shared with service account email
- Wrong spreadsheet ID
- Missing required tabs

**Fix**:
1. Verify sheet is shared with the service account email (Step 7)
2. Verify spreadsheet ID is correct
3. Ensure all 5 required tabs exist: Inputs, Assumptions, AuditLog, Summary, Projections
4. Check Google Sheet hasn't been deleted or moved

### Error: "Invalid JSON" in GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON

**Cause**: JSON not properly formatted as a string in `.env`

**Fix**:
1. Use single quotes around the entire JSON: `'{"type":"service_account",...}'`
2. Ensure all quotes inside JSON are double quotes
3. Don't use newlines — keep it on one line
4. Copy the raw JSON from the key file, don't modify it

### Sync button shows "not configured" or disabled

**Cause**: 
- Environment variables not loaded
- `VITE_GOOGLE_SHEETS_ENABLED` is not `true`

**Fix**:
1. Verify `VITE_GOOGLE_SHEETS_ENABLED=true` in `.env`
2. Check sync-status endpoint: `GET /api/v1/finance/sync-status?session_id=YOUR_SESSION_ID`
3. Response should show `"enabled": true` if configured correctly

### Data appears in wrong columns or bad format

**Cause**: Spreadsheet structure changed or tabs got reordered

**Fix**:
1. Verify tab names are exact (case-sensitive): `Inputs`, `Assumptions`, `AuditLog`, `Summary`, `Projections`
2. Check that columns haven't been inserted/deleted
3. If tabs were reorganized, delete them and let the sync feature recreate them
4. Re-sync

---

## Disabling Google Sheets Sync

To temporarily disable the sync feature:

**In `.env`**:
```env
VITE_GOOGLE_SHEETS_ENABLED=false
```

Or remove the environment variable and restart the backend.

---

## Security Best Practices

1. **Never commit** the `.env` file or JSON key file to git
2. **Store the JSON key securely** (not in shared drives, not in repos)
3. **Rotate keys** periodically:
   - Go to Google Cloud Console → Service Accounts → Keys
   - Delete old keys, create new ones
   - Update `.env` with new credentials
4. **Restrict Sheet permissions** — only share with users who need it
5. **Use env vars for secrets** — never hardcode credentials in source code
6. **In production**, use a secrets manager (Google Secret Manager, AWS Secrets Manager, etc.)

---

## Next Steps

Once everything is working:

1. **Set up more farms** — each farm can have its own spreadsheet or share one
2. **Share sheets with stakeholders** — financial advisors, investors, partners
3. **Automate reporting** — add formulas and charts in the Google Sheet
4. **Monitor audit logs** — review who changed what and when

---

## Additional Resources

- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Google Cloud Service Accounts](https://cloud.google.com/iam/docs/service-accounts)
- [Google Sheets Best Practices](https://support.google.com/docs/answer/183965)

---

## Support

If you encounter issues not covered above:

1. Check the backend logs: `docker compose logs -f backend`
2. Verify all 5 tabs exist in your Google Sheet
3. Re-run the share permissions (Step 7)
4. Try recreating the service account key (Step 4)
5. Restart all services: `docker compose restart`

For bug reports or feature requests, open an issue in the repository.

---

**Happy syncing!** 🎉
