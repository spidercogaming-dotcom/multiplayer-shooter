"use strict";

// ─── Settings (persisted to localStorage) ────────────────────────────────────
const DEFAULT_SETTINGS = {
  // display
  showFps:true, showPing:true, gridStyle:"normal", renderScale:1.0,
  fpsLimit:0, showZoneWarning:true, bloodParticles:true, bulletTrails:true, rarityAuras:true,
  // hud
  hudScale:1.0, minimapSize:"medium", minimapOpacity:0.88, minimapZoom:"full",
  showNames:true, showHealthBars:true, showShieldArcs:true,
  showDamageNums:true, showPassive:true, showKillFeed:true, killFeedSize:"medium",
  // crosshair
  crosshairStyle:"dynamic", crosshairColor:"#ffffff", crosshairSize:1.0,
  crosshairOpacity:1.0, crosshairOutline:true, crosshairGap:4,
  // gameplay
  screenShake:true, particleQuality:"high", inputRate:64, colorblindMode:"off",
  autoReload:true, showHitIndicator:true, cameraSmoothing:0.12,
  // audio
  masterVolume:0.6, sfxVolume:0.8, shootSfx:true, hitSfx:true, killSfx:true,
  // controls
  mouseSensitivity:1.0, invertY:false, scopeToggle:"toggle", aimAssist:false,
};

let S = {};
try { S = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem("roi_settings")||"{}")); }
catch { S = {...DEFAULT_SETTINGS}; }
function saveSetting(k,v){ S[k]=v; try{localStorage.setItem("roi_settings",JSON.stringify(S));}catch{} }

// ─── Socket ───────────────────────────────────────────────────────────────────
const socket = io({ transports:["websocket"], reconnectionDelay:500 });
let ping=0, lastPingSent=0;
setInterval(()=>{ lastPingSent=Date.now(); socket.emit("ping_check"); },2000);
socket.on("pong_check",()=>{ ping=Date.now()-lastPingSent; });

// ─── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById("game");
const ctx    = canvas.getContext("2d");
const mmCvs  = document.getElementById("minimap");
const mctx   = mmCvs.getContext("2d");

function resizeCanvas(){
  const sc=S.renderScale||1;
  canvas.width=Math.round(window.innerWidth*sc); canvas.height=Math.round(window.innerHeight*sc);
  canvas.style.width=window.innerWidth+"px"; canvas.style.height=window.innerHeight+"px";
}
resizeCanvas();
window.addEventListener("resize",resizeCanvas);

// ─── State ────────────────────────────────────────────────────────────────────
let myId=null,players={},bullets=[],lootItems=[],obstacles=[],weapons={},crates=[];
let rarities={},rarityOrder=[],zone={cx:3000,cy:3000,radius:4320},mapSize=6000;
let gameMode="ffa",gameActive=false,selectedMode="ffa";
let myPos={x:3000,y:3000},myAngle=0,myVel={x:0,y:0};
let camX=0,camY=0,shakeAmt=0;
const keys={};
let mx=800,my=450,mouseHeld=false,scoped=false,lastInputSent=0;
let currentWeapon="pistol_common",currentAmmo=12,reloading=false,reloadStart=0,reloadDuration=0,lastFire=0;
let particles=[],damageNums=[],prevPlayers={},lerpT=0,lastStateAt=0,hitFlash=0,inZone=true,_lastInvKey="";
let lastFrame=performance.now(),fps=0,fpsAcc=0,fpsN=0,_mmFrame=0,_rafId=null;
let shopListings=[],shopOpen=false,settingsOpen=false;
let deviceType="pc"; // set by device picker
window.onDevicePicked=function(type){ deviceType=type; initMobileControls(); };


const LERP_DUR=80, FRICTION=0.80, BASE_SPEED=260;

const RARITY_COLORS={common:"#94a3b8",uncommon:"#4ade80",rare:"#60a5fa",epic:"#a78bfa",legendary:"#f97316",mythic:"#f43f5e",special:"#facc15"};
const WEAPON_COLORS={pistol:"#facc15",smg:"#22d3ee",rifle:"#4ade80",shotgun:"#f97316",sniper:"#a78bfa",sword:"#f1f5f9",knife:"#94a3b8",rpg:"#ef4444",minigun:"#fb923c",railgun:"#60a5fa",dual_pistols:"#facc15",plasma:"#38bdf8",katana:"#f43f5e",flamethrower:"#f97316"};

// ─── HUD refs ─────────────────────────────────────────────────────────────────
const $=id=>document.getElementById(id);
const hudEl=$("hud"),hpFill=$("hp-fill"),shFill=$("sh-fill"),hpVal=$("hp-val"),shVal=$("sh-val");
const statKills=$("stat-kills"),statScore=$("stat-score"),statCoins=$("stat-coins");
const weaponNameEl=$("weapon-name"),ammoCountEl=$("ammo-count"),ammoResEl=$("ammo-reserve");
const reloadWrap=$("reload-bar-wrap"),reloadFill=$("reload-bar-fill");
const weaponSlots=$("weapon-slots"),killfeed=$("killfeed"),zoneWarn=$("zone-warn"),notifyEl=$("notify");
const deathScreen=$("death-screen"),deathBy=$("death-by"),respawnBar=$("respawn-bar");
const lbEl=$("leaderboard"),lbRows=$("lb-rows"),passiveHud=$("passive-hud");
const shopEl=$("shop"),shopItemsEl=$("shop-items"),settingsEl=$("settings-panel");
const fpsEl=$("fps-counter"),pingEl=$("ping-counter");

// ─── Menu ─────────────────────────────────────────────────────────────────────
document.querySelectorAll(".mode-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".mode-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active"); selectedMode=btn.dataset.mode;
  });
});

window.startGame=function(){
  const name=($("name-input").value.trim()||"Player");
  socket.emit("joinGame",{name}); socket.emit("setMode",selectedMode);
  $("menu").style.display="none"; hudEl.style.display="block"; gameActive=true;
  applyHudScale(); applyMinimapSize();
};

// ─── Socket events ────────────────────────────────────────────────────────────
socket.on("init",data=>{
  myId=data.id; obstacles=data.obstacles||[]; weapons=data.weapons||{};
  rarities=data.rarities||{}; rarityOrder=data.rarityOrder||Object.keys(RARITY_COLORS);
  mapSize=data.mapSize||6000; gameMode=data.mode||"ffa";
  shopListings=data.shop||[];
  buildWeaponSlots(); buildShopUI();
});
socket.on("crateSync",d=>{crates=d;});
socket.on("crateOpened",d=>{const c=crates.find(x=>x.id===d.id);if(c)c.open=true;});
socket.on("crateRespawned",d=>{const c=crates.find(x=>x.id===d.id);if(c){c.open=false;c.tier=d.tier;}});

socket.on("state",data=>{
  // Lightweight prev-copy (only position/hp for lerp)
  const pp={};
  for(const id in players){const p=players[id];pp[id]={x:p.x,y:p.y,hp:p.hp,shield:p.shield};}
  prevPlayers=pp;
  players=data.players||{}; bullets=data.bullets||[]; lootItems=data.loot||[];
  if(data.zone) zone=data.zone;
  lerpT=0; lastStateAt=performance.now();
  const me=players[myId]; if(!me) return;
  // Soft position reconciliation — smooth lerp, hard snap only on teleport
  const dx=me.x-myPos.x,dy=me.y-myPos.y,err=Math.sqrt(dx*dx+dy*dy);
  if(err>200){
    // Teleport / respawn — hard snap
    myPos.x=me.x;myPos.y=me.y;myVel.x=0;myVel.y=0;
  }else if(err>6){
    // Gentle correction — blend at ~18% per server tick, not per frame
    // This prevents the jitter from accumulated prediction drift
    const blend=Math.min(0.18,err/300);
    myPos.x+=dx*blend;myPos.y+=dy*blend;
    // Also dampen velocity in the error direction to prevent over-correction
    myVel.x*=0.95;myVel.y*=0.95;
  }
  currentAmmo=me.currentAmmo;
  updateHUD(me);
  inZone=Math.hypot(me.x-zone.cx,me.y-zone.cy)<=zone.radius;
  zoneWarn.style.display=(S.showZoneWarning&&!inZone)?"block":"none";
});

