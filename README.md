# Kaltura Moderation Demo

A single-page web application for demoing Kaltura's media moderation feature via the Reach / EntryVendorTask API.

## Features

### Tab 1 — Policies *(coming soon)*
Full CRUD for moderation reach profiles and rules.

### Tab 2 — Entry Vendor Tasks
- Lists all entry vendor tasks (default filter: Moderation feature)
- Filter by service feature, status, or entry ID
- Pagination with 30 tasks per page
- **Review** button on completed (Ready) tasks to open the review tab

### Tab 3 — Review
- Split view: moderation results on the left, Kaltura player on the right
- Parses moderation report JSON (supports AWS Rekognition, Google Video Intelligence, and generic schemas)
- Shows detected labels, confidence scores with visual bars, and flagged time segments
- Collapsible raw JSON viewer for the full report

## Usage

1. Open `index.html` in a browser (or serve via `python3 -m http.server 8080`).
2. Enter your **Kaltura Session (KS)** in the header and click **Connect**.
3. Optionally enter a **Player uiconf ID** to enable the embedded video player.
4. Navigate to **Entry Vendor Tasks** to see moderation jobs.
5. Click **Review** on any job with status **Ready** to view the results.

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| KS | — | Kaltura Session token (required) |
| Service URL | `https://www.kaltura.com` | API base URL (change for on-prem deployments) |
| Player uiconf ID | — | Player configuration ID for the embedded player |

Session state is persisted in `sessionStorage` so the page can be refreshed without re-entering credentials.

## File Structure

```
index.html          Main page
css/styles.css      Styles
js/api.js           Kaltura API wrapper (fetch-based, no dependencies)
js/app.js           Global state, KS connect flow, tab management
js/tab-policies.js  Tab 1 placeholder
js/tab-tasks.js     Tab 2 — entry vendor task list
js/tab-review.js    Tab 3 — moderation results + player
```

## Kaltura APIs Used

- `session.get` — validate KS and detect partner ID
- `entryVendorTask.list` — list tasks with optional feature/status/entry filters
- `entryVendorTask.get` — fetch full task details and output asset reference
- `attachment_attachmentasset.getUrl` — download moderation report JSON
- `attachment_attachmentasset.list` — fallback attachment discovery
