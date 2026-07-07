// Import Mermaid from CDN
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

// Initialize Mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  flowchart: {
    useWidth: false,
    htmlLabels: true
  }
});

// App State
const state = {
  apiKey: localStorage.getItem('api_key') || '',
  autoRefresh: true,
  refreshInterval: 5,
  layoutDirection: 'TD',
  excludeStopped: false,
  hideInternalPorts: false,
  hideLoopback: true,
  hideVeth: true,
  hideBridge: true,
  excludeNetworks: new Set(),
  zoom: 1.0,
  panX: 0,
  panY: 0,
  lastMermaidCode: '',
  isDragging: false,
  startX: 0,
  startY: 0,
  refreshTimer: null,
  isFirstLoad: true
};

// DOM Elements
const elements = {
  appTitle: document.getElementById('app-title'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  autoRefresh: document.getElementById('auto-refresh'),
  refreshInterval: document.getElementById('refresh-interval'),
  intervalVal: document.getElementById('interval-val'),
  layoutDirection: document.getElementById('layout-direction'),
  filterStopped: document.getElementById('filter-stopped'),
  filterInternal: document.getElementById('filter-internal'),
  filterLoopback: document.getElementById('filter-loopback'),
  filterVeth: document.getElementById('filter-veth'),
  filterBridge: document.getElementById('filter-bridge'),
  networksList: document.getElementById('networks-list'),
  refreshBtn: document.getElementById('refresh-btn'),
  viewCodeBtn: document.getElementById('view-code-btn'),
  apiKeyBtn: document.getElementById('api-key-btn'),
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomReset: document.getElementById('zoom-reset'),
  diagramContainer: document.getElementById('diagram-container'),
  diagramWrapper: document.getElementById('diagram-wrapper'),
  loading: document.getElementById('loading'),
  sidebar: document.getElementById('sidebar'),
  menuBtn: document.getElementById('menu-btn'),
  
  // Modals
  codeModal: document.getElementById('code-modal'),
  codeOutput: document.getElementById('code-output'),
  copyCodeBtn: document.getElementById('copy-code-btn'),
  apiKeyModal: document.getElementById('api-key-modal'),
  apiKeyInput: document.getElementById('api-key-input'),
  saveApiKey: document.getElementById('save-api-key')
};

// Initialize App
function init() {
  loadSavedSettings();
  setupEventListeners();
  fetchData();
  setupAutoRefresh();
}

// Load configurations from localStorage
function loadSavedSettings() {
  const saved = localStorage.getItem('visualizer_settings');
  if (saved) {
    try {
      const config = JSON.parse(saved);
      state.autoRefresh = config.autoRefresh !== undefined ? config.autoRefresh : true;
      state.refreshInterval = config.refreshInterval || 5;
      state.layoutDirection = config.layoutDirection || 'TD';
      state.excludeStopped = !!config.excludeStopped;
      state.hideInternalPorts = !!config.hideInternalPorts;
      state.hideLoopback = config.hideLoopback !== undefined ? config.hideLoopback : true;
      state.hideVeth = config.hideVeth !== undefined ? config.hideVeth : true;
      state.hideBridge = config.hideBridge !== undefined ? config.hideBridge : true;
      state.excludeNetworks = new Set(config.excludeNetworks || []);
    } catch (e) {
      console.error('Failed to parse saved settings', e);
    }
  }

  // Update UI inputs to match state
  elements.autoRefresh.checked = state.autoRefresh;
  elements.refreshInterval.value = state.refreshInterval;
  elements.intervalVal.textContent = `${state.refreshInterval}s`;
  elements.layoutDirection.value = state.layoutDirection;
  elements.filterStopped.checked = state.excludeStopped;
  elements.filterInternal.checked = state.hideInternalPorts;
  elements.filterLoopback.checked = state.hideLoopback;
  elements.filterVeth.checked = state.hideVeth;
  elements.filterBridge.checked = state.hideBridge;
}

// Save configurations to localStorage
function saveSettings() {
  const config = {
    autoRefresh: state.autoRefresh,
    refreshInterval: state.refreshInterval,
    layoutDirection: state.layoutDirection,
    excludeStopped: state.excludeStopped,
    hideInternalPorts: state.hideInternalPorts,
    hideLoopback: state.hideLoopback,
    hideVeth: state.hideVeth,
    hideBridge: state.hideBridge,
    excludeNetworks: Array.from(state.excludeNetworks)
  };
  localStorage.setItem('visualizer_settings', JSON.stringify(config));
}

// Event Listeners
function setupEventListeners() {
  // Sidebar Toggle Inputs
  elements.autoRefresh.addEventListener('change', (e) => {
    state.autoRefresh = e.target.checked;
    saveSettings();
    setupAutoRefresh();
  });

  elements.refreshInterval.addEventListener('input', (e) => {
    state.refreshInterval = parseInt(e.target.value);
    elements.intervalVal.textContent = `${state.refreshInterval}s`;
  });

  elements.refreshInterval.addEventListener('change', () => {
    saveSettings();
    setupAutoRefresh();
  });

  elements.layoutDirection.addEventListener('change', (e) => {
    state.layoutDirection = e.target.value;
    saveSettings();
    fetchData();
  });

  const toggleFilters = [
    { el: elements.filterStopped, prop: 'excludeStopped' },
    { el: elements.filterInternal, prop: 'hideInternalPorts' },
    { el: elements.filterLoopback, prop: 'hideLoopback' },
    { el: elements.filterVeth, prop: 'hideVeth' },
    { el: elements.filterBridge, prop: 'hideBridge' }
  ];

  toggleFilters.forEach(filter => {
    filter.el.addEventListener('change', (e) => {
      state[filter.prop] = e.target.checked;
      saveSettings();
      fetchData();
    });
  });

  // Action Buttons
  elements.refreshBtn.addEventListener('click', () => fetchData(true));
  
  // Mobile menu toggle
  elements.menuBtn.addEventListener('click', () => {
    elements.sidebar.classList.toggle('active');
  });

  // Modals management
  elements.viewCodeBtn.addEventListener('click', () => {
    elements.codeOutput.value = state.lastMermaidCode;
    openModal(elements.codeModal);
  });

  elements.apiKeyBtn.addEventListener('click', () => {
    elements.apiKeyInput.value = state.apiKey;
    openModal(elements.apiKeyModal);
  });

  elements.saveApiKey.addEventListener('click', () => {
    state.apiKey = elements.apiKeyInput.value.trim();
    localStorage.setItem('api_key', state.apiKey);
    closeModal(elements.apiKeyModal);
    fetchData(true);
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      closeModal(e.target.closest('.modal'));
    });
  });

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  // Copy Code
  elements.copyCodeBtn.addEventListener('click', () => {
    elements.codeOutput.select();
    navigator.clipboard.writeText(elements.codeOutput.value)
      .then(() => {
        const originalText = elements.copyCodeBtn.innerHTML;
        elements.copyCodeBtn.innerHTML = '✓ Copied!';
        elements.copyCodeBtn.style.backgroundColor = 'var(--success-color)';
        setTimeout(() => {
          elements.copyCodeBtn.innerHTML = originalText;
          elements.copyCodeBtn.style.backgroundColor = '';
        }, 2000);
      })
      .catch(err => console.error('Failed to copy text: ', err));
  });

  // Viewport Zoom & Drag & Pan
  elements.zoomIn.addEventListener('click', () => zoomAtCenter(1.25));
  elements.zoomOut.addEventListener('click', () => zoomAtCenter(0.8));
  elements.zoomReset.addEventListener('click', resetViewport);
  
  setupDragAndPan();
}

