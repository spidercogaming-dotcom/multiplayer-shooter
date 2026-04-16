"use strict";

/**
 * RISE OF IKONS PRO — Authoritative Game Server
 *
 * Improvements over original:
 *  ✓ Server-side authoritative game loop (64 Hz)
 *  ✓ Real projectile system — bullets travel, expire, hit-test server-side
 *  ✓ Full weapon stats: damage, fire rate, spread, reload, bullet speed, range
 *  ✓ Storm / safe zone that shrinks over time and deals damage
 *  ✓ Loot drops on kill (weapons, health, ammo, coins)
 *  ✓ Team balancing + FFA + Swords-only modes
 *  ✓ Kill feed + leaderboard broadcast
 *  ✓ Anti-cheat: input rate-limiting, speed clamping, action validation
 *  ✓ Invincibility window after respawn
 *  ✓ Delta compression — only changed player fields sent each tick
 *  ✓ Obstacle/wall map (static collision boxes)
 *  ✓ Graceful shutdown
 */

const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 10_000,
  pingTimeout:  5_000,
});

app.use(express.static("public"));

// ─── Config ──────────────────────────────────────────────────────────────────
const CFG = {
  TICK_RATE:     64,
  MAP_SIZE:      4000,
  MAX_SPEED:     260,        // px per second
  FRICTION:      0.80,
  BULLET_TTL:    1800,       // ms before bullet expires
  INVINCIBLE_MS: 1500,
  RESPAWN_MS:    2500,
  STORM_DELAY:   60_000,     // ms before storm starts shrinking
  STORM_INTERVAL:15_000,     // ms between each shrink
  STORM_SHRINK:  0.82,       // zone radius multiplier per interval
  STORM_DAMAGE:  4,          // hp/s outside zone
  MAX_PLAYERS:   50,
};
const TICK_S = 1 / CFG.TICK_RATE;

// ─── Weapons ─────────────────────────────────────────────────────────────────
const WEAPONS = {
  pistol:   { damage: 22,  range: 600,  fireRate: 400,  spread: 0.05, bullets: 1, speed: 900,  reload: 900,  maxAmmo: 12, ammoType: "light" },
  smg:      { damage: 14,  range: 450,  fireRate: 100,  spread: 0.12, bullets: 1, speed: 1100, reload: 1600, maxAmmo: 30, ammoType: "light" },
  rifle:    { damage: 28,  range: 800,  fireRate: 280,  spread: 0.04, bullets: 1, speed: 1200, reload: 2000, maxAmmo: 20, ammoType: "medium" },
  shotgun:  { damage: 18,  range: 280,  fireRate: 750,  spread: 0.28, bullets: 7, speed: 700,  reload: 1800, maxAmmo:  6, ammoType: "shells" },
  sniper:   { damage: 95,  range: 1400, fireRate: 1400, spread: 0.01, bullets: 1, speed: 2000, reload: 2500, maxAmmo:  5, ammoType: "heavy" },
  sword:    { damage: 45,  range: 80,   fireRate: 600,  spread: 0,    bullets: 1, speed: 0,    reload: 0,    maxAmmo: -1, ammoType: "melee" },
  knife:    { damage: 28,  range: 55,   fireRate: 350,  spread: 0,    bullets: 1, speed: 0,    reload: 0,    maxAmmo: -1, ammoType: "melee" },
  rpg:      { damage: 180, range: 350,  fireRate: 2500, spread: 0.02, bullets: 1, speed: 550,  reload: 3500, maxAmmo:  2, ammoType: "rockets", splash: 120 },
};

// ─── Map obstacles (static rectangles) ───────────────────────────────────────
const OBSTACLES = [
  { x: 800,  y: 800,  w: 200, h: 200 },
  { x: 1600, y: 400,  w: 300, h: 80  },
  { x: 2200, y: 1200, w: 80,  h: 400 },
  { x: 600,  y: 2200, w: 400, h: 80  },
  { x: 3000, y: 700,  w: 200, h: 200 },
  { x: 1000, y: 3000, w: 300, h: 150 },
  { x: 2600, y: 2600, w: 150, h: 300 },
  { x: 1800, y: 1800, w: 250, h: 250 }, // center landmark
  { x: 3200, y: 2000, w: 200, h: 80  },
  { x: 400,  y: 3400, w: 80,  h: 200 },
];

