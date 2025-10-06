const ION_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MDgxYjM4MS04MmE3LTRkNTAtYWI0OS1mZTdjMzBlMmIwNjMiLCJpZCI6MzQ3MTY4LCJpYXQiOjE3NTk2MjY2NTd9.r-OmZYSrWOKI_8orTFtUrdxvpJB6_jP1rK8eupZ-1H4";

const statusEl = document.getElementById("status");
function setStatus(s) {
  statusEl.textContent = "Status: " + s;
  console.log(s);
}

// Inicializa viewer
try {
  if (ION_TOKEN && !ION_TOKEN.includes("YOUR_ION_ACCESS_TOKEN")) {
    Cesium.Ion.defaultAccessToken = ION_TOKEN;
  }
} catch (e) {
  console.warn("Ion token parse error", e);
}

const viewer = new Cesium.Viewer("cesiumContainer", {
  imageryProvider: false,
  baseLayerPicker: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  sceneModePicker: false,
  timeline: false,
  animation: false,
});

// Tenta Ion terrain/imagery e faz fallback para OSM se necessário
(async function setupImageryAndTerrain() {
  setStatus("Configurando camadas...");
  if (ION_TOKEN && !ION_TOKEN.includes("YOUR_ION_ACCESS_TOKEN")) {
    try {
      // tenta terrain do Ion (pode falhar por permissão)
      const terrain = Cesium.createWorldTerrain();
      viewer.terrainProvider = terrain;
      // tenta também imagery via Ion (assetId genérico 3812 — pode falhar dependendo do token)
      try {
        const provider = new Cesium.IonImageryProvider({ assetId: 3812 });
        viewer.imageryLayers.addImageryProvider(provider);
        setStatus("Camada Cesium Ion carregada.");
        return;
      } catch (eImg) {
        console.warn("Ion imagery não carregou, fallback para OSM.", eImg);
        // segue para fallback imagery
      }
    } catch (eTerrain) {
      console.warn("createWorldTerrain() falhou (token/perm).", eTerrain);
      // fallback abaixo
    }
  }
  // fallback imagery OSM
  try {
    const osm = new Cesium.UrlTemplateImageryProvider({
      url: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
      credit: "© OpenStreetMap contributors",
      maximumLevel: 19,
    });
    viewer.imageryLayers.addImageryProvider(osm);
    setStatus("Usando OpenStreetMap (fallback).");
  } catch (e) {
    setStatus("Falha ao carregar imagery — exibindo globo liso.");
    console.error(e);
  }
})();

// Leitura dos inputs
function readInputs() {
  return {
    L0: parseFloat(document.getElementById("diam").value) || 0,
    rho: parseFloat(document.getElementById("dens").value) || 2700,
    v_kms: parseFloat(document.getElementById("vel").value) || 20,
    angle_deg: parseFloat(document.getElementById("angle").value) || 45,
  };
}

// Função de cálculo (implementa aproximações discutidas)
function calculateRadii(params) {
  // params: {L0 (m), rho (kg/m3), v_kms, angle_deg}
  const L0 = params.L0;
  const rho_i = params.rho;
  const v = params.v_kms * 1000.0; // m/s
  const theta = Cesium.Math.toRadians(params.angle_deg);

  // Massa e energia cinética
  const volume = (Math.PI / 6.0) * Math.pow(L0, 3);
  const mass = volume * rho_i;
  const E = 0.5 * mass * v * v; // Joules

  // 1) Transient crater Dtc (m) — aproximação de Collins et al. (Eq.21*)
  const Ut = 2700.0; // target density rock
  const g = 9.81;
  const Dtc =
    1.161 *
    Math.pow(rho_i / Ut, 1 / 3.0) *
    Math.pow(L0, 0.78) *
    Math.pow(v, 0.44) *
    Math.pow(g, -0.22) *
    Math.pow(Math.sin(theta), 1 / 3.0);

  // 2) Final crater Dfr (m)
  let Dfr;
  const Dc = 3200.0; // transição simple->complex (m)
  if (Dtc <= Dc) {
    Dfr = 1.25 * Dtc;
  } else {
    Dfr = (1.17 * Math.pow(Dtc, 1.13)) / Math.pow(Dc, 0.13);
  }

  const craterRadius_m = Dfr / 2.0;

  // 3) Radiação térmica (m)
  const K = 0.001; // luminous efficiency assumed
  const threshold = 0.42e6; // J/m^2 (3rd-degree burn)
  const thermalRadius_m = Math.sqrt((K * E) / (2.0 * Math.PI * threshold));

  // 4) Shock radius (≈0.75 bar) — scale E^(1/3)
  const E_Mt = E / 4.184e15;
  const shockRadius_km = 2.81 * Math.pow(Math.max(E_Mt, 1e-12), 1 / 3.0); // km, calibrated factor
  const shockRadius_m = shockRadius_km * 1000.0;

  // 5) Seismic: magnitude M and rough radius for Mercalli VI
  const M = 0.67 * Math.log10(E) - 5.87;
  // Approximate radius (m) where intensity ≈ VI (didactic approximation)
  const seismicRadius_m =
    M > 5 ? 1000.0 * Math.pow(10.0, 0.5 * (M - 5.0)) : 0.0;

  return {
    craterRadius_m,
    thermalRadius_m,
    shockRadius_m,
    seismicRadius_m,
    Dfr_m: Dfr,
    E_joules: E,
    magnitude: M,
  };
}

