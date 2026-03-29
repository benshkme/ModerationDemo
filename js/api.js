/* =============================================
   Kaltura API Wrapper — api.js
   ============================================= */

const KalturaAPI = (() => {

  const state = {
    baseUrl: 'https://www.kaltura.com',
    ks: null,
    partnerId: null,
  };

  // ---- Low-level POST ----------------------------------------

  async function call(service, action, params = {}) {
    const url = `${state.baseUrl}/api_v3/service/${service}/action/${action}`;

    const body = new URLSearchParams();
    body.append('format', '1'); // JSON
    if (state.ks) body.append('ks', state.ks);

    // Flatten nested params (e.g. filter[statusEqual]=3)
    flattenParams(params, '', body);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    if (data && data.objectType === 'KalturaAPIException') {
      throw new KalturaError(data.message, data.code);
    }

    return data;
  }

  // Flatten { filter: { statusEqual: 3 } } → filter[statusEqual]=3
  function flattenParams(obj, prefix, urlParams) {
    if (obj === null || obj === undefined) return;
    if (typeof obj !== 'object') {
      urlParams.append(prefix, obj);
      return;
    }
    for (const [key, val] of Object.entries(obj)) {
      const flatKey = prefix ? `${prefix}[${key}]` : key;
      if (typeof val === 'object' && val !== null) {
        flattenParams(val, flatKey, urlParams);
      } else if (val !== undefined && val !== null && val !== '') {
        urlParams.append(flatKey, val);
      }
    }
  }

  // ---- Public API Methods ------------------------------------

  function configure({ baseUrl, ks }) {
    if (baseUrl) state.baseUrl = baseUrl.replace(/\/$/, '');
    if (ks) state.ks = ks;
  }

  // session.get — validates KS and returns session details
  async function sessionGet() {
    const data = await call('session', 'get', { ks: state.ks });
    if (data && data.partnerId) {
      state.partnerId = data.partnerId;
    }
    return data;
  }

  // reach_entryVendorTask.list
  async function taskList({ serviceFeature, status, createdAfter, entryId, pageIndex = 1, pageSize = 30 } = {}) {
    const params = {
      filter: {
        objectType: 'KalturaEntryVendorTaskFilter',
        orderBy: '-createdAt',
      },
      pager: {
        objectType: 'KalturaFilterPager',
        pageIndex,
        pageSize,
      },
    };

    if (serviceFeature)  params.filter.serviceFeatureEqual        = serviceFeature;
    if (status)          params.filter.statusEqual                 = status;
    if (createdAfter)    params.filter.createdAtGreaterThanOrEqual = createdAfter;
    if (entryId)         params.filter.entryIdEqual                = entryId;

    return call('reach_entryVendorTask', 'list', params);
  }

  // reach_entryVendorTask.get
  async function taskGet(taskId) {
    return call('reach_entryVendorTask', 'get', { id: taskId });
  }

  // attachmentAsset.getUrl — returns a URL string to download the asset
  async function attachmentGetUrl(assetId) {
    const data = await call('attachment_attachmentAsset', 'getUrl', { id: assetId });
    // Returns a plain string URL
    return typeof data === 'string' ? data : null;
  }

  // attachmentAsset.list — list attachments for an entry
  async function attachmentList(entryId) {
    return call('attachment_attachmentAsset', 'list', {
      filter: {
        objectType: 'KalturaAssetFilter',
        entryIdEqual: entryId,
      },
    });
  }

  // baseEntry.get — get entry details
  async function entryGet(entryId) {
    return call('baseentry', 'get', { entryId });
  }

  // ---- Helpers -----------------------------------------------

  function getPartnerId() { return state.partnerId; }
  function getKS()        { return state.ks; }
  function getBaseUrl()   { return state.baseUrl; }

  // ---- Error class -------------------------------------------

  class KalturaError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'KalturaError';
      this.code = code;
    }
  }

  // ---- Status helpers ----------------------------------------

  const TASK_STATUS = {
    1: { label: 'Pending',              cls: 'pending'    },
    2: { label: 'Ready',                cls: 'ready'      },
    3: { label: 'Processing',           cls: 'processing' },
    4: { label: 'Pending Moderation',   cls: 'pending'    },
    5: { label: 'Rejected',             cls: 'error'      },
    6: { label: 'Error',                cls: 'error'      },
    7: { label: 'Aborted',              cls: 'aborted'    },
    8: { label: 'Pending Entry Ready',  cls: 'pending'    },
    9: { label: 'Scheduled',            cls: 'pending'    },
  };

  const SERVICE_FEATURE = {
    1:  'Captions',
    2:  'Translation',
    3:  'Alignment',
    4:  'Audio Description',
    5:  'Chaptering',
    6:  'Intelligent Tagging',
    7:  'Dubbing',
    8:  'Live Caption',
    9:  'Extended Audio Description',
    10: 'Clips',
    11: 'Live Translation',
    12: 'Quiz',
    13: 'Summary',
    14: 'Video Analysis',
    15: 'Moderation',
    16: 'Metadata Enrichment',
    17: 'Sentiment Analysis',
    18: 'Document Enrichment',
    19: 'Sign Language',
    20: 'Speech to Video',
    21: 'Immersive Agent Call',
    22: 'Immersive Agent Chat',
  };

  function taskStatusInfo(status) {
    return TASK_STATUS[status] || { label: `Status ${status}`, cls: 'pending' };
  }

  function serviceFeatureLabel(feature) {
    return SERVICE_FEATURE[feature] || `Feature ${feature}`;
  }

  return {
    configure,
    sessionGet,
    taskList,
    taskGet,
    attachmentGetUrl,
    attachmentList,
    entryGet,
    getPartnerId,
    getKS,
    getBaseUrl,
    taskStatusInfo,
    serviceFeatureLabel,
    SERVICE_FEATURE,
    TASK_STATUS,
    KalturaError,
  };
})();
