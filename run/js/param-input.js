function rsDebugAlert(message) {
  return;
}

// Global variables for parambase handling (declared early to avoid TDZ)
let cachedParambaseContent = {};
let currentParambase = null;

function safeGetHash() {
  return typeof getHash === 'function' ? getHash() : {};
}

document.addEventListener('hashChangeEvent', function (event) {
    console.log("param-input.js detects URL hashChangeEvent");
    
    // Reload YAML content for the current parambase
    const hash = safeGetHash();
    if (hash.parambase) {
        const select = document.getElementById('parambase');
        if (select) {
            const selectedOption = Array.from(select.options).find(option => option.value === hash.parambase);
            if (selectedOption && selectedOption.dataset && selectedOption.dataset.url) {
                loadParambaseYAML(hash.parambase, selectedOption.dataset.url);
            }
        }
    } else {
        // No parambase - reload using the standard paramText loading process
        loadParamTextFromCurrentState();
    }
}, false);

function renderPathControls() {
  const host = document.getElementById('pathControls');
  if (!host) {
    return;
  }

  let shouldRefreshSelections = false;
  if (!host.children.length) {
    host.innerHTML = `
      <div id="rsAddBackdrop" class="rs-backdrop"></div>

      <div id="rsAddPopup" class="rs-popup">
        <div class="rs-popup-header">
          <div class="rs-popup-title">Add dataset</div>
          <button id="rsAddClose" type="button" class="rs-popup-close">×</button>
        </div>

        <div class="rs-role-options">
          <label>
            <input type="radio" name="rs_role" value="features" checked> Features
          </label>
          <label>
            <input type="radio" name="rs_role" value="target"> Targets
          </label>
        </div>

        <div class="rs-popup-subtitle">Select from:</div>

        <div class="rs-option-group">
          <button id="rsAddTimelines" type="button" class="rs-option-button">
            Google Data Commons Timelines
          </button>

          <button id="rsAddNaics" type="button" class="rs-option-button">
            US Industry NAICS Data
          </button>
        </div>
      </div>

      <div id="rsPickers" class="rs-pickers">
        <div class="rs-picker">
          <div class="rs-picker-header">
            <div class="rs-picker-title">Features Data</div>
          </div>
          <div id="rsFeaturesList" class="rs-drop rs-drop-list"></div>
          <div id="rsFeaturesEmpty" class="rs-drop-empty">
            No features selected yet.
          </div>
        </div>

        <div class="rs-picker">
          <div class="rs-picker-header">
            <div class="rs-picker-title">Target Data</div>
          </div>
          <div id="rsTargetList" class="rs-drop rs-drop-list"></div>
          <div id="rsTargetEmpty" class="rs-drop-empty">
            No target selected yet.
          </div>
        </div>
      </div>

      <div id="rsJoinStatus" class="rs-join-status"></div>
    `;
    shouldRefreshSelections = true;
  }

  function rsOpenAddPopup() {
    const popup = document.getElementById('rsAddPopup');
    const backdrop = document.getElementById('rsAddBackdrop');
    if (popup) popup.style.display = 'block';
    if (backdrop) backdrop.style.display = 'block';
  }

  function rsCloseAddPopup() {
    const popup = document.getElementById('rsAddPopup');
    const backdrop = document.getElementById('rsAddBackdrop');
    if (popup) popup.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
  }

  function rsGetSelectedRole() {
    const chosen = document.querySelector('input[name="rs_role"]:checked');
    return chosen ? chosen.value : 'features';
  }

  function rsOpenAddPopupWithRole(role) {
    const desired = role === 'target' ? 'target' : 'features';
    const input = document.querySelector(`input[name="rs_role"][value="${desired}"]`);
    if (input) input.checked = true;
    rsOpenAddPopup();
  }

  function rsNavigateWithHash(destPath, source) {
    const role = rsGetSelectedRole();
    if (role === 'target' && window.rsHasTarget && window.rsHasTarget()) {
      alert('Only 1 target is allowed. Remove the current target first.');
      return;
    }

    const h = (window.location.hash || '').replace(/^#/, '');
    const p = new URLSearchParams(h);

    p.set('rs_role', role);
    p.set('rs_source', source);

    rsCloseAddPopup();
    window.location.href = destPath + '#' + p.toString();
  }

  window.rsOpenAddPopup = rsOpenAddPopup;
  window.rsOpenAddPopupWithRole = rsOpenAddPopupWithRole;
  window.rsCloseAddPopup = rsCloseAddPopup;
  window.rsNavigateWithHash = rsNavigateWithHash;

  const closeBtn = document.getElementById('rsAddClose');
  const backdrop = document.getElementById('rsAddBackdrop');
  const btnTimelines = document.getElementById('rsAddTimelines');
  const btnNaics = document.getElementById('rsAddNaics');

  if (closeBtn) closeBtn.addEventListener('click', rsCloseAddPopup);
  if (backdrop) backdrop.addEventListener('click', rsCloseAddPopup);

  if (btnTimelines) btnTimelines.addEventListener('click', function() {
    rsNavigateWithHash('/localsite/timeline/', 'timelines');
  });

  if (btnNaics) btnNaics.addEventListener('click', function() {
    rsNavigateWithHash('/localsite/info', 'naics');
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') rsCloseAddPopup();
  });

  if (shouldRefreshSelections && typeof window.rsRefreshFromYaml === 'function') {
    window.rsRefreshFromYaml();
  }
}

// Function to reload paramText content without affecting the dropdown
function loadParamTextFromCurrentState() {
    const paramTextDiv = document.getElementById('paramText');
    if (!paramTextDiv) return;
    
    const preTag = paramTextDiv.querySelector('pre');
    if (!preTag) return;
    
    // Check if we have a current parambase with cached content
    if (currentParambase && cachedParambaseContent[currentParambase]) {
        // Use the base YAML and apply any hash overrides
        updateParamTextWithBase(cachedParambaseContent[currentParambase]);
    } else {
        // Fall back to the original loadParamText process
        let preContent = preTag.innerHTML;
        let hash = getHash();
        console.log("loadParamTextFromCurrentState - hash:", hash);
        
        const modelHashParams = ["features", "targets", "models"];
        const addHashKeys = ["folder","features", "targets", "models"];
        let parsedContent = parseYAML(preContent);
        parsedContent = updateYAMLFromHash(parsedContent, hash, addHashKeys);
        preContent = convertToYAML(parsedContent);
        preTag.innerHTML = preContent;
        
        // Update reset button visibility after content changes
        updateResetButtonVisibility();
    }
}

function updateYAMLFromHash(parsedContent, hash, addHashKeys) {
    // Sets nested yaml values for textbox while preserving existing structure
    function setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            // Preserve existing object or create new one if doesn't exist
            current[key] = current[key] || {};
            current = current[key];
        }

        // Set the value at the final key, converting numeric strings to numbers
        const lastKey = keys[keys.length - 1];
        current[lastKey] = convertValueType(value);
    }


    function decodeHashParamValue(v) {
  if (v == null) return v;
  if (typeof v !== 'string') return v;

  // If string contains percent-encoding, decode it
  if (/%[0-9A-Fa-f]{2}/.test(v)) {
    try {
      return decodeURIComponent(v.replace(/\+/g, '%20'));
    } catch (e) {
      return v;
    }
  }
  return v;
}


    // Helper function to handle comma-separated values, including encrypted commas
   function handleCommaSeparatedValue(value) {
  if (typeof value !== 'string') return value;

  // Decode first (fixes %2F, %2C, etc.)
  const decoded = decodeHashParamValue(value);

  // If it's comma-separated, return array
  if (decoded.includes(',')) {
    return decoded.split(',').map(item => item.trim());
  }
  return decoded;
}


    // Check if a path should be included based on addHashKeys
    function shouldIncludePath(path) {
        const rootKey = path.split('.')[0];
        return addHashKeys.includes(rootKey);
    }

    // Traverse hash and update parsedContent
    function traverseAndUpdate(obj, prefix = '') {
        Object.keys(obj).forEach(key => {
            const currentPath = prefix ? `${prefix}.${key}` : key;

            // Skip if this path doesn't match our allowed root keys
            if (!shouldIncludePath(currentPath)) {
                return;
            }

            if (typeof obj[key] === 'object' && obj[key] !== null) {
                // If value is an object, recurse deeper
                traverseAndUpdate(obj[key], currentPath);
            } else {
                // Process value for comma-separated strings
                const processedValue = handleCommaSeparatedValue(obj[key]);
                // Update the parsedContent with the processed value
                setNestedValue(parsedContent, currentPath, processedValue);
            }
        });
    }

    // Start the traversal
    traverseAndUpdate(hash);
    return parsedContent;
}