// Open/Close Modals
function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}

// Zoom functionality at a specific coordinate (pins that point)
function zoomAtPoint(factor, clientX, clientY) {
  const oldZoom = state.zoom;
  const newZoom = Math.max(0.02, Math.min(25.0, oldZoom * factor)); // Allow 0.02x to 25.0x zoom!
  
  // Calculate new pan to keep coordinate under pointer pinned on screen
  state.panX = clientX - (clientX - state.panX) * (newZoom / oldZoom);
  state.panY = clientY - (clientY - state.panY) * (newZoom / oldZoom);
  state.zoom = newZoom;
  
  applyViewportTransform();
}

// Zoom functionality relative to center of viewport
function zoomAtCenter(factor) {
  const container = elements.diagramContainer;
  const rect = container.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  zoomAtPoint(factor, centerX, centerY);
}

function resetViewport() {
  const container = elements.diagramContainer;
  const wrapper = elements.diagramWrapper;
  
  const containerRect = container.getBoundingClientRect();
  
  const svg = wrapper.querySelector('svg');
  let wWidth = wrapper.offsetWidth;
  let wHeight = wrapper.offsetHeight;
  
  if (svg) {
    const viewBox = svg.viewBox.baseVal;
    if (viewBox && viewBox.width > 0) {
      wWidth = viewBox.width;
      wHeight = viewBox.height;
    }
  }
  
  if (!wWidth || wWidth < 10) wWidth = 800;
  if (!wHeight || wHeight < 10) wHeight = 600;
  
  // Fit diagram to screen on reset
  const margin = 60;
  const zoomX = (containerRect.width - margin) / wWidth;
  const zoomY = (containerRect.height - margin) / wHeight;
  
  state.zoom = Math.min(1.0, Math.min(zoomX, zoomY));
  if (state.zoom < 0.02) state.zoom = 0.02;
  
  // Centering pan values
  state.panX = (containerRect.width - wWidth * state.zoom) / 2;
  state.panY = (containerRect.height - wHeight * state.zoom) / 2;
  
  applyViewportTransform();
}

