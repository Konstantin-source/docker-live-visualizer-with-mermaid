// Vis.js Network Live Visualizer Implementation
// State
const state = {
  apiKey: localStorage.getItem('api_key') || '',
  autoRefresh: true,
  refreshInterval: 5,
  layoutMode: 'physics', // 'physics', 'UD' (Up-Down), 'LR' (Left-Right)
  excludeStopped: false,
  hideInternalPorts: false,
  hideLoopback: true,
  hideVeth: true,
  hideBridge: true,
  excludeNetworks: new Set(),
  appTitle: 'Docker Live Visualizer',
  isFirstLoad: true,
  refreshTimer: null,
  portsList: []
};

// Global Vis.js DataSet & Network Instances
let nodesDataSet = new vis.DataSet();
let edgesDataSet = new vis.DataSet();
let networkInstance = null;

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
  exportPngBtn: document.getElementById('export-png-btn'),
  apiKeyBtn: document.getElementById('api-key-btn'),
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomReset: document.getElementById('zoom-reset'),
  diagramContainer: document.getElementById('diagram-container'),
  loading: document.getElementById('loading'),
  sidebar: document.getElementById('sidebar'),
  menuBtn: document.getElementById('menu-btn'),
  
  // Modals
  apiKeyModal: document.getElementById('api-key-modal'),
  apiKeyInput: document.getElementById('api-key-input'),
  saveApiKey: document.getElementById('save-api-key'),
  portsModal: document.getElementById('ports-modal'),
  portOverviewBtn: document.getElementById('port-overview-btn'),
  portsTableBody: document.getElementById('ports-table-body')
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
      state.layoutMode = config.layoutMode || 'physics';
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
  elements.layoutDirection.value = state.layoutMode;
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
    layoutMode: state.layoutMode,
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
    state.layoutMode = e.target.value;
    saveSettings();
    
    // Dynamically update layout options
    if (networkInstance) {
      updateNetworkLayoutMode();
    }
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
  elements.exportPngBtn.addEventListener('click', exportPNG);

  elements.portOverviewBtn.addEventListener('click', () => {
    renderPortsTable(state.portsList);
    openModal(elements.portsModal);
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

  // Viewport zoom buttons hooked up to Vis.js
  elements.zoomIn.addEventListener('click', () => {
    if (networkInstance) {
      networkInstance.moveTo({ scale: networkInstance.getScale() * 1.3, animation: true });
    }
  });

  elements.zoomOut.addEventListener('click', () => {
    if (networkInstance) {
      networkInstance.moveTo({ scale: networkInstance.getScale() * 0.75, animation: true });
    }
  });

  elements.zoomReset.addEventListener('click', () => {
    if (networkInstance) {
      networkInstance.fit({ animation: true });
    }
  });
}

// Open/Close Modals
function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}