socket.on("zoneUpdate",d=>Object.assign(zone,d));
socket.on("modeChanged",m=>{gameMode=m;});
socket.on("shopUpdate",d=>{shopListings=d;buildShopUI();});
socket.on("serverFull",()=>showNotify("Server full!",null));
socket.on("serverShutdown",d=>showNotify(d.message,null));

socket.on("killFeed",entries=>{
  if(!S.showKillFeed){killfeed.innerHTML="";return;}
  killfeed.innerHTML="";
  const sz=S.killFeedSize||"medium";
  const fsz={small:"10px",medium:"11px",large:"13px"}[sz]||"11px";
  entries.forEach(e=>{
    const div=document.createElement("div"); div.className="kf-entry"; div.style.fontSize=fsz;
    const wb=(e.w||"").split("_")[0];
    div.innerHTML=`<span class="kf-kill">${esc(e.k)}</span> <span class="kf-weapon">[${wb}]</span> <span class="kf-victim">${esc(e.v)}</span>`;
    killfeed.appendChild(div); setTimeout(()=>div.remove(),2600);
  });
});

socket.on("leaderboard",board=>{
  lbRows.innerHTML=board.map((p,i)=>`<div class="lb-row"><div class="lb-rank">${i+1}</div><div class="lb-name">${esc(p.name)}${p.team?` <span style="color:${p.team==="red"?"#ef4444":"#3b82f6"}">[${p.team.toUpperCase()}]</span>`:""}</div><div class="lb-kills">${p.kills}K</div><div class="lb-score">${p.score}</div></div>`).join("");
});

socket.on("weaponSwitched",d=>{
  currentWeapon=d.weapon; currentAmmo=d.ammo; reloading=false; reloadWrap.style.display="none";
  updateWeaponSlots(); updateAmmoHUD(); updatePassiveHud();
});
socket.on("reloading",d=>{reloading=true;reloadStart=performance.now();reloadDuration=d.duration;reloadWrap.style.display="block";});
socket.on("died",d=>{
  deathBy.textContent=`Killed by ${d.by}`; deathScreen.style.display="flex";
  let el=0; const iv=setInterval(()=>{el+=50;respawnBar.style.width=Math.min(100,(el/d.respawnIn)*100)+"%";if(el>=d.respawnIn)clearInterval(iv);},50);
});
socket.on("respawned",d=>{myPos.x=d.x;myPos.y=d.y;myVel.x=0;myVel.y=0;deathScreen.style.display="none";reloading=false;reloadWrap.style.display="none";});
socket.on("notify",d=>{const msg=typeof d==="string"?d:d.msg;showNotify(msg,typeof d==="string"?null:d.rarity);});

// ─── HUD helpers ──────────────────────────────────────────────────────────────
function updateHUD(me){
  const hp=Math.max(0,me.hp/me.maxHp),sh=Math.max(0,me.shield/me.maxShield);
  hpFill.style.width=(hp*100)+"%"; shFill.style.width=(sh*100)+"%";
  hpVal.textContent=me.hp|0; shVal.textContent=me.shield|0;
  statKills.textContent=me.kills; statScore.textContent=me.score; statCoins.textContent=me.coins;
  hpFill.style.background=hp>0.5?"#22c55e":hp>0.25?"#facc15":"#ef4444";
  updateAmmoHUD();
}
function updateAmmoHUD(){
  const me=players[myId],w=weapons[currentWeapon];
  const base=currentWeapon.split("_")[0],rarity=currentWeapon.split("_").slice(1).join("_"),col=getRarityColor(rarity);
  weaponNameEl.textContent=base.replace(/_/g," ").toUpperCase(); weaponNameEl.style.color=col;
  ammoCountEl.textContent=currentAmmo<0?"∞":currentAmmo;
  ammoResEl.textContent=me&&w?((me.ammo||{})[w.ammoType]??""):"";
}
function getRarityColor(r){return rarities[r]?.color||RARITY_COLORS[r]||"#f1f5f9";}
function updatePassiveHud(){
  if(!S.showPassive){passiveHud.style.display="none";return;}
  const w=weapons[currentWeapon];
  if(!w||!w.passive||w.passive==="none"){passiveHud.style.display="none";return;}
  const col=getRarityColor(w.rarity);
  passiveHud.style.display="flex";
  passiveHud.innerHTML=`<span style="color:${col}">◆ ${w.passive.replace(/_/g," ").toUpperCase()}</span><span class="passive-desc">${w.passiveDesc||""}</span>`;
}
let _notifyT;
function showNotify(msg,rarity){
  const col=getRarityColor(rarity);
  notifyEl.innerHTML=(rarity?`<span style="color:${col}">[${rarity.toUpperCase()}]</span> `:``)+"<span>"+esc(msg)+"</span>";
  notifyEl.style.opacity="1"; notifyEl.style.transform="translateX(-50%) translateY(0)";
  clearTimeout(_notifyT);
  _notifyT=setTimeout(()=>{notifyEl.style.opacity="0";notifyEl.style.transform="translateX(-50%) translateY(8px)";},2600);
}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

function buildWeaponSlots(){
  const inv=(players[myId]?.inventory)||["pistol_common"];
  weaponSlots.innerHTML="";
  inv.slice(0,7).forEach((wKey,i)=>{
    const parts=wKey.split("_"),base=parts[0],rarity=parts.slice(1).join("_"),col=getRarityColor(rarity);
    const d=document.createElement("div");
    d.className="wslot"+(wKey===currentWeapon?" active":""); d.id="wslot-"+wKey;
    if(wKey===currentWeapon)d.style.borderColor=col;
    d.innerHTML=`<span class="wslot-key">${i+1}</span><span style="color:${col}">${base.replace(/_/g," ").toUpperCase()}</span><span class="wslot-rarity" style="color:${col}">${rarity.toUpperCase()}</span>`;
    d.addEventListener("click",()=>socket.emit("switchWeapon",wKey));
    weaponSlots.appendChild(d);
  });
}
function updateWeaponSlots(){
  document.querySelectorAll(".wslot").forEach(el=>{el.classList.remove("active");el.style.borderColor="";});
  const a=document.getElementById("wslot-"+currentWeapon);
  if(a){a.classList.add("active");a.style.borderColor=getRarityColor(currentWeapon.split("_").slice(1).join("_"));}
}

// ─── Shop ─────────────────────────────────────────────────────────────────────
function buildShopUI(){
  shopItemsEl.innerHTML="";
  shopListings.forEach(item=>{
    const col=item.rarity?getRarityColor(item.rarity):"#f1f5f9";
    const d=document.createElement("div"); d.className="shop-item"; d.style.setProperty("--c",col);
    d.innerHTML=`<div class="shop-item-name" style="color:${col}">${item.label}</div>${item.passiveDesc?`<div class="shop-item-passive">⚡ ${item.passiveDesc}</div>`:""}<div class="shop-item-cost"><span class="coin-icon">⬡</span>${item.cost}</div><button class="shop-buy-btn" style="border-color:${col};color:${col}" data-id="${item.id}">BUY</button>`;
    d.querySelector(".shop-buy-btn").addEventListener("click",()=>socket.emit("shopBuy",item.id));
    shopItemsEl.appendChild(d);
  });
}
window.toggleShop=function(){shopOpen=!shopOpen;shopEl.style.display=shopOpen?"flex":"none";if(shopOpen)socket.emit("getShop");};

// ─── Settings ─────────────────────────────────────────────────────────────────
// tab: key prefix tells buildSettingsUI which tab page to render it on
const SETTINGS_SCHEMA=[
  // ── Display ──────────────────────────────────────────────────────────────
  {tab:"display",key:"showFps",label:"Show FPS Counter",type:"toggle"},
  {tab:"display",key:"showPing",label:"Show Ping",type:"toggle"},
  {tab:"display",key:"gridStyle",label:"Grid Style",type:"select",options:["normal","subtle","off"]},
  {tab:"display",key:"renderScale",label:"Render Scale",type:"select",options:[0.5,0.75,1.0],labels:["50% (potato)","75% (balanced)","100% (native)"]},
  {tab:"display",key:"fpsLimit",label:"FPS Cap",type:"select",options:[0,30,60,120,144,240],labels:["Unlimited","30","60","120","144","240"]},
  {tab:"display",key:"showZoneWarning",label:"Zone Warning Overlay",type:"toggle"},
  {tab:"display",key:"bloodParticles",label:"Blood Particles",type:"toggle"},
  {tab:"display",key:"bulletTrails",label:"Bullet Trail Glow",type:"toggle"},
  {tab:"display",key:"rarityAuras",label:"Rarity Aura Effect",type:"toggle"},
  // ── HUD ──────────────────────────────────────────────────────────────────
  {tab:"hud",key:"hudScale",label:"HUD Scale",type:"range",min:0.7,max:1.4,step:0.05,fmt:v=>(v*100|0)+"%"},
  {tab:"hud",key:"minimapSize",label:"Minimap Size",type:"select",options:["hidden","small","medium","large","xlarge"],labels:["Hidden","Small 100px","Medium 160px","Large 210px","XL 260px"]},
  {tab:"hud",key:"minimapOpacity",label:"Minimap Opacity",type:"range",min:0.2,max:1.0,step:0.05,fmt:v=>(v*100|0)+"%"},
  {tab:"hud",key:"minimapZoom",label:"Minimap Zoom",type:"select",options:["full","near","medium"],labels:["Full map","Near (500m)","Medium (1500m)"]},
  {tab:"hud",key:"showNames",label:"Enemy Names",type:"toggle"},
  {tab:"hud",key:"showHealthBars",label:"Enemy Health Bars",type:"toggle"},
  {tab:"hud",key:"showShieldArcs",label:"Shield Arcs",type:"toggle"},
  {tab:"hud",key:"showDamageNums",label:"Damage Numbers",type:"toggle"},
  {tab:"hud",key:"showPassive",label:"Passive Indicator",type:"toggle"},
  {tab:"hud",key:"showKillFeed",label:"Kill Feed",type:"toggle"},
  {tab:"hud",key:"killFeedSize",label:"Kill Feed Size",type:"select",options:["small","medium","large"],labels:["Small","Medium","Large"]},
  // ── Crosshair ─────────────────────────────────────────────────────────────
  {tab:"crosshair",key:"crosshairStyle",label:"Style",type:"select",options:["dynamic","static","dot","cross","circle","none"]},
  {tab:"crosshair",key:"crosshairColor",label:"Color",type:"color"},
  {tab:"crosshair",key:"crosshairSize",label:"Size",type:"range",min:0.5,max:3.0,step:0.1,fmt:v=>v.toFixed(1)+"×"},
  {tab:"crosshair",key:"crosshairOpacity",label:"Opacity",type:"range",min:0.2,max:1.0,step:0.05,fmt:v=>(v*100|0)+"%"},
  {tab:"crosshair",key:"crosshairOutline",label:"Outline",type:"toggle"},
  {tab:"crosshair",key:"crosshairGap",label:"Gap Size",type:"range",min:0,max:12,step:1,fmt:v=>v+"px"},
  // ── Gameplay ──────────────────────────────────────────────────────────────
  {tab:"gameplay",key:"screenShake",label:"Screen Shake",type:"toggle"},
  {tab:"gameplay",key:"particleQuality",label:"Particle Quality",type:"select",options:["high","medium","low","off"]},
  {tab:"gameplay",key:"inputRate",label:"Input Rate (Hz)",type:"select",options:[20,30,45,64],labels:["20 Hz (weak)","30 Hz","45 Hz","64 Hz (smooth)"]},
  {tab:"gameplay",key:"colorblindMode",label:"Colorblind Mode",type:"select",options:["off","deuteranopia","protanopia","tritanopia"]},
  {tab:"gameplay",key:"autoReload",label:"Auto-Reload on Empty",type:"toggle"},
  {tab:"gameplay",key:"showHitIndicator",label:"Hit Flash on Crosshair",type:"toggle"},
  {tab:"gameplay",key:"cameraSmoothing",label:"Camera Smoothing",type:"range",min:0.05,max:1.0,step:0.05,fmt:v=>v===1?"Instant":(v*100|0)+"%"},
  // ── Audio ─────────────────────────────────────────────────────────────────
  {tab:"audio",key:"masterVolume",label:"Master Volume",type:"range",min:0,max:1.0,step:0.05,fmt:v=>v===0?"Off":(v*100|0)+"%"},
  {tab:"audio",key:"sfxVolume",label:"SFX Volume",type:"range",min:0,max:1.0,step:0.05,fmt:v=>(v*100|0)+"%"},
  {tab:"audio",key:"shootSfx",label:"Shoot Sounds",type:"toggle"},
  {tab:"audio",key:"hitSfx",label:"Hit Sounds",type:"toggle"},
  {tab:"audio",key:"killSfx",label:"Kill Sound",type:"toggle"},
  // ── Controls ──────────────────────────────────────────────────────────────
  {tab:"controls",key:"mouseSensitivity",label:"Mouse Sensitivity",type:"range",min:0.5,max:3.0,step:0.1,fmt:v=>v.toFixed(1)+"×"},
  {tab:"controls",key:"invertY",label:"Invert Y Axis",type:"toggle"},
  {tab:"controls",key:"scopeToggle",label:"Scope Mode",type:"select",options:["toggle","hold"],labels:["Toggle (RMB)","Hold (RMB)"]},
];

let _activeSettingsTab="display";
function buildSettingsUI(){
  const body=$("settings-body"); if(!body) return;
  body.innerHTML="";

  // Build one page per tab
  const tabs=["display","hud","crosshair","gameplay","audio","controls"];
  const pages={};
  for(const t of tabs){
    const pg=document.createElement("div"); pg.className="settings-page"+(t===_activeSettingsTab?" active":""); pg.dataset.tab=t;
    pages[t]=pg; body.appendChild(pg);
  }

  // Wire tab buttons
  document.querySelectorAll(".settings-tab").forEach(btn=>{
    btn.className="settings-tab"+(btn.dataset.tab===_activeSettingsTab?" active":"");
    btn.onclick=()=>{
      _activeSettingsTab=btn.dataset.tab;
      document.querySelectorAll(".settings-tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".settings-page").forEach(p=>{p.classList.toggle("active",p.dataset.tab===_activeSettingsTab);});
    };
  });

  for(const item of SETTINGS_SCHEMA){
    const page=pages[item.tab||"display"]; if(!page) continue;
    const row=document.createElement("div"); row.className="settings-row";
    const lbl=document.createElement("label"); lbl.className="settings-label"; lbl.textContent=item.label; row.appendChild(lbl);
    const ctrl=document.createElement("div"); ctrl.className="settings-ctrl";
    if(item.type==="toggle"){
      const btn=document.createElement("button");
      btn.className="settings-toggle"+(S[item.key]?" on":"");
      btn.textContent=S[item.key]?"ON":"OFF";
      btn.addEventListener("click",()=>{
        saveSetting(item.key,!S[item.key]);
        btn.className="settings-toggle"+(S[item.key]?" on":"");
        btn.textContent=S[item.key]?"ON":"OFF";
        applyFx(item.key);
      });
      ctrl.appendChild(btn);
    }else if(item.type==="select"){
      const sel=document.createElement("select"); sel.className="settings-select";
      (item.options||[]).forEach((opt,i)=>{
        const o=document.createElement("option"); o.value=opt;
        o.textContent=item.labels?item.labels[i]:String(opt);
        if(String(S[item.key])===String(opt)) o.selected=true;
        sel.appendChild(o);
      });
      sel.addEventListener("change",()=>{saveSetting(item.key,isNaN(sel.value)?sel.value:+sel.value);applyFx(item.key);});
      ctrl.appendChild(sel);
    }else if(item.type==="range"){
      const wrap=document.createElement("div"); wrap.className="settings-range-wrap";
      const inp=document.createElement("input"); inp.type="range"; inp.className="settings-range";
      inp.min=item.min; inp.max=item.max; inp.step=item.step; inp.value=S[item.key];
      const val=document.createElement("span"); val.className="settings-range-val"; val.textContent=item.fmt(+inp.value);
      inp.addEventListener("input",()=>{saveSetting(item.key,+inp.value);val.textContent=item.fmt(S[item.key]);applyFx(item.key);});
      wrap.appendChild(inp); wrap.appendChild(val); ctrl.appendChild(wrap);
    }else if(item.type==="color"){
      const inp=document.createElement("input"); inp.type="color"; inp.className="settings-color"; inp.value=S[item.key]||"#ffffff";
      inp.addEventListener("input",()=>saveSetting(item.key,inp.value)); ctrl.appendChild(inp);
    }
    row.appendChild(ctrl); page.appendChild(row);
  }

  // Reset button in gameplay tab
  const resetBtn=document.createElement("button"); resetBtn.className="settings-reset"; resetBtn.textContent="↺ Reset All to Defaults";
  resetBtn.addEventListener("click",()=>{
    Object.assign(S,DEFAULT_SETTINGS);
    try{localStorage.setItem("roi_settings",JSON.stringify(S));}catch{}
    buildSettingsUI(); applyAllSettings();
  });
  const resetRow=document.createElement("div"); resetRow.className="settings-row"; resetRow.style.marginTop="16px"; resetRow.appendChild(resetBtn);
  pages["gameplay"].appendChild(resetRow);
}

function applyFx(k){
  if(k==="renderScale")resizeCanvas();
  if(k==="hudScale")applyHudScale();
  if(k==="minimapSize"||k==="minimapOpacity")applyMinimapSize();
  if(k==="showFps"){if(fpsEl)fpsEl.style.display=S.showFps?"block":"none";}
  if(k==="showPing"){if(pingEl)pingEl.style.display=S.showPing?"block":"none";}
  if(k==="showPassive")updatePassiveHud();
  if(k==="showKillFeed"){if(killfeed)killfeed.style.display=S.showKillFeed?"flex":"none";}
}
function applyAllSettings(){
  resizeCanvas(); applyHudScale(); applyMinimapSize();
  if(fpsEl) fpsEl.style.display=S.showFps?"block":"none";
  if(pingEl) pingEl.style.display=S.showPing?"block":"none";
  if(killfeed) killfeed.style.display=S.showKillFeed?"flex":"none";
  updatePassiveHud();
}
function applyHudScale(){hudEl.style.fontSize=((S.hudScale||1)*100)+"%";}
function applyMinimapSize(){
  const sizes={hidden:0,small:110,medium:160,large:210,xlarge:260};
  const sz=sizes[S.minimapSize]??160;
  const wrap=$("minimap-wrap");
  if(!wrap) return;
  if(S.minimapSize==="hidden"){ wrap.style.display="none"; return; }
  wrap.style.display="flex";
  wrap.style.flexDirection="column"; // canvas THEN label — keeps map on screen
  wrap.style.bottom="16px";
  wrap.style.left="16px";
  if(sz!==mmCvs.width||sz!==mmCvs.height){ mmCvs.width=sz; mmCvs.height=sz; }
  mmCvs.style.width=sz+"px"; mmCvs.style.height=sz+"px";
  mmCvs.style.opacity=String(S.minimapOpacity??0.88);
}

window.toggleSettings=function(){settingsOpen=!settingsOpen;if(settingsOpen)buildSettingsUI();settingsEl.style.display=settingsOpen?"flex":"none";};

// ─── Input ────────────────────────────────────────────────────────────────────
document.addEventListener("keydown",e=>{
  keys[e.key.toLowerCase()]=true;
  if(!gameActive)return;
  if(e.key==="Tab"){e.preventDefault();lbEl.style.display="block";return;}
  if(e.key==="Escape"){lbEl.style.display="none";if(shopOpen)toggleShop();if(settingsOpen)toggleSettings();return;}
  if(e.key==="b"||e.key==="B"){toggleShop();return;}
  if(e.key==="p"||e.key==="P"){toggleSettings();return;}
  if(e.key==="r"||e.key==="R"){socket.emit("reload");return;}
  const numKeys={"1":0,"2":1,"3":2,"4":3,"5":4,"6":5,"7":6};
  if(e.key in numKeys){const me=players[myId];if(me?.inventory){const w=me.inventory[numKeys[e.key]];if(w)socket.emit("switchWeapon",w);}return;}
  if(e.key==="f"||e.key==="F"){const me=players[myId];if(!me)return;const n=crates.find(c=>!c.open&&Math.hypot(me.x-c.x,me.y-c.y)<80);if(n)socket.emit("openCrate",n.id);}
  if(e.key==="m"||e.key==="M"){
    const sizes=["hidden","small","medium","large","xlarge"];
    const idx=sizes.indexOf(S.minimapSize||"medium");
    saveSetting("minimapSize",sizes[(idx+1)%sizes.length]);
    applyMinimapSize();
  }
});
document.addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=false;if(e.key==="Tab")lbEl.style.display="none";});
canvas.addEventListener("mousemove",e=>{const sc=S.renderScale||1;mx=e.clientX*sc;my=e.clientY*sc;});
canvas.addEventListener("mousedown",e=>{if(!gameActive||!myId||e.button!==0)return;mouseHeld=true;doShoot();});
canvas.addEventListener("mouseup",()=>mouseHeld=false);
canvas.addEventListener("mouseleave",()=>mouseHeld=false);
canvas.addEventListener("contextmenu",e=>{e.preventDefault();if(S.scopeToggle==="toggle"){scoped=!scoped;}else{scoped=true;}});
canvas.addEventListener("mouseup",e=>{if(e.button===2&&S.scopeToggle==="hold")scoped=false;});

