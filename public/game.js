"use strict";

// ─── Socket ───────────────────────────────────────────────────────────────────
const socket = io({ transports: ["websocket"] });

const canvas  = document.getElementById("game");
const ctx     = canvas.getContext("2d");
const minimap = document.getElementById("minimap");
const mctx    = minimap.getContext("2d");

canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;
window.addEventListener("resize", () => { canvas.width=window.innerWidth; canvas.height=window.innerHeight; });

// ─── State ────────────────────────────────────────────────────────────────────
let myId=null, players={}, bullets=[], lootItems=[], obstacles=[], weapons={}, crates=[];
let rarities={}, rarityOrder=[], zone={cx:3000,cy:3000,radius:4320}, mapSize=6000;
let gameMode="ffa", gameActive=false, selectedMode="ffa";

let myPos={x:3000,y:3000}, myAngle=0, myVel={x:0,y:0};
let camX=0, camY=0, shakeAmt=0;
const keys={};
let mx=canvas.width/2, my=canvas.height/2;

let currentWeapon="pistol_common", currentAmmo=12, reloading=false, reloadStart=0, reloadDuration=0, lastFire=0;
let mouseHeld=false, scoped=false;

let particles=[], prevPlayers={}, lerpAlpha=0, lastStateAt=0, hitFlash=0, inZone=true;
let _lastInvKey="", lastInputSent=0;
const FRICTION=0.80, SPEED=260;

// Shop
let shopListings=[], shopOpen=false;

// Rarity colours (fallback until server sends)
const RARITY_COLORS = {
  common:"#94a3b8", uncommon:"#4ade80", rare:"#60a5fa",
  epic:"#a78bfa", legendary:"#f97316", mythic:"#f43f5e", special:"#facc15",
};

// ─── HUD refs ─────────────────────────────────────────────────────────────────
const hudEl        = document.getElementById("hud");
const hpFill       = document.getElementById("hp-fill");
const shFill       = document.getElementById("sh-fill");
const hpVal        = document.getElementById("hp-val");
const shVal        = document.getElementById("sh-val");
const statKills    = document.getElementById("stat-kills");
const statScore    = document.getElementById("stat-score");
const statCoins    = document.getElementById("stat-coins");
const weaponNameEl = document.getElementById("weapon-name");
const ammoCountEl  = document.getElementById("ammo-count");
const ammoResEl    = document.getElementById("ammo-reserve");
const reloadWrap   = document.getElementById("reload-bar-wrap");
const reloadFill   = document.getElementById("reload-bar-fill");
const weaponSlots  = document.getElementById("weapon-slots");
const killfeed     = document.getElementById("killfeed");
const zoneWarn     = document.getElementById("zone-warn");
const notifyEl     = document.getElementById("notify");
const deathScreen  = document.getElementById("death-screen");
const deathBy      = document.getElementById("death-by");
const respawnBar   = document.getElementById("respawn-bar");
const lbEl         = document.getElementById("leaderboard");
const lbRows       = document.getElementById("lb-rows");
const passiveHud   = document.getElementById("passive-hud");
const shopEl       = document.getElementById("shop");
const shopItems    = document.getElementById("shop-items");

// ─── Menu ─────────────────────────────────────────────────────────────────────
document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(b=>b.classList.remove("active"));
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

// ─── Socket events ─────────────────────────────────────────────────────────────
socket.on("init", data => {
  myId       = data.id;
  obstacles  = data.obstacles || [];
  weapons    = data.weapons   || {};
  rarities   = data.rarities  || RARITY_COLORS;
  rarityOrder= data.rarityOrder||Object.keys(RARITY_COLORS);
  mapSize    = data.mapSize   || 6000;
  gameMode   = data.mode      || "ffa";
  shopListings = data.shop    || [];
  buildWeaponSlots();
  buildShop();
});

socket.on("crateSync", data => { crates = data; });
socket.on("crateOpened",  d => { const c=crates.find(x=>x.id===d.id); if (c) c.open=true; });
socket.on("crateRespawned",d => { const c=crates.find(x=>x.id===d.id); if (c) { c.open=false; c.tier=d.tier; } });

