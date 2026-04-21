"use strict";

const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors:{ origin:"*" }, pingInterval:10000, pingTimeout:5000 });

// Serve from "public/" if it exists, otherwise serve from current directory
const fs_=require("fs");
const path_=require("path");
const staticDir=fs_.existsSync("public")?"public":".";
app.use(express.static(staticDir));
// Explicit fallback route so index.html is always served
app.get("/",(req,res)=>res.sendFile(path_.join(__dirname,staticDir,"index.html")));

// ─── Config ───────────────────────────────────────────────────────────────────
const CFG = {
  TICK_RATE:      64,
  MAP_SIZE:       6000,
  MAX_SPEED:      260,
  FRICTION:       0.80,
  BULLET_TTL:     2200,
  INVINCIBLE_MS:  1500,
  RESPAWN_MS:     2500,
  STORM_DELAY:    90000,
  STORM_INTERVAL: 20000,
  STORM_SHRINK:   0.88,
  STORM_DAMAGE:   4,
  MAX_PLAYERS:    50,
  CRATE_COUNT:    18,
  CRATE_RESPAWN:  30000,
};

// ─── Rarity ───────────────────────────────────────────────────────────────────
const RARITY = {
  common:    { label:"Common",    color:"#94a3b8", weight:50, mult:1.00 },
  uncommon:  { label:"Uncommon",  color:"#4ade80", weight:30, mult:1.15 },
  rare:      { label:"Rare",      color:"#60a5fa", weight:15, mult:1.30 },
  epic:      { label:"Epic",      color:"#a78bfa", weight:8,  mult:1.50 },
  legendary: { label:"Legendary", color:"#f97316", weight:3,  mult:1.75 },
  mythic:    { label:"Mythic",    color:"#f43f5e", weight:1,  mult:2.20 },
  special:   { label:"Special",   color:"#facc15", weight:1,  mult:2.50 },
};
const RARITY_ORDER = ["common","uncommon","rare","epic","legendary","mythic","special"];

function pickRarity(minRarity) {
  const minIdx = RARITY_ORDER.indexOf(minRarity || "common");
  const pool   = RARITY_ORDER.slice(minIdx).map(r => ({ r, w: RARITY[r].weight }));
  const total  = pool.reduce((s,i) => s+i.w, 0);
  let   roll   = Math.random() * total;
  for (const item of pool) { roll -= item.w; if (roll <= 0) return item.r; }
  return pool[0].r;
}