// ─── Shooting ─────────────────────────────────────────────────────────────────
function doShoot(){
  if(!myId||!players[myId])return;
  const now=Date.now(),w=weapons[currentWeapon];if(!w)return;
  if(now-lastFire<w.fireRate||reloading)return;
  if(currentAmmo===0){socket.emit("reload");return;}
  lastFire=now;
  const wMx=myPos.x+(mx-canvas.width/2),wMy=myPos.y+(my-canvas.height/2);
  const angle=Math.atan2(wMy-myPos.y,wMx-myPos.x);
  socket.emit("attack",{angle});
  spawnMuzzleFlash(myPos.x,myPos.y,angle,w);
  if(S.screenShake){const wb=w.baseName||"";shakeAmt=Math.min(shakeAmt+(wb==="rpg"?14:wb==="shotgun"?7:3),16);}
}

// ─── Particles ────────────────────────────────────────────────────────────────
const P_LIMITS={high:200,medium:80,low:30,off:0};
function spawnMuzzleFlash(x,y,angle,w){
  if(S.particleQuality==="off")return;
  const lim=P_LIMITS[S.particleQuality]||200;if(particles.length>=lim)return;
  const wb=w?.baseName||"",col=wb==="flamethrower"?"#f97316":wb==="plasma"?"#60a5fa":"#facc15";
  const n=S.particleQuality==="low"?2:S.particleQuality==="medium"?4:(wb==="shotgun"?10:5);
  for(let i=0;i<n;i++){const a=angle+(Math.random()-.5)*0.6;particles.push({x,y,vx:Math.cos(a)*(60+Math.random()*120),vy:Math.sin(a)*(60+Math.random()*120),life:1,decay:3+Math.random()*2,color:col,size:1.5+Math.random()*2});}
}