socket.on("state", data => {
  prevPlayers = JSON.parse(JSON.stringify(players));
  players  = data.players || {};
  bullets  = data.bullets || [];
  lootItems= data.loot    || [];
  if (data.zone) zone = data.zone;
  lerpAlpha=0; lastStateAt=performance.now();
  if (!myId||!players[myId]) return;
  const me=players[myId];
  myPos.x=me.x; myPos.y=me.y;
  updateHUD(me);
  inZone = Math.hypot(me.x-zone.cx, me.y-zone.cy) <= zone.radius;
  zoneWarn.style.display = inZone ? "none" : "block";
});

socket.on("zoneUpdate",   d => Object.assign(zone,d));
socket.on("modeChanged",  m => { gameMode=m; });
socket.on("shopUpdate",   d => { shopListings=d; buildShop(); });
socket.on("serverFull",   () => showNotify("Server full!",null));
socket.on("serverShutdown",d => showNotify(d.message,null));

socket.on("killFeed", entries => {
  killfeed.innerHTML="";
  entries.forEach(e=>{
    const div=document.createElement("div"); div.className="kf-entry";
    const wBase=e.w.split("_")[0]||e.w;
    div.innerHTML=`<span class="kf-kill">${e.k}</span> <span class="kf-weapon">[${wBase}]</span> <span class="kf-victim">${e.v}</span>`;
    killfeed.appendChild(div);
    setTimeout(()=>div.remove(),2500);
  });
});

socket.on("leaderboard", board => {
  lbRows.innerHTML=board.map((p,i)=>
    `<div class="lb-row"><div class="lb-rank">${i+1}</div><div class="lb-name">${p.name}</div><div class="lb-kills">${p.kills}K</div><div class="lb-score">${p.score}</div></div>`
  ).join("");
});

socket.on("weaponSwitched", d => {
  currentWeapon=d.weapon; currentAmmo=d.ammo;
  updateWeaponSlots(); updateAmmoHUD(); updatePassiveHud();
});

socket.on("reloading", d => {
  reloading=true; reloadStart=performance.now(); reloadDuration=d.duration;
  reloadWrap.style.display="block";
});

socket.on("died", d => {
  deathBy.textContent=`Killed by ${d.by}`;
  deathScreen.style.display="flex";
  let el=0; const total=d.respawnIn;
  const iv=setInterval(()=>{ el+=50; respawnBar.style.width=Math.min(100,(el/total)*100)+"%"; if(el>=total) clearInterval(iv); },50);
});

socket.on("respawned", d => {
  myPos.x=d.x; myPos.y=d.y;
  deathScreen.style.display="none"; reloading=false; reloadWrap.style.display="none";
});

socket.on("notify", d => {
  const msg   = typeof d==="string" ? d : d.msg;
  const rarity= typeof d==="string" ? null : d.rarity;
  showNotify(msg,rarity);
});

// ─── HUD helpers ──────────────────────────────────────────────────────────────
function updateHUD(me) {
  hpFill.style.width=Math.max(0,(me.hp/me.maxHp)*100)+"%";
  shFill.style.width=Math.max(0,(me.shield/me.maxShield)*100)+"%";
  hpVal.textContent=me.hp|0; shVal.textContent=me.shield|0;
  statKills.textContent=me.kills; statScore.textContent=me.score; statCoins.textContent=me.coins;
  currentAmmo=me.currentAmmo;
  const pct=me.hp/me.maxHp;
  hpFill.style.background=pct>0.5?"#22c55e":pct>0.25?"#facc15":"#ef4444";
  updateAmmoHUD();
}

function updateAmmoHUD() {
  const me=players[myId];
  const wBase=currentWeapon.split("_")[0];
  const w=weapons[currentWeapon];
  const rarity=currentWeapon.split("_").slice(1).join("_");
  const col=getRarityColor(rarity);
  weaponNameEl.textContent=wBase.replace("_"," ").toUpperCase();
  weaponNameEl.style.color=col;
  ammoCountEl.textContent=currentAmmo<0?"∞":currentAmmo;
  ammoResEl.textContent=me&&w?((me.ammo||{})[w.ammoType]||""):"";
}

function getRarityColor(rarity) {
  if (!rarity) return "#f1f5f9";
  return (rarities[rarity]?.color) || RARITY_COLORS[rarity] || "#f1f5f9";
}