// Utility: format meters to km nicely
function fmtKm(m) {
  if (!m || m <= 0) return "—";
  return (m / 1000.0).toFixed(2) + " km";
}

// Atualiza campos de saída
function updateOutputs(res) {
  document.getElementById("out_crater").textContent =
    fmtKm(res.craterRadius_m) + ` (D≈ ${(res.Dfr_m / 1000).toFixed(2)} km)`;
  document.getElementById("out_thermal").textContent = fmtKm(
    res.thermalRadius_m
  );
  document.getElementById("out_shock").textContent = fmtKm(res.shockRadius_m);
  document.getElementById("out_seismic").textContent = fmtKm(
    res.seismicRadius_m
  );
}

// Armazena último ponto de impacto para recalcular se inputs mudarem
let lastImpact = null; // {lat, lon}

// Função que processa o impacto (calcula e desenha)
function processImpact(lat, lon) {
  const params = readInputs();
  // sanity checks
  if (!(params.L0 > 0)) {
    setStatus("Insira um diâmetro > 0.");
    return;
  }
  const res = calculateRadii(params);
  // desenhar elipses (remoção das anteriores)
  viewer.entities.removeAll();
  const center = Cesium.Cartesian3.fromDegrees(lon, lat);

  function addEllipse(radius_m, colorCss, alpha) {
    viewer.entities.add({
      position: center,
      ellipse: {
        semiMajorAxis: radius_m,
        semiMinorAxis: radius_m,
        material: Cesium.Color.fromCssColorString(colorCss).withAlpha(alpha),
        height: 0,
      },
    });
  }

  addEllipse(res.craterRadius_m, "gray", 0.6);
  addEllipse(res.thermalRadius_m, "#ff6b6b", 0.35);
  addEllipse(res.shockRadius_m, "#57a0ff", 0.25);
  addEllipse(res.seismicRadius_m, "#63d68e", 0.25);

  // centraliza câmera
  const maxR = Math.max(
    res.craterRadius_m,
    res.thermalRadius_m,
    res.shockRadius_m,
    res.seismicRadius_m,
    1000
  );
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      lon,
      lat,
      Math.max(2000, maxR * 3.5)
    ),
  });

  // atualiza outputs e status
  updateOutputs(res);
  setStatus(
    `Impacto em ${lat.toFixed(4)}°, ${lon.toFixed(
      4
    )}° — clique em outro ponto para recalcular.`
  );
  lastImpact = { lat, lon };
}

// Clique no globo define impacto
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction(function (click) {
  const cart = viewer.camera.pickEllipsoid(
    click.position,
    viewer.scene.globe.ellipsoid
  );
  if (!cart) {
    setStatus("Clique no globo (não no céu).");
    return;
  }
  const carto = Cesium.Cartographic.fromCartesian(cart);
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  processImpact(lat, lon);
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// Recalcula automaticamente se inputs mudarem (mantendo o último ponto clicado)
["diam", "dens", "vel", "angle"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => {
    if (lastImpact) {
      processImpact(lastImpact.lat, lastImpact.lon);
    }
  });
});




// Função de exemplo para salvar estado do painel (inputs, seleções, etc.)
function savePanelState() {
  const inputs = document.querySelectorAll(".panel input, .panel select");
  inputs.forEach((input) => {
    localStorage.setItem(input.id, input.value);
  });
}