// ─── FIXED BUFFERING: decouple prediction from network rate ───────────────────
// Prediction runs every frame → butter-smooth.
// Network sends at inputRate Hz → no over-sending.
// Soft reconciliation on server snapshot → no hard snaps/stutter.

function sendInput(){
  if(!gameActive||!myId)return;
  const now=Date.now(),interval=1000/(S.inputRate||64);
  if(now-lastInputSent<interval)return;
  lastInputSent=now;
  let dx=0,dy=0;
  if(keys["w"]||keys["arrowup"])dy-=1;
  if(keys["s"]||keys["arrowdown"])dy+=1;
  if(keys["a"]||keys["arrowleft"])dx-=1;
  if(keys["d"]||keys["arrowright"])dx+=1;
  // Mobile joystick
  if(deviceType==="mobile"&&joystickActive){dx+=touchDx;dy+=touchDy;}
  const wMx=myPos.x+(mx-canvas.width/2),wMy=myPos.y+(my-canvas.height/2);
  myAngle=Math.atan2(wMy-myPos.y,wMx-myPos.x);
  if(dx!==0||dy!==0)socket.emit("input",{dx,dy,angle:myAngle});
  if(mouseHeld){const w=weapons[currentWeapon];if(w?.auto)doShoot();}
}

function applyPrediction(dt){
  if(!gameActive||!myId)return;
  let dx=0,dy=0;
  if(keys["w"]||keys["arrowup"])dy-=1;
  if(keys["s"]||keys["arrowdown"])dy+=1;
  if(keys["a"]||keys["arrowleft"])dx-=1;
  if(keys["d"]||keys["arrowright"])dx+=1;
  // Mobile joystick
  if(deviceType==="mobile"&&joystickActive){dx+=touchDx;dy+=touchDy;}
  if(dx!==0||dy!==0){
    const mag=Math.sqrt(dx*dx+dy*dy),w=weapons[currentWeapon];
    const spd=(w?.passive==="speed_boost")?BASE_SPEED*1.25:BASE_SPEED;
    myVel.x+=(dx/mag)*spd*dt*3.2; myVel.y+=(dy/mag)*spd*dt*3.2;
  }
  const spd=Math.sqrt(myVel.x*myVel.x+myVel.y*myVel.y);
  if(spd>BASE_SPEED*1.4){myVel.x*=BASE_SPEED*1.4/spd;myVel.y*=BASE_SPEED*1.4/spd;}
  myVel.x*=FRICTION; myVel.y*=FRICTION;
  myPos.x=Math.max(20,Math.min(mapSize-20,myPos.x+myVel.x*dt));
  myPos.y=Math.max(20,Math.min(mapSize-20,myPos.y+myVel.y*dt));
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function w2s(wx,wy){return{x:wx-camX+canvas.width/2,y:wy-camY+canvas.height/2};}
function rr(c,x,y,w,h,r){c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();}
const TILE=80;

function drawBackground(){
  ctx.fillStyle="#0f172a";ctx.fillRect(0,0,canvas.width,canvas.height);
  if(S.gridStyle!=="off"){
    const a=S.gridStyle==="subtle"?0.22:0.50;
    ctx.strokeStyle=`rgba(30,41,59,${a})`;ctx.lineWidth=0.5;
    const ox=((-camX%TILE)+canvas.width/2)%TILE,oy=((-camY%TILE)+canvas.height/2)%TILE;
    ctx.beginPath();
    for(let x=ox-TILE;x<canvas.width+TILE;x+=TILE){ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);}
    for(let y=oy-TILE;y<canvas.height+TILE;y+=TILE){ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);}
    ctx.stroke();
  }
  const c0=w2s(0,0),c1=w2s(mapSize,0),c2=w2s(mapSize,mapSize),c3=w2s(0,mapSize);
  ctx.strokeStyle="rgba(59,130,246,0.28)";ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(c0.x,c0.y);ctx.lineTo(c1.x,c1.y);ctx.lineTo(c2.x,c2.y);ctx.lineTo(c3.x,c3.y);ctx.closePath();ctx.stroke();
}