function updatePassiveHud() {
  const w=weapons[currentWeapon];
  if (!w||!w.passive||w.passive==="none") { passiveHud.style.display="none"; return; }
  passiveHud.style.display="flex";
  passiveHud.innerHTML=`<span style="color:${getRarityColor(w.rarity)}">◆ ${w.passive.replace(/_/g," ").toUpperCase()}</span><span style="color:#94a3b8;font-size:10px">${w.passiveDesc}</span>`;
}

let notifyTimeout;
function showNotify(msg, rarity) {
  const col=getRarityColor(rarity);
  notifyEl.innerHTML=`<span style="color:${rarity?col:'#facc15'}">${rarity?`[${rarity.toUpperCase()}] `:""}</span>${msg}`;
  notifyEl.style.opacity="1";
  clearTimeout(notifyTimeout);
  notifyTimeout=setTimeout(()=>notifyEl.style.opacity="0",2400);
}

function buildWeaponSlots() {
  const me=players[myId];
  const inv=me?.inventory||["pistol_common"];
  weaponSlots.innerHTML="";
  inv.forEach((wKey,i)=>{
    if (i>=7) return;
    const rarity=wKey.split("_").slice(1).join("_");
    const base=wKey.split("_")[0];
    const col=getRarityColor(rarity);
    const d=document.createElement("div");
    d.className="wslot"+(wKey===currentWeapon?" active":"");
    d.id="wslot-"+wKey;
    d.style.borderColor=wKey===currentWeapon?col:"";
    d.innerHTML=`<span class="wslot-key">${i+1}</span><span style="color:${col}">${base.replace("_"," ").toUpperCase()}</span><span class="wslot-rarity" style="color:${col};font-size:8px">${rarity.toUpperCase()}</span>`;
    d.onclick=()=>socket.emit("switchWeapon",wKey);
    weaponSlots.appendChild(d);
  });
}

function updateWeaponSlots() {
  document.querySelectorAll(".wslot").forEach(el=>{
    el.classList.remove("active");
    el.style.borderColor="";
  });
  const active=document.getElementById("wslot-"+currentWeapon);
  if (active) {
    active.classList.add("active");
    const rarity=currentWeapon.split("_").slice(1).join("_");
    active.style.borderColor=getRarityColor(rarity);
  }
}

// ─── Shop UI ──────────────────────────────────────────────────────────────────
function buildShop() {
  if (!shopEl) return;
  shopItems.innerHTML="";
  shopListings.forEach(item=>{
    const col=item.rarity?getRarityColor(item.rarity):"#f1f5f9";
    const div=document.createElement("div");
    div.className="shop-item";
    div.style.borderColor=item.rarity?col:"rgba(255,255,255,0.1)";
    div.innerHTML=`
      <div class="shop-item-name" style="color:${col}">${item.label}</div>
      ${item.passiveDesc?`<div class="shop-item-passive">⚡ ${item.passiveDesc}</div>`:""}
      <div class="shop-item-cost"><span style="color:#facc15">⬡</span> ${item.cost}</div>
      <button class="shop-buy-btn" style="border-color:${col};color:${col}" onclick="buyItem('${item.id}')">BUY</button>`;
    shopItems.appendChild(div);
  });
}

function buyItem(id) {
  socket.emit("shopBuy",id);
}

function toggleShop() {
  shopOpen=!shopOpen;
  shopEl.style.display=shopOpen?"flex":"none";
  if (shopOpen) { socket.emit("getShop"); }
}

// ─── Input ────────────────────────────────────────────────────────────────────
document.addEventListener("keydown", e=>{
  keys[e.key.toLowerCase()]=true;
  if (!gameActive) return;
  if (e.key==="Tab")    { e.preventDefault(); lbEl.style.display="block"; }
  if (e.key==="Escape") { lbEl.style.display="none"; shopEl.style.display="none"; shopOpen=false; }
  if (e.key==="b"||e.key==="B") toggleShop();
  if (e.key==="r"||e.key==="R") socket.emit("reload");
  const numKeys={"1":0,"2":1,"3":2,"4":3,"5":4,"6":5,"7":6};
  if (e.key in numKeys) {
    const me=players[myId];
    if (me?.inventory) { const w=me.inventory[numKeys[e.key]]; if (w) socket.emit("switchWeapon",w); }
  }
  if (e.key==="f"||e.key==="F") {
    const me=players[myId]; if (!me) return;
    const nearby=crates.find(c=>!c.open&&Math.hypot(me.x-c.x,me.y-c.y)<80);
    if (nearby) socket.emit("openCrate",nearby.id);
  }
});