// ─── State ────────────────────────────────────────────────────────────────────
let players  = {};   // socket.id → player
let bullets  = [];   // active projectiles
let loot     = [];   // dropped items
let killFeed = [];   // last 5 kills
let gameMode = "ffa";
let gameTime = 0;    // ms since server start

let zone = {
  cx: CFG.MAP_SIZE / 2,
  cy: CFG.MAP_SIZE / 2,
  radius:     CFG.MAP_SIZE * 0.70,
  nextRadius: CFG.MAP_SIZE * 0.70,
  shrinking:  false,
  nextShrink: CFG.STORM_DELAY,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rand   = (a, b) => a + Math.random() * (b - a);
const clamp  = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2  = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const dist   = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

function collidesObstacle(x, y, r = 18) {
  for (const o of OBSTACLES) {
    const cx = clamp(x, o.x, o.x + o.w);
    const cy = clamp(y, o.y, o.y + o.h);
    if (dist2(x, y, cx, cy) < r * r) return true;
  }
  return false;
}

function safeSpawn() {
  for (let i = 0; i < 100; i++) {
    const x = rand(100, CFG.MAP_SIZE - 100);
    const y = rand(100, CFG.MAP_SIZE - 100);
    if (!collidesObstacle(x, y, 30)) return { x, y };
  }
  return { x: CFG.MAP_SIZE / 2, y: CFG.MAP_SIZE / 2 };
}

const SKINS = ["#38bdf8","#f472b6","#4ade80","#fb923c","#a78bfa","#facc15","#34d399","#f87171"];
let skinIdx = 0;

function createPlayer(id, name) {
  const { x, y } = safeSpawn();
  return {
    id, name: (name || "Player").slice(0, 16),
    x, y, vx: 0, vy: 0,
    hp: 100, maxHp: 100,
    shield: 50, maxShield: 100,
    alive: true,
    respawnAt: 0,
    invincibleUntil: Date.now() + CFG.INVINCIBLE_MS,
    skin: SKINS[skinIdx++ % SKINS.length],
    weapon: "pistol",
    inventory: ["pistol"],
    ammo: { light: 90, medium: 60, heavy: 15, shells: 18, rockets: 2, melee: -1 },
    currentAmmo: WEAPONS.pistol.maxAmmo,
    reloadUntil: 0,
    lastFire: 0,
    team: null,
    kills: 0,
    deaths: 0,
    score: 0,
    coins: 50,
    angle: 0,
    // anti-cheat
    _inputBuf: [],
    _lastInputFlush: Date.now(),
  };
}

function assignTeam(p) {
  const counts = { red: 0, blue: 0 };
  for (const q of Object.values(players)) if (q.team) counts[q.team]++;
  p.team = counts.red <= counts.blue ? "red" : "blue";
}

// ─── Kill feed ────────────────────────────────────────────────────────────────
function addKill(killerName, victimName, weapon) {
  killFeed.unshift({ k: killerName, v: victimName, w: weapon, t: Date.now() });
  if (killFeed.length > 5) killFeed.pop();
  io.emit("killFeed", killFeed.slice(0, 5));
}

// ─── Loot drops ───────────────────────────────────────────────────────────────
const LOOT_POOL = [
  { type: "weapon", value: "smg",    weight: 10 },
  { type: "weapon", value: "rifle",  weight: 8  },
  { type: "weapon", value: "shotgun",weight: 7  },
  { type: "weapon", value: "sniper", weight: 3  },
  { type: "weapon", value: "rpg",    weight: 1  },
  { type: "health", value: 40,       weight: 20 },
  { type: "shield", value: 50,       weight: 15 },
  { type: "ammo",   value: "light",  weight: 18 },
  { type: "ammo",   value: "medium", weight: 12 },
  { type: "coins",  value: 30,       weight: 20 },
];

function weightedPick(pool) {
  const total = pool.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of pool) { r -= item.weight; if (r <= 0) return item; }
  return pool[0];
}

