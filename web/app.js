// LILA BLACK - Player Journey Explorer
// Vanilla JS, canvas-based. No build step, no dependencies.

const MAP_IMAGES = {
  AmbroseValley: "minimaps/AmbroseValley_Minimap.png",
  GrandRift: "minimaps/GrandRift_Minimap.png",
  Lockdown: "minimaps/Lockdown_Minimap.jpg",
};

const MOVEMENT_EVENTS = new Set(["Position", "BotPosition"]);
const KILL_LOCATION_EVENTS = new Set(["Kill", "BotKill"]); // where a kill happened, from the killer's perspective
const DEATH_LOCATION_EVENTS = new Set(["Killed", "BotKilled", "KilledByStorm"]); // where a death happened

const EVENT_STYLE = {
  Kill:          { color: "#ffd23b", shape: "circle" },
  Killed:        { color: "#ff3b5c", shape: "circle" },
  BotKill:       { color: "#ff9d3b", shape: "circle" },
  BotKilled:     { color: "#ff9d3b", shape: "circle" },
  KilledByStorm: { color: "#a15bff", shape: "triangle" },
  Loot:          { color: "#3bffb0", shape: "diamond" },
};

let DATA = null;
let mapImages = {}; // map_id -> HTMLImageElement
let currentMatch = null;
let currentMode = "paths"; // 'paths' | 'heat_traffic' | 'heat_kills' | 'heat_deaths'
let timelineMinMax = [0, 1];
let playing = false;
let playTimer = null;
let selectedPlayerIdx = null; // index into currentMatch.players, or null = show all
let frameHitTargets = []; // [{x, y, r, label}] rebuilt every render, used for hover tooltips

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

const mapSelect = document.getElementById("mapSelect");
const dateSelect = document.getElementById("dateSelect");
const matchSelect = document.getElementById("matchSelect");
const timelineSlider = document.getElementById("timelineSlider");
const timeLabel = document.getElementById("timeLabel");
const matchMeta = document.getElementById("matchMeta");
const emptyState = document.getElementById("emptyState");
const btnPlay = document.getElementById("btnPlay");
const playerListEl = document.getElementById("playerList");
const statsPanelEl = document.getElementById("statsPanel");
const tooltipEl = document.getElementById("tooltip");
const mapWrap = document.getElementById("mapWrap");

const modeButtons = {
  paths: document.getElementById("btnPaths"),
  heat_traffic: document.getElementById("btnHeatTraffic"),
  heat_kills: document.getElementById("btnHeatKills"),
  heat_deaths: document.getElementById("btnHeatDeaths"),
};

init();

async function init() {
  try {
    const res = await fetch("data.json");
    DATA = await res.json();
  } catch (e) {
    showEmpty("Could not load data.json. Make sure it's in the same folder as index.html.");
    return;
  }

  await preloadImages();
  populateMapSelect();
  wireEvents();
  onFiltersChanged();
}

function preloadImages() {
  const maps = DATA.maps && DATA.maps.length ? DATA.maps : Object.keys(MAP_IMAGES);
  const promises = maps.map((mapId) => {
    return new Promise((resolve) => {
      const src = MAP_IMAGES[mapId];
      if (!src) { resolve(); return; }
      const img = new Image();
      img.onload = () => { mapImages[mapId] = img; resolve(); };
      img.onerror = () => { resolve(); }; // still proceed without the image
      img.src = src;
    });
  });
  return Promise.all(promises);
}

function populateMapSelect() {
  const maps = DATA.maps && DATA.maps.length
    ? DATA.maps
    : [...new Set(DATA.matches.map(m => m.map_id))].sort();
  mapSelect.innerHTML = `<option value="__all__">All maps</option>` +
    maps.map(m => `<option value="${m}">${m}</option>`).join("");
}

function wireEvents() {
  mapSelect.addEventListener("change", () => { populateDateSelect(); populateMatchSelect(); onFiltersChanged(); });
  dateSelect.addEventListener("change", () => { populateMatchSelect(); onFiltersChanged(); });
  matchSelect.addEventListener("change", onFiltersChanged);

  timelineSlider.addEventListener("input", () => {
    stopPlaying();
    renderCurrentFrame();
  });

  btnPlay.addEventListener("click", togglePlay);

  Object.entries(modeButtons).forEach(([mode, btn]) => {
    btn.addEventListener("click", () => setMode(mode));
  });

  canvas.addEventListener("mousemove", onCanvasHover);
  canvas.addEventListener("mouseleave", () => { tooltipEl.style.display = "none"; });

  populateDateSelect();
  populateMatchSelect();
}

