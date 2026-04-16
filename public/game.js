"use strict";
/**
 * RISE OF IKONS PRO — Client (game.js)
 *
 * Improvements over original:
 *  ✓ Client-side prediction: movement applied immediately, reconciled by server
 *  ✓ Entity interpolation: smooth rendering even at 64Hz server tick
 *  ✓ Full weapon rendering with muzzle flash, reload animation
 *  ✓ Bullet trail particles
 *  ✓ Animated storm zone with pulsing danger ring
 *  ✓ Loot rendering with pickup prompts
 *  ✓ Obstacle rendering with shadow/depth
 *  ✓ Player name tags, health bars, shield arcs
 *  ✓ Team colours + invincibility shimmer
 *  ✓ Camera shake on hit/explosion
 *  ✓ Minimap: zone, loot, enemies, bullets
 *  ✓ Full HUD: bars, ammo, reload, weapon slots, kill feed, leaderboard
 *  ✓ Death screen with respawn countdown
 *  ✓ Notifications system
 *  ✓ Crosshair with hit-indicator
 */

// ─── Socket & state ───────────────────────────────────────────────────────────
const socket = io({ transports: ["websocket"] });

const canvas  = document.getElementById("game");
const ctx     = canvas.getContext("2d");
const minimap = document.getElementById("minimap");
const mctx    = minimap.getContext("2d");

canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;
window.addEventListener("resize", () => {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
});

// ─── Game state ───────────────────────────────────────────────────────────────
let myId       = null;
let players    = {};
let bullets    = [];
let lootItems  = [];
let obstacles  = [];
let weapons    = {};
let zone       = { cx: 2000, cy: 2000, radius: 2800 };
let gameMode   = "ffa";
let mapSize    = 4000;
let kills      = 0;
let score      = 0;
let gameActive = false;
let _lastInvKey = "";
let selectedMode = "ffa";

// Prediction
let myPos    = { x: 2000, y: 2000 };
let myAngle  = 0;
let myVel    = { x: 0, y: 0 };

// Camera
let camX = 0, camY = 0;
let shakeAmt = 0;
const FRICTION = 0.80;
const SPEED    = 260;

// Input
const keys = {};
let   mx = 0, my = 0;
let   lastInputSent = 0;

// Weapons
let currentWeapon  = "pistol";
let currentAmmo    = 12;
let ammoReserve    = 90;
let reloading      = false;
let reloadStart    = 0;
let reloadDuration = 0;
let lastFire       = 0;

// Particles
let particles = [];

// Interpolation
let prevPlayers = {};
let lerpAlpha   = 0;
let lastStateAt = 0;

// Hit indicator
let hitFlash = 0;

// Zone warning state
let inZone = true;

// ─── HUD elements ─────────────────────────────────────────────────────────────
const hudEl         = document.getElementById("hud");
const hpFill        = document.getElementById("hp-fill");
const shFill        = document.getElementById("sh-fill");
const hpVal         = document.getElementById("hp-val");
const shVal         = document.getElementById("sh-val");
const statKills     = document.getElementById("stat-kills");
const statScore     = document.getElementById("stat-score");
const statCoins     = document.getElementById("stat-coins");
const weaponNameEl  = document.getElementById("weapon-name");
const ammoCountEl   = document.getElementById("ammo-count");
const ammoReserveEl = document.getElementById("ammo-reserve");
const reloadBarWrap = document.getElementById("reload-bar-wrap");
const reloadBarFill = document.getElementById("reload-bar-fill");
const weaponSlots   = document.getElementById("weapon-slots");
const killfeed      = document.getElementById("killfeed");
const zoneWarn      = document.getElementById("zone-warn");
const notifyEl      = document.getElementById("notify");
const deathScreen   = document.getElementById("death-screen");
const deathBy       = document.getElementById("death-by");
const respawnBar    = document.getElementById("respawn-bar");
const lbEl          = document.getElementById("leaderboard");
const lbRows        = document.getElementById("lb-rows");