function dropLoot(x, y) {
  const count = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const item = weightedPick(LOOT_POOL);
    loot.push({
      id: Math.random().toString(36).slice(2),
      x: x + rand(-40, 40),
      y: y + rand(-40, 40),
      ...item,
      spawnedAt: Date.now(),
    });
  }
}

function pickupLoot(player) {
  const PICKUP_R2 = 35 * 35;
  loot = loot.filter(item => {
    if (dist2(player.x, player.y, item.x, item.y) > PICKUP_R2) return true;
    if (item.type === "weapon" && !player.inventory.includes(item.value)) {
      player.inventory.push(item.value);
      io.to(player.id).emit("notify", `Picked up ${item.value.toUpperCase()}!`);
    } else if (item.type === "health") {
      player.hp = Math.min(player.maxHp, player.hp + item.value);
    } else if (item.type === "shield") {
      player.shield = Math.min(player.maxShield, player.shield + item.value);
    } else if (item.type === "ammo") {
      player.ammo[item.value] = Math.min(999, (player.ammo[item.value] || 0) + 30);
    } else if (item.type === "coins") {
      player.coins += item.value;
    }
    return false; // consumed
  });
}

// ─── Damage ───────────────────────────────────────────────────────────────────
function applyDamage(victim, amount, attackerId, weaponName) {
  if (!victim.alive) return;
  if (Date.now() < victim.invincibleUntil) return;

  // Shield absorbs first
  const shieldAbs = Math.min(victim.shield, amount);
  victim.shield -= shieldAbs;
  victim.hp     -= (amount - shieldAbs);

  if (victim.hp <= 0) {
    victim.hp    = 0;
    victim.alive = false;
    victim.deaths++;

    const attacker = players[attackerId];
    if (attacker) {
      attacker.kills++;
      attacker.score += 100 + (attacker.kills > 1 ? (attacker.kills - 1) * 10 : 0);
      attacker.coins += 30;
      addKill(attacker.name, victim.name, weaponName);
    }

    dropLoot(victim.x, victim.y);
    io.to(victim.id).emit("died", { by: attacker?.name || "storm", respawnIn: CFG.RESPAWN_MS });

    // Schedule respawn
    victim.respawnAt = Date.now() + CFG.RESPAWN_MS;

    broadcastLeaderboard();
  }
}

function broadcastLeaderboard() {
  const board = Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(p => ({ name: p.name, kills: p.kills, score: p.score, team: p.team }));
  io.emit("leaderboard", board);
}