// ─── Weapon bases ─────────────────────────────────────────────────────────────
const WEAPON_BASE = {
  pistol:       { damage:22,  range:700,  fireRate:380,  spread:0.05,  bullets:1, speed:950,  reload:850,  maxAmmo:12,  ammoType:"light",   auto:false, passive:"none",              passiveDesc:"No passive" },
  smg:          { damage:14,  range:500,  fireRate:95,   spread:0.11,  bullets:1, speed:1100, reload:1500, maxAmmo:30,  ammoType:"light",   auto:true,  passive:"speed_boost",       passiveDesc:"+25% move speed while holding" },
  rifle:        { damage:28,  range:900,  fireRate:270,  spread:0.04,  bullets:1, speed:1250, reload:1900, maxAmmo:20,  ammoType:"medium",  auto:true,  passive:"armor_pierce",      passiveDesc:"Bullets ignore 30% of shield" },
  shotgun:      { damage:18,  range:320,  fireRate:700,  spread:0.26,  bullets:7, speed:720,  reload:1700, maxAmmo:6,   ammoType:"shells",  auto:false, passive:"knockback",         passiveDesc:"Blasts enemies back on hit" },
  sniper:       { damage:95,  range:1800, fireRate:1300, spread:0.005, bullets:1, speed:2200, reload:2400, maxAmmo:5,   ammoType:"heavy",   auto:false, passive:"fov_boost",         passiveDesc:"Hold RMB to scope (+60% FOV)" },
  sword:        { damage:45,  range:90,   fireRate:580,  spread:0,     bullets:1, speed:0,    reload:0,    maxAmmo:-1,  ammoType:"melee",   auto:false, passive:"life_steal",        passiveDesc:"Heal 15 HP per kill" },
  knife:        { damage:28,  range:60,   fireRate:320,  spread:0,     bullets:1, speed:0,    reload:0,    maxAmmo:-1,  ammoType:"melee",   auto:false, passive:"rapid_reload",      passiveDesc:"Instant weapon switch" },
  rpg:          { damage:180, range:400,  fireRate:2400, spread:0.02,  bullets:1, speed:560,  reload:3200, maxAmmo:2,   ammoType:"rockets", auto:false, passive:"explosive_bullets", passiveDesc:"Area damage on impact", splash:130 },
  minigun:      { damage:12,  range:500,  fireRate:60,   spread:0.18,  bullets:1, speed:1000, reload:3500, maxAmmo:100, ammoType:"light",   auto:true,  passive:"suppression",       passiveDesc:"Slows enemy on hit" },
  railgun:      { damage:140, range:2200, fireRate:2000, spread:0,     bullets:1, speed:5000, reload:3000, maxAmmo:3,   ammoType:"heavy",   auto:false, passive:"wall_pierce",       passiveDesc:"Bullets pass through walls",   pierce:true },
  dual_pistols: { damage:18,  range:600,  fireRate:200,  spread:0.07,  bullets:2, speed:950,  reload:1200, maxAmmo:24,  ammoType:"light",   auto:false, passive:"double_tap",        passiveDesc:"Fires two bullets per shot" },
  plasma:       { damage:55,  range:650,  fireRate:500,  spread:0.06,  bullets:1, speed:800,  reload:2000, maxAmmo:15,  ammoType:"energy",  auto:true,  passive:"shield_regen",      passiveDesc:"Each kill restores 20 shield" },
  katana:       { damage:70,  range:110,  fireRate:700,  spread:0,     bullets:1, speed:0,    reload:0,    maxAmmo:-1,  ammoType:"melee",   auto:false, passive:"ghost",             passiveDesc:"Walk through obstacles" },
  flamethrower: { damage:8,   range:220,  fireRate:80,   spread:0.35,  bullets:3, speed:400,  reload:2000, maxAmmo:60,  ammoType:"fuel",    auto:true,  passive:"burn",              passiveDesc:"Enemies burn for 5 dmg/s (3s)" },
};

const WEAPON_RARITY_FLOORS = {
  pistol:"common", smg:"common", rifle:"uncommon", shotgun:"common",
  sniper:"rare",   sword:"uncommon", knife:"common", rpg:"epic",
  minigun:"rare",  railgun:"legendary", dual_pistols:"uncommon", plasma:"epic",
  katana:"legendary", flamethrower:"rare",
};

function buildWeapon(baseName, rarity) {
  const base = WEAPON_BASE[baseName];
  if (!base) return null;
  const m = RARITY[rarity].mult;
  return {
    ...base, baseName, rarity,
    damage:   Math.round(base.damage * m),
    range:    Math.round(base.range  * Math.sqrt(m)),
    fireRate: Math.round(base.fireRate / Math.sqrt(m)),
    maxAmmo:  base.maxAmmo < 0 ? -1 : Math.round(base.maxAmmo * m),
  };
}

const CATALOGUE = {};
for (const [name, floor] of Object.entries(WEAPON_RARITY_FLOORS)) {
  for (const rarity of RARITY_ORDER) {
    if (RARITY_ORDER.indexOf(rarity) < RARITY_ORDER.indexOf(floor)) continue;
    CATALOGUE[`${name}_${rarity}`] = buildWeapon(name, rarity);
  }
}

function getW(wKey) { return CATALOGUE[wKey] || null; }

// ─── Shop ──────────────────────────────────────────────────────────────────────
const SHOP_CONSUMABLES = [
  { id:"health_pack", label:"Health Pack +60", cost:80,  type:"consumable" },
  { id:"shield_pack", label:"Shield Pack +80", cost:100, type:"consumable" },
  { id:"ammo_pack",   label:"Ammo Pack (all)", cost:60,  type:"consumable" },
  { id:"crate_key",   label:"Crate Key",       cost:150, type:"consumable" },
  { id:"reroll",      label:"Reroll Shop",     cost:50,  type:"consumable" },
];
const RARITY_PRICES = [120,180,260,380,500,700,900];