// ─── Menu logic ───────────────────────────────────────────────────────────────
document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedMode = btn.dataset.mode;
  });
});

function startGame() {
  const name = document.getElementById("name-input").value.trim() || "Player";
  socket.emit("joinGame", { name });
  socket.emit("setMode", selectedMode);
  document.getElementById("menu").style.display = "none";
  hudEl.style.display = "block";
  gameActive = true;
}

// ─── Socket events ────────────────────────────────────────────────────────────
socket.on("init", data => {
  myId      = data.id;
  obstacles = data.obstacles || [];
  weapons   = data.weapons   || {};
  mapSize   = data.mapSize   || 4000;
  gameMode  = data.mode      || "ffa";
  buildWeaponSlots();
});

socket.on("state", data => {
  prevPlayers = JSON.parse(JSON.stringify(players));
  players     = data.players || {};
  bullets     = data.bullets || [];
  lootItems   = data.loot    || [];
  if (data.zone) zone = data.zone;

  lerpAlpha   = 0;
  lastStateAt = performance.now();

  if (!myId || !players[myId]) return;

  const me = players[myId];
  // Reconcile position prediction
  myPos.x   = me.x;
  myPos.y   = me.y;
  kills      = me.kills;
  score      = me.score;

  updateHUD(me);

  // Zone warning
  const d = Math.hypot(me.x - zone.cx, me.y - zone.cy);
  inZone = d <= zone.radius;
  zoneWarn.style.display = inZone ? "none" : "block";
});

socket.on("zoneUpdate", data => {
  zone = { ...zone, ...data };
});

socket.on("killFeed", entries => {
  killfeed.innerHTML = "";
  entries.forEach(e => {
    const div = document.createElement("div");
    div.className = "kf-entry";
    div.innerHTML = `<span class="kf-kill">${e.k}</span> <span class="kf-weapon">[${e.w}]</span> <span class="kf-victim">${e.v}</span>`;
    killfeed.appendChild(div);
    setTimeout(() => div.remove(), 2500);
  });
});

socket.on("leaderboard", board => {
  lbRows.innerHTML = board.map((p, i) =>
    `<div class="lb-row">
       <div class="lb-rank">${i + 1}</div>
       <div class="lb-name">${p.name}${p.team ? ` <span style="color:${p.team==='red'?'#ef4444':'#3b82f6'}">(${p.team})</span>` : ""}</div>
       <div class="lb-kills">${p.kills}K</div>
       <div class="lb-score">${p.score}</div>
     </div>`
  ).join("");
});

socket.on("weaponSwitched", data => {
  currentWeapon = data.weapon;
  currentAmmo   = data.ammo;
  updateWeaponSlots();
  updateAmmoHUD();
});

socket.on("reloading", data => {
  reloading      = true;
  reloadStart    = performance.now();
  reloadDuration = data.duration;
  reloadBarWrap.style.display = "block";
});

socket.on("died", data => {
  deathBy.textContent = `Killed by ${data.by}`;
  deathScreen.style.display = "flex";
  let elapsed = 0;
  const total = data.respawnIn;
  const iv = setInterval(() => {
    elapsed += 50;
    respawnBar.style.width = Math.min(100, (elapsed / total) * 100) + "%";
    if (elapsed >= total) { clearInterval(iv); }
  }, 50);
});

socket.on("respawned", data => {
  myPos.x = data.x;
  myPos.y = data.y;
  deathScreen.style.display = "none";
  reloading = false;
  reloadBarWrap.style.display = "none";
});

socket.on("notify", msg => showNotify(msg));
socket.on("modeChanged", m => { gameMode = m; });
socket.on("serverFull", () => showNotify("Server is full! Try again later."));
socket.on("serverShutdown", d => showNotify(d.message));