function drawZone(){
  const c=w2s(zone.cx,zone.cy),sr=zone.radius*(canvas.width/mapSize);
  ctx.save();
  ctx.beginPath();ctx.arc(c.x,c.y,sr,0,Math.PI*2);
  ctx.fillStyle="rgba(59,130,246,0.03)";ctx.fill();
  ctx.strokeStyle="rgba(59,130,246,0.5)";ctx.lineWidth=2;
  ctx.setLineDash([12,8]);ctx.lineDashOffset=-((Date.now()/40)%20);ctx.stroke();ctx.setLineDash([]);ctx.restore();
  if(!inZone){const vg=ctx.createRadialGradient(canvas.width/2,canvas.height/2,canvas.width*0.3,canvas.width/2,canvas.height/2,canvas.width*0.88);vg.addColorStop(0,"rgba(239,68,68,0)");vg.addColorStop(1,"rgba(239,68,68,0.28)");ctx.fillStyle=vg;ctx.fillRect(0,0,canvas.width,canvas.height);}
}

function drawObstacles(){
  ctx.fillStyle="#1e293b";ctx.strokeStyle="#334155";ctx.lineWidth=1.5;
  for(const o of obstacles){
    const s=w2s(o.x,o.y);
    if(s.x+o.w<0||s.x>canvas.width||s.y+o.h<0||s.y>canvas.height)continue;
    ctx.beginPath();rr(ctx,s.x,s.y,o.w,o.h,4);ctx.fill();ctx.stroke();
  }
}

function drawCrates(){
  const t=Date.now()/1000;
  const me=players[myId];
  for(const c of crates){
    if(c.open)continue;
    const s=w2s(c.x,c.y);if(s.x<-30||s.x>canvas.width+30||s.y<-30||s.y>canvas.height+30)continue;
    const col=getRarityColor(c.tier),bob=Math.sin(t*1.8+c.x*0.01)*3;
    ctx.save();ctx.strokeStyle=col;ctx.lineWidth=2;ctx.fillStyle="rgba(10,20,40,0.8)";
    ctx.beginPath();rr(ctx,s.x-13,s.y-13+bob,26,26,4);ctx.fill();ctx.stroke();
    ctx.globalAlpha=0.75;ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(s.x-6,s.y+bob);ctx.lineTo(s.x+6,s.y+bob);ctx.moveTo(s.x,s.y-6+bob);ctx.lineTo(s.x,s.y+6+bob);ctx.stroke();
    ctx.restore();
    ctx.fillStyle=col;ctx.font="bold 8px monospace";ctx.textAlign="center";ctx.fillText(c.tier.toUpperCase(),s.x,s.y-17+bob);
    if(me&&Math.hypot(me.x-c.x,me.y-c.y)<80){ctx.fillStyle="#fff";ctx.font="bold 9px monospace";ctx.fillText("[F] OPEN",s.x,s.y+27+bob);}
  }
}

function drawLoot(){
  const t=Date.now()/1000;ctx.font="bold 8px monospace";ctx.textAlign="center";
  for(const item of lootItems){
    const s=w2s(item.x,item.y);if(s.x<-20||s.x>canvas.width+20||s.y<-20||s.y>canvas.height+20)continue;
    const bob=Math.sin(t*2+item.x*0.01)*3,col=item.type==="weapon"?getRarityColor(item.rarity):item.type==="health"?"#22c55e":item.type==="shield"?"#3b82f6":"#facc15";
    ctx.fillStyle=col;ctx.beginPath();ctx.arc(s.x,s.y+bob,5,0,Math.PI*2);ctx.fill();
    ctx.fillText(item.type==="weapon"?item.value.split("_")[0].toUpperCase():item.type==="health"?"+HP":item.type==="shield"?"+SH":"$",s.x,s.y+bob-12);
    if(item.rarity&&item.type==="weapon"){ctx.font="6px monospace";ctx.fillText(item.rarity.toUpperCase(),s.x,s.y+bob-21);ctx.font="bold 8px monospace";}
  }
}