function genShopWeapons(count=4) {
  const bases = Object.keys(WEAPON_RARITY_FLOORS);
  const picks = [], used = new Set();
  let tries = 0;
  while (picks.length < count && tries++ < 200) {
    const base   = bases[Math.floor(Math.random()*bases.length)];
    const rarity = pickRarity(WEAPON_RARITY_FLOORS[base]);
    const key    = `${base}_${rarity}`;
    if (used.has(key)) continue;
    used.add(key);
    const w    = CATALOGUE[key];
    const ridx = RARITY_ORDER.indexOf(rarity);
    const cost = Math.round(RARITY_PRICES[ridx] * (0.9+Math.random()*0.2));
    picks.push({ id:key, label:`${RARITY[rarity].label} ${base.replace("_"," ").toUpperCase()}`,
      cost, type:"weapon", rarity, passive:w.passive, passiveDesc:w.passiveDesc });
  }
  return picks;
}

let shopListings = [...SHOP_CONSUMABLES, ...genShopWeapons()];

// ─── Obstacles ────────────────────────────────────────────────────────────────
const OBSTACLES = [
  {x:800, y:800, w:250,h:250},{x:1600,y:400, w:350,h:90},{x:2200,y:1200,w:90, h:500},
  {x:600, y:2200,w:500,h:90},{x:3000,y:700, w:250,h:250},{x:1000,y:3000,w:350,h:180},
  {x:2600,y:2600,w:180,h:350},{x:2700,y:2700,w:300,h:300},
  {x:3200,y:2000,w:240,h:90},{x:400, y:3400,w:90, h:250},
  {x:4500,y:500, w:300,h:90},{x:5200,y:1200,w:90, h:400},{x:4800,y:3000,w:300,h:180},
  {x:5400,y:4200,w:200,h:200},{x:1200,y:4800,w:400,h:90},{x:2800,y:5000,w:250,h:250},
  {x:4000,y:4600,w:90, h:300},{x:3600,y:1600,w:200,h:200},
  {x:700, y:5200,w:300,h:90},{x:5100,y:5100,w:200,h:200},
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rand  = (a,b) => a+Math.random()*(b-a);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const dist2 = (ax,ay,bx,by) => (ax-bx)**2+(ay-by)**2;
const dist  = (ax,ay,bx,by) => Math.sqrt(dist2(ax,ay,bx,by));
const uid   = () => Math.random().toString(36).slice(2,10);

function collidesObs(x,y,r=18) {
  for (const o of OBSTACLES) {
    const cx=clamp(x,o.x,o.x+o.w), cy=clamp(y,o.y,o.y+o.h);
    if (dist2(x,y,cx,cy)<r*r) return true;
  }
  return false;
}

function safeSpawn() {
  for (let i=0;i<120;i++) {
    const x=rand(150,CFG.MAP_SIZE-150), y=rand(150,CFG.MAP_SIZE-150);
    if (!collidesObs(x,y,35)) return {x,y};
  }
  return {x:CFG.MAP_SIZE/2,y:CFG.MAP_SIZE/2};
}

// ─── Crates ───────────────────────────────────────────────────────────────────
let crates = [];
function initCrates() {
  crates=[];
  for (let i=0;i<CFG.CRATE_COUNT;i++) addCrate();
}
function addCrate() {
  for (let a=0;a<80;a++) {
    const x=rand(200,CFG.MAP_SIZE-200), y=rand(200,CFG.MAP_SIZE-200);
    if (!collidesObs(x,y,40)) {
      crates.push({id:uid(),x,y,tier:pickRarity("common"),open:false,respawnAt:0});
      return;
    }
  }
}
function openCrate(crate) {
  if (crate.open) return null;
  crate.open=true; crate.respawnAt=Date.now()+CFG.CRATE_RESPAWN;
  const rarity   = pickRarity(crate.tier);
  const valid    = Object.entries(WEAPON_RARITY_FLOORS)
    .filter(([,f])=>RARITY_ORDER.indexOf(f)<=RARITY_ORDER.indexOf(rarity))
    .map(([n])=>n);
  const base     = valid[Math.floor(Math.random()*valid.length)];
  const weapKey  = `${base}_${rarity}`;
  const coins    = 30+RARITY_ORDER.indexOf(rarity)*20;
  return {weaponKey:weapKey,rarity,coins};
}

// ─── State ────────────────────────────────────────────────────────────────────
let players={}, bullets=[], loot=[], killFeed=[], gameMode="ffa", gameTime=0;
let zone={cx:CFG.MAP_SIZE/2,cy:CFG.MAP_SIZE/2,radius:CFG.MAP_SIZE*0.72,nextRadius:CFG.MAP_SIZE*0.72,shrinking:false,nextShrink:CFG.STORM_DELAY};

const SKINS=["#38bdf8","#f472b6","#4ade80","#fb923c","#a78bfa","#facc15","#34d399","#f87171"];
let skinIdx=0;

function createPlayer(id,name) {
  const {x,y}=safeSpawn();
  return {
    id,name:(name||"Player").slice(0,16),x,y,vx:0,vy:0,
    hp:100,maxHp:100,shield:50,maxShield:100,alive:true,respawnAt:0,
    invincibleUntil:Date.now()+CFG.INVINCIBLE_MS,
    skin:SKINS[skinIdx++%SKINS.length],
    weapon:"pistol_common",inventory:["pistol_common"],
    ammo:{light:90,medium:60,heavy:15,shells:18,rockets:2,melee:-1,energy:30,fuel:80},
    currentAmmo:CATALOGUE["pistol_common"].maxAmmo,
    reloadUntil:0,lastFire:0,team:null,kills:0,deaths:0,score:0,coins:120,angle:0,
    burnTargets:{},slowed:0,_inputBuf:[],
  };
}

function addKill(kName,vName,wKey) {
  killFeed.unshift({k:kName,v:vName,w:wKey,t:Date.now()});
  if (killFeed.length>5) killFeed.pop();
  io.emit("killFeed",killFeed.slice(0,5));
}

function dropLoot(x,y) {
  loot.push({id:uid(),x:x+rand(-30,30),y:y+rand(-30,30),type:"coins",value:25+Math.floor(Math.random()*30),spawnedAt:Date.now()});
  if (Math.random()<0.45) {
    const base=Object.keys(WEAPON_RARITY_FLOORS)[Math.floor(Math.random()*Object.keys(WEAPON_RARITY_FLOORS).length)];
    const rarity=pickRarity(WEAPON_RARITY_FLOORS[base]);
    loot.push({id:uid(),x:x+rand(-50,50),y:y+rand(-50,50),type:"weapon",value:`${base}_${rarity}`,rarity,spawnedAt:Date.now()});
  }
  if (Math.random()<0.5)  loot.push({id:uid(),x:x+rand(-40,40),y:y+rand(-40,40),type:"health",value:35,spawnedAt:Date.now()});
  if (Math.random()<0.35) loot.push({id:uid(),x:x+rand(-40,40),y:y+rand(-40,40),type:"shield",value:40,spawnedAt:Date.now()});
}

function pickupLoot(p) {
  const R2=40*40;
  loot=loot.filter(item=>{
    if (dist2(p.x,p.y,item.x,item.y)>R2) return true;
    if (item.type==="weapon") {
      if (!p.inventory.includes(item.value)) {
        p.inventory.push(item.value);
        const base=item.value.split("_")[0];
        io.to(p.id).emit("notify",{msg:`Picked up ${(item.rarity||"").toUpperCase()} ${base.toUpperCase()}!`,rarity:item.rarity||null});
      }
    } else if (item.type==="health") { p.hp=Math.min(p.maxHp,p.hp+item.value);
    } else if (item.type==="shield") { p.shield=Math.min(p.maxShield,p.shield+item.value);
    } else if (item.type==="ammo")   { p.ammo[item.value]=Math.min(999,(p.ammo[item.value]||0)+40);
    } else if (item.type==="coins")  { p.coins+=item.value; }
    return false;
  });
}

function applyDamage(victim,amount,attackerId,wKey) {
  if (!victim.alive||Date.now()<victim.invincibleUntil) return;
  const aw=getW(wKey);
  let amt=amount;
  if (aw?.passive==="armor_pierce") { const p=Math.min(victim.shield,amt*0.3); victim.hp-=p; amt-=p; }
  const shAbs=Math.min(victim.shield,amt); victim.shield-=shAbs; victim.hp-=(amt-shAbs);
  if (aw?.passive==="burn"&&attackerId) { const a=players[attackerId]; if (a) { a.burnTargets=a.burnTargets||{}; a.burnTargets[victim.id]=Date.now()+3000; } }
  if (aw?.passive==="suppression") victim.slowed=Date.now()+800;
  if (aw?.passive==="knockback"&&attackerId) {
    const a=players[attackerId]; if (a) { const dx=victim.x-a.x,dy=victim.y-a.y,mag=Math.sqrt(dx*dx+dy*dy)||1; victim.vx+=(dx/mag)*320; victim.vy+=(dy/mag)*320; }
  }
  if (victim.hp<=0) {
    victim.hp=0; victim.alive=false; victim.deaths++;
    const attacker=players[attackerId];
    if (attacker) {
      attacker.kills++; attacker.score+=100+Math.max(0,(attacker.kills-1)*15); attacker.coins+=35;
      if (aw?.passive==="life_steal")   attacker.hp=Math.min(attacker.maxHp,attacker.hp+15);
      if (aw?.passive==="shield_regen") attacker.shield=Math.min(attacker.maxShield,attacker.shield+20);
      addKill(attacker.name,victim.name,wKey);
    }
    dropLoot(victim.x,victim.y);
    io.to(victim.id).emit("died",{by:attacker?.name||"storm",respawnIn:CFG.RESPAWN_MS});
    victim.respawnAt=Date.now()+CFG.RESPAWN_MS;
    broadcastLB();
  }
}

function broadcastLB() {
  const board=Object.values(players).sort((a,b)=>b.score-a.score).slice(0,10)
    .map(p=>({name:p.name,kills:p.kills,score:p.score,team:p.team}));
  io.emit("leaderboard",board);
}

function startReload(p,w,wKey) {
  if (Date.now()<p.reloadUntil) return;
  if ((p.ammo[w.ammoType]||0)===0) return;
  p.reloadUntil=Date.now()+w.reload;
  io.to(p.id).emit("reloading",{duration:w.reload});
}

// ─── Sockets ──────────────────────────────────────────────────────────────────
function _finalizeJoin(socket, name) {
  const p = createPlayer(socket.id, name);
  if (gameMode === "team") {
    const c={red:0,blue:0};
    for (const q of Object.values(players)) if (q.team) c[q.team]++;
    p.team = c.red <= c.blue ? "red" : "blue";
  }
  players[socket.id] = p;
  socket.emit("init", {id:socket.id,obstacles:OBSTACLES,weapons:CATALOGUE,rarities:RARITY,rarityOrder:RARITY_ORDER,mapSize:CFG.MAP_SIZE,mode:gameMode,shop:shopListings});
  socket.emit("crateSync", crates.map(c=>({id:c.id,x:c.x,y:c.y,tier:c.tier,open:c.open})));
  broadcastLB();
}

io.on("connection",socket=>{
  if (Object.keys(players).length>=CFG.MAX_PLAYERS) { socket.emit("serverFull"); socket.disconnect(true); return; }

  socket.on("joinGame",data=>{
    const name=(data.name||"Player").slice(0,16).trim();
    _finalizeJoin(socket,name);
  });

  socket.on("input",data=>{
    const p=players[socket.id]; if (!p||!p.alive) return;
    p._inputBuf.push({dx:data.dx,dy:data.dy,angle:data.angle});
    if (p._inputBuf.length>8) p._inputBuf=p._inputBuf.slice(-4);
  });

  socket.on("attack",data=>{
    const p=players[socket.id]; if (!p||!p.alive) return;
    const now=Date.now(), w=getW(p.weapon); if (!w) return;
    if (now-p.lastFire<w.fireRate||now<p.reloadUntil) return;
    if (w.ammoType!=="melee") { if (p.currentAmmo<=0) { startReload(p,w,p.weapon); return; } p.currentAmmo--; }
    p.lastFire=now;
    const angle=typeof data.angle==="number"?data.angle:0;
    if (w.ammoType==="melee") {
      for (const q of Object.values(players)) {
        if (q.id===socket.id||(gameMode==="team"&&q.team===p.team)) continue;
        if (dist(p.x,p.y,q.x,q.y)>w.range) continue;
        if (Math.abs(Math.atan2(q.y-p.y,q.x-p.x)-angle)<0.65) applyDamage(q,w.damage,socket.id,p.weapon);
      }
      return;
    }
    for (let b=0;b<(w.bullets||1);b++) {
      const a=angle+(Math.random()-0.5)*w.spread;
      bullets.push({id:uid(),ownerId:socket.id,ownerTeam:p.team,weaponKey:p.weapon,weapon:w.baseName||p.weapon,
        x:p.x,y:p.y,vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,
        damage:w.damage,range:w.range,splash:w.splash||0,pierce:w.passive==="wall_pierce",traveled:0,born:now});
    }
  });

  socket.on("reload",()=>{
    const p=players[socket.id]; if (!p) return;
    const w=getW(p.weapon); if (!w||w.ammoType==="melee") return;
    startReload(p,w,p.weapon);
  });

  socket.on("switchWeapon",wKey=>{
    const p=players[socket.id];
    if (!p||!p.inventory.includes(wKey)||!CATALOGUE[wKey]) return;
    p.weapon=wKey; p.currentAmmo=CATALOGUE[wKey].maxAmmo; p.reloadUntil=0;
    io.to(socket.id).emit("weaponSwitched",{weapon:wKey,ammo:p.currentAmmo});
  });

  socket.on("shopBuy",itemId=>{
    const p=players[socket.id]; if (!p) return;
    const item=shopListings.find(i=>i.id===itemId);
    if (!item||p.coins<item.cost) { io.to(socket.id).emit("notify",{msg:"Not enough coins!",rarity:null}); return; }
    p.coins-=item.cost;
    if (item.type==="weapon") {
      if (!p.inventory.includes(item.id)) { p.inventory.push(item.id); io.to(socket.id).emit("notify",{msg:`Bought ${item.label}!`,rarity:item.rarity}); }
      else { p.coins+=Math.round(item.cost*0.5); io.to(socket.id).emit("notify",{msg:"Already owned — refunded 50%",rarity:null}); }
    } else if (item.id==="health_pack") { p.hp=Math.min(p.maxHp,p.hp+60); io.to(socket.id).emit("notify",{msg:"+60 HP restored",rarity:null});
    } else if (item.id==="shield_pack") { p.shield=Math.min(p.maxShield,p.shield+80); io.to(socket.id).emit("notify",{msg:"+80 Shield restored",rarity:null});
    } else if (item.id==="ammo_pack")   { for (const t of ["light","medium","heavy","shells","energy","fuel"]) p.ammo[t]=Math.min(999,(p.ammo[t]||0)+50); io.to(socket.id).emit("notify",{msg:"Ammo restocked!",rarity:null});
    } else if (item.id==="crate_key") {
      const avail=crates.filter(c=>!c.open);
      if (!avail.length) { p.coins+=item.cost; io.to(socket.id).emit("notify",{msg:"No crates available!",rarity:null}); return; }
      const crate=avail[Math.floor(Math.random()*avail.length)];
      const reward=openCrate(crate);
      if (reward) {
        if (!p.inventory.includes(reward.weaponKey)) p.inventory.push(reward.weaponKey);
        p.coins+=reward.coins;
        const base=reward.weaponKey.split("_")[0];
        io.to(socket.id).emit("notify",{msg:`CRATE: ${RARITY[reward.rarity].label} ${base.toUpperCase()} +${reward.coins} coins!`,rarity:reward.rarity});
        io.emit("crateOpened",{id:crate.id});
      }
    } else if (item.id==="reroll") {
      shopListings=[...SHOP_CONSUMABLES,...genShopWeapons()];
      io.to(socket.id).emit("shopUpdate",shopListings);
      io.to(socket.id).emit("notify",{msg:"Shop refreshed!",rarity:null});
    }
  });

  socket.on("openCrate",crateId=>{
    const p=players[socket.id]; if (!p||!p.alive) return;
    const crate=crates.find(c=>c.id===crateId);
    if (!crate||crate.open||dist(p.x,p.y,crate.x,crate.y)>80) return;
    const reward=openCrate(crate);
    if (reward) {
      if (!p.inventory.includes(reward.weaponKey)) p.inventory.push(reward.weaponKey);
      p.coins+=reward.coins;
      const base=reward.weaponKey.split("_")[0];
      io.to(socket.id).emit("notify",{msg:`${crate.tier.toUpperCase()} CRATE: ${RARITY[reward.rarity].label} ${base.toUpperCase()}!`,rarity:reward.rarity});
      io.emit("crateOpened",{id:crate.id});
    }
  });

  socket.on("getShop",()=>socket.emit("shopUpdate",shopListings));

  // Ping measurement
  socket.on("ping_check",()=>socket.emit("pong_check"));

  socket.on("setMode",m=>{
    if (!["ffa","team","swords"].includes(m)) return;
    gameMode=m;
    if (m==="swords") for (const q of Object.values(players)) { q.weapon="sword_common"; q.inventory=["sword_common"]; }
    io.emit("modeChanged",m);
  });

  socket.on("disconnect",()=>{ delete players[socket.id]; broadcastLB(); });
});

// ─── Game loop ────────────────────────────────────────────────────────────────
let lastTick=Date.now();

function gameTick() {
  const now=Date.now(), dt=Math.min((now-lastTick)/1000,0.1);
  lastTick=now; gameTime+=dt*1000;

  // Zone shrink
  if (gameTime>=zone.nextShrink&&!zone.shrinking) {
    zone.nextRadius=Math.max(zone.radius*CFG.STORM_SHRINK,200);
    zone.shrinking=true; zone.shrinkEnd=now+CFG.STORM_INTERVAL*0.45;
    zone.nextShrink=now+CFG.STORM_INTERVAL;
    io.emit("zoneUpdate",{cx:zone.cx,cy:zone.cy,radius:zone.nextRadius,shrinkEnd:zone.shrinkEnd});
  }
  if (zone.shrinking) {
    const t=1-clamp((zone.shrinkEnd-now)/(CFG.STORM_INTERVAL*0.45),0,1);
    zone.radius+=(zone.nextRadius-zone.radius)*Math.min(t,1);
    if (now>=zone.shrinkEnd) zone.shrinking=false;
  }

  // Crate respawn
  for (const c of crates) if (c.open&&now>=c.respawnAt) { c.open=false; c.tier=pickRarity("common"); c.respawnAt=0; io.emit("crateRespawned",{id:c.id,tier:c.tier}); }

  // Players
  for (const p of Object.values(players)) {
    if (!p.alive) {
      if (now>=p.respawnAt) {
        const sp=safeSpawn();
        Object.assign(p,{x:sp.x,y:sp.y,hp:p.maxHp,shield:50,alive:true,invincibleUntil:now+CFG.INVINCIBLE_MS,currentAmmo:CATALOGUE[p.weapon]?.maxAmmo||0});
        io.to(p.id).emit("respawned",{x:p.x,y:p.y});
      }
      continue;
    }
    if (p._inputBuf.length) {
      let tdx=0,tdy=0,lastAng=p.angle;
      for (const inp of p._inputBuf) { tdx+=clamp(inp.dx,-1,1); tdy+=clamp(inp.dy,-1,1); lastAng=inp.angle; }
      p._inputBuf=[];
      const mag=Math.sqrt(tdx**2+tdy**2)||1;
      const w=getW(p.weapon);
      const spd=(w?.passive==="speed_boost")?CFG.MAX_SPEED*1.25:CFG.MAX_SPEED;
      const slow=(p.slowed>now)?0.45:1;
      p.vx+=(tdx/mag)*spd*0.3*slow; p.vy+=(tdy/mag)*spd*0.3*slow; p.angle=lastAng;
    }
    const spd=Math.sqrt(p.vx**2+p.vy**2);
    if (spd>CFG.MAX_SPEED*1.3) { p.vx*=CFG.MAX_SPEED*1.3/spd; p.vy*=CFG.MAX_SPEED*1.3/spd; }
    let nx=p.x+p.vx*dt,ny=p.y+p.vy*dt;
    const pw=getW(p.weapon);
    if (pw?.passive!=="ghost") {
      if (collidesObs(nx,p.y,18)) { nx=p.x; p.vx*=-0.3; }
      if (collidesObs(p.x,ny,18)) { ny=p.y; p.vy*=-0.3; }
    }
    p.x=clamp(nx,20,CFG.MAP_SIZE-20); p.y=clamp(ny,20,CFG.MAP_SIZE-20);
    p.vx*=CFG.FRICTION; p.vy*=CFG.FRICTION;
    pickupLoot(p);
    // burn DoT
    for (const [vid,exp] of Object.entries(p.burnTargets||{})) {
      if (now>exp) { delete p.burnTargets[vid]; continue; }
      const v=players[vid]; if (v?.alive) { v.hp=Math.max(0,v.hp-5*dt); if (v.hp<=0) applyDamage(v,9999,p.id,p.weapon); }
    }
    const dz=dist(p.x,p.y,zone.cx,zone.cy);
    if (dz>zone.radius) { const d=CFG.STORM_DAMAGE*dt; p.shield=Math.max(0,p.shield-d); if (p.shield===0) p.hp=Math.max(0,p.hp-d); if (p.hp<=0) applyDamage(p,9999,null,"storm"); }
    if (dz<=zone.radius&&p.shield<p.maxShield) p.shield=Math.min(p.maxShield,p.shield+3*dt);
    if (p.reloadUntil&&now>=p.reloadUntil) {
      const w=getW(p.weapon);
      if (w&&w.ammoType!=="melee") { const need=w.maxAmmo-p.currentAmmo,fill=Math.min(need,p.ammo[w.ammoType]||0); p.currentAmmo+=fill; p.ammo[w.ammoType]=Math.max(0,(p.ammo[w.ammoType]||0)-fill); }
      p.reloadUntil=0;
    }
  }

  // Bullets
  const alive=[];
  for (const b of bullets) {
    if (now-b.born>CFG.BULLET_TTL) continue;
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.traveled+=Math.sqrt(b.vx**2+b.vy**2)*dt;
    if (b.x<0||b.x>CFG.MAP_SIZE||b.y<0||b.y>CFG.MAP_SIZE||b.traveled>b.range) continue;
    if (!b.pierce&&collidesObs(b.x,b.y,4)) continue;
    let hit=false;
    if (b.splash>0) {
      for (const q of Object.values(players)) {
        if (!q.alive||q.id===b.ownerId||(gameMode==="team"&&q.team===b.ownerTeam)) continue;
        const d=dist(b.x,b.y,q.x,q.y); if (d<b.splash) { applyDamage(q,Math.round(b.damage*(1-d/b.splash)),b.ownerId,b.weaponKey); hit=true; }
      }
    } else {
      for (const q of Object.values(players)) {
        if (!q.alive||q.id===b.ownerId||(gameMode==="team"&&q.team===b.ownerTeam)) continue;
        if (dist2(b.x,b.y,q.x,q.y)<18**2) { applyDamage(q,b.damage,b.ownerId,b.weaponKey); hit=!b.pierce; if (hit) break; }
      }
    }
    if (!hit) alive.push(b);
  }
  bullets=alive;
  loot=loot.filter(l=>now-l.spawnedAt<60000);

  io.emit("state",{
    players: sanitise(players),
    bullets: bullets.map(b=>({id:b.id,x:b.x|0,y:b.y|0,weapon:b.weapon,weaponKey:b.weaponKey})),
    loot:    loot.map(l=>({id:l.id,x:l.x|0,y:l.y|0,type:l.type,value:l.value,rarity:l.rarity})),
    zone:    {cx:zone.cx|0,cy:zone.cy|0,radius:zone.radius|0},
    time:    gameTime|0,
  });
}

function sanitise(ps) {
  const out={}, now=Date.now();
  for (const [id,p] of Object.entries(ps)) {
    const w=getW(p.weapon);
    out[id]={
      id:p.id,name:p.name,x:p.x|0,y:p.y|0,hp:p.hp|0,shield:p.shield|0,
      maxHp:p.maxHp,maxShield:p.maxShield,alive:p.alive,skin:p.skin,
      weapon:p.weapon,angle:+p.angle.toFixed(2),team:p.team,
      kills:p.kills,score:p.score,coins:p.coins,
      currentAmmo:p.currentAmmo,inventory:p.inventory,ammo:p.ammo,
      invincible:now<p.invincibleUntil,reloading:now<p.reloadUntil,
      passive:w?.passive||"none",rarity:w?.rarity||"common",
    };
  }
  return out;
}

initCrates();
setInterval(gameTick,1000/CFG.TICK_RATE);

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`🎮 Rise of Ikons PRO :${PORT}`));
process.on("SIGTERM",()=>{io.emit("serverShutdown",{message:"Restarting…"});server.close(()=>process.exit(0));});
process.on("SIGINT", ()=>{io.emit("serverShutdown",{message:"Restarting…"});server.close(()=>process.exit(0));});