function filteredMatches() {
  const map = mapSelect.value;
  const date = dateSelect.value;
  return DATA.matches.filter(m => {
    if (map !== "__all__" && m.map_id !== map) return false;
    if (date && date !== "__all__" && m.date !== date) return false;
    return true;
  });
}

function populateDateSelect() {
  const map = mapSelect.value;
  const pool = map === "__all__" ? DATA.matches : DATA.matches.filter(m => m.map_id === map);
  const dates = [...new Set(pool.map(m => m.date))].sort();
  dateSelect.innerHTML = `<option value="__all__">All dates</option>` +
    dates.map(d => `<option value="${d}">${d.replace("_", " ")}</option>`).join("");
}

function populateMatchSelect() {
  const matches = filteredMatches();
  if (matches.length === 0) {
    matchSelect.innerHTML = `<option value="">No matches</option>`;
    return;
  }
  matchSelect.innerHTML = matches.map((m, i) => {
    const humanCount = m.players.filter(p => !p.is_bot).length;
    const botCount = m.players.length - humanCount;
    const shortId = m.match_id.slice(0, 8);
    return `<option value="${i}">${shortId}… (${humanCount}H / ${botCount}B)</option>`;
  }).join("");
}

function onFiltersChanged() {
  const matches = filteredMatches();
  updateStatsPanel(matches);

  const idx = matchSelect.value;
  if (matches.length === 0) {
    currentMatch = null;
    playerListEl.innerHTML = "";
    showEmpty("No matches for this filter combination.");
    return;
  }
  currentMatch = matches[idx] ?? matches[0];
  selectedPlayerIdx = null;
  hideEmpty();
  setupTimelineForMatch(currentMatch);
  renderPlayerList(currentMatch);
  renderCurrentFrame();
}

function setupTimelineForMatch(match) {
  let min = Infinity, max = -Infinity;
  match.players.forEach(p => p.events.forEach(e => {
    if (e.ts < min) min = e.ts;
    if (e.ts > max) max = e.ts;
  }));
  if (!isFinite(min)) { min = 0; max = 1; }
  timelineMinMax = [min, max];
  timelineSlider.min = 0;
  timelineSlider.max = 1000;
  timelineSlider.value = 1000; // start showing full match
  updateMatchMeta(match);
}

function updateMatchMeta(match) {
  const humanCount = match.players.filter(p => !p.is_bot).length;
  const botCount = match.players.length - humanCount;
  const kills = countEvents(match, ["Kill", "BotKill"]);
  const deaths = countEvents(match, ["Killed", "BotKilled", "KilledByStorm"]);
  const loot = countEvents(match, ["Loot"]);
  const [tMin, tMax] = timelineMinMax;
  matchMeta.innerHTML = `
    <div><b>Map:</b> ${match.map_id}</div>
    <div><b>Date:</b> ${match.date.replace("_", " ")}</div>
    <div><b>Match:</b> ${match.match_id.slice(0, 13)}…</div>
    <div><b>Players:</b> ${humanCount} human, ${botCount} bot</div>
    <div><b>Kills:</b> ${kills} &nbsp; <b>Deaths:</b> ${deaths} &nbsp; <b>Loot:</b> ${loot}</div>
    <div style="margin-top:6px;color:#6a6e76;font-size:11px;">
      Recorded window: ${formatMs(tMax - tMin)} — this data captures a short,
      densely-sampled snapshot per player, not a full continuous match.
    </div>
  `;
}

function countEvents(match, types) {
  const set = new Set(types);
  let n = 0;
  match.players.forEach(p => p.events.forEach(e => { if (set.has(e.event)) n++; }));
  return n;
}

function renderPlayerList(match) {
  playerListEl.innerHTML = match.players.map((p, i) => {
    const color = p.is_bot ? "#ff9d3b" : "#3b9eff";
    const label = p.is_bot ? `Bot ${p.user_id}` : `Human ${p.user_id.slice(0, 8)}…`;
    const evCount = p.events.length;
    return `<div class="player-row" data-idx="${i}">
      <span class="player-dot" style="background:${color}"></span>
      <span class="pid">${label}</span>
      <span class="pcount">${evCount} pts</span>
    </div>`;
  }).join("") + `<div id="clearIsolate">Show all players</div>`;

  playerListEl.querySelectorAll(".player-row").forEach(row => {
    row.addEventListener("click", () => {
      const idx = Number(row.dataset.idx);
      selectedPlayerIdx = (selectedPlayerIdx === idx) ? null : idx;
      updatePlayerListSelection();
      renderCurrentFrame();
    });
  });
  document.getElementById("clearIsolate").addEventListener("click", () => {
    selectedPlayerIdx = null;
    updatePlayerListSelection();
    renderCurrentFrame();
  });
  updatePlayerListSelection();
}

