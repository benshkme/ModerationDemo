/* =============================================
   Tab 2 — Entry Vendor Tasks — tab-tasks.js
   ============================================= */

const TasksTab = (() => {

  let currentPage          = 1;
  let totalCount           = 0;
  let lastFilter           = {};
  let moderationCatalogIds   = null; // Set of catalog item IDs for serviceFeature=15
  let moderationCatalogItems = null; // Full catalog item objects (for order modal)
  const PAGE_SIZE          = 30;
  const MODERATION_FEATURE = 15;

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
            <button class="btn btn-primary btn-sm" id="tasks-order-btn">+ Order Job</button>
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
                <th>Created</th>
                <th>Moderation Result</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="tasks-tbody">
              <tr class="loading-row"><td colspan="7">
                <span class="spinner"></span> Loading…
              </td></tr>
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <span id="tasks-count-label">—</span>
          <div class="paging-btns">
            <button class="btn btn-outline btn-sm" id="tasks-prev-btn" disabled>&#8592; Prev</button>
            <span id="tasks-page-label" style="padding:0 8px;line-height:28px;font-size:13px;color:var(--text-muted)">Page 1</span>
            <button class="btn btn-outline btn-sm" id="tasks-next-btn" disabled>Next &#8594;</button>
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
    document.getElementById('tasks-order-btn').addEventListener('click', openOrderModal);
    // Delegated click handler for Review buttons (avoids inline onclick escaping issues)
    document.getElementById('tasks-tbody').addEventListener('click', e => {
      const btn = e.target.closest('.review-btn');
      if (btn) openReview(btn.dataset.taskId, btn.dataset.entryId);
    });
  }

  // ---- Fetch moderation catalog IDs (once) -------------------------

  async function ensureModerationCatalogIds() {
    if (moderationCatalogIds !== null) return;
    try {
      const result = await KalturaAPI.catalogItemList(MODERATION_FEATURE);
      const items = result?.objects || [];
      moderationCatalogIds   = new Set(items.map(i => String(i.id)));
      moderationCatalogItems = items;
    } catch {
      moderationCatalogIds   = new Set();
      moderationCatalogItems = [];
    }
  }

  // ---- Load tasks ---------------------------------------------------

  async function loadTasks(page = 1) {
    if (!AppState.connected) {
      showAlert('Connect with a valid KS first.', 'info');
      return;
    }

    currentPage = page;
    const tbody = document.getElementById('tasks-tbody');
    tbody.innerHTML = `<tr class="loading-row"><td colspan="7"><span class="spinner"></span> Loading…</td></tr>`;

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
      // serviceFeature is not a direct filter on entryVendorTask —
      // resolve it to catalog item IDs first, then filter by those IDs.
      let catalogItemIds = null;
      if (serviceFeature) {
        const catalogResult = await KalturaAPI.catalogItemList(serviceFeature);
        const items = catalogResult?.objects || [];
        if (!items.length) {
          renderRows([]);
          totalCount = 0;
          updatePagination();
          return;
        }
        catalogItemIds = items.map(i => i.id);
        // Populate moderationCatalogIds from this fetch when it's the moderation feature
        if (String(serviceFeature) === String(MODERATION_FEATURE) && moderationCatalogIds === null) {
          moderationCatalogIds = new Set(catalogItemIds.map(String));
        }
      }

      // Ensure we know which catalog items are moderation (for the Review button)
      await ensureModerationCatalogIds();

      const filter = { catalogItemIds, status, createdAfter, pageIndex: page, pageSize: PAGE_SIZE };
      const params = buildParams(filter, entryId);
      const result = await KalturaAPI.taskList(params);

      totalCount = result.totalCount || 0;

      updatePagination();
      renderRows(result.objects || []);

    } catch (err) {
      tbody.innerHTML = `<tr class="loading-row"><td colspan="7" style="color:var(--red)">
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
      tbody.innerHTML = `<tr><td colspan="7">
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
      const isModeration = moderationCatalogIds?.has(String(task.catalogItemId)) ?? false;
      const isReady      = task.status === 2 && isModeration;

      const complianceHtml = isModeration
        ? renderCompliance(task)
        : '<span style="color:var(--text-muted);font-size:12px">—</span>';

      return `<tr>
        <td><code style="font-size:11px">${escapeHtml(task.id)}</code></td>
        <td>
          <a href="${escapeHtml(buildEntryUrl(task.entryId))}" target="_blank"
             style="color:var(--kaltura-orange);text-decoration:none;font-family:monospace;font-size:12px"
             title="Open entry">
            ${escapeHtml(task.entryId)}
          </a>
        </td>
        <td>${renderStatusPill(si, task)}</td>
        <td>${escapeHtml(feature)}</td>
        <td style="white-space:nowrap">${formatDate(task.createdAt)}</td>
        <td data-compliance-id="${escapeHtml(task.id)}">${complianceHtml}</td>
        <td>
          ${isReady
            ? `<button class="btn btn-sm btn-review review-btn"
                 data-task-id="${escapeHtml(task.id)}"
                 data-entry-id="${escapeHtml(task.entryId)}">
                 Review
               </button>`
            : '<span style="color:var(--text-muted);font-size:12px">—</span>'
          }
        </td>
      </tr>`;
    }).join('');

  }

  // ---- Status pill (with hover tooltip for error statuses) ---------

  function renderStatusPill(si, task) {
    const isError = si.cls === 'error';
    const errText = isError && task.errDescription ? task.errDescription : null;
    const titleAttr = errText ? ` title="${escapeHtml(errText)}"` : '';
    const styleAttr = errText ? ' style="cursor:help;text-decoration:underline dotted"' : '';
    return `<span class="pill pill-${si.cls}"${titleAttr}${styleAttr}>${escapeHtml(si.label)}</span>`;
  }

  // ---- Moderation compliance cell ----------------------------------
  // summary format: { "policyId": { score: number, comply: boolean }, ... }

  function renderCompliance(task) {
    const raw = task.taskJobData?.moderationOutputJson;
    if (!raw) return '<span style="color:var(--text-muted);font-size:12px">—</span>';
    try {
      const report  = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const summary = report?.summary;
      if (!summary || typeof summary !== 'object') return '<span style="color:var(--text-muted);font-size:12px">—</span>';

      const entries = Object.entries(summary); // [['policyId', {score, comply}], ...]
      if (!entries.length) return '<span style="color:var(--text-muted);font-size:12px">—</span>';

      if (entries.length === 1) {
        const [policyId, result] = entries[0];
        return compliancePill(result.comply, result.score, policyId);
      }

      // Multiple policies — overall = Non-Compliant if any fails
      const overallComply = entries.every(([, v]) => v.comply === true);
      const rows = entries.map(([policyId, result]) =>
        `<div style="padding:3px 0;display:flex;align-items:center;gap:6px;white-space:nowrap">
           <span style="font-size:11px;color:var(--text-muted)">Policy ${escapeHtml(policyId)}:</span>
           ${compliancePill(result.comply, result.score)}
         </div>`
      ).join('');

      return `<details class="compliance-expand">
        <summary>${compliancePill(overallComply)}
          <span style="font-size:11px;color:var(--text-muted);margin-left:4px">${entries.length} policies</span>
        </summary>
        <div style="padding:4px 0 2px">${rows}</div>
      </details>`;
    } catch {
      return '<span style="color:var(--text-muted);font-size:12px">—</span>';
    }
  }

  function compliancePill(comply, score, policyId) {
    const label    = comply ? 'Compliant' : 'Non-Compliant';
    const cls      = comply ? 'pill-ready' : 'pill-error';
    const scoreStr = score != null ? ` · ${Math.round(score)}%` : '';
    return `<span class="pill ${cls}" style="font-size:11px">${label}${scoreStr}</span>`;
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

  // ---- Order Job Modal --------------------------------------------

  async function openOrderModal() {
    if (!AppState.connected) {
      showAlert('Connect with a valid KS first.', 'info');
      return;
    }

    // Always fetch fresh — avoids stale cache from loadTasks partial initialisation
    let catalogItems;
    try {
      const result = await KalturaAPI.catalogItemList(MODERATION_FEATURE);
      catalogItems = result?.objects || [];
    } catch (err) {
      showAlert(`Failed to load moderation catalog items: ${err.message}`, 'error');
      return;
    }
    if (!catalogItems.length) {
      showAlert('No moderation catalog items (serviceFeature=15) found for this account.', 'error');
      return;
    }
    // Remove any existing modal
    document.getElementById('order-modal-overlay')?.remove();

    const catalogOptions = catalogItems.map(item =>
      `<option value="${escapeHtml(String(item.id))}">${escapeHtml(item.name || 'Moderation')} (ID: ${escapeHtml(String(item.id))})</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'order-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>Order Moderation Job</h2>
          <button class="modal-close-btn" id="modal-close-btn" title="Close">&#10005;</button>
        </div>
        <div class="modal-body">
          <div id="modal-alert-area"></div>

          ${catalogItems.length > 1 ? `
          <div class="form-group">
            <label class="form-label">Catalog Item</label>
            <select class="form-input" id="modal-catalog-select">${catalogOptions}</select>
          </div>` : `<input type="hidden" id="modal-catalog-select" value="${escapeHtml(String(catalogItems[0].id))}">`}

          <div class="form-group">
            <label class="form-label">Entry (video)</label>
            <div class="entry-search-row">
              <input type="text" id="modal-entry-search" class="form-input" placeholder="Search by name or ID…">
              <button class="btn btn-outline btn-sm" id="modal-search-btn">Search</button>
            </div>
            <div class="entry-picker" id="modal-entry-picker">
              <div style="padding:16px;text-align:center"><span class="spinner"></span></div>
            </div>
            <div class="selected-entry-label" id="modal-selected-label"></div>
          </div>

          <div class="form-group">
            <label class="form-label">Reach Profile</label>
            <select class="form-input" id="modal-reach-select">
              <option value="">Loading reach profiles…</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Policy ID</label>
            <input type="text" id="modal-policy-input" class="form-input" placeholder="Enter policy ID">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="modal-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="modal-submit-btn">Submit Order</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Track selection
    let selectedEntryId = null;

    // Close handlers
    const closeModal = () => overlay.remove();
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // Entry search
    const searchBtn  = document.getElementById('modal-search-btn');
    const searchInput = document.getElementById('modal-entry-search');
    const doSearch = () => loadEntriesForModal(searchInput.value.trim());
    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

    // Single delegated click handler on the picker (set up once)
    document.getElementById('modal-entry-picker').addEventListener('click', e => {
      const item = e.target.closest('.entry-item');
      if (!item) return;
      document.querySelectorAll('#modal-entry-picker .entry-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selectedEntryId = item.dataset.id;
      const label = document.getElementById('modal-selected-label');
      if (label) label.innerHTML =
        `Selected: <strong>${escapeHtml(item.dataset.name || item.dataset.id)}</strong>
         <code style="font-size:11px;margin-left:4px">${escapeHtml(item.dataset.id)}</code>`;
    });

    // Load reach profiles into the dropdown
    KalturaAPI.reachProfileList().then(result => {
      const profiles = result?.objects || [];
      const sel = document.getElementById('modal-reach-select');
      if (!sel) return;
      if (!profiles.length) {
        sel.innerHTML = '<option value="">No reach profiles found</option>';
        return;
      }
      sel.innerHTML = profiles.map(p =>
        `<option value="${escapeHtml(String(p.id))}">${escapeHtml(p.name || `Profile ${p.id}`)} (ID: ${escapeHtml(String(p.id))})</option>`
      ).join('');
    }).catch(() => {
      const sel = document.getElementById('modal-reach-select');
      if (sel) sel.innerHTML = '<option value="">Failed to load reach profiles</option>';
    });

    // Initial load
    loadEntriesForModal('');

    // Submit
    document.getElementById('modal-submit-btn').addEventListener('click', async () => {
      const catalogItemId = document.getElementById('modal-catalog-select').value;
      const reachProfileId = document.getElementById('modal-reach-select').value;
      const policyId       = document.getElementById('modal-policy-input').value.trim();

      if (!selectedEntryId) { showModalAlert('Please select an entry.'); return; }
      if (!reachProfileId)  { showModalAlert('Please select a reach profile.'); return; }
      if (!policyId)        { showModalAlert('Please enter a policy ID.'); return; }

      const btn = document.getElementById('modal-submit-btn');
      btn.disabled = true;
      btn.textContent = 'Submitting…';

      try {
        await KalturaAPI.vendorTaskAdd({ entryId: selectedEntryId, catalogItemId, reachProfileId, policyIds: policyId });
        closeModal();
        loadTasks(1);
      } catch (err) {
        showModalAlert(`Error: ${err.message || err}`);
        btn.disabled = false;
        btn.textContent = 'Submit Order';
      }
    });
  }

  function loadEntriesForModal(search) {
    const picker = document.getElementById('modal-entry-picker');
    if (!picker) return;
    picker.innerHTML = '<div style="padding:16px;text-align:center"><span class="spinner"></span></div>';

    KalturaAPI.entryList({ search }).then(result => {
      if (!picker.isConnected) return; // modal was closed while fetching
      const entries = result?.objects || [];
      if (!entries.length) {
        picker.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:13px">No entries found</div>';
        return;
      }
      picker.innerHTML = entries.map(e => `
        <div class="entry-item" data-id="${escapeHtml(e.id)}" data-name="${escapeHtml(e.name || '')}">
          <span class="entry-item-id">${escapeHtml(e.id)}</span>
          <span class="entry-item-name">${escapeHtml(e.name || '(no name)')}</span>
        </div>`).join('');
    }).catch(err => {
      if (picker.isConnected)
        picker.innerHTML = `<div style="padding:12px;color:var(--red);font-size:13px">${escapeHtml(err.message)}</div>`;
    });
  }

  function showModalAlert(msg) {
    const area = document.getElementById('modal-alert-area');
    if (area) area.innerHTML = `<div class="alert alert-error" style="margin-bottom:12px">${escapeHtml(msg)}</div>`;
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