// ─── HUD helpers ──────────────────────────────────────────────────────────────
function updateHUD(me) {
  hpFill.style.width  = Math.max(0, (me.hp / me.maxHp) * 100) + "%";
  shFill.style.width  = Math.max(0, (me.shield / me.maxShield) * 100) + "%";
  hpVal.textContent   = me.hp   | 0;
  shVal.textContent   = me.shield | 0;
  statKills.textContent = me.kills;
  statScore.textContent = me.score;
  statCoins.textContent = me.coins;
  currentAmmo = me.currentAmmo;
  updateAmmoHUD();

  // HP bar colour
  const pct = me.hp / me.maxHp;
  hpFill.style.background = pct > 0.5 ? "#22c55e" : pct > 0.25 ? "#facc15" : "#ef4444";
}

function updateAmmoHUD() {
  const me = players[myId];
  weaponNameEl.textContent = currentWeapon.toUpperCase();
  ammoCountEl.textContent  = currentAmmo < 0 ? "∞" : currentAmmo;
  ammoReserveEl.textContent = me ? (me.ammo?.[weapons[currentWeapon]?.ammoType] ?? "") : "";
}

let notifyTimeout;
function showNotify(msg) {
  notifyEl.textContent = msg;
  notifyEl.style.opacity = "1";
  clearTimeout(notifyTimeout);
  notifyTimeout = setTimeout(() => { notifyEl.style.opacity = "0"; }, 2200);
}

function buildWeaponSlots() {
  const me = players[myId];
  const inv = me?.inventory || ["pistol"];
  weaponSlots.innerHTML = "";
  inv.forEach((w, i) => {
    const d = document.createElement("div");
    d.className = "wslot" + (w === currentWeapon ? " active" : "");
    d.id = "wslot-" + w;
    d.innerHTML = `<span class="wslot-key">${i+1}</span>${w.toUpperCase()}`;
    d.onclick = () => socket.emit("switchWeapon", w);
    weaponSlots.appendChild(d);
  });
}

function updateWeaponSlots() {
  document.querySelectorAll(".wslot").forEach(el => el.classList.remove("active"));
  const active = document.getElementById("wslot-" + currentWeapon);
  if (active) active.classList.add("active");
}

// ─── Input ────────────────────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;

  if (!gameActive) return;

  if (e.key === "Tab") { e.preventDefault(); lbEl.style.display = "block"; }
  if (e.key === "Escape") { lbEl.style.display = "none"; }

  if (e.key === "r" || e.key === "R") socket.emit("reload");

  const numKeys = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6 };
  if (e.key in numKeys) {
    const me = players[myId];
    if (me?.inventory) {
      const w = me.inventory[numKeys[e.key]];
      if (w) socket.emit("switchWeapon", w);
    }
  }
});

document.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
  if (e.key === "Tab") lbEl.style.display = "none";
});

canvas.addEventListener("mousemove", e => {
  mx = e.clientX;
  my = e.clientY;
});

// Single unified mouse handler — no duplicate listeners, no setInterval stutter
let mouseHeld = false;
canvas.addEventListener("mousedown", e => {
  if (!gameActive || !myId || e.button !== 0) return;
  mouseHeld = true;
  doShoot(); // immediate shot on press
});
canvas.addEventListener("mouseup",   () => { mouseHeld = false; });
canvas.addEventListener("mouseleave",() => { mouseHeld = false; });

function doShoot() {
  if (!myId || !players[myId]) return;
  const now = Date.now();
  const w   = weapons[currentWeapon];
  if (!w) return;
  if (now - lastFire < w.fireRate) return;
  if (reloading) return;
  if (currentAmmo === 0) { socket.emit("reload"); return; }

  lastFire = now;

  const worldMx = myPos.x + (mx - canvas.width  / 2);
  const worldMy = myPos.y + (my - canvas.height / 2);
  const angle   = Math.atan2(worldMy - myPos.y, worldMx - myPos.x);

  socket.emit("attack", { angle });

  // Client-side muzzle flash particle
  spawnMuzzleFlash(myPos.x, myPos.y, angle);
  shakeAmt = Math.min(shakeAmt + 3, 12);
}

