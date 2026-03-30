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
      // 1. Fetch full task details
      const task = await KalturaAPI.taskGet(taskId);
      renderMetaCard(task);

      // 2. Fetch moderation report
      await loadModerationReport(task);

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
        ${task.outputObjectId
          ? `<div><strong>Output Asset ID:</strong> <code style="font-size:11px">${escapeHtml(task.outputObjectId)}</code></div>`
          : ''}
        ${task.errDescription
          ? `<div><strong>Error:</strong> <span style="color:var(--red)">${escapeHtml(task.errDescription)}</span></div>`
          : ''}
      </div>
    `;
  }

  // ---- Load moderation report --------------------------------------

  async function loadModerationReport(task) {
    const resultsBody   = document.getElementById('review-results-body');
    const severityBadge = document.getElementById('review-severity-badge');

    resultsBody.innerHTML =
      `<div style="text-align:center;padding:20px"><span class="spinner"></span> Fetching report…</div>`;

    // Primary source: taskJobData field on the entryVendorTask
    const reportData = task.taskJobData || null;

    if (!reportData) {
      resultsBody.innerHTML = `
        <div class="alert alert-info">
          No moderation report found (taskJobData is empty). The job may still be processing.
        </div>
        <details style="margin-top:12px">
          <summary>Raw task object</summary>
          <pre class="json-viewer">${escapeHtml(JSON.stringify(task, null, 2))}</pre>
        </details>`;
      return;
    }

    renderReport(reportData, severityBadge, resultsBody);
  }

  // ---- Render parsed moderation report ----------------------------

  function renderReport(report, severityBadge, container) {
    // Try to detect common output schemas
    const severity = detectSeverity(report);
    const labels   = extractLabels(report);

    // Severity badge
    if (severity) {
      severityBadge.innerHTML = `
        <span class="severity-badge severity-${severity}">
          ${severity} SEVERITY
        </span>`;
    }

    let html = '';

    if (labels.length > 0) {
      html += `<div style="margin-bottom:8px;font-size:12px;color:var(--text-muted)">
        ${labels.length} moderation label(s) detected
      </div>`;
      html += labels.map(lbl => renderLabelCard(lbl)).join('');
    } else {
      html += `<div class="alert alert-success">No moderation labels detected.</div>`;
    }

    // Raw JSON viewer (collapsible)
    html += `
      <details style="margin-top:16px">
        <summary>Raw report JSON</summary>
        <pre class="json-viewer">${escapeHtml(JSON.stringify(report, null, 2))}</pre>
      </details>`;

    container.innerHTML = html;
  }

  function renderLabelCard(lbl) {
    const pct        = Math.round((lbl.confidence || 0) * 100);
    const barClass   = pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low';
    const segmentsHtml = lbl.segments && lbl.segments.length
      ? `<ul class="segments-list">
           ${lbl.segments.map(s => `
             <li class="segment-item">
               <span class="segment-time">${escapeHtml(s.start || s.startTimestamp || s.startTimeMs || '?')}</span>
               <span>→</span>
               <span class="segment-time">${escapeHtml(s.end || s.endTimestamp || s.endTimeMs || '?')}</span>
               ${s.confidence != null ? `<span style="margin-left:auto">${Math.round(s.confidence*100)}%</span>` : ''}
             </li>`).join('')}
         </ul>`
      : '';

    return `
      <div class="label-card">
        <div class="label-name">
          <span>${escapeHtml(lbl.name)}</span>
          <span style="font-weight:400;font-size:12px;color:var(--text-muted)">${pct}%</span>
        </div>
        <div class="confidence-bar-wrap">
          <div class="confidence-bar ${barClass}" style="width:${pct}%"></div>
        </div>
        ${segmentsHtml}
      </div>`;
  }

  // ---- Schema detection helpers -----------------------------------

  function detectSeverity(report) {
    // Various schema shapes
    if (report.overallSeverity)       return report.overallSeverity.toUpperCase();
    if (report.severity)              return report.severity.toUpperCase();
    if (report.ModerationLabels) {
      // AWS Rekognition shape
      const max = Math.max(...(report.ModerationLabels.map(l => l.Confidence || 0)));
      if (max >= 70) return 'HIGH';
      if (max >= 40) return 'MEDIUM';
      return 'LOW';
    }
    if (Array.isArray(report.labels || report.categories)) {
      const arr = report.labels || report.categories;
      const max = Math.max(...arr.map(l => l.confidence || l.score || 0));
      if (max >= 0.7) return 'HIGH';
      if (max >= 0.4) return 'MEDIUM';
      return 'LOW';
    }
    return null;
  }

  function extractLabels(report) {
    // AWS Rekognition: { ModerationLabels: [{Name, Confidence, Instances:[{BoundingBox,Confidence}]}] }
    if (report.ModerationLabels) {
      return report.ModerationLabels.map(l => ({
        name:       l.Name || l.name,
        confidence: (l.Confidence || l.confidence || 0) / 100,
        segments:   (l.Instances || []).map(inst => ({
          start:      inst.Timestamp != null ? msToTimecode(inst.Timestamp) : undefined,
          confidence: inst.Confidence ? inst.Confidence / 100 : undefined,
        })).filter(s => s.start),
      }));
    }

    // Google Video Intelligence: { annotationResults: [{explicitAnnotation:{frames:[]}}] }
    if (report.annotationResults) {
      const labels = [];
      for (const r of report.annotationResults) {
        if (r.explicitAnnotation?.frames) {
          const grouped = {};
          for (const f of r.explicitAnnotation.frames) {
            const cat = f.pornographyLikelihood || f.category || 'Explicit';
            if (!grouped[cat]) grouped[cat] = { name: cat, confidence: 0, segments: [] };
            grouped[cat].confidence = Math.max(grouped[cat].confidence, likelihoodToScore(f.pornographyLikelihood));
            grouped[cat].segments.push({ start: f.timeOffset });
          }
          labels.push(...Object.values(grouped));
        }
        if (r.segmentLabelAnnotations) {
          for (const a of r.segmentLabelAnnotations) {
            labels.push({
              name:       a.entity?.description || 'Unknown',
              confidence: (a.segments?.[0]?.confidence || 0),
              segments:   [],
            });
          }
        }
      }
      return labels;
    }

    // Generic: array of { label/name/category, confidence/score, instances/segments }
    const arr = report.labels || report.categories || report.moderationLabels || report.flags;
    if (Array.isArray(arr)) {
      return arr.map(l => ({
        name:       l.label || l.name || l.category || l.type || '?',
        confidence: l.confidence || l.score || l.Confidence || 0,
        segments:   extractSegments(l),
      }));
    }

    return [];
  }

  function extractSegments(label) {
    const raw = label.instances || label.segments || label.timestamps || [];
    return raw.map(s => ({
      start: s.startTimestamp || s.start_time || s.startTimeMs != null ? msToTimecode(s.startTimeMs) : (s.start || s.startTimestamp),
      end:   s.endTimestamp   || s.end_time   || s.endTimeMs   != null ? msToTimecode(s.endTimeMs)   : (s.end   || s.endTimestamp),
    }));
  }

  function msToTimecode(ms) {
    if (ms == null) return undefined;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function likelihoodToScore(likelihood) {
    const map = { UNKNOWN:0, VERY_UNLIKELY:0.05, UNLIKELY:0.2, POSSIBLE:0.5, LIKELY:0.75, VERY_LIKELY:0.95 };
    return map[likelihood] || 0;
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
      // Fallback: show a connect prompt with uiconf input
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
      // Inline helper
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