// Função de exemplo para restaurar estado do painel
function restorePanelState() {
  const inputs = document.querySelectorAll(".panel input, .panel select");
  inputs.forEach((input) => {
    const saved = localStorage.getItem(input.id);
    if (saved !== null) input.value = saved;
  });
}

// Chama ao carregar a página
window.addEventListener("DOMContentLoaded", restorePanelState);

// Mensagem inicial
setStatus("Pronto — clique no globo para posicionar o impacto.");

/* === MÓDULO NEO UNIFICADO (cole substituindo versões antigas) ===
   - define API_KEY (use DEMO_KEY ou substitua)
   - prefetch para autocomplete
   - busca por id (/neo/{id})
   - persistência (localStorage)
   - showNeoInfo(neoOrId) -> popula painel e chama window.onNeoSelected(neo)
   - openRightPanel / closeRightPanel
   - bind: search input, full search, Apply, Clear, Fechar painel
*/

const NEO_API_KEY = '6OaJZYzf1weKrNWWjrh7jiHmMWibRwDABF14Xbbh'; // <-- troque pela sua chave quando for para produção

(function () {
  const PAGE_SIZE = 20;
  const PREFETCH_PAGES = 4;
  const MAX_FULL_PAGES = 200;

  const endpointBrowse = (page = 0, size = PAGE_SIZE) =>
    `https://api.nasa.gov/neo/rest/v1/neo/browse?page=${page}&size=${size}&api_key=${NEO_API_KEY}`;
  const endpointLookup = (id) =>
    `https://api.nasa.gov/neo/rest/v1/neo/${encodeURIComponent(id)}?api_key=${NEO_API_KEY}`;

  // DOM refs
  const input = document.getElementById('neo-search');
  const suggestionsEl = document.getElementById('neo-suggestions');
  const statusEl = document.getElementById('neo-search-status');
  const fullBtn = document.getElementById('search-full-btn');
  const infoEl = document.getElementById('neo-info');
  const applyBtn = document.getElementById('neo-apply-btn');
  const clearBtn = document.getElementById('neo-clear-btn');
  const panelEl = document.querySelector('#panel-right') || document.querySelector('.panel-right');
  const panelCloseBtn = document.getElementById('panel-close-btn'); // botão Fechar que inserimos no HTML

  // elementos do painel esquerdo que receberão os valores ao clicar "Aplicar"
  const leftVelocityEl = document.getElementById('left-velocity');
  const leftDiameterEl = document.getElementById('left-diameter');


  // in-memory cache
  let neoCache = [];
  let prefetching = false;
  let debounceTimer = null;

  // localStorage keys
  const KEY_INPUT = 'neo-search-value';
  const KEY_SELECTED = 'neo-selected-id';

  // helpers
  function setStatus(txt) { if (statusEl) statusEl.textContent = txt || ''; }
  function safeText(node, txt) { if (!node) return; node.textContent = (txt === null || txt === undefined || txt === '') ? '—' : txt; }
  function formatDateToDDMMYYYY(dateStr) {
    if (!dateStr) return '—';
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) d = new Date(dateStr + 'T00:00:00Z');
    else d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  function formatNumber(n, decimals = 3) {
    if (n === null || n === undefined || isNaN(Number(n))) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
  }
  function pickFirstAndLastApproaches(arr = []) {
    if (!Array.isArray(arr) || arr.length === 0) return { first: null, last: null };
    const sorted = arr.slice().sort((a, b) => {
      const aEpoch = (a.epoch_date_close_approach != null) ? Number(a.epoch_date_close_approach) : (a.close_approach_date ? Date.parse(a.close_approach_date) : 0);
      const bEpoch = (b.epoch_date_close_approach != null) ? Number(b.epoch_date_close_approach) : (b.close_approach_date ? Date.parse(b.close_approach_date) : 0);
      return aEpoch - bEpoch;
    });
    return { first: sorted[0], last: sorted[sorted.length - 1] };
  }

  // prefetch
  async function prefetchInitial(pages = PREFETCH_PAGES) {
    if (prefetching) return;
    prefetching = true;
    setStatus('Carregando lista inicial...');
    try {
      for (let p = 0; p < pages; p++) {
        const res = await fetch(endpointBrowse(p));
        if (!res.ok) break;
        const data = await res.json();
        if (Array.isArray(data.near_earth_objects)) {
          neoCache.push(...data.near_earth_objects);
        } else break;
      }
      setStatus(`Cache: ${neoCache.length} objetos`);
    } catch (err) {
      console.warn('Prefetch error', err);
      setStatus('Falha ao carregar lista inicial');
    } finally {
      prefetching = false;
      renderSuggestions();
    }
  }

  // lookup by id
  async function fetchNeoById(id) {
    if (!id) return null;
    try {
      const res = await fetch(endpointLookup(id));
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('fetchNeoById error', err);
      return null;
    }
  }

  // suggestions render
  function renderSuggestions() {
    if (!suggestionsEl || !input) return;
    const q = (input.value || '').trim().toLowerCase();
    suggestionsEl.innerHTML = '';
    if (!q) return;
    const matches = neoCache.filter(n => n.name && n.name.toLowerCase().includes(q)).slice(0, 12);
    if (matches.length === 0) {
      const li = document.createElement('li');
      li.className = 'autocomplete-item';
      li.textContent = 'Nenhuma sugestão local — use "Buscar"';
      suggestionsEl.appendChild(li);
      return;
    }
    matches.forEach(neo => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item';
      li.setAttribute('role', 'option');
      li.textContent = `${neo.name}  ·  ID:${neo.id}`;
      li.addEventListener('click', () => selectNeo(neo));
      suggestionsEl.appendChild(li);
    });
  }

  // select neo
  function selectNeo(neo) {
    if (!neo) return;
    if (input) input.value = neo.name || '';
    renderSuggestions();
    showNeoInfo(neo);
    try { localStorage.setItem(KEY_SELECTED, neo.id || ''); } catch (e) {}
    // abrir painel ao selecionar
    openRightPanel();
  }

  // exhaustive search (button)
  async function searchFullDataset(query) {
    if (!query || !query.trim()) return;
    setStatus('Buscando na API (pode demorar)...');
    if (fullBtn) fullBtn.disabled = true;

    const localFound = neoCache.find(n => n.name && n.name.toLowerCase().includes(query.toLowerCase()));
    if (localFound) { selectNeo(localFound); setStatus('Encontrado localmente'); if (fullBtn) fullBtn.disabled = false; return; }

    try {
      for (let page = 0; page < MAX_FULL_PAGES; page++) {
        setStatus(`Buscando página ${page + 1}...`);
        const res = await fetch(endpointBrowse(page));
        if (!res.ok) { setStatus('Erro na API'); break; }
        const data = await res.json();
        if (!Array.isArray(data.near_earth_objects)) break;

        neoCache.push(...data.near_earth_objects);
        const found = data.near_earth_objects.find(n => n.name && n.name.toLowerCase().includes(query.toLowerCase()));
        if (found) { selectNeo(found); setStatus(`Encontrado: ${found.name}`); break; }
        if (data.near_earth_objects.length < PAGE_SIZE) break;
      }
    } catch (err) {
      console.error('searchFullDataset err', err);
      setStatus('Erro na busca completa');
    } finally {
      if (fullBtn) fullBtn.disabled = false;
      renderSuggestions();
    }
  }

  // --- painel population ---
  function populatePanel(neo) {
    if (!infoEl) return;
    const ids = {
      name: 'neo-name',
      diameter: 'neo-diameter',
      hazard: 'neo-hazard',
      velocity: 'neo-velocity',
      firstDate: 'neo-first-date',
      firstDist: 'neo-first-dist',
      firstBody: 'neo-first-body',
      lastDate: 'neo-last-date',
      lastDist: 'neo-last-dist',
      lastBody: 'neo-last-body',
      perihelion: 'neo-perihelion',
      aphelion: 'neo-aphelion',
      ecc: 'neo-ecc',
      inc: 'neo-inc'
    };

    const el = {};
    Object.keys(ids).forEach(k => el[k] = document.getElementById(ids[k]));

    function clearAll() {
      Object.values(el).forEach(n => safeText(n, '—'));
      infoEl.dataset.neoId = '';
      try { localStorage.removeItem(KEY_SELECTED); } catch (e) {}
    }
    if (!neo) { clearAll(); return; }

    infoEl.dataset.neoId = neo.id || '';
    safeText(el.name, neo.name || neo.designation || neo.neo_reference_id || '—');

    // diameter (km)
    const diam = neo.estimated_diameter && neo.estimated_diameter.kilometers;
    if (diam) {
      const minKm = Number(diam.estimated_diameter_min);
      const maxKm = Number(diam.estimated_diameter_max);
      if (!isNaN(minKm) && !isNaN(maxKm)) safeText(el.diameter, `${formatNumber(minKm, 3)} — ${formatNumber(maxKm, 3)}`);
      else safeText(el.diameter, '—');
    } else safeText(el.diameter, '—');

    safeText(el.hazard, (neo.is_potentially_hazardous_asteroid === true) ? 'Sim' : 'Não');

    const cad = Array.isArray(neo.close_approach_data) ? neo.close_approach_data : [];
    const { first, last } = pickFirstAndLastApproaches(cad);

    if (last && last.relative_velocity && last.relative_velocity.kilometers_per_second) {
      const v = parseFloat(last.relative_velocity.kilometers_per_second);
      safeText(el.velocity, isNaN(v) ? '—' : formatNumber(v, 4));
    } else safeText(el.velocity, '—');

    if (first) {
      const dateStr = first.close_approach_date_full || first.close_approach_date;
      safeText(el.firstDate, formatDateToDDMMYYYY(dateStr));
      const au = first.miss_distance ? (first.miss_distance.astronomical ?? first.miss_distance.astronomical) : null;
      safeText(el.firstDist, au ? Number(au).toFixed(6) : '—');
      safeText(el.firstBody, first.orbiting_body || '—');
    } else { safeText(el.firstDate, '—'); safeText(el.firstDist, '—'); safeText(el.firstBody, '—'); }

    if (last) {
      const dateStr = last.close_approach_date_full || last.close_approach_date;
      safeText(el.lastDate, formatDateToDDMMYYYY(dateStr));
      const au = last.miss_distance ? (last.miss_distance.astronomical ?? last.miss_distance.astronomical) : null;
      safeText(el.lastDist, au ? Number(au).toFixed(6) : '—');
      safeText(el.lastBody, last.orbiting_body || '—');
    } else { safeText(el.lastDate, '—'); safeText(el.lastDist, '—'); safeText(el.lastBody, '—'); }

    const od = neo.orbital_data || {};
    safeText(el.perihelion, od.perihelion_distance ? Number(od.perihelion_distance).toFixed(6) : '—');
    const ap = od.aphelion_distance ?? od.aphelion ?? null;
    safeText(el.aphelion, ap ? Number(ap).toFixed(6) : '—');
    safeText(el.ecc, (od.eccentricity !== undefined && od.eccentricity !== null) ? String(od.eccentricity) : '—');
    safeText(el.inc, od.inclination ? Number(od.inclination).toFixed(3) : '—');

    try { localStorage.setItem(KEY_SELECTED, neo.id || ''); } catch (e) {}
    if (typeof window.onNeoSelected === 'function') {
      try { window.onNeoSelected(neo); } catch (err) { console.warn('window.onNeoSelected error', err); }
    } else {
      setStatus(`Selecionado: ${neo.name || neo.id}`);
    }
  }

  // Copia os valores mostrados no painel direito para o painel esquerdo
  function copyValuesToLeftPanel() {
    // pega os textos exibidos no painel direito (IDs usados pelo painel direito)
    const velocityText = (document.getElementById('neo-velocity') || {}).textContent || '—';
    const diameterText = (document.getElementById('neo-diameter') || {}).textContent || '—';

    // atualiza o painel esquerdo (se os elementos existirem)
    if (leftVelocityEl) leftVelocityEl.textContent = velocityText;
    if (leftDiameterEl) leftDiameterEl.textContent = diameterText;

    // opcional: persiste para manutenção entre reloads
    try {
      localStorage.setItem('left-velocity', velocityText);
      localStorage.setItem('left-diameter', diameterText);
    } catch (e) { /* ignore */ }

    setStatus('Valores aplicados ao painel esquerdo');
  }

  // restaura os valores do painel esquerdo do localStorage (opcional)
  function restoreLeftPanelValues() {
    try {
      const v = localStorage.getItem('left-velocity');
      const d = localStorage.getItem('left-diameter');
      if (v && leftVelocityEl) leftVelocityEl.textContent = v;
      if (d && leftDiameterEl) leftDiameterEl.textContent = d;
    } catch (e) {}
  }



  // public show function (accepts object or id)
  async function showNeoInfo(neoOrId) {
    if (!neoOrId) { populatePanel(null); return; }
    if (typeof neoOrId === 'string' || typeof neoOrId === 'number') {
      const obj = await fetchNeoById(String(neoOrId));
      if (obj) populatePanel(obj); else populatePanel(null);
      return;
    }
    if (typeof neoOrId === 'object' && neoOrId.id) {
      const hasCAD = Array.isArray(neoOrId.close_approach_data) && neoOrId.close_approach_data.length > 0;
      const hasOD = !!neoOrId.orbital_data;
      if (hasCAD && hasOD) populatePanel(neoOrId);
      else {
        const full = await fetchNeoById(neoOrId.id);
        populatePanel(full || neoOrId);
      }
      return;
    }
    populatePanel(null);
  }

  window.showNeoInfo = showNeoInfo;

  // clear selection
  function clearSelection() {
    populatePanel(null);
    if (input) { input.value = ''; try { localStorage.removeItem(KEY_INPUT); } catch (e) {} }
    setStatus('Selecionado limpo');
  }

  // open/close panel
  function openRightPanel() {
    if (!panelEl) return;
    panelEl.style.display = '';
    panelEl.dataset.open = 'true';
    if (panelEl.scrollTop !== undefined) panelEl.scrollTop = 0;
  }
  function closeRightPanel() {
    if (!panelEl) return;
    panelEl.style.display = 'none';
    panelEl.dataset.open = 'false';
  }
  window.openRightPanel = openRightPanel;
  window.closeRightPanel = closeRightPanel;

  // debounce
  function debounce(fn, wait = 220) {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // attach events
  function attachEvents() {
    if (input) {
      try {
        const saved = localStorage.getItem(KEY_INPUT);
        if (saved) input.value = saved;
      } catch (e) {}
      input.addEventListener('input', debounce(() => {
        try { localStorage.setItem(KEY_INPUT, input.value); } catch (e) {}
        renderSuggestions();
      }, 160));
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          const first = suggestionsEl && suggestionsEl.querySelector('.autocomplete-item');
          if (first) first.click();
          else {
            const q = (input.value || '').trim();
            if (q) searchFullDataset(q);
          }
        }
      });
    }

    if (fullBtn) {
      fullBtn.addEventListener('click', () => {
        const q = (input && input.value) ? input.value.trim() : '';
        if (!q) { setStatus('Digite algo antes de buscar'); return; }
        searchFullDataset(q);
      });
    }

    if (clearBtn) clearBtn.addEventListener('click', clearSelection);