// Helper function to convert string values to appropriate types
function convertValueType(value) {
    if (typeof value !== 'string') return value;
    
    // Check if it's a number (integer or decimal)
    if (/^\d+$/.test(value)) {
        return parseInt(value, 10);
    }
    if (/^\d*\.\d+$/.test(value)) {
        return parseFloat(value);
    }
    
    // Check if it's a boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Return as string if no conversion needed
    return value;
}

function parseHashParams() {
    const hash = window.location.hash.substring(1);
    const paramsHere = {};
    hash.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) paramsHere[key] = decodeURIComponent(value || '');
    });
    return paramsHere;
  }


function displayParams(obj) {
    const paramDiv = document.getElementById('pageparams');
    if (!obj || Object.keys(obj).length === 0) {
      paramDiv.style.display = 'none';
      return;
    }
    paramDiv.style.display = 'block';
    paramDiv.textContent = 'Parameters:\n' + JSON.stringify(obj, null, 2);
  }

function bootParamInput() {
  if (typeof waitForElm === 'function') {
    waitForElm('#pathControls').then(renderPathControls);
  } else {
    renderPathControls();
  }

  initRunPage();
  // Only load paramText if we're not expecting parambase to be loaded later
  // The parambase system will handle this when it's ready
  const hash = safeGetHash();
  if (!hash.parambase) {
    loadParamText();
  }
  
  // Listen for hash changes to update YAML content when hash params change
  window.addEventListener('hashchange', function() {
    handleHashChange();
  });
  
  // Add edit detection for paramText
  setupParamTextEditDetection();
  
  function loadParamText() {
    const paramTextDiv = document.getElementById('paramText');
    if (!paramTextDiv) return;
    
    const preTag = paramTextDiv.querySelector('pre');
    if (!preTag) return;
    
    let preContent = preTag.innerHTML;

    let hash = getHash();
    console.log("hash:", hash);
    console.log(hash.features?.dcid)

    modelHashParams = ["features", "targets", "models"];
    insertHashValues(modelHashParams);
    
    function insertHashValues(modelHashParams) {
      // Main execution
      const addHashKeys = ["folder","features", "targets", "models"];
      let parsedContent = parseYAML(preContent);
      parsedContent = updateYAMLFromHash(parsedContent, hash, addHashKeys);
      preContent = convertToYAML(parsedContent);
      preTag.innerHTML = preContent;
      
      // Update reset button visibility after content changes
      updateResetButtonVisibility();
    }
  }
  
  function handleHashChange() {
    const hash = getHash();
    
    // Filter out script loading parameters (but don't exit)
    filterScriptParamsFromHash(hash, 'Hash change');
    
    // Check for custom YAML URL first
    if (hash.customYamlUrl) {
      const select = document.getElementById('parambase');
      if (select) {
        select.value = 'custom';
        showCustomPathInput();
        // Load custom URL if different from current
        const customUrl = decodeHashValue(hash.customYamlUrl);
        const currentCustomUrl = document.getElementById('customYamlUrl')?.value;
        if (customUrl !== currentCustomUrl) {
          document.getElementById('customYamlUrl').value = customUrl;
          // Load the YAML
          fetch(customUrl)
            .then(response => response.text())
            .then(yamlText => {
              updateParamTextWithBase(yamlText);
              // Set button text to "Loaded" after successful load
              const loadButton = document.getElementById('loadCustomYamlButton');
              if (loadButton) {
                loadButton.textContent = 'Loaded';
              }
            })
            .catch(error => console.error('Error loading custom YAML:', error));
        }
      }
    }
    // If parambase changed, reload the YAML
    else if (hash.parambase) {
      // Decode hash value using shared function
      const decodedParambase = decodeHashValue(hash.parambase);
      
      if (decodedParambase === 'custom') {
        // Show custom path input for parambase=custom
        const select = document.getElementById('parambase');
        if (select) {
          select.value = 'custom';
          showCustomPathInput();
        }
      } else {
        // Hide custom path when switching to regular parambase
        hideCustomPathInput();
        
        if (decodedParambase !== currentParambase) {
          const select = document.getElementById('parambase');
          if (select && select.options.length > 0) {
            console.log('HandleHashChange - Trying to set dropdown to:', decodedParambase);
            console.log('HandleHashChange - Available options:', Array.from(select.options).map(opt => opt.value));
            select.value = decodedParambase;
            // Find the selected option by value (compare with decoded value)
            const selectedOption = Array.from(select.options).find(option => option.value === decodedParambase);
            console.log('HandleHashChange - Found matching option:', selectedOption);
            if (selectedOption && selectedOption.dataset && selectedOption.dataset.url) {
              loadParambaseYAML(decodedParambase, selectedOption.dataset.url);
            } else {
              console.warn('HandleHashChange - No matching option found for parambase:', decodedParambase);
            }
          }
        }
      }
    } else {
      // No parambase or customYamlUrl - hide custom path and use regular loading
      hideCustomPathInput();
      if (currentParambase) {
        // Just update existing content with new hash values
        const cachedYaml = cachedParambaseContent[currentParambase];
        if (cachedYaml) {
          updateParamTextWithBase(cachedYaml);
        }
      } else {
        // No parambase, use regular loading
        loadParamText();
      }
    }
    
    // Update reset button visibility after hash changes
    updateResetButtonVisibility();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootParamInput);
} else {
  bootParamInput();
}



// Parse YAML content from the #paramText element
function parseYamlContent() {
    const paramTextElement = document.getElementById('paramText');
    const yamlContent = paramTextElement.textContent || paramTextElement.innerText;
    return yamlContent;
}

function rsAttachCardMenu(options) {
  const {
    card,
    roleLabel,
    onAdd,
    onRemove,
    onExpandToggle
  } = options;

  if (!card || !roleLabel) return;

  const ensureMenu = () => {
    if (typeof addPanelMenu !== 'function') return;
    if (document.getElementById(`${card.id}MenuToggleHolder`)) return;

    const menuItems = [
      { label: `Expand ${roleLabel}`, action: 'expand', icon: 'open_in_full' },
      { label: `Remove ${roleLabel}`, action: 'remove', icon: 'visibility_off' },
      { divider: true },
      { label: `Add ${roleLabel}`, action: 'add', icon: 'add_circle' }
    ];

    addPanelMenu({
      panelType: roleLabel,
      targetPanelId: card.id,
      containerSelector: `#${card.id} .rsCardMenuHolder`,
      inline: true,
      menuItems,
      onAction: (action) => {
        if (action === 'add' && typeof onAdd === 'function') {
          onAdd();
          return true;
        }
        if (action === 'remove' && typeof onRemove === 'function') {
          onRemove();
          return true;
        }
        if ((action === 'expand' || action === 'collapse') && typeof onExpandToggle === 'function') {
          onExpandToggle(action === 'expand');
          return true;
        }
        return false;
      }
    }).render();
  };

  if (typeof addPanelMenu === 'function') {
    ensureMenu();
  } else if (typeof waitForVariable === 'function') {
    waitForVariable('addPanelMenu', ensureMenu);
  } else {
    const timer = setInterval(() => {
      if (typeof addPanelMenu === 'function') {
        clearInterval(timer);
        ensureMenu();
      }
    }, 200);
  }
}

window.rsAttachCardMenu = rsAttachCardMenu;