function applyViewportTransform() {
  elements.diagramWrapper.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}

// Drag & Pan implementation
function setupDragAndPan() {
  const container = elements.diagramContainer;
  
  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button') || e.target.closest('a')) return;
    
    state.isDragging = true;
    state.startX = e.clientX - state.panX;
    state.startY = e.clientY - state.panY;
    container.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    state.panX = e.clientX - state.startX;
    state.panY = e.clientY - state.startY;
    applyViewportTransform();
  });

  window.addEventListener('mouseup', () => {
    if (state.isDragging) {
      state.isDragging = false;
      container.style.cursor = 'grab';
    }
  });

  // Trackpad scroll (two-finger pan) and pinch (zoom)
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const rect = container.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    
    if (e.ctrlKey) {
      // Touchpad pinch-to-zoom or Ctrl+Scroll wheel
      // Uses a smooth exponential multiplier to match pinch speed
      const zoomFactor = Math.exp(-e.deltaY * 0.006);
      zoomAtPoint(zoomFactor, localX, localY);
    } else {
      // Trackpad two-finger swipe or standard mouse wheel scroll (pans diagram instantly)
      state.panX -= e.deltaX * 1.1;
      state.panY -= e.deltaY * 1.1;
      applyViewportTransform();
    }
  }, { passive: false });
}

