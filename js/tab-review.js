/* =============================================
   Tab 3 — Moderation Review — tab-review.js
   ============================================= */

const ReviewTab = (() => {

  // ---- Render shell ------------------------------------------------

  function renderShell() {
    const panel = document.getElementById('tab-review');
    if (panel.querySelector('.review-layout')) return;

    panel.innerHTML = `
      <div id="review-alert-area"></div>
      <div class="review-layout">

        <!-- Left: moderation results -->
        <div class="review-left">
          <div class="card" id="review-meta-card">
            <div class="card-header">
              <h2>Job Details</h2>
              <span id="review-task-id-label" style="font-size:12px;color:var(--text-muted)"></span>
            </div>
            <div class="card-body" id="review-meta-body">
              <div class="empty-state" style="padding:30px">
                <div class="icon">🔎</div>
                <strong>No task selected</strong>
                <p>Click "Review" on a completed job in the Entry Vendor Tasks tab.</p>
              </div>
            </div>
          </div>

          <div class="card" id="review-results-card">
            <div class="card-header">
              <h2>Moderation Results</h2>
              <span id="review-severity-badge"></span>
            </div>
            <div class="card-body" id="review-results-body">
              <!-- populated dynamically -->
            </div>
          </div>
        </div>

        <!-- Right: player -->
        <div class="review-right">
          <div class="card" style="height:100%">
            <div class="card-header">
              <h2>Video Player</h2>
              <span id="review-entry-id-label" style="font-size:12px;color:var(--text-muted);font-family:monospace"></span>
            </div>
            <div class="player-wrap" id="player-wrap" style="height:calc(100% - 52px);border-radius:0 0 8px 8px">
              <div class="player-placeholder" id="player-placeholder">
                <span style="font-size:36px">▶</span>
                <span>Player will appear here</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  // ---- Load review for a task -------------------------------------

  async function loadReview(taskId, entryId) {
    renderShell();
    clearAlert();

    if (!AppState.connected) {
      showAlert('Connect with a valid KS first.', 'info');
      return;
    }

    // Update labels
    document.getElementById('review-task-id-label').textContent = `Task: ${taskId}`;
    document.getElementById('review-entry-id-label').textContent = entryId;

    // Show loading state
    document.getElementById('review-meta-body').innerHTML =
      `<div style="text-align:center;padding:20px"><span class="spinner"></span> Loading task…</div>`;
    document.getElementById('review-results-body').innerHTML = '';
    document.getElementById('review-severity-badge').innerHTML = '';

    // Embed player immediately (doesn't need task data)
    embedPlayer(entryId);

    try {
      const task = await KalturaAPI.taskGet(taskId);
      renderMetaCard(task);
      loadModerationReport(task);
    } catch (err) {
      document.getElementById('review-meta-body').innerHTML =
        `<div class="alert alert-error">Error loading task: ${escapeHtml(err.message)}</div>`;
      console.error('[ReviewTab] Error:', err);
    }
  }

  // ---- Render meta card --------------------------------------------

  function renderMetaCard(task) {
    const si      = KalturaAPI.taskStatusInfo(task.status);
    const feature = KalturaAPI.serviceFeatureLabel(task.serviceFeature);

    document.getElementById('review-meta-body').innerHTML = `
      <div class="result-meta">
        <div><strong>Task ID:</strong> ${escapeHtml(task.id)}</div>
        <div><strong>Entry ID:</strong>
          <a href="https://kmc.kaltura.com/index.php/kmcng/content/entries/entry/${escapeHtml(task.entryId)}/metadata"
             target="_blank" style="color:var(--kaltura-orange)">${escapeHtml(task.entryId)}</a>
        </div>
        <div><strong>Status:</strong> <span class="pill pill-${si.cls}">${escapeHtml(si.label)}</span></div>
        <div><strong>Service Feature:</strong> ${escapeHtml(feature)}</div>
        <div><strong>Vendor Partner ID:</strong> ${escapeHtml(task.vendorPartnerId || '—')}</div>
        <div><strong>Created:</strong> ${formatDate(task.createdAt)}</div>
        <div><strong>Updated:</strong> ${formatDate(task.updatedAt)}</div>
        ${task.errDescription
          ? `<div><strong>Error:</strong> <span style="color:var(--red)">${escapeHtml(task.errDescription)}</span></div>`
          : ''}
      </div>
    `;
  }

  // ---- Load moderation report (from taskJobData) ------------------

  function loadModerationReport(task) {
    const resultsBody   = document.getElementById('review-results-body');
    const severityBadge = document.getElementById('review-severity-badge');

    const taskJobData = task.taskJobData || null;

    if (!taskJobData) {
      resultsBody.innerHTML = `
        <div class="alert alert-info">No taskJobData found on this task.</div>
        <details style="margin-top:12px">
          <summary>Raw task object</summary>
          <pre class="json-viewer">${escapeHtml(JSON.stringify(task, null, 2))}</pre>
        </details>`;
      return;
    }

    // Parse moderationOutputJson — may be a JSON string or already an object
    const raw = taskJobData.moderationOutputJson;
    let report = null;
    if (raw) {
      try { report = typeof raw === 'string' ? JSON.parse(raw) : raw; }
      catch { /* fall through to raw display */ }
    }

    if (!report) {
      resultsBody.innerHTML = `
        <div class="alert alert-info">No moderationOutputJson found in taskJobData.</div>
        <details style="margin-top:12px">
          <summary>Raw taskJobData</summary>
          <pre class="json-viewer">${escapeHtml(JSON.stringify(taskJobData, null, 2))}</pre>
        </details>`;
      return;
    }

    renderKalturaModerationReport(task, taskJobData, report, severityBadge, resultsBody);
  }

  // ---- Render Kaltura moderation report ---------------------------

  function renderKalturaModerationReport(task, taskJobData, report, severityBadge, container) {
    const violations = report.violations || [];
    const summary    = report.summary    || {};

    // Policy number: try common field names
    const policyId = taskJobData.reachProfileId
      || taskJobData.policyId
      || task.reachProfileId
      || '—';

    // Compliance badge
    const complies = summary.complies;
    if (complies !== undefined) {
      severityBadge.innerHTML = complies
        ? `<span class="compliance-badge comply">&#10003; Complies</span>`
        : `<span class="compliance-badge no-comply">&#10007; Does Not Comply</span>`;
    }

    // Group violations by rule id
    const byRule = new Map();
    for (const v of violations) {
      const key = String(v.id ?? v.rule);
      if (!byRule.has(key)) {
        byRule.set(key, { id: v.id, rule: v.rule, severity: v.severity, items: [] });
      }
      byRule.get(key).items.push(v);
    }

    let html = '';

    // ---- Policy + totals header
    html += `
      <div class="report-header">
        <div class="report-header-row">
          <span><strong>Policy:</strong> #${escapeHtml(String(policyId))}</span>
          <span style="color:var(--text-muted);font-size:12px">${violations.length} violation${violations.length !== 1 ? 's' : ''} · ${byRule.size} rule${byRule.size !== 1 ? 's' : ''}</span>
        </div>
      </div>`;

    // ---- Violations grouped by rule
    if (byRule.size === 0) {
      html += `<div class="alert alert-success" style="margin-top:12px">No violations detected.</div>`;
    } else {
      html += `<div class="rules-list">`;
      for (const [, rd] of byRule) {
        const sev       = rd.severity ?? 0;
        const sevClass  = sev >= 80 ? 'sev-high' : sev >= 60 ? 'sev-med' : 'sev-low';
        const ruleLabel = decodeEntities(rd.rule || `Rule ${rd.id}`);

        html += `
          <details class="rule-block">
            <summary class="rule-summary">
              <span class="sev-dot ${sevClass}" title="Severity ${sev}"></span>
              <span class="rule-name">${escapeHtml(ruleLabel)}</span>
              <span class="rule-pill">${rd.items.length}</span>
            </summary>
            <div class="violations-list">
              ${rd.items.map(v => `
                <div class="violation-row">
                  <span class="vio-reason">${escapeHtml(decodeEntities(v.reason || ''))}</span>
                  <button class="ts-btn" data-ts="${v.start_time ?? 0}"
                    title="Jump to ${secsToTimecode(v.start_time)}">${secsToTimecode(v.start_time)}</button>
                </div>`).join('')}
            </div>
          </details>`;
      }
      html += `</div>`;
    }

    // ---- Summary
    html += `
      <div class="report-summary">
        <div class="report-summary-title">Summary</div>
        <div class="result-meta">
          ${summary.score !== undefined
            ? `<div><strong>Score:</strong> ${escapeHtml(String(summary.score))}</div>`
            : ''}
          <div><strong>Complies with policy:</strong>
            <span style="font-weight:700;${complies ? 'color:var(--green)' : 'color:var(--red)'}">
              ${complies === true ? '&#10003; Yes' : complies === false ? '&#10007; No' : '—'}
            </span>
          </div>
        </div>
      </div>`;

    // ---- Raw JSON (collapsible)
    html += `
      <details style="margin-top:14px">
        <summary>Raw moderationOutputJson</summary>
        <pre class="json-viewer">${escapeHtml(JSON.stringify(report, null, 2))}</pre>
      </details>`;

    container.innerHTML = html;

    // Wire timestamp buttons — click seeks the player
    container.querySelectorAll('.ts-btn').forEach(btn => {
      btn.addEventListener('click', () => seekPlayer(parseFloat(btn.dataset.ts)));
    });
  }

  // ---- Seek player to a timestamp ---------------------------------

  function seekPlayer(seconds) {
    const iframe = document.querySelector('#player-wrap iframe');
    if (!iframe) return;
    // Reload iframe src with updated startTime — simple and reliable
    try {
      const url = new URL(iframe.src);
      url.searchParams.set('flashvars[playbackConfig.startTime]', Math.floor(seconds));
      iframe.src = url.toString();
    } catch (e) {
      console.warn('[ReviewTab] seekPlayer failed:', e);
    }
  }

  // ---- Helpers ----------------------------------------------------

  function decodeEntities(str) {
    if (!str) return '';
    return str
      .replace(/&amp;/g,  '&')
      .replace(/&lt;/g,   '<')
      .replace(/&gt;/g,   '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g,  "'");
  }

  function secsToTimecode(secs) {
    if (secs == null) return '?';
    const s   = Math.floor(secs);
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  // ---- Player embed -----------------------------------------------

  function embedPlayer(entryId) {
    const partnerId = AppState.partnerId;
    const uiconfId  = AppState.uiconfId;
    const wrap      = document.getElementById('player-wrap');

    if (!wrap) return;

    if (!partnerId) {
      wrap.innerHTML = `<div class="player-placeholder">
        <span style="font-size:28px">⚠</span>
        <span>Partner ID not detected. Please reconnect.</span>
      </div>`;
      return;
    }

    if (!uiconfId) {
      wrap.innerHTML = `<div class="player-placeholder" style="gap:14px">
        <span style="font-size:28px">🎬</span>
        <span>Enter a Player UI Conf ID in the header to load the player.</span>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="inline-uiconf" type="text" placeholder="uiconf ID" style="
            padding:6px 10px;border:1px solid rgba(255,255,255,.3);
            background:rgba(255,255,255,.1);color:#fff;border-radius:6px;font-size:13px;
            outline:none;width:140px">
          <button class="btn btn-primary btn-sm" onclick="inlineSetUiconf()">Load Player</button>
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,.4)">Entry: ${escapeHtml(entryId)}</div>
      </div>`;
      window.inlineSetUiconf = () => {
        const val = document.getElementById('inline-uiconf')?.value.trim();
        if (val) {
          AppState.uiconfId = val;
          document.getElementById('uiconf-id').value = val;
          embedPlayer(entryId);
        }
      };
      return;
    }

    const src = `https://cdnapisec.kaltura.com/p/${partnerId}/embedPlaykitJs/uiconf_id/${uiconfId}?iframeembed=true&entry_id=${entryId}&flashvars[playbackConfig.startTime]=0`;

    wrap.innerHTML = `<iframe
      id="kaltura-player-iframe"
      src="${escapeHtml(src)}"
      allowfullscreen
      allow="autoplay; encrypted-media"
      title="Kaltura Player — ${escapeHtml(entryId)}"
    ></iframe>`;
  }

  // ---- Alert helpers -----------------------------------------------

  function showAlert(msg, type = 'error') {
    const area = document.getElementById('review-alert-area');
    if (area) area.innerHTML = `<div class="alert alert-${type}" style="margin-bottom:16px">${escapeHtml(msg)}</div>`;
  }

  function clearAlert() {
    const area = document.getElementById('review-alert-area');
    if (area) area.innerHTML = '';
  }

  // ---- Tab lifecycle -----------------------------------------------

  function onActivate() {
    renderShell();
    // loadReview is triggered directly by openReview(); no auto-reload here.
  }

  return { onActivate, loadReview };
})();