document.addEventListener("keyup", e=>{
  keys[e.key.toLowerCase()]=false;
  if (e.key==="Tab") lbEl.style.display="none";
});

canvas.addEventListener("mousemove",e=>{ mx=e.clientX; my=e.clientY; });
canvas.addEventListener("mousedown",e=>{ if (!gameActive||!myId||e.button!==0) return; mouseHeld=true; doShoot(); });
canvas.addEventListener("mouseup",  ()=>mouseHeld=false);
canvas.addEventListener("mouseleave",()=>mouseHeld=false);
canvas.addEventListener("contextmenu",e=>{ e.preventDefault(); scoped=!scoped; });
canvas.addEventListener("mouseup",e=>{ if (e.button===2) scoped=false; });

function doShoot() {
  if (!myId||!players[myId]) return;
  const now=Date.now(), w=weapons[currentWeapon]; if (!w) return;
  if (now-lastFire<w.fireRate||reloading) return;
  if (currentAmmo===0) { socket.emit("reload"); return; }
  lastFire=now;
  const worldMx=myPos.x+(mx-canvas.width/2), worldMy=myPos.y+(my-canvas.height/2);
  const angle=Math.atan2(worldMy-myPos.y, worldMx-myPos.x);
  socket.emit("attack",{angle});
  spawnMuzzleFlash(myPos.x,myPos.y,angle,w);
  shakeAmt=Math.min(shakeAmt+(w.baseName==="shotgun"?8:w.baseName==="rpg"?15:3),18);
}

// ─── Particles ────────────────────────────────────────────────────────────────
function spawnMuzzleFlash(x,y,angle,w) {
  const wName=w?.baseName||"";
  const col=wName==="flamethrower"?"#f97316":wName==="plasma"?"#60a5fa":"#facc15";
  const count=wName==="shotgun"?12:wName==="flamethrower"?8:5;
  for (let i=0;i<count;i++) {
    const a=angle+(Math.random()-0.5)*0.6, spd=60+Math.random()*130;
    particles.push({x,y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,life:1,decay:3+Math.random()*2,color:col,size:2+Math.random()*2.5});
  }
}

// ─── sendInput ────────────────────────────────────────────────────────────────
function sendInput() {
  if (!gameActive||!myId) return;
  const now=Date.now();
  if (now-lastInputSent<16) return;
  lastInputSent=now;
  let dx=0,dy=0;
  if (keys["w"]||keys["arrowup"])    dy-=1;
  if (keys["s"]||keys["arrowdown"])  dy+=1;
  if (keys["a"]||keys["arrowleft"])  dx-=1;
  if (keys["d"]||keys["arrowright"]) dx+=1;
  const worldMx=myPos.x+(mx-canvas.width/2), worldMy=myPos.y+(my-canvas.height/2);
  myAngle=Math.atan2(worldMy-myPos.y,worldMx-myPos.x);
  if (dx!==0||dy!==0) {
    socket.emit("input",{dx,dy,angle:myAngle});
    const mag=Math.sqrt(dx*dx+dy*dy);
    myVel.x+=(dx/mag)*SPEED*0.016; myVel.y+=(dy/mag)*SPEED*0.016;
  }
  myVel.x*=FRICTION; myVel.y*=FRICTION;
  myPos.x+=myVel.x; myPos.y+=myVel.y;
  if (mouseHeld) { const w=weapons[currentWeapon]; if (w?.auto) doShoot(); }
}

// ─── Rendering ────────────────────────────────────────────────────────────────
const TILE=80;
const WEAPON_COLORS={
  pistol:"#facc15",smg:"#22d3ee",rifle:"#4ade80",shotgun:"#f97316",
  sniper:"#a78bfa",sword:"#f1f5f9",knife:"#94a3b8",rpg:"#ef4444",
  minigun:"#fb923c",railgun:"#60a5fa",dual_pistols:"#facc15",
  plasma:"#38bdf8",katana:"#f43f5e",flamethrower:"#f97316",
};