function drawBullets(){
  const groups={};
  for(const b of bullets){const wb=b.weapon||(b.weaponKey||"").split("_")[0]||"";const col=WEAPON_COLORS[wb]||"#fff";if(!groups[col])groups[col]=[];groups[col].push(b);}
  for(const[col,batch]of Object.entries(groups)){
    ctx.fillStyle=col;ctx.beginPath();
    for(const b of batch){const s=w2s(b.x,b.y);if(s.x<-10||s.x>canvas.width+10||s.y<-10||s.y>canvas.height+10)continue;const r=(b.weapon==="sniper"||b.weapon==="railgun")?5:b.weapon==="rpg"?6:3;ctx.moveTo(s.x+r,s.y);ctx.arc(s.x,s.y,r,0,Math.PI*2);}
    ctx.fill();
  }
}

function drawPlayers(){
  for(const[id,p]of Object.entries(players)){
    if(!p.alive)continue;
    const prev=prevPlayers[id],t=Math.min(lerpT,1);
    const rx=prev?prev.x+(p.x-prev.x)*t:p.x,ry=prev?prev.y+(p.y-prev.y)*t:p.y;
    const s=w2s(id===myId?myPos.x:rx,id===myId?myPos.y:ry);
    if(s.x<-40||s.x>canvas.width+40||s.y<-40||s.y>canvas.height+40)continue;
    const R=18,rarity=p.rarity||"common",rc=getRarityColor(rarity),ridx=(rarityOrder||[]).indexOf(rarity);
    if(ridx>=2){ctx.save();ctx.globalAlpha=0.14+Math.sin(Date.now()/350)*0.06;ctx.fillStyle=rc;ctx.beginPath();ctx.arc(s.x,s.y,R+9,0,Math.PI*2);ctx.fill();ctx.restore();}
    if(p.invincible){ctx.save();ctx.globalAlpha=0.28+Math.sin(Date.now()/80)*0.26;ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.beginPath();ctx.arc(s.x,s.y,R+5,0,Math.PI*2);ctx.stroke();ctx.restore();}
    ctx.fillStyle="rgba(0,0,0,0.25)";ctx.beginPath();ctx.ellipse(s.x,s.y+R-2,R*0.65,5,0,0,Math.PI*2);ctx.fill();
    const skin=gameMode==="team"?(p.team==="red"?"#ef4444":"#3b82f6"):p.skin;
    ctx.fillStyle=skin;ctx.strokeStyle=id===myId?rc:"rgba(255,255,255,0.22)";ctx.lineWidth=id===myId?2.5:1;
    ctx.beginPath();ctx.arc(s.x,s.y,R,0,Math.PI*2);ctx.fill();ctx.stroke();
    const angle=id===myId?myAngle:(p.angle||0),wb=(p.weapon||"").split("_")[0];
    ctx.strokeStyle=WEAPON_COLORS[wb]||"#fff";ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x+Math.cos(angle)*28,s.y+Math.sin(angle)*28);ctx.stroke();
    if(S.showHealthBars){const bw=36,bh=4,bx=s.x-bw/2,by=s.y-R-10,hp=p.hp/p.maxHp;ctx.fillStyle="rgba(0,0,0,0.52)";ctx.beginPath();rr(ctx,bx,by,bw,bh,2);ctx.fill();ctx.fillStyle=hp>0.5?"#22c55e":hp>0.25?"#facc15":"#ef4444";ctx.beginPath();rr(ctx,bx,by,bw*hp,bh,2);ctx.fill();}
    if(S.showShieldArcs&&p.shield>0){ctx.strokeStyle="rgba(59,130,246,0.72)";ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(s.x,s.y,R+4,-Math.PI/2,-Math.PI/2+(p.shield/p.maxShield)*Math.PI*2);ctx.stroke();}
    if(S.showNames){ctx.font="bold 10px monospace";ctx.textAlign="center";const lbl=p.name+(gameMode==="team"?` [${(p.team||"").toUpperCase()}]`:"");if(!p._lbl||p._lbl!==lbl){p._lbl=lbl;p._lblW=ctx.measureText(lbl).width;}ctx.fillStyle="rgba(0,0,0,0.48)";ctx.fillRect(s.x-p._lblW/2-3,s.y-R-22,p._lblW+6,13);ctx.fillStyle=id===myId?rc:"#cbd5e1";ctx.fillText(lbl,s.x,s.y-R-12);}
  }
}

function drawParticles(dt){
  if(S.particleQuality==="off")return;
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=0.91;p.vy*=0.91;p.life-=p.decay*dt;}
  particles=particles.filter(p=>p.life>0);
  const B={};
  for(const p of particles){const a=Math.max(0,p.life).toFixed(1),k=p.color+"|"+a;if(!B[k])B[k]={color:p.color,alpha:+a,pts:[]};B[k].pts.push(p);}
  for(const b of Object.values(B)){ctx.globalAlpha=b.alpha;ctx.fillStyle=b.color;ctx.beginPath();for(const p of b.pts){const s=w2s(p.x,p.y);const r=Math.max(0.1,p.size*p.life);ctx.moveTo(s.x+r,s.y);ctx.arc(s.x,s.y,r,0,Math.PI*2);}ctx.fill();}
  ctx.globalAlpha=1;
}

function drawDamageNums(dt){
  if(!S.showDamageNums){damageNums=[];return;}
  for(const d of damageNums){d.y+=d.vy*dt;d.vy*=0.94;d.life-=d.decay*dt;}
  damageNums=damageNums.filter(d=>d.life>0);
  ctx.textAlign="center";
  for(const d of damageNums){const s=w2s(d.x,d.y);ctx.font=d.crit?"bold 16px monospace":"bold 13px monospace";ctx.fillStyle=d.crit?"#f43f5e":"#facc15";ctx.globalAlpha=Math.min(1,d.life*1.5);ctx.fillText((d.crit?"★ ":"")+d.amount,s.x,s.y);}
  ctx.globalAlpha=1;
}