if (applyBtn) {
  applyBtn.addEventListener('click', () => {
    applyBtn.disabled = true;
    setTimeout(() => applyBtn.disabled = false, 250);

    // Captura os valores do painel direito
    const velocityText = (document.getElementById('neo-velocity') || {}).textContent || '';
    const diameterText = (document.getElementById('neo-diameter') || {}).textContent || '';

    // Converte texto -> número
    const velocity = parseFloat(velocityText.replace(',', '.')) || 0;
    const diameterKm = parseFloat(diameterText.replace(',', '.')) || 0;
    const diameterMeters = diameterKm * 1000; // converte km → m

    // Atualiza os inputs do painel esquerdo
    const velInput = document.getElementById('vel');
    const diamInput = document.getElementById('diam');
    if (velInput) velInput.value = velocity.toFixed(2);
    if (diamInput) diamInput.value = diameterMeters.toFixed(1);

    setStatus('Valores aplicados à simulação.');
  });
}



    if (panelCloseBtn) panelCloseBtn.addEventListener('click', () => closeRightPanel());

    // esc fecha o painel
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (panelEl && (panelEl.style.display === '' || panelEl.dataset.open === 'true')) {
          closeRightPanel();
        }
      }
    });
  }

  async function restoreSelectionFromStorage() {
    try {
      const savedId = localStorage.getItem(KEY_SELECTED);
      if (savedId) {
        const obj = await fetchNeoById(savedId);
        if (obj) {
          populatePanel(obj);
          openRightPanel();
        }
      }
    } catch (e) {}
  }
      // restaurar valores do painel esquerdo se existirem



  function init() {
    setStatus('Inicializando NEO module...');
    attachEvents();
    prefetchInitial(PREFETCH_PAGES).then(() => {
      setStatus('Pronto');
      renderSuggestions();
      restoreSelectionFromStorage();
      // restaurar valores do painel esquerdo se existirem
      restoreLeftPanelValues();

    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else init();

  // debug exports
  window.__neoCache = neoCache;
})();