function rsCreateRowCard(options) {
  const {
    item,
    role,
    roleLabel,
    getPathInfo,
    isProbablyDcid,
    onAdd,
    onRemove,
    onPreviewInline
  } = options;

  const card = document.createElement('div');
  card.className = 'rsRowCard';
  card.id = options.cardId || `rsCard_${role}_${Math.random().toString(16).slice(2)}`;

  const header = document.createElement('div');
  header.className = 'rsCardHeader';

  const title = document.createElement('div');
  title.className = 'rsCardTitle';
  title.textContent = (item && (item.label || item.dcid)) || '';

  const menuWrap = document.createElement('div');
  menuWrap.className = 'rsCardMenuHolder';

  header.appendChild(title);
  header.appendChild(menuWrap);
  card.appendChild(header);

  let details = null;
  let previewWrap = null;

  if (item && typeof getPathInfo === 'function' && typeof isProbablyDcid === 'function') {
    details = document.createElement('div');
    details.className = 'rsDetails rsDetailsInline';
    details.style.display = 'none';

    const value = item.dcid || '';
    const isDcid = (item.kind === 'dcid') || isProbablyDcid(value);
    let link = item.href || '';
    if (!isDcid && link && link.includes('datacommons.org/browser')) {
      link = '';
    }

    const fromYaml = getPathInfo(role);
    const fullPath = item.fullPath || fromYaml.fullPath || '';
    const hasPH = !!item.hasPlaceholders || fromYaml.hasPH;
    const placeholderPath = item.placeholderPath || fromYaml.placeholderPath || '';
    const previewPath = item.previewPath || fromYaml.previewPath || '';
    const pv = item.previewWith || fromYaml.pv || null;

    const dcidBlock = (value || link) ? `
      ${value ? `
        <div class="k">${isProbablyDcid(value) ? 'DCID' : 'DATA'}</div>
        <div class="v">${value}</div>
      ` : ''}
      ${link ? `
        <div class="k">LINK</div>
        <div class="v">
          <a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a>
        </div>
      ` : ''}
    ` : '';

    const csvToPreview = previewPath || fullPath;
    const canPreview = !!csvToPreview && /\.csv(\?|#|$)/i.test(csvToPreview);

    const pathBlock = fullPath ? `
      <div class="k">PATH</div>
      <div class="v">
        ${hasPH ? `
          <div>${placeholderPath}</div>
          ${pv ? `
            <div style="margin-top:10px;">
              <div class="k" style="margin-top:0;">Preview with:</div>
              <div class="v">year: ${pv.year}</div>
              <div class="v">state: ${(!item.previewWith?.state || String(item.previewWith.state).toLowerCase() === 'all') ? 'all (using NY)' : pv.state}</div>
              <div class="v">naics: ${pv.naics}</div>
            </div>
          ` : ''}
          ${canPreview ? `
            <div class="k">Preview link</div>
            <div class="v">
              <a href="${csvToPreview}" class="rsPreviewLink" data-preview="${csvToPreview}">
                Open preview table
              </a>
            </div>
          ` : ''}
        ` : `
          <a href="${fullPath}" target="_blank" rel="noopener noreferrer">${fullPath}</a>
          ${canPreview ? `
            <div class="k" style="margin-top:10px;">Preview link</div>
            <div class="v">
              <a href="${csvToPreview}" class="rsPreviewLink" data-preview="${csvToPreview}">
                Open preview table
              </a>
            </div>
          ` : ''}
        `}
      </div>
    ` : '';

    details.innerHTML = `
      ${dcidBlock}
      ${dcidBlock && pathBlock ? `<div style="margin-top:10px;"></div>` : ''}
      ${pathBlock}
    `;

    previewWrap = document.createElement('div');
    previewWrap.className = 'rsPreviewInline';
    previewWrap.style.display = 'none';

    card.appendChild(details);
    card.appendChild(previewWrap);

    const previewA = details.querySelector('.rsPreviewLink');
    if (previewA && typeof onPreviewInline === 'function') {
      previewA.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const url = previewA.getAttribute('data-preview');
        const tableId = `rsPreviewTable_${card.id}`;
        previewWrap.style.display = 'block';
        previewWrap.innerHTML = `
          <div class="rsPreviewMeta"><a href="${url}" target="_blank" rel="noopener noreferrer">Data Source</a></div>
          <div id="${tableId}"></div>
        `;
        onPreviewInline(url, tableId);
      });
    }
  }

  const attachMenu = () => {
    rsAttachCardMenu({
      card,
      roleLabel,
      onAdd,
      onRemove,
      onExpandToggle: (expanded) => {
        if (details) details.style.display = expanded ? 'block' : 'none';
        if (!expanded && previewWrap) {
          previewWrap.style.display = 'none';
          previewWrap.innerHTML = '';
        }
        if (card.dataset) {
          card.dataset.menuExpanded = expanded ? 'true' : 'false';
        }
        if (typeof updateMenuLabels === 'function') {
          updateMenuLabels(`${card.id}Menu`, card.id, roleLabel);
        }
        if (typeof setPanelToggleIcon === 'function') {
          setPanelToggleIcon(`${card.id}MenuToggleHolder`, expanded ? 'arrow_drop_down_circle' : 'arrow_right');
        }
      }
    });
  };

  card._rsAttachMenu = attachMenu;

  card.addEventListener('click', (ev) => {
    if (ev.target && ev.target.closest(`[id$=\"MenuToggleHolder\"], #${card.id}Menu`)) {
      return;
    }
    const isExpanded = details && details.style.display === 'block';
    const nextExpanded = !isExpanded;
    if (details) details.style.display = nextExpanded ? 'block' : 'none';
    if (!nextExpanded && previewWrap) {
      previewWrap.style.display = 'none';
      previewWrap.innerHTML = '';
    }
    if (card.dataset) {
      card.dataset.menuExpanded = nextExpanded ? 'true' : 'false';
    }
    if (typeof updateMenuLabels === 'function') {
      updateMenuLabels(`${card.id}Menu`, card.id, roleLabel);
    }
    if (typeof setPanelToggleIcon === 'function') {
      setPanelToggleIcon(`${card.id}MenuToggleHolder`, nextExpanded ? 'arrow_drop_down_circle' : 'arrow_right');
    }
  });

  return card;
}

window.rsCreateRowCard = rsCreateRowCard;