function updatePlayerListSelection() {
  playerListEl.querySelectorAll(".player-row").forEach(row => {
    row.classList.toggle("selected", Number(row.dataset.idx) === selectedPlayerIdx);
  });
  const clearBtn = document.getElementById("clearIsolate");
  if (clearBtn) clearBtn.style.display = selectedPlayerIdx === null ? "none" : "block";
}

function updateStatsPanel(matches) {
  if (matches.length === 0) { statsPanelEl.innerHTML = "No matches in this filter."; return; }

  let kills = 0, deaths = 0, loot = 0;
  const causeCounts = { Killed: 0, BotKilled: 0, KilledByStorm: 0 };

  matches.forEach(m => m.players.forEach(p => p.events.forEach(e => {
    if (e.event === "Kill" || e.event === "BotKill") kills++;
    if (e.event === "Loot") loot++;
    if (e.event in causeCounts) { causeCounts[e.event]++; deaths++; }
  })));

  const pct = (n) => deaths ? Math.round((n / deaths) * 100) : 0;

  statsPanelEl.innerHTML = `
    <div class="stat-line"><b>${matches.length}</b> matches in this filter</div>
    <div class="stat-line"><b>${(kills / matches.length).toFixed(1)}</b> avg kills / match</div>
    <div class="stat-line"><b>${(loot / matches.length).toFixed(1)}</b> avg loot pickups / match</div>
    <div class="stat-line" style="margin-top:6px;">Human deaths caused by:</div>
    <div class="stat-line">&nbsp;&nbsp;Other humans: <b>${pct(causeCounts.Killed)}%</b></div>
    <div class="stat-line">&nbsp;&nbsp;Bots: <b>${pct(causeCounts.BotKilled)}%</b></div>
    <div class="stat-line">&nbsp;&nbsp;The storm: <b>${pct(causeCounts.KilledByStorm)}%</b></div>
  `;
}

function currentTimeMs() {
  const [min, max] = timelineMinMax;
  const frac = Number(timelineSlider.value) / 1000;
  return min + frac * (max - min);
}