function worldToScreen(wx,wy) { return {x:wx-camX+canvas.width/2, y:wy-camY+canvas.height/2}; }

function drawBackground() {
  ctx.fillStyle="#0f172a"; ctx.fillRect(0,0,canvas.width,canvas.height);
  const startX=(-camX%TILE+canvas.width/2)%TILE, startY=(-camY%TILE+canvas.height/2)%TILE;
  ctx.strokeStyle="rgba(30,41,59,0.6)"; ctx.lineWidth=0.5;
  for (let x=startX-TILE;x<canvas.width+TILE;x+=TILE) { ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke(); }
  for (let y=startY-TILE;y<canvas.height+TILE;y+=TILE) { ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke(); }
  const corners=[worldToScreen(0,0),worldToScreen(mapSize,0),worldToScreen(mapSize,mapSize),worldToScreen(0,mapSize)];
  ctx.strokeStyle="rgba(59,130,246,0.3)"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(corners[0].x,corners[0].y); corners.forEach(c=>ctx.lineTo(c.x,c.y)); ctx.closePath(); ctx.stroke();
}

function drawZone() {
  const c=worldToScreen(zone.cx,zone.cy);
  const screenR=zone.radius*(canvas.width/mapSize);
  ctx.save();
  ctx.beginPath(); ctx.arc(c.x,c.y,screenR,0,Math.PI*2);
  ctx.fillStyle="rgba(59,130,246,0.03)"; ctx.fill();
  ctx.strokeStyle="rgba(59,130,246,0.5)"; ctx.lineWidth=2;
  ctx.setLineDash([12,8]); ctx.lineDashOffset=-((Date.now()/40)%20);
  ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  if (!inZone) {
    const vignette=ctx.createRadialGradient(canvas.width/2,canvas.height/2,canvas.width*0.3,canvas.width/2,canvas.height/2,canvas.width*0.85);
    vignette.addColorStop(0,"rgba(239,68,68,0)"); vignette.addColorStop(1,"rgba(239,68,68,0.28)");
    ctx.fillStyle=vignette; ctx.fillRect(0,0,canvas.width,canvas.height);
  }
}

function drawObstacles() {
  for (const o of obstacles) {
    const s=worldToScreen(o.x,o.y);
    ctx.fillStyle="#1e293b"; ctx.strokeStyle="#334155"; ctx.lineWidth=1.5;
    ctx.beginPath(); roundRect(ctx,s.x,s.y,o.w,o.h,4); ctx.fill(); ctx.stroke();
  }
}

function drawCrates() {
  const now=Date.now()/1000;
  for (const c of crates) {
    if (c.open) continue;
    const s=worldToScreen(c.x,c.y);
    const col=RARITY_COLORS[c.tier]||"#94a3b8";
    const bob=Math.sin(now*1.5+c.x)*3;
    // Crate box
    ctx.save();
    ctx.strokeStyle=col; ctx.lineWidth=2;
    ctx.fillStyle="rgba(0,0,0,0.5)";
    ctx.beginPath(); roundRect(ctx,s.x-14,s.y-14+bob,28,28,4); ctx.fill(); ctx.stroke();
    // Inner cross
    ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.globalAlpha=0.7;
    ctx.beginPath(); ctx.moveTo(s.x-7,s.y+bob); ctx.lineTo(s.x+7,s.y+bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x,s.y-7+bob); ctx.lineTo(s.x,s.y+7+bob); ctx.stroke();
    ctx.restore();
    // Tier label
    ctx.fillStyle=col; ctx.font="bold 8px monospace"; ctx.textAlign="center";
    ctx.fillText(c.tier.toUpperCase(),s.x,s.y-18+bob);
    // Prompt if nearby
    const me=players[myId];
    if (me&&Math.hypot(me.x-c.x,me.y-c.y)<80) {
      ctx.fillStyle="#fff"; ctx.font="bold 9px monospace";
      ctx.fillText("[F] OPEN",s.x,s.y+30+bob);
    }
  }
}