function initRunPage() {
  const mode = document.body ? document.body.dataset.paramInput : '';
  if (mode !== 'cloud-run') {
    return;
  }
  const runButton = document.getElementById('runButton');
  if (!runButton) {
    rsDebugAlert('runButton not found');
    return;
  }

  const paramTextDiv = document.getElementById('paramText');
  const yamlInput = document.querySelector('#paramText pre');
  const status = document.getElementById('status');
  const stepsToggle = document.getElementById('enableSteps');
  const stepsContainer = document.getElementById('stepsContainer');
  const stepsLoading = document.getElementById('stepsLoading');
  const tokenInput = document.getElementById('tokenInput');
  const saveBtn = document.getElementById('saveTokenBtn');
  const savedMsg = document.getElementById('tokenSavedMsg');
  const logoutButton = document.getElementById('logoutButton');

  if (!yamlInput || !paramTextDiv) return;

  window.UI_ACCESS_TOKEN = null;

  const originalFetch = window.fetch;
  window.fetch = async function (url, options = {}) {
    const isLocalApiCall = typeof url === 'string' && (
      url.startsWith('/') ||
      url.startsWith(window.location.origin) ||
      url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1')
    );

    if (isLocalApiCall) {
      options.headers = options.headers || {};
      options.headers['X-Access-Token'] = localStorage.getItem("UI_ACCESS_TOKEN");
    }

    const response = await originalFetch(url, options);

    if (isLocalApiCall && (response.status === 401 || response.status === 403)) {
      alert("❌ Invalid or expired access token. Please re-enter.");
      localStorage.removeItem("UI_ACCESS_TOKEN");
      location.reload();
      return Promise.reject(new Error("Unauthorized"));
    }

    return response;
  };

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.UI_ACCESS_TOKEN = 'local-dev-token';
    localStorage.setItem("UI_ACCESS_TOKEN", window.UI_ACCESS_TOKEN);
  } else if (tokenInput && saveBtn && savedMsg) {
    tokenInput.value = localStorage.getItem("UI_ACCESS_TOKEN") || "";
    window.UI_ACCESS_TOKEN = tokenInput.value.trim() || null;

    saveBtn.addEventListener("click", () => {
      const t = tokenInput.value.trim();
      if (!t) {
        alert("Please enter a token first.");
        return;
      }
      localStorage.setItem("UI_ACCESS_TOKEN", t);
      window.UI_ACCESS_TOKEN = t;
      savedMsg.style.display = "inline";
      setTimeout(() => savedMsg.style.display = "none", 1500);
    });
  }

  if (logoutButton) {
    window.logout = function () {
      localStorage.removeItem("UI_ACCESS_TOKEN");
      location.reload();
    };
  }

  const banner = document.getElementById("serverStatusBanner");
  const retryBtn = document.getElementById("retryServerCheck");
  const statusText = document.getElementById("serverStatusText");
  const statusIcon = document.getElementById("serverStatusIcon");
  const activateFlaskLink = document.getElementById("activateFlaskLink");

  const FLASK_BASE = "http://127.0.0.1:8100";
  const FLASK_PORT = new URL(FLASK_BASE).port;
  const HEALTH_URL = FLASK_BASE + "/health";

  function setBannerState(state, message) {
    if (!banner) return;
    banner.style.display = "flex";
    statusText.textContent = message;

    if (state === "checking") {
      banner.style.background = "#2e2e2e";
      banner.style.color = "#e5e7eb";
      statusIcon.textContent = "⏳";
      retryBtn.style.display = "inline-block";
      if (activateFlaskLink) activateFlaskLink.style.display = "none";
    }

    if (state === "up") {
      banner.style.background = "rgba(34, 197, 94, 0.08)";
      banner.style.color = "#065f46";
      statusIcon.textContent = "✅";
      retryBtn.style.display = "none";
      if (activateFlaskLink) activateFlaskLink.style.display = "none";
    }

    if (state === "down") {
      banner.style.background = "#3b261d";
      banner.style.color = "#ffcc9c";
      statusIcon.textContent = "⚠️";
      retryBtn.style.display = "inline-block";
      if (activateFlaskLink) activateFlaskLink.style.display = "inline-flex";
    }
  }

  function fetchWithTimeout(url, ms = 2000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    return fetch(url, { cache: "no-store", signal: controller.signal })
      .finally(() => clearTimeout(t));
  }

  async function checkFlask() {
    try {
      const res = await fetchWithTimeout(HEALTH_URL, 2000);
      if (res.ok) {
        setBannerState("up", `Connected to Flask on port ${FLASK_PORT}`);
      } else {
        setBannerState("down", `Flask responded but is not healthy (HTTP ${res.status}) on port ${FLASK_PORT}`);
      }
    } catch (e) {
      setBannerState("down", `Flask Server is not running on port ${FLASK_PORT}`);
    }
  }

  if (retryBtn) retryBtn.addEventListener("click", checkFlask);
  checkFlask();

  const defaultYamlObj = {
    folder: "naics6-bees-counties",
    features: {
      data: "industries",
      common: "Fips",
      path: "https://raw.githubusercontent.com/ModelEarth/community-timelines/main/training/naics6/US/counties/2020/US-ME-training-naics6-counties-2020.csv"
    },
    targets: {
      data: "bees",
      path: "https://raw.githubusercontent.com/ModelEarth/bee-data/main/targets/bees-targets-top-20-percent.csv"
    },
    models: "xgboost"
  };

  function deepMerge(target, source) {
    for (const key in source) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        target[key] = target[key] || {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  function expandHashObject(hash) {
    const expanded = {};
    Object.keys(hash || {}).forEach((key) => {
      if (key === 'gonext') return;
      const parts = key.split('.');
      let current = expanded;
      parts.forEach((part, i) => {
        if (i === parts.length - 1) {
          current[part] = hash[key];
        } else {
          current[part] = current[part] || {};
          current = current[part];
        }
      });
    });
    return expanded;
  }

  function parseAndRenderFromHash() {
    const hash = typeof getHash === 'function' ? getHash() : {};
    const expanded = expandHashObject(hash);
    const hasHashOverrides = Object.keys(hash).some(key => key !== 'gonext');
    const mergedYamlObj = hasHashOverrides
      ? deepMerge(JSON.parse(JSON.stringify(defaultYamlObj)), expanded)
      : defaultYamlObj;

    const yamlString = jsyaml.dump(mergedYamlObj, { lineWidth: -1, flowLevel: -1 });
    yamlInput.textContent = yamlString;
    paramTextDiv.innerText = yamlString;
    renderSelectionsFromYaml();
  }

  parseAndRenderFromHash();
  document.addEventListener('hashChangeEvent', parseAndRenderFromHash);
  window.addEventListener("hashchange", parseAndRenderFromHash);

  loadBaseParamsSelect();
  if (typeof window.rsRefreshFromYaml !== 'function') {
    window.rsRefreshFromYaml = renderSelectionsFromYaml;
  }
  renderSelectionsFromYaml();

  const preTag = document.querySelector('#paramText pre');
  if (preTag) {
    const observer = new MutationObserver(() => {
      renderSelectionsFromYaml();
    });
    observer.observe(preTag, { childList: true, subtree: true, characterData: true });
  }

  if (stepsToggle) {
    stepsToggle.addEventListener('change', () => {
      if (stepsToggle.checked) {
        if (stepsLoading) stepsLoading.style.display = 'block';
        fetch('/list-notebook-steps')
          .then(res => res.json())
          .then(data => {
            const availableSteps = data.steps || [];
            stepsContainer.innerHTML = '';
            availableSteps.forEach(step => {
              const label = document.createElement('label');
              label.innerHTML = `<input type="checkbox" value="${step}"> ${step}`;
              stepsContainer.appendChild(label);
            });
            stepsContainer.style.display = 'block';
          })
          .catch(() => {
            stepsContainer.innerHTML = '<p style="color:red;">Failed to load steps</p>';
            stepsContainer.style.display = 'block';
          })
          .finally(() => {
            if (stepsLoading) stepsLoading.style.display = 'none';
          });
      } else {
        stepsContainer.style.display = 'none';
        stepsContainer.innerHTML = '';
        if (stepsLoading) stepsLoading.style.display = 'none';
      }
    });
  }

  runButton.addEventListener('click', () => {
    status.style.display = 'none';
    runButton.disabled = true;
    runButton.textContent = 'Processing...';

    let finalParams = {};
    try {
      const yamlContent = yamlInput.textContent || yamlInput.innerText || '';
      finalParams = jsyaml.load(yamlContent.trim());
    } catch (e) {
      status.className = 'error';
      status.style.display = 'block';
      status.textContent = 'Invalid YAML: ' + e.message;
      runButton.disabled = false;
      runButton.textContent = 'Run Notebook';
      return;
    }

    if (stepsToggle && stepsToggle.checked) {
      const selectedSteps = [...stepsContainer.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
      if (selectedSteps.length > 0) finalParams.steps = selectedSteps;
    }

    displayParams(finalParams);

    fetch('/run-notebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: finalParams })
    })
    .then(response => response.json())
    .then(data => {
      runButton.disabled = false;
      runButton.textContent = 'Run Notebook';
      status.style.display = 'block';

      if (data.status === 'success') {
        status.className = 'success';

        fetch('/get-config')
          .then(res => res.json())
          .then(config => {
            if (config.status === 'success' && config.config.github?.target_repo) {
              status.innerHTML = 'Notebook executed successfully!<br><a href="' + config.config.github.target_repo + '" target="_blank" style="color: #155724; font-weight: bold;">View results in GitHub →</a>';
            } else {
              status.textContent = 'Notebook executed successfully!';
            }

            const hash = typeof getHash === 'function' ? getHash() : {};
            const gonext = hash.gonext;
            if (gonext) {
              const redirectMsg = document.createElement('div');
              redirectMsg.style.marginTop = '10px';
              redirectMsg.style.color = '#155724';
              redirectMsg.innerHTML = 'Redirecting...';
              status.appendChild(redirectMsg);
              setTimeout(() => { window.location.href = gonext; }, 2000);
            }
          })
          .catch(() => {
            status.textContent = 'Notebook executed successfully!';
          });
      } else {
        status.className = 'error';
        status.textContent = 'Error: ' + data.message;
      }
    })
    .catch(error => {
      runButton.disabled = false;
      runButton.textContent = 'Run Notebook';
      status.className = 'error';
      status.style.display = 'block';
      status.textContent = 'Request failed: ' + error.message;
    });
  });

  function renderSelectionsFromYaml() {
    const featuresList = document.getElementById('rsFeaturesList');
    const targetList = document.getElementById('rsTargetList');
    const featuresEmpty = document.getElementById('rsFeaturesEmpty');
    const targetEmpty = document.getElementById('rsTargetEmpty');
    const joinStatus = document.getElementById('rsJoinStatus');
    if (!featuresList || !targetList || !featuresEmpty || !targetEmpty) return;

    let yamlObj = {};
    try {
      const yamlContent = yamlInput.textContent || yamlInput.innerText || '';
      yamlObj = jsyaml.load(yamlContent.trim()) || {};
    } catch (e) {
      return;
    }

    const features = yamlObj.features || {};
    const targets = yamlObj.targets || {};

    const parseCsv = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(x => String(x).trim()).filter(Boolean);
      return String(val).split(',').map(s => s.trim()).filter(Boolean);
    };

    const featureItems = parseCsv(features.dcid || features.data);
    const targetItems = parseCsv(targets.dcid || targets.data);

    featuresList.innerHTML = '';
    targetList.innerHTML = '';

    const createCard = (label, role) => {
      if (!window.rsCreateRowCard) return null;
      const roleLabel = role === 'features' ? 'Features' : 'Targets';
      return window.rsCreateRowCard({
        item: { label, dcid: label },
        role,
        roleLabel,
        onAdd: () => {
          if (window.rsOpenAddPopupWithRole) {
            window.rsOpenAddPopupWithRole(role);
          }
        },
        onRemove: () => {},
        onPreviewInline: () => {}
      });
    };

    featureItems.forEach((label) => {
      const card = createCard(label, 'features');
      if (!card) return;
      featuresList.appendChild(card);
      if (card._rsAttachMenu) {
        card._rsAttachMenu();
      }
    });

    targetItems.forEach((label) => {
      const card = createCard(label, 'target');
      if (!card) return;
      targetList.appendChild(card);
      if (card._rsAttachMenu) {
        card._rsAttachMenu();
      }
    });

    featuresEmpty.style.display = featureItems.length ? 'none' : 'block';
    targetEmpty.style.display = targetItems.length ? 'none' : 'block';

    if (joinStatus) {
      const common = (features.common || '').toString().trim();
      const scope = (features.scope || yamlObj.scope || '').toString().trim();
      if (common || scope) {
        const scopeLabel = scope || 'country';
        const commonLabel = common || 'FIPS';
        joinStatus.textContent = `Joining on: ${scopeLabel} using common ${commonLabel}`;
        joinStatus.style.display = 'block';
      } else {
        joinStatus.style.display = 'none';
      }
    }
  }
}