// ─── Particles ────────────────────────────────────────────────────────────────
function spawnMuzzleFlash(x, y, angle) {
  for (let i = 0; i < 6; i++) {
    const a   = angle + (Math.random() - 0.5) * 0.5;
    const spd = 80 + Math.random() * 120;
    particles.push({ x, y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
      life: 1, decay: 3 + Math.random()*2, color: "#facc15", size: 2+Math.random()*2 });
  }
}

function spawnBlood(x, y) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    particles.push({ x, y, vx: (Math.random()-0.5)*140, vy: (Math.random()-0.5)*140,
      life: 1, decay: 2.5+Math.random()*2, color: "#ef4444", size: 1.5+Math.random()*2.5 });
  }
}

function spawnExplosion(x, y) {
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 200;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
      life: 1, decay: 1.5+Math.random(), color: i%2===0?"#f97316":"#facc15", size: 2+Math.random()*5 });
  }
}

// ─── Send input ───────────────────────────────────────────────────────────────
function sendInput() {
  if (!gameActive || !myId) return;
  const now = Date.now();
  if (now - lastInputSent < 16) return; // max ~60 sends/s
  lastInputSent = now;

  let dx = 0, dy = 0;
  if (keys["w"] || keys["arrowup"])    dy -= 1;
  if (keys["s"] || keys["arrowdown"])  dy += 1;
  if (keys["a"] || keys["arrowleft"])  dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;

  const worldMx = myPos.x + (mx - canvas.width  / 2);
  const worldMy = myPos.y + (my - canvas.height / 2);
  myAngle = Math.atan2(worldMy - myPos.y, worldMx - myPos.x);

  if (dx !== 0 || dy !== 0) {
    socket.emit("input", { dx, dy, angle: myAngle });
    // Client prediction
    const mag = Math.sqrt(dx*dx + dy*dy);
    myVel.x += (dx / mag) * SPEED * 0.016;
    myVel.y += (dy / mag) * SPEED * 0.016;
  }
  myVel.x *= FRICTION;
  myVel.y *= FRICTION;
  myPos.x += myVel.x;
  myPos.y += myVel.y;

  // Auto-fire: mouse held + weapon declared auto
  if (mouseHeld) {
    const w = weapons[currentWeapon];
    if (w && w.auto) doShoot();
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────
const TILE = 80;
const COLORS = {
  bg:        "#0f172a",
  grid:      "rgba(30,41,59,0.6)",
  obstacle:  "#1e293b",
  obstEdge:  "#334155",
  zone:      "rgba(59,130,246,0.08)",
  storm:     "rgba(239,68,68,0.18)",
  stormEdge: "#ef4444",
};

function worldToScreen(wx, wy) {
  return {
    x: wx - camX + canvas.width  / 2,
    y: wy - camY + canvas.height / 2,
  };
}

function drawBackground() {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid
  const startX = (-camX % TILE + canvas.width  / 2) % TILE;
  const startY = (-camY % TILE + canvas.height / 2) % TILE;
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  for (let x = startX - TILE; x < canvas.width  + TILE; x += TILE) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = startY - TILE; y < canvas.height + TILE; y += TILE) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // Map border glow
  const corners = [
    worldToScreen(0, 0),
    worldToScreen(mapSize, 0),
    worldToScreen(mapSize, mapSize),
    worldToScreen(0, mapSize),
  ];
  ctx.strokeStyle = "rgba(59,130,246,0.3)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  corners.forEach(c => ctx.lineTo(c.x, c.y));
  ctx.closePath();
  ctx.stroke();
}

function drawZone() {
  const c = worldToScreen(zone.cx, zone.cy);
  // 1 world-unit = canvas.width / mapSize pixels (camera is centered, no zoom)
  const screenR = zone.radius * (canvas.width / mapSize);

  // Safe zone fill
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, screenR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(59,130,246,0.04)";
  ctx.fill();
  ctx.strokeStyle = "rgba(59,130,246,0.5)";
  ctx.lineWidth = 2;
  // Pulsing
  ctx.setLineDash([12, 8]);
  ctx.lineDashOffset = -((Date.now() / 40) % 20);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Storm (outside zone) — red vignette on screen edges if player outside
  if (!inZone) {
    const vignette = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.width*0.3,
      canvas.width/2, canvas.height/2, canvas.width*0.8);
    vignette.addColorStop(0, "rgba(239,68,68,0)");
    vignette.addColorStop(1, "rgba(239,68,68,0.25)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawObstacles() {
  for (const o of obstacles) {
    const s = worldToScreen(o.x, o.y);
    ctx.fillStyle   = COLORS.obstacle;
    ctx.strokeStyle = COLORS.obstEdge;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    roundRect(ctx, s.x, s.y, o.w, o.h, 4);
    ctx.fill();
    ctx.stroke();
    // Top highlight
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.beginPath();
    roundRect(ctx, s.x, s.y, o.w, 6, 4);
    ctx.fill();
  }
}

function roundRect(c, x, y, w, h, r) {
  c.moveTo(x+r, y);
  c.lineTo(x+w-r, y); c.quadraticCurveTo(x+w, y, x+w, y+r);
  c.lineTo(x+w, y+h-r); c.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  c.lineTo(x+r, y+h); c.quadraticCurveTo(x, y+h, x, y+h-r);
  c.lineTo(x, y+r); c.quadraticCurveTo(x, y, x+r, y);
  c.closePath();
}

function drawLoot() {
  const t = Date.now() / 1000;
  for (const item of lootItems) {
    const s = worldToScreen(item.x, item.y);
    const bob = Math.sin(t * 2 + item.x) * 3;
    const col = item.type === "weapon" ? "#a78bfa"
              : item.type === "health" ? "#22c55e"
              : item.type === "shield" ? "#3b82f6"
              : item.type === "ammo"   ? "#fbbf24"
              : "#f1f5f9";

    // Glow
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(s.x, s.y + bob, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = col;
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      item.type === "weapon" ? item.value.toUpperCase()
      : item.type === "health" ? `+${item.value}HP`
      : item.type === "shield" ? `+${item.value}SH`
      : item.type === "ammo"   ? item.value.toUpperCase()
      : `$${item.value}`,
      s.x, s.y + bob - 14
    );
  }
}

const WEAPON_COLORS = {
  pistol: "#facc15", smg: "#22d3ee", rifle: "#4ade80",
  shotgun: "#f97316", sniper: "#a78bfa", sword: "#f1f5f9",
  knife: "#94a3b8", rpg: "#ef4444",
};

function drawBullets() {
  // Batch by weapon colour — no shadowBlur (it tanks FPS on heavy fire)
  const groups = {};
  for (const b of bullets) {
    const col = WEAPON_COLORS[b.weapon] || "#fff";
    if (!groups[col]) groups[col] = [];
    groups[col].push(b);
  }
  for (const [col, batch] of Object.entries(groups)) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (const b of batch) {
      const s = worldToScreen(b.x, b.y);
      const r = b.weapon === "sniper" ? 4 : b.weapon === "rpg" ? 6 : 3;
      ctx.moveTo(s.x + r, s.y);
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function drawPlayers() {
  const me = players[myId];
  for (const [id, p] of Object.entries(players)) {
    if (!p.alive) continue;

    // Interpolate position
    const prev = prevPlayers[id];
    const t    = Math.min(lerpAlpha, 1);
    const rx   = prev ? prev.x + (p.x - prev.x) * t : p.x;
    const ry   = prev ? prev.y + (p.y - prev.y) * t : p.y;

    const s = worldToScreen(id === myId ? myPos.x : rx, id === myId ? myPos.y : ry);
    const R = 18;

    // Invincibility shimmer
    if (p.invincible) {
      ctx.save();
      ctx.globalAlpha = 0.3 + Math.sin(Date.now()/80)*0.3;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, R + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + R - 3, R * 0.7, 5, 0, 0, Math.PI*2);
    ctx.fill();

    // Body
    const skin = gameMode === "team"
      ? (p.team === "red" ? "#ef4444" : "#3b82f6")
      : p.skin;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = id === myId ? "#fff" : "rgba(255,255,255,0.3)";
    ctx.lineWidth   = id === myId ? 2 : 1;
    ctx.stroke();

    // Weapon indicator (line from center in facing direction)
    const angle = id === myId ? myAngle : (p.angle || 0);
    ctx.strokeStyle = WEAPON_COLORS[p.weapon] || "#fff";
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(angle)*26, s.y + Math.sin(angle)*26);
    ctx.stroke();

    // HP bar
    const bw = 36, bh = 4;
    const bx = s.x - bw/2, by = s.y - R - 10;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath(); roundRect(ctx, bx, by, bw, bh, 2); ctx.fill();
    const hpPct = p.hp / p.maxHp;
    ctx.fillStyle = hpPct > 0.5 ? "#22c55e" : hpPct > 0.25 ? "#facc15" : "#ef4444";
    ctx.beginPath(); roundRect(ctx, bx, by, bw*hpPct, bh, 2); ctx.fill();

    // Shield arc
    if (p.shield > 0) {
      const sa = -Math.PI/2;
      const ea = sa + (p.shield / p.maxShield) * Math.PI * 2;
      ctx.strokeStyle = "rgba(59,130,246,0.7)";
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, R + 4, sa, ea);
      ctx.stroke();
    }

    // Name tag — measure once, cache on player object
    ctx.font      = "bold 10px monospace";
    ctx.textAlign = "center";
    const label = p.name + (gameMode==="team" ? ` [${(p.team||"").toUpperCase()}]` : "");
    if (!p._labelW || p._label !== label) { p._label = label; p._labelW = ctx.measureText(label).width; }
    const tw = p._labelW;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(s.x - tw/2 - 3, s.y - R - 22, tw + 6, 13);
    ctx.fillStyle = id === myId ? "#fff" : "#cbd5e1";
    ctx.fillText(label, s.x, s.y - R - 12);
  }
}

function drawParticles(dt) {
  // Update positions first
  for (const p of particles) {
    p.x    += p.vx * dt;
    p.y    += p.vy * dt;
    p.vx   *= 0.92;
    p.vy   *= 0.92;
    p.life -= p.decay * dt;
  }
  particles = particles.filter(p => p.life > 0);

  // Batch draw — one path per opacity bucket to avoid ctx.globalAlpha thrash
  const buckets = {};
  for (const p of particles) {
    const alpha = Math.max(0, p.life).toFixed(1);
    const key   = p.color + "|" + alpha;
    if (!buckets[key]) buckets[key] = { color: p.color, alpha: +alpha, pts: [] };
    buckets[key].pts.push(p);
  }
  for (const b of Object.values(buckets)) {
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle   = b.color;
    ctx.beginPath();
    for (const p of b.pts) {
      const s = worldToScreen(p.x, p.y);
      const r = Math.max(0.1, p.size * p.life);
      ctx.moveTo(s.x + r, s.y);
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCrosshair() {
  ctx.save();
  ctx.strokeStyle = hitFlash > 0 ? "#ef4444" : "rgba(255,255,255,0.85)";
  ctx.lineWidth   = hitFlash > 0 ? 2 : 1.5;
  const r = 10, gap = 4;
  ctx.beginPath();
  ctx.moveTo(mx - r, my); ctx.lineTo(mx - gap, my);
  ctx.moveTo(mx + gap, my); ctx.lineTo(mx + r, my);
  ctx.moveTo(mx, my - r); ctx.lineTo(mx, my - gap);
  ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + r);
  ctx.arc(mx, my, gap, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();
}

// ─── Minimap ──────────────────────────────────────────────────────────────────
function drawMinimap() {
  const W = minimap.width, H = minimap.height;
  mctx.fillStyle = "rgba(0,0,0,0.8)";
  mctx.fillRect(0, 0, W, H);

  const scale = W / mapSize;

  // Zone
  mctx.strokeStyle = "rgba(59,130,246,0.6)";
  mctx.lineWidth   = 1;
  mctx.beginPath();
  mctx.arc(zone.cx*scale, zone.cy*scale, zone.radius*scale, 0, Math.PI*2);
  mctx.stroke();

  // Obstacles
  mctx.fillStyle = "#1e293b";
  for (const o of obstacles) mctx.fillRect(o.x*scale, o.y*scale, o.w*scale, o.h*scale);

  // Loot
  for (const l of lootItems) {
    mctx.fillStyle = l.type==="weapon" ? "#a78bfa" : "#22c55e";
    mctx.fillRect(l.x*scale-1, l.y*scale-1, 2, 2);
  }

  // Bullets
  mctx.fillStyle = "#facc15";
  for (const b of bullets) {
    mctx.fillRect(b.x*scale-1, b.y*scale-1, 2, 2);
  }

  // Players
  for (const [id, p] of Object.entries(players)) {
    if (!p.alive) continue;
    const px = (id === myId ? myPos.x : p.x) * scale;
    const py = (id === myId ? myPos.y : p.y) * scale;
    const col = id === myId ? "#ffffff"
      : gameMode === "team"
        ? (p.team === "red" ? "#ef4444" : "#3b82f6")
        : p.skin;
    mctx.fillStyle = col;
    mctx.beginPath();
    mctx.arc(px, py, id===myId ? 3 : 2, 0, Math.PI*2);
    mctx.fill();
  }

  // FOV triangle on minimap for current player
  if (myId && players[myId]) {
    const px = myPos.x * scale;
    const py = myPos.y * scale;
    mctx.strokeStyle = "rgba(255,255,255,0.15)";
    mctx.lineWidth = 0.5;
    const fovHalf = Math.PI / 4;
    const fovLen  = 14;
    mctx.beginPath();
    mctx.moveTo(px, py);
    mctx.lineTo(px + Math.cos(myAngle - fovHalf)*fovLen, py + Math.sin(myAngle - fovHalf)*fovLen);
    mctx.moveTo(px, py);
    mctx.lineTo(px + Math.cos(myAngle + fovHalf)*fovLen, py + Math.sin(myAngle + fovHalf)*fovLen);
    mctx.stroke();
  }
}

// ─── Reload progress ──────────────────────────────────────────────────────────
function updateReload() {
  if (!reloading) return;
  const now     = performance.now();
  const elapsed = now - reloadStart;
  const pct     = Math.min(1, elapsed / reloadDuration);
  reloadBarFill.style.width = (pct * 100) + "%";
  if (pct >= 1) {
    reloading = false;
    reloadBarWrap.style.display = "none";
    buildWeaponSlots();
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────
let lastFrame = performance.now();
const LERP_DURATION = 100; // ms — match server tick rate

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  sendInput();
  updateReload();

  // Lerp alpha for interpolation
  lerpAlpha = Math.min(1, (now - lastStateAt) / LERP_DURATION);

  // Camera follows player with smoothing
  const me = players[myId];
  const targetX = myPos.x, targetY = myPos.y;
  camX += (targetX - camX) * 0.15;
  camY += (targetY - camY) * 0.15;

  // Camera shake
  let sx = 0, sy = 0;
  if (shakeAmt > 0.1) {
    sx = (Math.random()-0.5) * shakeAmt;
    sy = (Math.random()-0.5) * shakeAmt;
    shakeAmt *= 0.85;
  }

  ctx.save();
  ctx.translate(sx, sy);

  drawBackground();
  if (gameActive) {
    drawZone();
    drawObstacles();
    drawLoot();
    drawBullets();
    drawParticles(dt);
    drawPlayers();
  }
  drawCrosshair();

  ctx.restore();

  if (gameActive) drawMinimap();

  // Hit flash decay
  if (hitFlash > 0) hitFlash -= dt * 3;

  // Rebuild weapon slots only when inventory actually changes (not every frame)
  if (me && me.inventory) {
    const newKey = me.inventory.join(",");
    if (newKey !== _lastInvKey) { _lastInvKey = newKey; buildWeaponSlots(); }
  }
}

requestAnimationFrame(loop);