function formatMs(ms) {
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function setMode(mode) {
  currentMode = mode;
  Object.entries(modeButtons).forEach(([m, btn]) => btn.classList.toggle("active", m === mode));
  renderCurrentFrame();
}

function togglePlay() {
  if (playing) { stopPlaying(); return; }
  playing = true;
  btnPlay.textContent = "⏸ Pause";
  const step = 4; // slider units per tick
  playTimer = setInterval(() => {
    let v = Number(timelineSlider.value) + step;
    if (v >= 1000) { v = 1000; stopPlaying(); }
    timelineSlider.value = v;
    renderCurrentFrame();
  }, 60);
}

function stopPlaying() {
  playing = false;
  btnPlay.textContent = "▶ Play";
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
}

function renderCurrentFrame() {
  if (!currentMatch) return;
  const now = currentTimeMs();
  const [min, max] = timelineMinMax;
  timeLabel.textContent = `${formatMs(now - min)} / ${formatMs(max - min)}`;

  if (currentMode === "paths") {
    drawMatchPaths(currentMatch, now);
  } else {
    drawHeatmap(currentMode);
  }
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawBackground(mapId) {
  clearCanvas();
  const img = mapImages[mapId];
  if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

function drawMatchPaths(match, uptoTs) {
  drawBackground(match.map_id);
  frameHitTargets = [];

  match.players.forEach((player, idx) => {
    const isBot = player.is_bot;
    const isDimmed = selectedPlayerIdx !== null && selectedPlayerIdx !== idx;
    const pathColor = isBot ? "#ff9d3b" : "#3b9eff";
    const pathPoints = player.events
      .filter(e => MOVEMENT_EVENTS.has(e.event) && e.ts <= uptoTs)
      .sort((a, b) => a.ts - b.ts);

    const baseAlpha = isDimmed ? 0.08 : (isBot ? 0.55 : 0.85);

    if (pathPoints.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = pathColor;
      ctx.globalAlpha = baseAlpha;
      ctx.lineWidth = isBot ? 1.5 : 2.2;
      if (isBot) ctx.setLineDash([4, 3]); else ctx.setLineDash([]);
      pathPoints.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.px, p.py);
        else ctx.lineTo(p.px, p.py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // current position dot
    if (pathPoints.length > 0) {
      const last = pathPoints[pathPoints.length - 1];
      ctx.beginPath();
      ctx.fillStyle = pathColor;
      ctx.globalAlpha = isDimmed ? 0.15 : 1;
      ctx.arc(last.px, last.py, isBot ? 3 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!isDimmed) {
        frameHitTargets.push({
          x: last.px, y: last.py, r: 8,
          label: `${isBot ? "Bot" : "Human"} ${player.user_id} — last seen ${formatMs(last.ts - timelineMinMax[0])}`,
        });
      }
    }

    // discrete events up to now
    if (!isDimmed) {
      player.events
        .filter(e => !MOVEMENT_EVENTS.has(e.event) && e.ts <= uptoTs)
        .forEach(e => drawEventMarker(e, player));
    }
  });
}

function drawEventMarker(e, player) {
  const style = EVENT_STYLE[e.event];
  if (!style) return;
  ctx.fillStyle = style.color;
  ctx.strokeStyle = "#00000088";
  ctx.lineWidth = 1;

  const { px: x, py: y } = e;
  const r = 6;

  if (style.shape === "circle") {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  } else if (style.shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x - r, y + r);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (style.shape === "diamond") {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  if (player) {
    const who = player.is_bot ? `Bot ${player.user_id}` : `Human ${player.user_id.slice(0, 8)}…`;
    frameHitTargets.push({
      x, y, r: r + 3,
      label: `${e.event} — ${who} @ ${formatMs(e.ts - timelineMinMax[0])}`,
    });
  }
}

function onCanvasHover(evt) {
  if (currentMode !== "paths" || frameHitTargets.length === 0) {
    tooltipEl.style.display = "none";
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width; // canvas is square, so x/y scale match
  const mx = (evt.clientX - rect.left) * scale;
  const my = (evt.clientY - rect.top) * scale;

  let best = null, bestDist = Infinity;
  for (const t of frameHitTargets) {
    const d = Math.hypot(t.x - mx, t.y - my);
    if (d < t.r + 6 && d < bestDist) { best = t; bestDist = d; }
  }

  if (best) {
    tooltipEl.textContent = best.label;
    tooltipEl.style.left = `${(best.x / canvas.width) * 100}%`;
    tooltipEl.style.top = `${(best.y / canvas.height) * 100}%`;
    tooltipEl.style.display = "block";
  } else {
    tooltipEl.style.display = "none";
  }
}

// --- Heatmaps: aggregated over all matches currently in the filtered set ---
function drawHeatmap(mode) {
  const matches = filteredMatches();
  if (matches.length === 0) return;

  // Heatmap needs a single map background — use the selected map,
  // or the map of the first filtered match if "All maps" is selected.
  const mapId = mapSelect.value !== "__all__" ? mapSelect.value : matches[0].map_id;
  drawBackground(mapId);

  const eventSet = mode === "heat_kills" ? KILL_LOCATION_EVENTS
    : mode === "heat_deaths" ? DEATH_LOCATION_EVENTS
    : MOVEMENT_EVENTS;

  // Bin into a grid for density, then render as translucent colored cells.
  const bins = 48;
  const cell = canvas.width / bins;
  const grid = new Float32Array(bins * bins);
  let maxCount = 0;

  matches.forEach(match => {
    if (match.map_id !== mapId) return;
    match.players.forEach(player => {
      player.events.forEach(e => {
        if (!eventSet.has(e.event)) return;
        const bx = Math.min(bins - 1, Math.max(0, Math.floor(e.px / cell)));
        const by = Math.min(bins - 1, Math.max(0, Math.floor(e.py / cell)));
        const idx = by * bins + bx;
        grid[idx]++;
        if (grid[idx] > maxCount) maxCount = grid[idx];
      });
    });
  });

  if (maxCount === 0) return;

  for (let by = 0; by < bins; by++) {
    for (let bx = 0; bx < bins; bx++) {
      const v = grid[by * bins + bx];
      if (v === 0) continue;
      const t = Math.pow(v / maxCount, 0.45); // gamma so hotspots pop without washing out
      ctx.fillStyle = heatColor(t, mode);
      ctx.fillRect(bx * cell, by * cell, cell + 1, cell + 1);
    }
  }
}

function heatColor(t, mode) {
  // t in [0,1]. Different hue per mode, alpha scales with intensity.
  const alpha = 0.15 + t * 0.65;
  if (mode === "heat_kills") return `rgba(255, ${Math.round(180 - t * 140)}, 40, ${alpha})`;
  if (mode === "heat_deaths") return `rgba(255, 40, ${Math.round(60 + t * 40)}, ${alpha})`;
  return `rgba(59, ${Math.round(120 + t * 100)}, 255, ${alpha})`; // traffic = blue
}

function showEmpty(msg) {
  emptyState.style.display = "flex";
  emptyState.textContent = msg;
  clearCanvas();
}
function hideEmpty() {
  emptyState.style.display = "none";
}