// Function to convert YAML to URL parameters
function yamlToUrlParams(yamlStr) {
    // Simple YAML parser for this specific format
    const lines = yamlStr.split('\n');
    const paramsYaml = {};
    let currentKey = null;

    for (const line of lines) {
        if (line.trim() === '' || line.trim().startsWith('#')) continue;

        const indent = line.search(/\S|$/);
        const colonIndex = line.indexOf(':');

        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            let value = line.substring(colonIndex + 1).trim();

            if (indent === 0) {
                // Top level key
                currentKey = key;
                if (value) {
                    paramsYaml[key] = value;
                } else {
                    paramsYaml[key] = {};
                }
            } else if (indent > 0 && currentKey) {
                // Sub-key - ensure we have an object to add to
                if (typeof paramsYaml[currentKey] !== 'object' || Array.isArray(paramsYaml[currentKey])) {
                    paramsYaml[currentKey] = {};
                }

                if (value) {
                    paramsYaml[currentKey][key] = value;
                } else {
                    paramsYaml[currentKey][key] = {};
                }
            }
        } else if (line.trim().startsWith('-')) {
            // Handle array items
            const value = line.trim().substring(1).trim();

            if (!Array.isArray(paramsYaml[currentKey])) {
                paramsYaml[currentKey] = [];
            }
            paramsYaml[currentKey].push(value);
        }
    }

    // Convert to URL hash format with proper nesting and URL encoding
    const hashParams = [];

    function addParams(obj, prefix = '') {
        for (const [key, value] of Object.entries(obj)) {
            const paramKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'string') {
                hashParams.push(`${paramKey}=${encodeURIComponent(value)}`);
            } else if (Array.isArray(value)) {
                // OLD (encodes commas):
                //hashParams.push(`${paramKey}=${encodeURIComponent(value.join(','))}`);

                // NEW (preserves commas):
                const joinedValues = value.map(v => encodeURIComponent(v)).join(',');
                hashParams.push(`${paramKey}=${joinedValues}`);

            } else if (typeof value === 'object' && value !== null) {
                // Recursively handle nested objects
                addParams(value, paramKey);
            }
        }
    }

    addParams(paramsYaml);

    const result = hashParams.join('&');
    console.log("Generated URL parameters:", result);
    return result;
}

// Global variable to store cached parambase YAML content

// Function to create choose links after parambase dropdown
function createChooseLinks() {
    // Check if choose links already exist
    if (document.getElementById('chooseLinks')) {
        return;
    }
    
    // Create choose links div
    const chooseDiv = document.createElement('div');
    chooseDiv.id = 'chooseLinks';
    chooseDiv.style.marginTop = '10px';
    chooseDiv.innerHTML = `
        Choose:
        
        <a href="#" onclick="goToPage('/realitystream/models'); return false;">models</a> | 
        <a href="#geoview=country">location</a> 
        <div class="local" style="display:none">
            | <a href="#" onclick="goToPage('/localsite/info'); return false;">features</a> |
            <a href="#" onclick="goToPage('/localsite/timeline'); return false;">targets</a>
        </div>
        <span style="font-style: italic; font-size: 0.9em;"> (Location selector not yet integrated.)</span>
    `;
    
    // Insert after the parambase select
    const parambaseSelect = document.getElementById('parambase');
    parambaseSelect.parentNode.insertBefore(chooseDiv, parambaseSelect.nextSibling);
}