function drawLoot() {
  const t=Date.now()/1000;
  for (const item of lootItems) {
    const s=worldToScreen(item.x,item.y);
    const bob=Math.sin(t*2+item.x)*3;
    const col=item.type==="weapon"?getRarityColor(item.rarity)
      :item.type==="health"?"#22c55e":item.type==="shield"?"#3b82f6":"#facc15";
    ctx.fillStyle=col; ctx.beginPath(); ctx.arc(s.x,s.y+bob,6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=col; ctx.font="bold 8px monospace"; ctx.textAlign="center";
    const label=item.type==="weapon"?(item.value.split("_")[0]).toUpperCase()
      :item.type==="health"?"+HP":item.type==="shield"?"+SH":"$";
    ctx.fillText(label,s.x,s.y+bob-13);
    if (item.rarity&&item.type==="weapon") {
      ctx.fillStyle=col; ctx.font="7px monospace";
      ctx.fillText(item.rarity.toUpperCase(),s.x,s.y+bob-22);
    }
  }
}

function drawBullets() {
  const groups={};
  for (const b of bullets) {
    const wBase=b.weapon||b.weaponKey?.split("_")[0]||"";
    const col=WEAPON_COLORS[wBase]||"#fff";
    if (!groups[col]) groups[col]=[];
    groups[col].push(b);
  }
  for (const [col,batch] of Object.entries(groups)) {
    ctx.fillStyle=col; ctx.beginPath();
    for (const b of batch) {
      const s=worldToScreen(b.x,b.y);
      const r=b.weapon==="sniper"||b.weapon==="railgun"?5:b.weapon==="rpg"?6:3;
      ctx.moveTo(s.x+r,s.y); ctx.arc(s.x,s.y,r,0,Math.PI*2);
    }
    ctx.fill();
  }
}

function drawPlayers() {
  for (const [id,p] of Object.entries(players)) {
    if (!p.alive) continue;
    const prev=prevPlayers[id];
    const t=Math.min(lerpAlpha,1);
    const rx=prev?prev.x+(p.x-prev.x)*t:p.x;
    const ry=prev?prev.y+(p.y-prev.y)*t:p.y;
    const s=worldToScreen(id===myId?myPos.x:rx, id===myId?myPos.y:ry);
    const R=18;
    const rarity=p.rarity||"common";
    const rarityCol=getRarityColor(rarity);

    // Rarity aura for rare+
    if (["rare","epic","legendary","mythic","special"].includes(rarity)) {
      ctx.save(); ctx.globalAlpha=0.18+Math.sin(Date.now()/300)*0.08;
      ctx.fillStyle=rarityCol; ctx.beginPath(); ctx.arc(s.x,s.y,R+8,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    if (p.invincible) {
      ctx.save(); ctx.globalAlpha=0.3+Math.sin(Date.now()/80)*0.3;
      ctx.strokeStyle="#fff"; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(s.x,s.y,R+6,0,Math.PI*2); ctx.stroke(); ctx.restore();
    }
    // Shadow
    ctx.fillStyle="rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(s.x,s.y+R-3,R*0.7,5,0,0,Math.PI*2); ctx.fill();
    // Body
    const skin=gameMode==="team"?(p.team==="red"?"#ef4444":"#3b82f6"):p.skin;
    ctx.fillStyle=skin; ctx.beginPath(); ctx.arc(s.x,s.y,R,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=id===myId?rarityCol:"rgba(255,255,255,0.3)";
    ctx.lineWidth=id===myId?2.5:1; ctx.stroke();
    // Weapon line
    const angle=id===myId?myAngle:(p.angle||0);
    const wBase=(p.weapon||"").split("_")[0];
    ctx.strokeStyle=WEAPON_COLORS[wBase]||"#fff"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(s.x+Math.cos(angle)*28,s.y+Math.sin(angle)*28); ctx.stroke();
    // HP bar
    const bw=36,bh=4,bx=s.x-bw/2,by=s.y-R-10;
    ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.beginPath(); roundRect(ctx,bx,by,bw,bh,2); ctx.fill();
    const hp=p.hp/p.maxHp;
    ctx.fillStyle=hp>0.5?"#22c55e":hp>0.25?"#facc15":"#ef4444";
    ctx.beginPath(); roundRect(ctx,bx,by,bw*hp,bh,2); ctx.fill();
    // Shield arc
    if (p.shield>0) {
      ctx.strokeStyle="rgba(59,130,246,0.7)"; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(s.x,s.y,R+4,-Math.PI/2,-Math.PI/2+(p.shield/p.maxShield)*Math.PI*2); ctx.stroke();
    }
    // Name + rarity
    ctx.font="bold 10px monospace"; ctx.textAlign="center";
    const label=p.name+(gameMode==="team"?` [${(p.team||"").toUpperCase()}]`:"");
    if (!p._labelW||p._label!==label) { p._label=label; p._labelW=ctx.measureText(label).width; }
    ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(s.x-p._labelW/2-3,s.y-R-22,p._labelW+6,13);
    ctx.fillStyle=id===myId?rarityCol:"#cbd5e1"; ctx.fillText(label,s.x,s.y-R-12);
  }
}

function drawParticles(dt) {
  for (const p of particles) { p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.92; p.vy*=0.92; p.life-=p.decay*dt; }
  particles=particles.filter(p=>p.life>0);
  const buckets={};
  for (const p of particles) {
    const alpha=Math.max(0,p.life).toFixed(1);
    const key=p.color+"|"+alpha;
    if (!buckets[key]) buckets[key]={color:p.color,alpha:+alpha,pts:[]};
    buckets[key].pts.push(p);
  }
  for (const b of Object.values(buckets)) {
    ctx.globalAlpha=b.alpha; ctx.fillStyle=b.color; ctx.beginPath();
    for (const p of b.pts) { const s=worldToScreen(p.x,p.y); const r=Math.max(0.1,p.size*p.life); ctx.moveTo(s.x+r,s.y); ctx.arc(s.x,s.y,r,0,Math.PI*2); }
    ctx.fill();
  }
  ctx.globalAlpha=1;
}

function drawScope() {
  if (!scoped) return;
  const w=weapons[currentWeapon];
  if (!w||w.passive!=="fov_boost") return;
  // Dark vignette for scope
  ctx.fillStyle="rgba(0,0,0,0.75)";
  ctx.beginPath();
  ctx.rect(0,0,canvas.width,canvas.height);
  ctx.arc(mx,my,160,0,Math.PI*2,true);
  ctx.fill();
  // Scope ring
  ctx.strokeStyle="#94a3b8"; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(mx,my,160,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,0.3)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(mx-160,my); ctx.lineTo(mx+160,my); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mx,my-160); ctx.lineTo(mx,my+160); ctx.stroke();
}

function drawCrosshair() {
  if (scoped) return;
  ctx.save();
  const w=weapons[currentWeapon];
  const spread=w?Math.max(8,(w.spread||0.05)*80):8;
  ctx.strokeStyle=hitFlash>0?"#ef4444":"rgba(255,255,255,0.85)";
  ctx.lineWidth=hitFlash>0?2:1.5;
  const gap=4, r=spread;
  ctx.beginPath();
  ctx.moveTo(mx-r-gap,my); ctx.lineTo(mx-gap,my);
  ctx.moveTo(mx+gap,my);   ctx.lineTo(mx+r+gap,my);
  ctx.moveTo(mx,my-r-gap); ctx.lineTo(mx,my-gap);
  ctx.moveTo(mx,my+gap);   ctx.lineTo(mx,my+r+gap);
  ctx.arc(mx,my,gap,0,Math.PI*2);
  ctx.stroke(); ctx.restore();
}

function roundRect(c,x,y,w,h,r) {
  c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r);
  c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath();
}

// ─── Minimap ──────────────────────────────────────────────────────────────────
function drawMinimap() {
  const W=minimap.width, H=minimap.height, scale=W/mapSize;
  mctx.fillStyle="rgba(0,0,0,0.85)"; mctx.fillRect(0,0,W,H);
  // Zone
  mctx.strokeStyle="rgba(59,130,246,0.6)"; mctx.lineWidth=1;
  mctx.beginPath(); mctx.arc(zone.cx*scale,zone.cy*scale,zone.radius*scale,0,Math.PI*2); mctx.stroke();
  // Obstacles
  mctx.fillStyle="#1e293b";
  for (const o of obstacles) mctx.fillRect(o.x*scale,o.y*scale,o.w*scale,o.h*scale);
  // Crates
  for (const c of crates) {
    if (c.open) continue;
    mctx.fillStyle=RARITY_COLORS[c.tier]||"#94a3b8";
    mctx.fillRect(c.x*scale-2,c.y*scale-2,4,4);
  }
  // Loot
  for (const l of lootItems) {
    mctx.fillStyle=l.type==="weapon"?getRarityColor(l.rarity):"#22c55e";
    mctx.fillRect(l.x*scale-1,l.y*scale-1,2,2);
  }
  // Bullets
  mctx.fillStyle="#facc15";
  for (const b of bullets) mctx.fillRect(b.x*scale-1,b.y*scale-1,2,2);
  // Players
  for (const [id,p] of Object.entries(players)) {
    if (!p.alive) continue;
    const px=(id===myId?myPos.x:p.x)*scale, py=(id===myId?myPos.y:p.y)*scale;
    const col=id===myId?"#fff":gameMode==="team"?(p.team==="red"?"#ef4444":"#3b82f6"):p.skin;
    mctx.fillStyle=col; mctx.beginPath(); mctx.arc(px,py,id===myId?3:2,0,Math.PI*2); mctx.fill();
  }
  // FOV line
  if (myId&&players[myId]) {
    const px=myPos.x*scale, py=myPos.y*scale;
    mctx.strokeStyle="rgba(255,255,255,0.15)"; mctx.lineWidth=0.5;
    const fovH=Math.PI/4, fovL=14;
    mctx.beginPath(); mctx.moveTo(px,py); mctx.lineTo(px+Math.cos(myAngle-fovH)*fovL,py+Math.sin(myAngle-fovH)*fovL);
    mctx.moveTo(px,py); mctx.lineTo(px+Math.cos(myAngle+fovH)*fovL,py+Math.sin(myAngle+fovH)*fovL); mctx.stroke();
  }
}

function updateReload() {
  if (!reloading) return;
  const now=performance.now(), pct=Math.min(1,(now-reloadStart)/reloadDuration);
  reloadFill.style.width=(pct*100)+"%";
  if (pct>=1) { reloading=false; reloadWrap.style.display="none"; buildWeaponSlots(); }
}

// ─── Main loop ────────────────────────────────────────────────────────────────
let lastFrame=performance.now();
const LERP_DURATION=100;

function loop(now) {
  requestAnimationFrame(loop);
  const dt=Math.min((now-lastFrame)/1000,0.1);
  lastFrame=now;
  sendInput(); updateReload();
  lerpAlpha=Math.min(1,(now-lastStateAt)/LERP_DURATION);

  const targetX=myPos.x, targetY=myPos.y;
  camX+=(targetX-camX)*0.15; camY+=(targetY-camY)*0.15;

  // Scope zoom effect: shift camera closer to mouse
  if (scoped&&weapons[currentWeapon]?.passive==="fov_boost") {
    const worldMx=camX+(mx-canvas.width/2)*0.5;
    const worldMy=camY+(my-canvas.height/2)*0.5;
    camX+=(worldMx-camX)*0.12; camY+=(worldMy-camY)*0.12;
  }

  let sx=0,sy=0;
  if (shakeAmt>0.1) { sx=(Math.random()-0.5)*shakeAmt; sy=(Math.random()-0.5)*shakeAmt; shakeAmt*=0.82; }

  ctx.save(); ctx.translate(sx,sy);
  drawBackground();
  if (gameActive) {
    drawZone(); drawObstacles(); drawCrates(); drawLoot(); drawBullets(); drawParticles(dt); drawPlayers();
  }
  drawScope(); drawCrosshair();
  ctx.restore();
  if (gameActive) drawMinimap();
  if (hitFlash>0) hitFlash-=dt*3;

  const me=players[myId];
  if (me?.inventory) {
    const newKey=me.inventory.join(",");
    if (newKey!==_lastInvKey) { _lastInvKey=newKey; buildWeaponSlots(); updatePassiveHud(); }
  }
}

requestAnimationFrame(loop);