// Get Vis.js Options matching app styling
function getNetworkOptions() {
  return {
    nodes: {
      shape: 'box',
      margin: 12,
      font: {
        color: '#f8fafc',
        size: 13,
        face: 'Inter, system-ui, sans-serif',
      },
      borderWidth: 2,
      shadow: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.4)',
        size: 6,
        x: 0,
        y: 4
      }
    },
    edges: {
      width: 2,
      selectionWidth: 3,
      hoverWidth: 3,
      color: {
        color: '#475569',
        highlight: '#06b6d4',
        hover: '#06b6d4'
      },
      smooth: {
        enabled: true,
        type: 'continuous',
        roundness: 0.5
      }
    },
    groups: {
      physical: {
        shape: 'box',
        color: {
          background: '#0f172a',
          border: '#3b82f6',
          highlight: { background: '#1e293b', border: '#60a5fa' }
        }
      },
      vpn: {
        shape: 'box',
        color: {
          background: '#0f172a',
          border: '#8b5cf6',
          highlight: { background: '#1e293b', border: '#a78bfa' }
        }
      },
      hostport: {
        shape: 'box',
        borderWidth: 1.5,
        color: {
          background: '#1e293b',
          border: '#cbd5e1',
          highlight: { background: '#334155', border: '#f8fafc' }
        }
      },
      network: {
        shape: 'database',
        color: {
          background: '#111827',
          border: '#06b6d4',
          highlight: { background: '#1f2937', border: '#22d3ee' }
        }
      },
      running: {
        shape: 'box',
        color: {
          background: '#10b9810d',
          border: '#10b981',
          highlight: { background: '#10b98126', border: '#34d399' }
        }
      },
      db: {
        shape: 'box',
        color: {
          background: '#a855f70d',
          border: '#a855f7',
          highlight: { background: '#a855f726', border: '#c084fc' }
        }
      },
      web: {
        shape: 'box',
        color: {
          background: '#0ea5e90d',
          border: '#0ea5e9',
          highlight: { background: '#0ea5e926', border: '#38bdf8' }
        }
      },
      tool: {
        shape: 'box',
        color: {
          background: '#eab3080d',
          border: '#eab308',
          highlight: { background: '#eab30826', border: '#facc15' }
        }
      },
      app: {
        shape: 'box',
        color: {
          background: '#ec48990d',
          border: '#ec4899',
          highlight: { background: '#ec489926', border: '#f472b6' }
        }
      },
      stopped: {
        shape: 'box',
        color: {
          background: '#ef44440d',
          border: '#ef4444',
          highlight: { background: '#ef444426', border: '#f87171' }
        }
      },
      paused: {
        shape: 'box',
        color: {
          background: '#f59e0b0d',
          border: '#f59e0b',
          highlight: { background: '#f59e0b26', border: '#fbbf24' }
        }
      }
    },
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -260,
        centralGravity: 0.01,
        springLength: 200,
        springConstant: 0.06,
        damping: 0.4,
        avoidOverlap: 1.0
      },
      stabilization: {
        enabled: true,
        iterations: 200,
        updateInterval: 50
      }
    },
    interaction: {
      hover: true,
      hoverConnectedEdges: true,
      tooltipDelay: 150,
      zoomView: true,
      dragView: true,
      dragNodes: true
    }
  };
}

// Update Network Layout Options dynamically
function updateNetworkLayoutMode() {
  const isHierarchical = state.layoutMode !== 'physics';
  
  if (isHierarchical) {
    networkInstance.setOptions({
      physics: { enabled: false },
      layout: {
        hierarchical: {
          enabled: true,
          direction: state.layoutMode, // 'UD' or 'LR'
          sortMethod: 'directed',
          nodeSpacing: 160,
          treeSpacing: 220,
          edgeMinimization: true,
          parentCentralization: true
        }
      }
    });
  } else {
    // Standard Physics
    networkInstance.setOptions({
      layout: { hierarchical: { enabled: false } },
      physics: { enabled: true }
    });
    // Stabilize/re-run physics layout
    networkInstance.stabilize();
  }
}