// Function to load base parameter selector dropdown
async function loadBaseParamsSelect() {
    console.log('loadBaseParamsSelect() called');
    
    // Insert dropdown before the paramText div
    const paramTextDiv = document.getElementById('paramText');
    console.log('paramText div found:', !!paramTextDiv);
    

    // Fetch parameter paths CSV
    console.log('Fetching CSV from /realitystream/parameters/parameter-paths.csv');
    const response = await fetch('/realitystream/parameters/parameter-paths.csv', { cache: 'no-store' });
    console.log('CSV fetch response status:', response.status);

    if (!response.ok) {
        throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
    }

    let csvText = await response.text();
    // Strip UTF-8 BOM if present
    csvText = csvText.replace(/^\uFEFF/, '');
    console.debug('[parambase] CSV loaded (no-store), length:', csvText.length);
    console.log('CSV first 100 chars:', csvText.substring(0, 100));
    
    // Parse CSV
    const lines = csvText.split('\n').filter(line => line.trim());
    console.log('CSV lines found:', lines.length);
    const paramOptions = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            // Handle potential BOM and parse CSV line
            const cleanLine = line.replace(/^\uFEFF/, ''); // Remove BOM
            const [key, url] = cleanLine.split(',');
            if (key && url) {
                paramOptions.push({ key: key.trim(), url: url.trim() });
            }
        }
    }

    // Populate dropdown
    const select = document.getElementById('parambase');
    console.log('Parambase select element found:', !!select);
    
    if (!select) {
        console.error('Could not find parambase select element');
        return;
    }
    
    select.innerHTML = '<option value="">Select parameter base...</option>';
    
    console.log('Populating dropdown with', paramOptions.length, 'options');
    paramOptions.forEach(option => {
        console.log('Adding option:', option.key);
        const optionEl = document.createElement('option');
        optionEl.value = option.key;
        optionEl.textContent = option.key;
        optionEl.dataset.url = option.url;
        select.appendChild(optionEl);
    });
    
    // Add "Custom Path..." option at the end
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Custom Path...';
    select.appendChild(customOption);

    // Create the choose links after the dropdown
    createChooseLinks();

    // Set up event listener for dropdown changes
    select.addEventListener('change', async function() {
        const selectedKey = this.value;
        if (selectedKey === 'custom') {
            // Show custom path input
            showCustomPathInput();
            // Set parambase=custom in hash
            const currentHash = getHash();
            delete currentHash.customYamlUrl; // Remove any existing custom URL
            currentHash.parambase = 'custom';
            // Update hash to trigger hash change event
            goHash(currentHash);
        } else if (selectedKey) {
            // Remove customYamlUrl from hash when switching away from custom
            const currentHash = getHash();
            delete currentHash.customYamlUrl;
            // Update URL hash with parambase value
            currentHash.parambase = selectedKey;
            // Update hash to trigger hash change event
            goHash(currentHash);
            // Load the selected YAML
            await loadParambaseYAML(selectedKey, this.selectedOptions[0].dataset.url);
        } else {
            // Remove both custom and parambase from hash
            const currentHash = getHash();
            delete currentHash.customYamlUrl;
            delete currentHash.parambase;
            // Update hash to trigger hash change event
            goHash(currentHash);
        }
    });

    // Check if there's already a parambase in the URL hash
    const hash = getHash();
    
    // Filter out script loading parameters (but don't exit if they exist)
    filterScriptParamsFromHash(hash, 'Initial load');
    
    if (hash.customYamlUrl) {
        // Custom URL in hash - set dropdown to custom and show custom input
        select.value = 'custom';
        showCustomPathInput();
        // Load the custom URL
        try {
            const customUrl = decodeHashValue(hash.customYamlUrl);
            document.getElementById('customYamlUrl').value = customUrl;
            const response = await fetch(customUrl);
            const yamlText = await response.text();
            updateParamTextWithBase(yamlText);
            // Set button text to "Loaded" since we successfully loaded from hash
            const loadButton = document.getElementById('loadCustomYamlButton');
            if (loadButton) {
                loadButton.textContent = 'Loaded';
            }
        } catch (error) {
            console.error('Error loading custom YAML from hash:', error);
        }
    } else if (hash.parambase) {
        // Decode hash value using shared function
        const decodedParambase = decodeHashValue(hash.parambase);
        
        if (decodedParambase === 'custom') {
            // Set dropdown to custom and show custom input
            select.value = 'custom';
            showCustomPathInput();
        } else {
            // Set dropdown to the decoded hash value
            console.log('Trying to set dropdown to:', decodedParambase);
            console.log('Available options:', Array.from(select.options).map(opt => opt.value));
            select.value = decodedParambase;
            // Find the selected option by value (compare with decoded value)
            const selectedOption = Array.from(select.options).find(option => option.value === decodedParambase);
            console.log('Found matching option:', selectedOption);
            if (selectedOption && selectedOption.dataset && selectedOption.dataset.url) {
                await loadParambaseYAML(decodedParambase, selectedOption.dataset.url);
            } else {
                console.warn('No matching option found for parambase:', decodedParambase);
            }
        }
    } else {
        // Load first option by default if no parambase in hash
        if (paramOptions.length > 0) {
            const firstOption = paramOptions[0];
            select.value = firstOption.key;
            updateHashParam('parambase', firstOption.key);
            await loadParambaseYAML(firstOption.key, firstOption.url);
        }
    }

    // Ensure UI elements are created after dropdown is populated
    ensureParambaseUI();
}

// Function to load YAML content from parambase URL
async function loadParambaseYAML(key, url) {
    try {
        // Don't reload if it's the same parambase
        if (currentParambase === key && cachedParambaseContent[key]) {
            return;
        }

        // Fetch YAML content
        const response = await fetch(url);
        const yamlText = await response.text();
        
        // Cache the content
        cachedParambaseContent[key] = yamlText;
        currentParambase = key;
        
        // Update the paramText div with new base YAML
        updateParamTextWithBase(yamlText);
        if (typeof window.rsRefreshFromYaml === 'function') {
          window.rsRefreshFromYaml();
        }
        
    } catch (error) {
        console.error('Error loading parambase YAML:', error);
    }
}

// Function to update paramText div with base YAML and apply hash overrides
function updateParamTextWithBase(baseYamlText) {
    const paramTextDiv = document.getElementById('paramText');
    const preTag = paramTextDiv.querySelector('pre');
    
    if (preTag) {
        // Set base YAML content
        preTag.innerHTML = baseYamlText;
        
        // Apply hash overrides
        const hash = getHash();
        const modelHashParams = ["features", "targets", "models"];
        const addHashKeys = ["folder","features", "targets", "models"];
        
        let parsedContent = parseYAML(baseYamlText);
        parsedContent = updateYAMLFromHash(parsedContent, hash, addHashKeys);
        const updatedYaml = convertToYAML(parsedContent);
        
        preTag.innerHTML = updatedYaml;
        
        // Update reset button visibility after content changes
        updateResetButtonVisibility();
    }
}

// Helper function to encode only necessary characters in hash values
function encodeHashValue(value) {
    return String(value)
        .replace(/ /g, '%20')   // Space to %20
        .replace(/&/g, '%26')   // Ampersand to %26
        .replace(/=/g, '%3D');  // Equals to %3D
}

// Helper function to decode hash values
function decodeHashValue(value) {
    if (!value) return value;
    return decodeURIComponent(String(value)
        .replace(/\+/g, ' '));  // + to space (URL encoding), then decode URI components
}

// Function to show custom path input
function showCustomPathInput() {
    // Check if custom path div already exists
    let customDiv = document.getElementById('customPathDiv');
    if (customDiv) {
        customDiv.style.display = 'block';
        return;
    }
    
    // Create custom path input div
    customDiv = document.createElement('div');
    customDiv.id = 'customPathDiv';
    customDiv.style.marginTop = '10px';
    customDiv.innerHTML = `
        <p><strong>Load YAML from custom URL:</strong></p>
        <div style="display: flex; gap: 10px; align-items: center; margin-top: 8px; margin-bottom: 12px;">
            <input type="url" id="customYamlUrl" placeholder="Paste URL to parameters.yaml" 
                   style="flex: 1; padding:10px; font-size:14px;"
                   value="https://raw.githubusercontent.com/ModelEarth/RealityStream/main/parameters/parameters.yaml">
            <button id="loadCustomYamlButton" style="padding: 10px 16px; font-size: 14px; white-space: nowrap;">Load it</button>
        </div>
    `;
    
    // Insert after the parambase select (or after choose links if they exist)
    const parambaseSelect = document.getElementById('parambase');
    const chooseLinks = document.getElementById('chooseLinks');
    const insertAfter = chooseLinks || parambaseSelect;
    insertAfter.parentNode.insertBefore(customDiv, insertAfter.nextSibling);
    
    // Set up event listener for the load button
    const loadButton = document.getElementById('loadCustomYamlButton');
    const urlInput = document.getElementById('customYamlUrl');
    
    loadButton.addEventListener('click', async function() {
        const customUrl = urlInput.value.trim();
        if (customUrl) {
            try {
                // Load YAML from custom URL
                const response = await fetch(customUrl);
                const yamlText = await response.text();
                
                // Update the paramText div with custom YAML
                updateParamTextWithBase(yamlText);
                
                // Update hash to reflect custom URL
                updateHashParam('customYamlUrl', customUrl);
                
                // Change button text to "Loaded"
                loadButton.textContent = 'Loaded';
                
                console.log('Loaded custom YAML from:', customUrl);
            } catch (error) {
                console.error('Error loading custom YAML:', error);
                alert('Failed to load YAML from custom URL: ' + error.message);
            }
        }
    });
    
    // Set up event listener for URL input changes
    urlInput.addEventListener('input', function() {
        // Change button text back to "Load it" when URL is edited
        loadButton.textContent = 'Load it';
    });
}