function drawCrosshair(){
  if(S.crosshairStyle==="none"||scoped)return;
  const hitCol="#ef4444", isHit=(S.showHitIndicator&&hitFlash>0);
  const rawCol=S.crosshairColor||"#ffffff";
  const alpha=S.crosshairOpacity||1;
  // Parse hex to rgba
  const r=parseInt(rawCol.slice(1,3),16),gr=parseInt(rawCol.slice(3,5),16),b2=parseInt(rawCol.slice(5,7),16);
  const col=isHit?hitCol:`rgba(${r},${gr},${b2},${alpha})`;
  const size=S.crosshairSize||1;
  const gap=(S.crosshairGap??4)*size;
  const w=weapons[currentWeapon];
  ctx.save();
  ctx.lineWidth=isHit?2:1.5;

  // Outline helper
  function withOutline(fn){
    if(S.crosshairOutline){ctx.strokeStyle="rgba(0,0,0,0.6)";ctx.lineWidth=(isHit?2:1.5)+2;fn();ctx.lineWidth=isHit?2:1.5;}
    ctx.strokeStyle=col; fn();
  }

  if(S.crosshairStyle==="dot"){
    if(S.crosshairOutline){ctx.fillStyle="rgba(0,0,0,0.6)";ctx.beginPath();ctx.arc(mx,my,4*size,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=col;ctx.beginPath();ctx.arc(mx,my,3*size,0,Math.PI*2);ctx.fill();
  }else if(S.crosshairStyle==="circle"){
    withOutline(()=>{ctx.beginPath();ctx.arc(mx,my,10*size,0,Math.PI*2);ctx.stroke();});
  }else if(S.crosshairStyle==="cross"){
    // Classic full-length cross with no gap
    withOutline(()=>{ctx.beginPath();ctx.moveTo(mx-14*size,my);ctx.lineTo(mx+14*size,my);ctx.moveTo(mx,my-14*size);ctx.lineTo(mx,my+14*size);ctx.stroke();});
  }else{
    // dynamic or static — standard 4-line spread crosshair
    const spread=S.crosshairStyle==="dynamic"&&w?Math.max(5,(w.spread||0.05)*70*size):8*size;
    withOutline(()=>{
      ctx.beginPath();
      ctx.moveTo(mx-spread-gap,my);ctx.lineTo(mx-gap,my);
      ctx.moveTo(mx+gap,my);ctx.lineTo(mx+spread+gap,my);
      ctx.moveTo(mx,my-spread-gap);ctx.lineTo(mx,my-gap);
      ctx.moveTo(mx,my+gap);ctx.lineTo(mx,my+spread+gap);
      ctx.stroke();
    });
    // Centre dot
    if(S.crosshairOutline){ctx.fillStyle="rgba(0,0,0,0.5)";ctx.beginPath();ctx.arc(mx,my,2.5*size,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=col;ctx.beginPath();ctx.arc(mx,my,1.5*size,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

function drawScope(){
  if(!scoped)return;const w=weapons[currentWeapon];if(!w||w.passive!=="fov_boost")return;
  ctx.fillStyle="rgba(0,0,0,0.82)";ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);ctx.arc(mx,my,170,0,Math.PI*2,true);ctx.fill();
  ctx.strokeStyle="#475569";ctx.lineWidth=2;ctx.beginPath();ctx.arc(mx,my,170,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,0.2)";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(mx-170,my);ctx.lineTo(mx+170,my);ctx.stroke();
  ctx.beginPath();ctx.moveTo(mx,my-170);ctx.lineTo(mx,my+170);ctx.stroke();
  ctx.fillStyle="rgba(255,255,255,0.4)";ctx.beginPath();ctx.arc(mx,my,2,0,Math.PI*2);ctx.fill();
}

// ─── Minimap (bottom-left, throttled to ~20 fps) ─────────────────────────────
function drawMinimap(){
  if(S.minimapSize==="hidden")return;
  _mmFrame++;if(_mmFrame%3!==0)return; // ~20fps, saves perf
  const W=mmCvs.width,H=mmCvs.height;
  if(W===0||H===0)return;

  // Zoom: full=entire map, medium=1500 radius, near=500 radius around player
  const zoomRadii={full:mapSize/2,medium:1500,near:500};
  const viewR=zoomRadii[S.minimapZoom||"full"]||mapSize/2;
  const scale=W/(viewR*2); // pixels per world unit
  // Offset so player is centred in zoom modes
  const me=players[myId];
  const cx=(S.minimapZoom==="full")?mapSize/2:(me?me.x:mapSize/2);
  const cy=(S.minimapZoom==="full")?mapSize/2:(me?me.y:mapSize/2);
  const ox=cx-viewR, oy=cy-viewR; // world top-left of view

  function tx(wx){return(wx-ox)*scale;}
  function ty(wy){return(wy-oy)*scale;}

  mctx.clearRect(0,0,W,H);
  mctx.fillStyle="rgba(8,14,28,0.92)";mctx.fillRect(0,0,W,H);

  // Zone circle
  mctx.strokeStyle="rgba(59,130,246,0.6)";mctx.lineWidth=1.5;
  mctx.beginPath();mctx.arc(tx(zone.cx),ty(zone.cy),zone.radius*scale,0,Math.PI*2);mctx.stroke();

  // Obstacles
  mctx.fillStyle="#1e3355";
  for(const o of obstacles){
    const sx=tx(o.x),sy=ty(o.y),sw=Math.max(1,o.w*scale),sh=Math.max(1,o.h*scale);
    if(sx+sw<0||sx>W||sy+sh<0||sy>H)continue;
    mctx.fillRect(sx,sy,sw,sh);
  }

  // Crates
  for(const c of crates){
    if(c.open)continue;
    const sx=tx(c.x),sy=ty(c.y);
    if(sx<-4||sx>W+4||sy<-4||sy>H+4)continue;
    mctx.fillStyle=getRarityColor(c.tier);
    mctx.fillRect(sx-2,sy-2,4,4);
  }

  // Loot
  for(const l of lootItems){
    const sx=tx(l.x),sy=ty(l.y);
    if(sx<-2||sx>W+2||sy<-2||sy>H+2)continue;
    mctx.fillStyle=l.type==="weapon"?getRarityColor(l.rarity):"#22c55e";
    mctx.fillRect(sx-1,sy-1,2,2);
  }

  // Bullets (skip on low quality)
  if(S.particleQuality!=="low"&&S.particleQuality!=="off"){
    mctx.fillStyle="rgba(250,204,21,0.6)";
    for(const b of bullets){mctx.fillRect(tx(b.x)-1,ty(b.y)-1,2,2);}
  }

  // Players
  for(const[id,p]of Object.entries(players)){
    if(!p.alive)continue;
    const px=tx(id===myId?myPos.x:p.x),py=ty(id===myId?myPos.y:p.y);
    if(px<-6||px>W+6||py<-6||py>H+6)continue;
    const col=id===myId?"#fff":gameMode==="team"?(p.team==="red"?"#ef4444":"#3b82f6"):p.skin;
    mctx.fillStyle=col;
    // Ping me with a triangle pointer for better visibility
    if(id===myId){
      mctx.save();mctx.translate(px,py);mctx.rotate(myAngle);
      mctx.fillStyle="#fff";mctx.beginPath();mctx.moveTo(5,0);mctx.lineTo(-3,-3);mctx.lineTo(-3,3);mctx.closePath();mctx.fill();
      mctx.restore();
    }else{
      mctx.beginPath();mctx.arc(px,py,2.5,0,Math.PI*2);mctx.fill();
    }
  }

  // FOV lines from player
  if(myId&&players[myId]){
    const px=tx(myPos.x),py=ty(myPos.y);
    mctx.strokeStyle="rgba(255,255,255,0.18)";mctx.lineWidth=0.8;
    const fH=Math.PI/3.8,fL=W*0.10;
    mctx.beginPath();mctx.moveTo(px,py);mctx.lineTo(px+Math.cos(myAngle-fH)*fL,py+Math.sin(myAngle-fH)*fL);
    mctx.moveTo(px,py);mctx.lineTo(px+Math.cos(myAngle+fH)*fL,py+Math.sin(myAngle+fH)*fL);
    mctx.stroke();
  }

  // Compass rose (tiny, top-right of minimap)
  const cr=W-14,cc=14;
  mctx.font="bold 8px monospace";mctx.textAlign="center";mctx.fillStyle="rgba(255,255,255,0.5)";
  mctx.fillText("N",cr,cc-5);mctx.fillText("S",cr,cc+13);
  mctx.fillStyle="rgba(255,255,255,0.25)";
  mctx.fillText("W",cr-9,cc+4);mctx.fillText("E",cr+9,cc+4);

  // Border
  mctx.strokeStyle="rgba(255,255,255,0.12)";mctx.lineWidth=1;mctx.strokeRect(0,0,W,H);
}

function updateReload(){
  if(!reloading)return;
  const pct=Math.min(1,(performance.now()-reloadStart)/reloadDuration);
  reloadFill.style.width=(pct*100)+"%";
  if(pct>=1){reloading=false;reloadWrap.style.display="none";buildWeaponSlots();}
}

// ─── Main loop ────────────────────────────────────────────────────────────────
let _lastFpsCap=performance.now();

function loop(now){
  _rafId=requestAnimationFrame(loop);
  const dt=Math.min((now-lastFrame)/1000,0.1);lastFrame=now;
  if(S.fpsLimit>0&&now-_lastFpsCap<1000/S.fpsLimit-1)return;
  _lastFpsCap=now;

  // FPS
  fpsN++;fpsAcc+=dt;
  if(fpsAcc>=0.5){fps=Math.round(fpsN/fpsAcc);fpsN=0;fpsAcc=0;if(S.showFps)fpsEl.textContent=fps+" fps";if(S.showPing)pingEl.textContent=ping+" ms";}

  sendInput();
  applyPrediction(dt);
  updateReload();
  lerpT=Math.min(1,(now-lastStateAt)/LERP_DUR);

  // Camera — speed controlled by cameraSmoothing setting
  const camSpd=S.cameraSmoothing||0.12;
  const camFactor=Math.min(1,camSpd*60*dt); // frame-rate independent
  camX+=(myPos.x-camX)*camFactor;
  camY+=(myPos.y-camY)*camFactor;
  if(scoped&&weapons[currentWeapon]?.passive==="fov_boost"){
    const wMx=camX+(mx-canvas.width/2)*0.45,wMy=camY+(my-canvas.height/2)*0.45;
    camX+=(wMx-camX)*0.1;camY+=(wMy-camY)*0.1;
  }

  // Shake (computed once)
  let sx=0,sy=0;
  if(S.screenShake&&shakeAmt>0.1){sx=(Math.random()-.5)*shakeAmt;sy=(Math.random()-.5)*shakeAmt;shakeAmt*=0.80;}

  ctx.save();ctx.translate(sx,sy);
  drawBackground();
  if(gameActive){drawZone();drawObstacles();drawCrates();drawLoot();drawBullets();drawParticles(dt);drawPlayers();drawDamageNums(dt);}
  drawScope();drawCrosshair();
  ctx.restore();
  if(gameActive)drawMinimap();
  if(hitFlash>0)hitFlash-=dt*3;

  const me=players[myId];
  if(me?.inventory){const k=me.inventory.join(",");if(k!==_lastInvKey){_lastInvKey=k;buildWeaponSlots();updatePassiveHud();}}
}


// ─── Mobile touch controls ────────────────────────────────────────────────────
let joystickActive=false, joystickId=-1;
let joystickOriginX=0, joystickOriginY=0;
let touchDx=0, touchDy=0;
let aimTouchId=-1, aimLastX=0, aimLastY=0;
let mobileShooting=false, mobileShootInterval=null;

function initMobileControls(){
  const mc=document.getElementById("mobile-controls");
  const ab=document.getElementById("action-btns");
  if(!mc) return;

  if(deviceType!=="mobile"){
    mc.style.display="none";
    if(ab) ab.style.display="flex";
    canvas.style.cursor="crosshair";
    return;
  }

  mc.style.display="block";
  if(ab) ab.style.display="none"; // mobile has its own
  canvas.style.cursor="none"; // no cursor on mobile

  const jZone=document.getElementById("joystick-zone");
  const jThumb=document.getElementById("joystick-thumb");
  const aimZone=document.getElementById("aim-zone");
  const fireBtn=document.getElementById("fire-btn");
  const reloadBtn=document.getElementById("reload-btn");
  const scopeBtn=document.getElementById("mob-scope-btn");
  const weapPrev=document.getElementById("mob-weap-prev");
  const weapNext=document.getElementById("mob-weap-next");

  // ── Joystick ──────────────────────────────────────────────────────────────
  function jStart(e){
    e.preventDefault();
    const t=e.changedTouches[0];
    joystickActive=true; joystickId=t.identifier;
    joystickOriginX=t.clientX; joystickOriginY=t.clientY;
    touchDx=0; touchDy=0;
  }
  function jMove(e){
    e.preventDefault();
    for(let i=0;i<e.changedTouches.length;i++){
      const t=e.changedTouches[i];
      if(t.identifier!==joystickId) continue;
      const dx=t.clientX-joystickOriginX, dy=t.clientY-joystickOriginY;
      const len=Math.sqrt(dx*dx+dy*dy)||1;
      const clamped=Math.min(len,55);
      touchDx=(dx/len)*(clamped/55);
      touchDy=(dy/len)*(clamped/55);
      // Move thumb visual
      const tx=touchDx*55, ty=touchDy*55;
      if(jThumb){ jThumb.style.transform=`translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)`; }
    }
  }
  function jEnd(e){
    for(let i=0;i<e.changedTouches.length;i++){
      if(e.changedTouches[i].identifier===joystickId){
        joystickActive=false; joystickId=-1; touchDx=0; touchDy=0;
        if(jThumb) jThumb.style.transform="translate(-50%,-50%)";
      }
    }
  }
  if(jZone){ jZone.addEventListener("touchstart",jStart,{passive:false}); jZone.addEventListener("touchmove",jMove,{passive:false}); jZone.addEventListener("touchend",jEnd,{passive:false}); jZone.addEventListener("touchcancel",jEnd,{passive:false}); }

  // ── Aim zone (pan to aim) ─────────────────────────────────────────────────
  function aimStart(e){
    e.preventDefault();
    for(let i=0;i<e.changedTouches.length;i++){
      const t=e.changedTouches[i];
      if(aimTouchId===-1&&t.clientX>window.innerWidth*0.4){
        aimTouchId=t.identifier; aimLastX=t.clientX; aimLastY=t.clientY;
      }
    }
  }
  function aimMove(e){
    e.preventDefault();
    for(let i=0;i<e.changedTouches.length;i++){
      const t=e.changedTouches[i];
      if(t.identifier!==aimTouchId) continue;
      const sens=(S.mouseSensitivity||1)*1.8;
      mx+=( t.clientX-aimLastX)*sens;
      my+=( t.clientY-aimLastY)*sens;
      mx=Math.max(0,Math.min(canvas.width,mx));
      my=Math.max(0,Math.min(canvas.height,my));
      aimLastX=t.clientX; aimLastY=t.clientY;
    }
  }
  function aimEnd(e){
    for(let i=0;i<e.changedTouches.length;i++){
      if(e.changedTouches[i].identifier===aimTouchId) aimTouchId=-1;
    }
  }
  if(aimZone){ aimZone.addEventListener("touchstart",aimStart,{passive:false}); aimZone.addEventListener("touchmove",aimMove,{passive:false}); aimZone.addEventListener("touchend",aimEnd,{passive:false}); aimZone.addEventListener("touchcancel",aimEnd,{passive:false}); }

  // ── Fire button ───────────────────────────────────────────────────────────
  if(fireBtn){
    fireBtn.addEventListener("touchstart",e=>{
      e.preventDefault(); fireBtn.classList.add("active");
      doShoot();
      mobileShootInterval=setInterval(()=>{ const w=weapons[currentWeapon]; if(w?.auto) doShoot(); },50);
    });
    fireBtn.addEventListener("touchend",e=>{ e.preventDefault(); fireBtn.classList.remove("active"); clearInterval(mobileShootInterval); });
    fireBtn.addEventListener("touchcancel",e=>{ fireBtn.classList.remove("active"); clearInterval(mobileShootInterval); });
  }

  // ── Reload ────────────────────────────────────────────────────────────────
  if(reloadBtn) reloadBtn.addEventListener("touchstart",e=>{ e.preventDefault(); socket.emit("reload"); });

  // ── Scope toggle ──────────────────────────────────────────────────────────
  if(scopeBtn) scopeBtn.addEventListener("touchstart",e=>{ e.preventDefault(); scoped=!scoped; });

  // ── Weapon cycle ──────────────────────────────────────────────────────────
  if(weapPrev) weapPrev.addEventListener("touchstart",e=>{
    e.preventDefault();
    const me=players[myId]; if(!me?.inventory) return;
    const idx=me.inventory.indexOf(currentWeapon);
    const newW=me.inventory[(idx-1+me.inventory.length)%me.inventory.length];
    socket.emit("switchWeapon",newW);
  });
  if(weapNext) weapNext.addEventListener("touchstart",e=>{
    e.preventDefault();
    const me=players[myId]; if(!me?.inventory) return;
    const idx=me.inventory.indexOf(currentWeapon);
    const newW=me.inventory[(idx+1)%me.inventory.length];
    socket.emit("switchWeapon",newW);
  });
}

applyAllSettings();
_rafId=requestAnimationFrame(loop);