// Fetch API data and update diagram
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
      openModal(elements.apiKeyModal);
      return;
    }
    
    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}`);
    }

    const data = await res.json();
    
    // Update Title
    state.appTitle = data.app_title || 'Docker Live Visualizer';
    elements.appTitle.textContent = state.appTitle;
    
    // Check for scanner errors
    if (data.docker_error) {
      showStatus(false, `Docker Error: ${data.docker_error.split(':')[0]}`);
    } else {
      showStatus(true, 'Live Connected');
    }

    // Update ports list cache
    state.portsList = data.topology.ports || [];
    renderPortsTable(state.portsList);

    // Update Networks Checklist
    updateNetworksChecklist(data.networks || []);
    
    // Render/Update Vis.js Network
    renderNetwork(data.topology || { nodes: [], edges: [] });
    
  } catch (err) {
    console.error('Fetch failed:', err);
    showStatus(false, 'Connection Failed');
  } finally {
    showLoading(false);
  }
}

// Render or smooth update the Vis.js Network
function renderNetwork(topology) {
  const container = elements.diagramContainer;
  
  // 1. If networkInstance is null, initialize it for the first time
  if (!networkInstance) {
    // Clear the container first
    container.innerHTML = '';
    
    // Feed data to dataset
    nodesDataSet.clear();
    edgesDataSet.clear();
    nodesDataSet.add(topology.nodes);
    edgesDataSet.add(topology.edges);
    
    const data = {
      nodes: nodesDataSet,
      edges: edgesDataSet
    };
    
    const options = getNetworkOptions();
    
    networkInstance = new vis.Network(container, data, options);
    
    // Align current layout mode selection
    updateNetworkLayoutMode();
    
    // Auto-fit on first load
    networkInstance.once('stabilizationIterationsDone', () => {
      networkInstance.fit();
    });
    
    state.isFirstLoad = false;
  } else {
    // 2. Smooth Update: compare old and new nodes/edges to prevent visual jumpiness
    const currentNodes = nodesDataSet.getIds();
    const currentEdges = edgesDataSet.getIds();
    
    const newNodes = topology.nodes;
    const newEdges = topology.edges;
    
    const newNodesIds = newNodes.map(n => n.id);
    const newEdgesIds = newEdges.map(e => e.id);
    
    // Remove obsolete nodes and edges
    const nodesToRemove = currentNodes.filter(id => !newNodesIds.includes(id));
    const edgesToRemove = currentEdges.filter(id => !newEdgesIds.includes(id));
    
    if (nodesToRemove.length > 0) nodesDataSet.remove(nodesToRemove);
    if (edgesToRemove.length > 0) edgesDataSet.remove(edgesToRemove);
    
    // Add or update nodes and edges
    nodesDataSet.update(newNodes);
    edgesDataSet.update(newEdges);
    
    // If it's still first load (e.g. data arrived slowly), fit it
    if (state.isFirstLoad) {
      networkInstance.fit();
      state.isFirstLoad = false;
    }
  }
}

// Build checklist of Docker Networks dynamically
function updateNetworksChecklist(networks) {
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

// Render dynamic rows in ports table
function renderPortsTable(ports) {
  const tbody = elements.portsTableBody;
  if (!tbody) return;
  
  tbody.innerHTML = '';
  if (ports.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center;" class="text-muted">Keine belegten Host-Ports gefunden.</td>
      </tr>
    `;
    return;
  }

  ports.forEach(p => {
    const tr = document.createElement('tr');
    
    // Determine status styling
    let statusClass = 'stopped';
    let statusEmoji = '🔴';
    if (p.container_status === 'running') {
      statusClass = 'running';
      statusEmoji = '🟢';
    } else if (p.container_status === 'paused') {
      statusClass = 'paused';
      statusEmoji = '🟡';
    }
    
    tr.innerHTML = `
      <td><span class="port-badge">:${p.host_port}</span></td>
      <td><span class="text-muted" style="font-family: monospace;">${p.host_ip}</span></td>
      <td style="color: var(--text-primary); font-weight: 500;">📦 ${p.container_name}</td>
      <td><span class="text-muted" style="font-family: monospace;">${p.container_port}</span></td>
      <td><span class="status-badge ${statusClass}">${statusEmoji} ${p.container_status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Export canvas topology as a PNG image with a dark background
function exportPNG() {
  const canvas = elements.diagramContainer.querySelector('canvas');
  if (!canvas) {
    alert('No topology canvas available to export!');
    return;
  }
  
  // Create virtual canvas to render background color + diagram
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  
  const ctx = tempCanvas.getContext('2d');
  
  // App primary background (dark theme dark blue)
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  
  // Render the Vis.js canvas over it
  ctx.drawImage(canvas, 0, 0);
  
  // Download trigger
  const image = tempCanvas.toDataURL("image/png");
  const link = document.createElement('a');
  link.download = `${state.appTitle.replace(/\s+/g, '_')}_topology.png`;
  link.href = image;
  link.click();
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