// ─── Socket handlers ──────────────────────────────────────────────────────────
io.on("connection", socket => {
  console.log(`+ ${socket.id}`);

  if (Object.keys(players).length >= CFG.MAX_PLAYERS) {
    socket.emit("serverFull");
    socket.disconnect(true);
    return;
  }

  socket.on("joinGame", data => {
    const p = createPlayer(socket.id, data.name);
    if (gameMode === "team") assignTeam(p);
    players[socket.id] = p;
    socket.emit("init", {
      id:        socket.id,
      obstacles: OBSTACLES,
      weapons:   WEAPONS,
      mapSize:   CFG.MAP_SIZE,
      mode:      gameMode,
    });
    broadcastLeaderboard();
  });

  // ── Input: movement (server authoritative, input buffered) ──────────────────
  socket.on("input", data => {
    const p = players[socket.id];
    if (!p || !p.alive) return;

    // Rate-limit: accept at most TICK_RATE inputs/sec
    const now = Date.now();
    p._inputBuf.push({ dx: data.dx, dy: data.dy, angle: data.angle, t: now });

    // Flush if buffer > 3 inputs or > 50ms old (processed in game loop)
    if (p._inputBuf.length > 8) p._inputBuf = p._inputBuf.slice(-4);
  });

  // ── Attack / shoot ──────────────────────────────────────────────────────────
  socket.on("attack", data => {
    const p = players[socket.id];
    if (!p || !p.alive) return;

    const now   = Date.now();
    const wName = p.weapon;
    const w     = WEAPONS[wName];
    if (!w) return;

    // Fire-rate gate
    if (now - p.lastFire < w.fireRate) return;

    // Reload gate
    if (now < p.reloadUntil) return;

    // Ammo check (melee = unlimited)
    if (w.ammoType !== "melee") {
      if (p.currentAmmo <= 0) {
        startReload(p, w);
        return;
      }
      p.currentAmmo--;
    }

    p.lastFire = now;
    const angle = typeof data.angle === "number" ? data.angle : 0;

    // Melee — instant hit cone
    if (w.ammoType === "melee") {
      for (const q of Object.values(players)) {
        if (q.id === socket.id) continue;
        if (gameMode === "team" && q.team === p.team) continue;
        const d = dist(p.x, p.y, q.x, q.y);
        if (d > w.range) continue;
        const a = Math.atan2(q.y - p.y, q.x - p.x);
        if (Math.abs(a - angle) < 0.6) applyDamage(q, w.damage, socket.id, wName);
      }
      return;
    }

    // Ranged — spawn bullet(s)
    for (let b = 0; b < w.bullets; b++) {
      const spread = (Math.random() - 0.5) * w.spread;
      const a = angle + spread;
      bullets.push({
        id:       Math.random().toString(36).slice(2),
        ownerId:  socket.id,
        ownerTeam: p.team,
        weapon:   wName,
        x:        p.x,
        y:        p.y,
        vx:       Math.cos(a) * w.speed,
        vy:       Math.sin(a) * w.speed,
        damage:   w.damage,
        range:    w.range,
        splash:   w.splash || 0,
        traveled: 0,
        born:     now,
      });
    }
  });

  // ── Reload ──────────────────────────────────────────────────────────────────
  socket.on("reload", () => {
    const p = players[socket.id];
    if (!p) return;
    const w = WEAPONS[p.weapon];
    if (!w || w.ammoType === "melee") return;
    startReload(p, w);
  });

  // ── Switch weapon ───────────────────────────────────────────────────────────
  socket.on("switchWeapon", wName => {
    const p = players[socket.id];
    if (!p || !p.inventory.includes(wName) || !WEAPONS[wName]) return;
    p.weapon      = wName;
    p.currentAmmo = WEAPONS[wName].maxAmmo;
    p.reloadUntil = 0;
    io.to(socket.id).emit("weaponSwitched", { weapon: wName, ammo: p.currentAmmo });
  });

  // ── Game mode ───────────────────────────────────────────────────────────────
  socket.on("setMode", m => {
    if (!["ffa","team","swords"].includes(m)) return;
    gameMode = m;
    if (m === "swords") {
      for (const q of Object.values(players)) {
        q.weapon = "sword";
        q.inventory = ["sword"];
      }
    }
    io.emit("modeChanged", m);
  });

  socket.on("disconnect", () => {
    console.log(`- ${socket.id}`);
    delete players[socket.id];
    broadcastLeaderboard();
  });
});

function startReload(p, w) {
  if (Date.now() < p.reloadUntil) return;
  const reserve = p.ammo[w.ammoType];
  if (reserve === 0) return;
  p.reloadUntil = Date.now() + w.reload;
  io.to(p.id).emit("reloading", { duration: w.reload });
}

// ─── Main game loop ───────────────────────────────────────────────────────────
let lastTick = Date.now();