// Fetch API data
async function fetchData(manual = false) {
  showLoading(true);
  
  // Construct Query String
  const params = new URLSearchParams();
  if (state.excludeNetworks.size > 0) {
    params.append('exclude_networks', Array.from(state.excludeNetworks).join(','));
  }
  params.append('exclude_stopped', state.excludeStopped);
  params.append('hide_internal_ports', state.hideInternalPorts);
  params.append('hide_loopback', state.hideLoopback);
  params.append('hide_veth', state.hideVeth);
  params.append('hide_bridge', state.hideBridge);
  params.append('direction', state.layoutDirection);

  const url = `/api/diagram?${params.toString()}`;
  const headers = {};
  if (state.apiKey) {
    headers['Authorization'] = `Bearer ${state.apiKey}`;
  }

  try {
    const res = await fetch(url, { headers });
    
    if (res.status === 401 || res.status === 403) {
      showStatus(false, 'Unauthorized / Invalid Key');
      showLoading(false);
      // Trigger API Key modal if authentication error occurs
      openModal(elements.apiKeyModal);
      return;
    }
    
    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}`);
    }

    const data = await res.json();
    
    // Update title
    elements.appTitle.textContent = data.app_title || 'Docker Live Visualizer';
    
    // Check for scanner errors
    if (data.docker_error) {
      showStatus(false, `Docker Error: ${data.docker_error.split(':')[0]}`);
    } else {
      showStatus(true, 'Live Connected');
    }

    state.lastMermaidCode = data.mermaid;
    
    // Update networks filter list
    updateNetworksChecklist(data.networks || []);
    
    // Render the new diagram
    await renderDiagram(data.mermaid);
    
    if (state.isFirstLoad) {
      // Small timeout to allow DOM dimensions to calculate
      setTimeout(() => {
        resetViewport();
        state.isFirstLoad = false;
      }, 80);
    }
    
  } catch (err) {
    console.error('Fetch failed:', err);
    showStatus(false, 'Connection Failed');
    renderErrorDiagram(err.message);
  } finally {
    showLoading(false);
  }
}

// Render Mermaid Diagram to DOM
async function renderDiagram(mermaidCode) {
  try {
    // Clear previous temporary rendering divs if any
    const tempDiv = document.createElement('div');
    tempDiv.id = 'mermaid-temp';
    document.body.appendChild(tempDiv);
    
    // Render code to SVG string
    const { svg } = await mermaid.render('mermaid-rendered-svg', mermaidCode);
    
    // Clean up temporary div
    tempDiv.remove();
    
    // Set SVG to wrapper
    elements.diagramWrapper.innerHTML = svg;
    
    // Trigger viewport transform alignment in case size changed
    applyViewportTransform();
  } catch (err) {
    console.error('Mermaid render failed:', err);
    // If mermaid rendering throws syntax error, show in DOM
    renderErrorDiagram('Mermaid Syntax/Rendering Failure');
    // Clear error cache
    const badSvg = document.getElementById('mermaid-rendered-svg');
    if (badSvg) badSvg.remove();
    const badTemp = document.getElementById('mermaid-temp');
    if (badTemp) badTemp.remove();
  }
}

function renderErrorDiagram(message) {
  elements.diagramWrapper.innerHTML = `
    <div style="text-align: center; color: var(--danger-color); padding: 2rem; border: 1px dashed var(--danger-color); border-radius: 8px; background: rgba(239, 68, 68, 0.05);">
      <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-bottom: 1rem;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h3 style="margin-bottom: 0.5rem; font-weight: 600;">Failed to Load Infrastructure</h3>
      <p style="font-size: 0.875rem; color: var(--text-secondary);">${message}</p>
    </div>
  `;
}

// Build checklist of Docker Networks dynamically
function updateNetworksChecklist(networks) {
  // Save selected state
  const currentSelections = new Set(state.excludeNetworks);
  
  elements.networksList.innerHTML = '';
  
  if (networks.length === 0) {
    elements.networksList.innerHTML = '<span class="text-muted">No networks found</span>';
    return;
  }

  networks.forEach(net => {
    const label = document.createElement('label');
    label.className = 'checkbox-container';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = net;
    input.checked = currentSelections.has(net);
    
    input.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.excludeNetworks.add(net);
      } else {
        state.excludeNetworks.delete(net);
      }
      saveSettings();
      fetchData();
    });
    
    label.appendChild(input);
    label.appendChild(document.createTextNode(net));
    elements.networksList.appendChild(label);
  });
}

// Control Auto-Refresh timers
function setupAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }

  if (state.autoRefresh) {
    state.refreshTimer = setInterval(() => {
      fetchData();
    }, state.refreshInterval * 1000);
  }
}

// UI Overlays & States
function showLoading(show) {
  if (show) {
    elements.loading.classList.add('active');
  } else {
    elements.loading.classList.remove('active');
  }
}

function showStatus(ok, message) {
  elements.statusText.textContent = message;
  if (ok) {
    elements.statusDot.className = 'status-dot active';
  } else {
    elements.statusDot.className = 'status-dot error';
  }
}

// Start visualizer
init();
