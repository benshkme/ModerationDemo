/* =============================================
   Tab 2 — Entry Vendor Tasks — tab-tasks.js
   ============================================= */

const TasksTab = (() => {

  let currentPage  = 1;
  let totalCount   = 0;
  let lastFilter   = {};
  const PAGE_SIZE  = 30;

  // ---- Render shell (called once on first activation) ---------------

  function renderShell() {
    const panel = document.getElementById('tab-tasks');
    if (panel.querySelector('.card')) return; // already rendered

    panel.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Entry Vendor Tasks</h2>
          <div class="toolbar">
            <select id="tasks-feature-filter" title="Filter by service feature">
              <option value="">All Features</option>
              <option value="15" selected>Moderation (15)</option>
              <option value="1">Captions (1)</option>
              <option value="2">Translation (2)</option>
              <option value="3">Alignment (3)</option>
              <option value="7">Dubbing (7)</option>
              <option value="8">Live Caption (8)</option>
              <option value="14">Video Analysis (14)</option>
              <option value="17">Sentiment Analysis (17)</option>
              <option value="19">Sign Language (19)</option>
            </select>
            <select id="tasks-status-filter" title="Filter by status">
              <option value="">All Statuses</option>
              <option value="2">Ready</option>
              <option value="3">Processing</option>
              <option value="1">Pending</option>
              <option value="4">Pending Moderation</option>
              <option value="5">Rejected</option>
              <option value="6">Error</option>
              <option value="7">Aborted</option>
              <option value="8">Pending Entry Ready</option>
              <option value="9">Scheduled</option>
            </select>
            <select id="tasks-window-filter" title="Created in last…">
              <option value="">All time</option>
              <option value="3600">Last hour</option>
              <option value="86400" selected>Last 24 hours</option>
              <option value="604800">Last 7 days</option>
              <option value="2592000">Last 30 days</option>
              <option value="31536000">Last year</option>
            </select>
            <input id="tasks-entry-filter" type="text" placeholder="Entry ID…" style="width:140px">
            <button class="btn btn-secondary btn-sm" id="tasks-refresh-btn">&#8635; Refresh</button>
          </div>
        </div>

        <div id="tasks-alert-area"></div>

        <div class="table-wrap" style="max-height:calc(100vh - 320px);overflow-y:auto">
          <table id="tasks-table">
            <thead style="position:sticky;top:0;z-index:1">
              <tr>
                <th>Task ID</th>
                <th>Entry ID</th>
                <th>Status</th>
                <th>Service Feature</th>
                <th>Vendor Partner</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="tasks-tbody">
              <tr class="loading-row"><td colspan="8">
                <span class="spinner"></span> Loading…
              </td></tr>
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <span id="tasks-count-label">—</span>
          <div class="paging-btns">
            <button class="btn btn-secondary btn-sm" id="tasks-prev-btn" disabled>&#8592; Prev</button>
            <span id="tasks-page-label" style="padding:0 8px;line-height:28px;font-size:13px;color:var(--text-muted)">Page 1</span>
            <button class="btn btn-secondary btn-sm" id="tasks-next-btn" disabled>Next &#8594;</button>
          </div>
        </div>
      </div>
    `;

    // Wire controls
    document.getElementById('tasks-refresh-btn').addEventListener('click', () => loadTasks(1));
    document.getElementById('tasks-prev-btn').addEventListener('click', () => loadTasks(currentPage - 1));
    document.getElementById('tasks-next-btn').addEventListener('click', () => loadTasks(currentPage + 1));
    document.getElementById('tasks-feature-filter').addEventListener('change', () => loadTasks(1));
    document.getElementById('tasks-status-filter').addEventListener('change', () => loadTasks(1));
    document.getElementById('tasks-window-filter').addEventListener('change', () => loadTasks(1));
    document.getElementById('tasks-entry-filter').addEventListener('keydown', e => {
      if (e.key === 'Enter') loadTasks(1);
    });
  }

  // ---- Load tasks ---------------------------------------------------

  async function loadTasks(page = 1) {
    if (!AppState.connected) {
      showAlert('Connect with a valid KS first.', 'info');
      return;
    }

    currentPage = page;
    const tbody = document.getElementById('tasks-tbody');
    tbody.innerHTML = `<tr class="loading-row"><td colspan="8"><span class="spinner"></span> Loading…</td></tr>`;

    clearAlert();

    const serviceFeature = document.getElementById('tasks-feature-filter').value;
    const status         = document.getElementById('tasks-status-filter').value;
    const windowSecs     = document.getElementById('tasks-window-filter').value;
    const entryId        = document.getElementById('tasks-entry-filter').value.trim();

    const createdAfter = windowSecs
      ? Math.floor(Date.now() / 1000) - parseInt(windowSecs, 10)
      : null;

    lastFilter = { serviceFeature, status, createdAfter };

    try {
      const filter = { serviceFeature, status, createdAfter, pageIndex: page, pageSize: PAGE_SIZE };

      // Inject entryId filter if provided
      const params = buildParams(filter, entryId);
      const result = await KalturaAPI.taskList(params);

      totalCount = result.totalCount || 0;

      updatePagination();
      renderRows(result.objects || []);

    } catch (err) {
      tbody.innerHTML = `<tr class="loading-row"><td colspan="8" style="color:var(--red)">
        Error: ${escapeHtml(err.message)}
      </td></tr>`;
      showAlert(err.message, 'error');
      console.error('[TasksTab] Load error:', err);
    }
  }

  function buildParams(filter, entryId) {
    const p = { ...filter };
    if (entryId) p.entryId = entryId;
    return p;
  }

  // ---- Render rows --------------------------------------------------

  function renderRows(tasks) {
    const tbody = document.getElementById('tasks-tbody');

    if (!tasks.length) {
      tbody.innerHTML = `<tr><td colspan="8">
        <div class="empty-state">
          <div class="icon">🔍</div>
          <strong>No tasks found</strong>
          <p>Try adjusting the filters above.</p>
        </div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = tasks.map(task => {
      const si      = KalturaAPI.taskStatusInfo(task.status);
      const feature = KalturaAPI.serviceFeatureLabel(task.serviceFeature);
      const isReady = task.status === 2;

      return `<tr>
        <td><code style="font-size:11px">${escapeHtml(task.id)}</code></td>
        <td>
          <a href="${escapeHtml(buildEntryUrl(task.entryId))}" target="_blank"
             style="color:var(--kaltura-orange);text-decoration:none;font-family:monospace;font-size:12px"
             title="Open entry">
            ${escapeHtml(task.entryId)}
          </a>
        </td>
        <td><span class="pill pill-${si.cls}">${escapeHtml(si.label)}</span></td>
        <td>${escapeHtml(feature)}</td>
        <td>${escapeHtml(task.vendorPartnerId || '—')}</td>
        <td style="white-space:nowrap">${formatDate(task.createdAt)}</td>
        <td style="white-space:nowrap">${formatDate(task.updatedAt)}</td>
        <td>
          ${isReady
            ? `<button class="btn btn-sm btn-review"
                 onclick="openReview(${JSON.stringify(String(task.id))}, ${JSON.stringify(String(task.entryId))})">
                 Review
               </button>`
            : '<span style="color:var(--text-muted);font-size:12px">—</span>'
          }
        </td>
      </tr>`;
    }).join('');
  }

  // ---- Pagination ---------------------------------------------------

  function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const start      = (currentPage - 1) * PAGE_SIZE + 1;
    const end        = Math.min(currentPage * PAGE_SIZE, totalCount);

    document.getElementById('tasks-count-label').textContent =
      totalCount ? `Showing ${start}–${end} of ${totalCount}` : 'No results';

    document.getElementById('tasks-page-label').textContent = `Page ${currentPage} / ${totalPages}`;
    document.getElementById('tasks-prev-btn').disabled = currentPage <= 1;
    document.getElementById('tasks-next-btn').disabled = currentPage >= totalPages;
  }

  // ---- Alert helpers -----------------------------------------------

  function showAlert(msg, type = 'error') {
    const area = document.getElementById('tasks-alert-area');
    if (!area) return;
    area.innerHTML = `<div class="alert alert-${type}" style="margin:12px 20px 0">
      ${escapeHtml(msg)}
    </div>`;
  }

  function clearAlert() {
    const area = document.getElementById('tasks-alert-area');
    if (area) area.innerHTML = '';
  }

  // ---- Helper: build KMC entry URL ---------------------------------

  function buildEntryUrl(entryId) {
    // Generic deep-link; adjust base domain if custom deployment
    return `https://kmc.kaltura.com/index.php/kmcng/content/entries/entry/${entryId}/metadata`;
  }

  // ---- Tab lifecycle -----------------------------------------------

  function onActivate() {
    renderShell();
    // Only auto-load if we haven't loaded yet or just connected
    if (!document.getElementById('tasks-tbody')?.querySelector('.loading-row') === false) return;
    loadTasks(1);
  }

  return { onActivate, loadTasks };
})();