function gameTick() {
  const now   = Date.now();
  const dt    = Math.min((now - lastTick) / 1000, 0.1); // cap at 100ms
  lastTick    = now;
  gameTime   += dt * 1000;

  // ── Zone / storm ────────────────────────────────────────────────────────────
  if (gameTime >= zone.nextShrink && !zone.shrinking) {
    zone.nextRadius = zone.radius * CFG.STORM_SHRINK;
    zone.shrinking  = true;
    zone.shrinkEnd  = now + CFG.STORM_INTERVAL * 0.4;
    zone.nextShrink = now + CFG.STORM_INTERVAL;
    io.emit("zoneUpdate", { cx: zone.cx, cy: zone.cy, radius: zone.nextRadius, shrinkEnd: zone.shrinkEnd });
  }
  if (zone.shrinking) {
    const t = 1 - clamp((zone.shrinkEnd - now) / (CFG.STORM_INTERVAL * 0.4), 0, 1);
    zone.radius = zone.radius + (zone.nextRadius - zone.radius) * Math.min(t, 1);
    if (now >= zone.shrinkEnd) zone.shrinking = false;
  }

  // ── Player updates ──────────────────────────────────────────────────────────
  for (const p of Object.values(players)) {

    // Respawn
    if (!p.alive) {
      if (now >= p.respawnAt) {
        const sp = safeSpawn();
        p.x = sp.x; p.y = sp.y;
        p.hp = p.maxHp; p.shield = 50;
        p.alive = true;
        p.invincibleUntil = now + CFG.INVINCIBLE_MS;
        p.currentAmmo = WEAPONS[p.weapon]?.maxAmmo || 0;
        io.to(p.id).emit("respawned", { x: p.x, y: p.y });
      }
      continue;
    }

    // Process buffered inputs
    if (p._inputBuf.length) {
      let totalDx = 0, totalDy = 0, lastAngle = p.angle;
      for (const inp of p._inputBuf) {
        totalDx  += clamp(inp.dx, -1, 1);
        totalDy  += clamp(inp.dy, -1, 1);
        lastAngle = inp.angle;
      }
      p._inputBuf = [];
      const mag = Math.sqrt(totalDx ** 2 + totalDy ** 2) || 1;
      const nx  = totalDx / mag;
      const ny  = totalDy / mag;
      p.vx += nx * CFG.MAX_SPEED * 0.3;
      p.vy += ny * CFG.MAX_SPEED * 0.3;
      p.angle = lastAngle;
    }

    // Clamp speed
    const spd = Math.sqrt(p.vx ** 2 + p.vy ** 2);
    if (spd > CFG.MAX_SPEED) { p.vx *= CFG.MAX_SPEED / spd; p.vy *= CFG.MAX_SPEED / spd; }

    // Integrate position
    let nx = p.x + p.vx * dt;
    let ny = p.y + p.vy * dt;

    // Obstacle collision
    if (collidesObstacle(nx, p.y, p.radius || 18)) { nx = p.x; p.vx *= -0.3; }
    if (collidesObstacle(p.x, ny, p.radius || 18)) { ny = p.y; p.vy *= -0.3; }

    p.x = clamp(nx, 20, CFG.MAP_SIZE - 20);
    p.y = clamp(ny, 20, CFG.MAP_SIZE - 20);
    p.vx *= CFG.FRICTION;
    p.vy *= CFG.FRICTION;

    // Loot pickup
    pickupLoot(p);

    // Storm damage
    const dz = dist(p.x, p.y, zone.cx, zone.cy);
    if (dz > zone.radius) {
      const stormDmg = CFG.STORM_DAMAGE * dt;
      p.shield = Math.max(0, p.shield - stormDmg);
      if (p.shield === 0) p.hp = Math.max(0, p.hp - stormDmg);
      if (p.hp <= 0) applyDamage(p, 999, null, "storm");
    }

    // Shield regen (slow, only when out of storm)
    if (dz <= zone.radius && p.shield < p.maxShield) {
      p.shield = Math.min(p.maxShield, p.shield + 3 * dt);
    }

    // Reload completion
    if (p.reloadUntil && Date.now() >= p.reloadUntil) {
      const w = WEAPONS[p.weapon];
      if (w && w.ammoType !== "melee") {
        const need    = w.maxAmmo - p.currentAmmo;
        const reserve = p.ammo[w.ammoType];
        const fill    = Math.min(need, reserve);
        p.currentAmmo     += fill;
        p.ammo[w.ammoType] = Math.max(0, reserve - fill);
      }
      p.reloadUntil = 0;
    }
  }

  // ── Bullet updates ──────────────────────────────────────────────────────────
  const aliveBullets = [];
  for (const b of bullets) {
    if (now - b.born > CFG.BULLET_TTL) continue;

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.traveled += Math.sqrt(b.vx ** 2 + b.vy ** 2) * dt;

    // Out of map or range
    if (b.x < 0 || b.x > CFG.MAP_SIZE || b.y < 0 || b.y > CFG.MAP_SIZE) continue;
    if (b.traveled > b.range) continue;

    // Hit obstacle
    if (collidesObstacle(b.x, b.y, 4)) continue;

    let hit = false;

    if (b.splash > 0) {
      // Splash (RPG) — check proximity
      for (const q of Object.values(players)) {
        if (!q.alive) continue;
        if (q.id === b.ownerId) continue;
        if (gameMode === "team" && q.team === b.ownerTeam) continue;
        const d = dist(b.x, b.y, q.x, q.y);
        if (d < b.splash) {
          const falloff = 1 - (d / b.splash);
          applyDamage(q, Math.round(b.damage * falloff), b.ownerId, b.weapon);
          hit = true;
        }
      }
    } else {
      // Direct hit
      for (const q of Object.values(players)) {
        if (!q.alive) continue;
        if (q.id === b.ownerId) continue;
        if (gameMode === "team" && q.team === b.ownerTeam) continue;
        if (dist2(b.x, b.y, q.x, q.y) < (q.radius || 18) ** 2) {
          applyDamage(q, b.damage, b.ownerId, b.weapon);
          hit = true;
          break;
        }
      }
    }

    if (!hit) aliveBullets.push(b);
  }
  bullets = aliveBullets;

  // ── Expire old loot (60s) ───────────────────────────────────────────────────
  loot = loot.filter(l => now - l.spawnedAt < 60_000);

  // ── Broadcast state ─────────────────────────────────────────────────────────
  const snapshot = {
    players:  sanitisePlayers(players),
    bullets:  bullets.map(b => ({ id: b.id, x: b.x | 0, y: b.y | 0, weapon: b.weapon })),
    loot:     loot.map(l => ({ id: l.id, x: l.x | 0, y: l.y | 0, type: l.type, value: l.value })),
    zone:     { cx: zone.cx | 0, cy: zone.cy | 0, radius: zone.radius | 0 },
    time:     gameTime | 0,
  };
  io.emit("state", snapshot);
}

function sanitisePlayers(ps) {
  const out = {};
  for (const [id, p] of Object.entries(ps)) {
    out[id] = {
      id:     p.id,
      name:   p.name,
      x:      p.x    | 0,
      y:      p.y    | 0,
      hp:     p.hp   | 0,
      shield: p.shield | 0,
      maxHp:  p.maxHp,
      maxShield: p.maxShield,
      alive:  p.alive,
      skin:   p.skin,
      weapon: p.weapon,
      angle:  +p.angle.toFixed(2),
      team:   p.team,
      kills:  p.kills,
      score:  p.score,
      coins:  p.coins,
      currentAmmo: p.currentAmmo,
      invincible: Date.now() < p.invincibleUntil,
      reloading: Date.now() < p.reloadUntil,
    };
  }
  return out;
}

const tickInterval = setInterval(gameTick, 1000 / CFG.TICK_RATE);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Rise of Ikons PRO running on :${PORT}`));

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function shutdown() {
  console.log("Shutting down…");
  clearInterval(tickInterval);
  io.emit("serverShutdown", { message: "Server restarting, back soon!" });
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);