// Function to hide custom path input
function hideCustomPathInput() {
    const customDiv = document.getElementById('customPathDiv');
    if (customDiv) {
        customDiv.style.display = 'none';
    }
}

// Helper function to filter out script loading parameters that don't belong in hash
function filterScriptParamsFromHash(hash, context = 'unknown') {
    if (hash.showheader || hash.showsearch) {
        console.log(`⚠️ ${context}: Detected script loading parameters in hash (these should be query params, not hash params):`, {
            showheader: hash.showheader,
            showsearch: hash.showsearch,
            fullHash: {...hash}
        });
        delete hash.showheader;
        delete hash.showsearch;
        return true; // Indicates filtering occurred
    }
    return false; // No filtering needed
}

// Helper function to update a single hash parameter
function updateHashParam(key, value) {
    const hash = getHash();
    hash[key] = value;
    
    // Filter out incorrect parameters
    filterScriptParamsFromHash(hash, 'updateHashParam');
    
    // Use existing goHash function from localsite.js
    goHash(hash);
}

// Helper function to get the parambase select element (supports both #parambase and #parambase-select)
function getParambaseSelect() {
    return document.getElementById('parambase') || document.getElementById('parambase-select');
}

// Helper function to ensure parambase UI elements exist (idempotent)
function ensureParambaseUI() {
    const selectEl = getParambaseSelect();
    if (!selectEl) {
        console.warn('ensureParambaseUI: No parambase select element found');
        return;
    }

    // Check if wrapper row already exists
    let wrapperRow = document.getElementById('parambase-row');
    if (wrapperRow) {
        // Already exists, just update the YAML link
        updateYamlLink(selectEl);
        return;
    }

    // Create wrapper row
    wrapperRow = document.createElement('div');
    wrapperRow.id = 'parambase-row';
    wrapperRow.style.display = 'flex';
    wrapperRow.style.alignItems = 'center';
    wrapperRow.style.gap = '6px';
    wrapperRow.style.marginBottom = '10px';

    // Create label
    const label = document.createElement('label');
    label.id = 'parambase-label';
    label.textContent = 'Base parameters:';
    label.style.fontSize = '14px';
    label.style.marginRight = '8px';
    label.style.marginBottom = '0';


    // Create Base YAML link
    const yamlLink = document.createElement('a');
    yamlLink.id = 'parambase-yaml';
    yamlLink.target = '_blank';
    yamlLink.rel = 'noopener';
    yamlLink.textContent = 'Base YAML';
    yamlLink.style.fontSize = '12px';
    yamlLink.style.marginLeft = '6px';
    yamlLink.style.textDecoration = 'none';
    yamlLink.style.color = 'inherit';


    // Create Reset button (initially hidden)
    const resetButton = document.createElement('button');
    resetButton.id = 'parambase-reset';
    resetButton.type = 'button';
    resetButton.textContent = 'Reset';
    resetButton.className = 'btn btn-white btn-sm';
    resetButton.title = 'Clear URL parameters and reload base YAML';
    resetButton.style.fontSize = '12px';
    resetButton.style.marginLeft = '6px';
    resetButton.style.padding = '2px 6px';
    resetButton.style.whiteSpace = 'nowrap';
    resetButton.style.display = 'none'; // Initially hidden

    // Insert elements in correct order: label, select, yaml link, reset button
    const parent = selectEl.parentNode;
    parent.insertBefore(wrapperRow, selectEl);

    // Add label to wrapper
    wrapperRow.appendChild(label);

    // Move select into wrapper
    wrapperRow.appendChild(selectEl);

    // Add yaml link and reset button to wrapper
    wrapperRow.appendChild(yamlLink);
    wrapperRow.appendChild(resetButton);


    // Set up reset button handler
    resetButton.addEventListener('click', function() {
        console.info('[parambase] Reset: retaining current parambase, clearing other hash values');

        // Get currently selected parambase
        const currentParambase = selectEl.value;
        
        // Clear localStorage keys
        localStorage.removeItem('parambase/value');
        localStorage.removeItem('parambase/url');

        // Create new URL with only parambase in hash (if one is selected)
        const newHashString = currentParambase ? `parambase=${encodeURIComponent(currentParambase)}` : '';
        const newUrl = window.location.pathname + window.location.search + (newHashString ? '#' + newHashString : '');
        
        // Update URL directly without using goHash
        window.history.pushState('', '', newUrl);
        
        // Directly reload the YAML content immediately
        if (currentParambase && cachedParambaseContent[currentParambase]) {
            // Use the cached base YAML for the current parambase
            updateParamTextWithBase(cachedParambaseContent[currentParambase]);
        } else {
            // Fall back to loading from current state
            loadParamTextFromCurrentState();
        }
        
        // Also trigger custom hash change event for any other listeners
        const hashChangeEvent = new CustomEvent('hashChangeEvent', { detail: { parambase: currentParambase } });
        document.dispatchEvent(hashChangeEvent);
    });

    // Update YAML link and reset button visibility initially
    updateYamlLink(selectEl);
    updateResetButtonVisibility();

    // Add change listener for YAML link updates (only if not already present)
    if (!selectEl.hasAttribute('data-yaml-listener-added')) {
        selectEl.addEventListener('change', function() {
            updateYamlLink(this);
            updateResetButtonVisibility();
        });
        selectEl.setAttribute('data-yaml-listener-added', 'true');
    }
}

// Helper function to update the YAML link href
function updateYamlLink(selectEl) {
    const yamlLink = document.getElementById('parambase-yaml');
    if (!yamlLink) return;

    const selectedOption = selectEl.selectedOptions[0];
    if (selectedOption && selectedOption.dataset && selectedOption.dataset.url) {
        yamlLink.href = selectedOption.dataset.url;
    } else {
        yamlLink.href = '';
    }
}

// Helper function to check if current YAML differs from base and show/hide reset button
function updateResetButtonVisibility() {
    const resetButton = document.getElementById('parambase-reset');
    if (!resetButton) return;

    // Check if there are any hash parameters that would modify the YAML content
    const hash = getHash();
    const modelHashParams = ["folder","features", "targets", "models"];
    
    // Check if any model parameters exist in the hash
    const hasYamlOverrides = modelHashParams.some(param => {
        if (hash[param]) return true;
        // Check for nested parameters like features.data, targets.path, etc.
        return Object.keys(hash).some(key => key.startsWith(param + '.'));
    });

    // Show reset button only if there are YAML overrides from URL hash
    resetButton.style.display = hasYamlOverrides ? 'inline-block' : 'none';
}

// Function to setup edit detection for paramText
function setupParamTextEditDetection() {
    let editTimeout;
    let baseYamlContent = null;
    
    // Function to handle paramText changes
    function handleParamTextEdit() {
        console.log('handleParamTextEdit called');
        const paramTextDiv = document.getElementById('paramText');
        if (!paramTextDiv) {
            console.log('No paramTextDiv found');
            return;
        }
        
        const preTag = paramTextDiv.querySelector('pre');
        if (!preTag) {
            console.log('No preTag found');
            return;
        }
        
        // Get current content
        const currentContent = preTag.textContent || preTag.innerText;
        console.log('Current content:', currentContent.substring(0, 100) + '...');
        
        // Skip if we don't have base content to compare against
        if (!baseYamlContent || !currentParambase) {
            console.log('Missing base content or currentParambase:', { 
                hasBase: !!baseYamlContent, 
                currentParambase: currentParambase 
            });
            return;
        }
        
        console.log('Base content:', baseYamlContent.substring(0, 100) + '...');
        
        try {
            // Parse both base and current YAML
            const baseYaml = parseYAML(baseYamlContent);
            const currentYaml = parseYAML(currentContent);
            
            console.log('Parsed YAMLs:', { baseYaml, currentYaml });
            
            // Find differences and update hash
            const differences = findYamlDifferences(baseYaml, currentYaml);
            console.log('Found differences:', differences);
            
            if (Object.keys(differences).length > 0) {
                console.log('Updating hash with differences:', differences);
                // Update hash with differences
                updateHash(differences, true); // true = add to existing hash
                // Reveal reset button
                updateResetButtonVisibility();
            } else {
                console.log('No differences found, removing model parameters');
                // No differences, remove model parameters from hash
                const hash = getHash();
                const modelHashParams = ["folder","features", "targets", "models"];
                const toRemove = {};
                
                // Remove all model-related parameters
                modelHashParams.forEach(param => {
                    if (hash[param]) toRemove[param] = '';
                    // Also remove nested parameters
                    Object.keys(hash).forEach(key => {
                        if (key.startsWith(param + '.')) {
                            toRemove[key] = '';
                        }
                    });
                });
                
                if (Object.keys(toRemove).length > 0) {
                    updateHash(toRemove, true);
                }
                updateResetButtonVisibility();
            }
        } catch (error) {
            console.warn('Error parsing YAML during edit detection:', error);
        }
    }
    
    // Function to store base YAML content
    function storeBaseYamlContent() {
        if (currentParambase && cachedParambaseContent[currentParambase]) {
            baseYamlContent = cachedParambaseContent[currentParambase];
        }
    }
    
    // Set up mutation observer for contenteditable changes
    const paramTextDiv = document.getElementById('paramText');
    console.log('setupParamTextEditDetection: paramTextDiv found:', !!paramTextDiv);
    console.log('setupParamTextEditDetection: paramTextDiv contentEditable:', paramTextDiv ? paramTextDiv.contentEditable : 'N/A');
    
    if (paramTextDiv) {
        const preTag = paramTextDiv.querySelector('pre');
        console.log('setupParamTextEditDetection: preTag found:', !!preTag);
        
        // Store initial base content
        storeBaseYamlContent();
        
        // Listen for input events on the contenteditable div (not the pre tag)
        paramTextDiv.addEventListener('input', function(event) {
            console.log('Input event detected on paramTextDiv:', event);
            clearTimeout(editTimeout);
            editTimeout = setTimeout(handleParamTextEdit, 500); // Debounce 500ms
        });
        
        // Also listen for keyup events as backup
        paramTextDiv.addEventListener('keyup', function(event) {
            console.log('Keyup event detected on paramTextDiv:', event.key);
            clearTimeout(editTimeout);
            editTimeout = setTimeout(handleParamTextEdit, 500); // Debounce 500ms
        });
        
        console.log('setupParamTextEditDetection: Event listeners attached to paramTextDiv');
        
        // Listen for when base content changes
        if (preTag) {
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.type === 'childList' || mutation.type === 'characterData') {
                        // Update base content when YAML is loaded
                        setTimeout(storeBaseYamlContent, 100);
                    }
                });
            });
            
            observer.observe(preTag, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }
    } else {
        console.log('setupParamTextEditDetection: No paramTextDiv found, will retry in 1000ms');
        // Retry setup after 1 second if elements aren't ready yet
        setTimeout(setupParamTextEditDetection, 1000);
    }
}

// Helper function to determine if a change is meaningful (not just whitespace or trivial punctuation)
function isMeaningfulChange(baseValue, currentValue) {
    // Convert to strings for comparison
    const baseStr = String(baseValue || '').trim();
    const currentStr = String(currentValue || '').trim();
    
    // If strings are the same after trimming, not meaningful
    if (baseStr === currentStr) return false;
    
    // Check if the only difference is trailing punctuation (comma, semicolon, etc.)
    const baseTrimmed = baseStr.replace(/[,;:\s]+$/, '');
    const currentTrimmed = currentStr.replace(/[,;:\s]+$/, '');
    
    // If the content is the same after removing trailing punctuation, not meaningful
    if (baseTrimmed === currentTrimmed) return false;
    
    // Check if the only difference is leading/trailing whitespace or punctuation
    const baseNormalized = baseStr.replace(/^[\s,;:]+|[\s,;:]+$/g, '');
    const currentNormalized = currentStr.replace(/^[\s,;:]+|[\s,;:]+$/g, '');
    
    if (baseNormalized === currentNormalized) return false;
    
    // If we get here, it's a meaningful change
    return true;
}

// Function to find differences between base and current YAML
function findYamlDifferences(baseYaml, currentYaml) {
    const differences = {};
    const modelHashParams = ["folder","features", "targets", "models"];
    
    // Helper function to flatten nested objects for comparison
    function flattenObject(obj, prefix = '') {
        const flattened = {};
        Object.keys(obj || {}).forEach(key => {
            const newKey = prefix ? `${prefix}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                Object.assign(flattened, flattenObject(obj[key], newKey));
            } else {
                // Don't flatten arrays - treat them as complete values
                flattened[newKey] = obj[key];
            }
        });
        return flattened;
    }
    
    // Only compare model-related parameters
    modelHashParams.forEach(param => {
        if (currentYaml[param] || baseYaml[param]) {
            const baseValue = baseYaml[param];
            const currentValue = currentYaml[param];
            
            console.log(`Comparing ${param}:`, { baseValue, currentValue });
            
            // For top-level parameters, compare directly without flattening
            if (JSON.stringify(baseValue) !== JSON.stringify(currentValue)) {
                if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
                    // Check if this is a meaningful change (not just whitespace or punctuation)
                    if (isMeaningfulChange(baseValue, currentValue)) {
                        console.log(`Found meaningful difference in ${param}:`, currentValue);
                        differences[param] = currentValue;
                    } else {
                        console.log(`Ignoring trivial change in ${param}:`, { base: baseValue, current: currentValue });
                    }
                }
            }
            
            // If the parameter is an object, also check nested properties
            if (typeof currentValue === 'object' && currentValue !== null && !Array.isArray(currentValue)) {
                const baseFlat = flattenObject(baseValue || {}, param);
                const currentFlat = flattenObject(currentValue || {}, param);
                
                // Find differences in nested properties
                Object.keys({...baseFlat, ...currentFlat}).forEach(key => {
                    // Skip the top-level key we already handled
                    if (key === param) return;
                    
                    const baseNestedValue = baseFlat[key];
                    const currentNestedValue = currentFlat[key];
                    
                    if (JSON.stringify(baseNestedValue) !== JSON.stringify(currentNestedValue)) {
                        if (currentNestedValue !== undefined && currentNestedValue !== null && currentNestedValue !== '') {
                            // Check if this is a meaningful change for nested properties too
                            if (isMeaningfulChange(baseNestedValue, currentNestedValue)) {
                                console.log(`Found meaningful nested difference in ${key}:`, currentNestedValue);
                                differences[key] = currentNestedValue;
                            } else {
                                console.log(`Ignoring trivial nested change in ${key}:`, { base: baseNestedValue, current: currentNestedValue });
                            }
                        }
                    }
                });
            }
        }
    });
    
    return differences;
}

// Helper functions for YAML parsing (moved from anonymous functions)
function parseYAML(yamlString) {
    yamlString = yamlString.replace(/<b>|<\/b>/g, '');
    return jsyaml.load(yamlString);
}

function convertToYAML(obj) {
    return jsyaml.dump(obj, {
        lineWidth: -1,
        noCompatMode: true
    });
}

// Get model parameters from textbox and pass forward in hash.
function goToPage(whatPage) { // Used by RealityStream/index.html
    // Get current hash parameters
    const currentHash = getHash();
    
    // Get YAML content and convert to URL parameters
    const yamlContent = parseYamlContent();
    const yamlParams = yamlToUrlParams(yamlContent);
    
    // Parse YAML params into object for merging
    const yamlParamsObj = {};
    if (yamlParams) {
        yamlParams.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key) yamlParamsObj[key] = decodeURIComponent(value || '');
        });
    }
    
    // Merge current hash with YAML params (YAML params take priority)
    const mergedParams = { ...currentHash, ...yamlParamsObj };
    
    // Rebuild hash string with encoded values
    const hashParts = [];
    for (const [key, value] of Object.entries(mergedParams)) {
        if (value !== undefined && value !== null && value !== '') {
            const encodedValue = encodeHashValue(value);
            hashParts.push(`${key}=${encodedValue}`);
        }
    }
    
    const finalHash = hashParts.join('&');
    window.location.href = whatPage + "#" + finalHash;
}
