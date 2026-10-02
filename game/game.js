/* ===================================================================
   Macro Ledger — the collecting game.
   Species, base stats, movesets and the type chart are real data pulled
   from PokeAPI at build time (game/dex.json); nothing here is invented.
   Sprites are fetched one at a time, only when something is shown.
   =================================================================== */
(function(){
"use strict";
var LS="ml.game", DEXP="game/dex.json", SPR="dex/";
var DEX=null, G=null;

/* ---------- state ---------- */
function blank(){
  return {v:1, started:false, player:{lvl:1,xp:0},
    party:[], box:[], items:{pokeball:5,potion:2},
    seen:{}, caught:{}, nextUid:1,
    day:null, streak:0, mult:1,
    spent:{},            /* encounter tokens already used: "2026-09-07|Lunch" */
    goalsHit:{},         /* per day: which macro goals paid out */
    missions:[], week:null, theme:"modern", enc:null, log:[]
  };
}
function load(){
  try{ var v=JSON.parse(localStorage.getItem(LS));
       if(v&&typeof v==="object") return Object.assign(blank(),v); }catch(e){}
  return blank();
}
function save(){ try{ localStorage.setItem(LS,JSON.stringify(G)) }catch(e){} }

/* ---------- dex ---------- */
function dex(){
  if(DEX) return Promise.resolve(DEX);
  return fetch(DEXP).then(function(r){return r.json()}).then(function(d){DEX=d;return d});
}
var NAMES=null;
function names(){ return NAMES||(NAMES=Object.keys(DEX.mon)); }
function pretty(s){
  return s.split("-").map(function(w){return w.charAt(0).toUpperCase()+w.slice(1)}).join(" ");
}
function sprite(s){ return SPR+s+".webp"; }

/* ---------- a pokemon ---------- */
/* Level scaling on the real base stats. Not the games' exact formula, but the
   same shape: hp grows faster than the rest, and level matters most. */
function statAt(base, lvl, isHp){
  return isHp ? Math.floor(base*2*lvl/100)+lvl+10
              : Math.floor(base*2*lvl/100)+5;
}
function makeMon(species, lvl, forceShiny){
  var d=DEX.mon[species];
  var shiny = forceShiny!==undefined ? !!forceShiny : Math.random()<1/280;
  var m={u:G.nextUid++, s:species, nick:"", lvl:lvl, xp:0, shiny:shiny,
         moves:d.m.slice(0,4)};
  m.max=statAt(d.s[0],lvl,true); m.hp=m.max;
  return m;
}
function statsOf(m){
  var b=DEX.mon[m.s].s;
  return {hp:statAt(b[0],m.lvl,true), atk:statAt(b[1],m.lvl), def:statAt(b[2],m.lvl),
          spa:statAt(b[3],m.lvl), spd:statAt(b[4],m.lvl), spe:statAt(b[5],m.lvl)};
}
function nameOf(m){ return m.nick || pretty(m.s); }
function xpNeed(lvl){ return Math.round(14*Math.pow(lvl,1.45)); }

/* ---------- damage ---------- */
function eff(moveType, defTypes){
  var e=1, tc=DEX.tc[moveType]||{};
  for(var i=0;i<defTypes.length;i++){
    var v=tc[defTypes[i]]; e *= (v===undefined?1:v);
  }
  return e;
}
function damage(att, def, moveName){
  var mv=DEX.mv[moveName]; if(!mv) return {dmg:0,e:1,miss:true};
  var mtype=mv[0], power=mv[1], cls=mv[2], acc=mv[3];
  if(Math.random()*100 > acc) return {dmg:0,e:1,miss:true};
  var A=statsOf(att), D=statsOf(def);
  var a = cls==="p" ? A.atk : A.spa;
  var d = cls==="p" ? D.def : D.spd;
  var base = ((2*att.lvl/5+2)*power*a/Math.max(1,d))/50 + 2;
  var e = eff(mtype, DEX.mon[def.s].t);
  var stab = DEX.mon[att.s].t.indexOf(mtype)>=0 ? 1.5 : 1;
  var roll = 0.85 + Math.random()*0.15;
  var crit = Math.random()<0.0625 ? 1.5 : 1;
  return {dmg: Math.max(e>0?1:0, Math.round(base*e*stab*roll*crit)), e:e, crit:crit>1, miss:false,
          type:mtype};
}
function moveLabel(n){ return pretty(n); }

/* ---------- xp for a pokemon ---------- */
function giveMonXp(m, amount){
  if(!m) return null;
  m.xp += Math.round(amount);
  var ups=0;
  while(m.lvl<100 && m.xp>=xpNeed(m.lvl)){
    m.xp-=xpNeed(m.lvl); m.lvl++; ups++;
    var was=m.max; m.max=statAt(DEX.mon[m.s].s[0],m.lvl,true);
    m.hp=Math.min(m.max, m.hp + (m.max-was));
  }
  return ups;
}
function party(){ return G.party.map(byUid).filter(Boolean); }
function byUid(u){ for(var i=0;i<G.box.length;i++) if(G.box[i].u===u) return G.box[i]; return null; }
function firstHealthy(){ var p=party(); for(var i=0;i<p.length;i++) if(p[i].hp>0) return p[i]; return null; }

/* ---------- items ---------- */
var ITEMS={
  pokeball:{n:"Poke Ball", rate:1.0, kind:"ball"},
  greatball:{n:"Great Ball", rate:1.5, kind:"ball"},
  ultraball:{n:"Ultra Ball", rate:2.0, kind:"ball"},
  masterball:{n:"Master Ball", rate:255, kind:"ball"},
  potion:{n:"Potion", heal:20, kind:"heal"},
  superpotion:{n:"Super Potion", heal:60, kind:"heal"},
  revive:{n:"Revive", kind:"revive"},
  rarecandy:{n:"Rare Candy", kind:"candy"},
  xpshare:{n:"XP Share", kind:"misc"}
};
function give(item,n){ G.items[item]=(G.items[item]||0)+(n||1); }
/* give AND tell: every item the player earns gets a proper popup with an OK
   button, queued until nothing else is on screen */
var itemQ=[], itemT=null;
function award(item,n,why){
  give(item,n);
  itemQ.push({item:item,n:n||1,why:why||""});
  clearTimeout(itemT); itemT=setTimeout(flushItems,250);
}
var ICON={
  pokeball:'<circle cx="24" cy="24" r="20" fill="#fff" stroke="#1a1a1a" stroke-width="3"/>'+
    '<path d="M4 24a20 20 0 0 1 40 0z" fill="#E3262E" stroke="#1a1a1a" stroke-width="3"/>'+
    '<rect x="4" y="22" width="40" height="4" fill="#1a1a1a"/><circle cx="24" cy="24" r="6" fill="#fff" stroke="#1a1a1a" stroke-width="3"/>',
  greatball:'<circle cx="24" cy="24" r="20" fill="#fff" stroke="#1a1a1a" stroke-width="3"/>'+
    '<path d="M4 24a20 20 0 0 1 40 0z" fill="#2F6FD6" stroke="#1a1a1a" stroke-width="3"/>'+
    '<path d="M11 11l7 9M37 11l-7 9" stroke="#E3262E" stroke-width="5" stroke-linecap="round"/>'+
    '<rect x="4" y="22" width="40" height="4" fill="#1a1a1a"/><circle cx="24" cy="24" r="6" fill="#fff" stroke="#1a1a1a" stroke-width="3"/>',
  ultraball:'<circle cx="24" cy="24" r="20" fill="#fff" stroke="#1a1a1a" stroke-width="3"/>'+
    '<path d="M4 24a20 20 0 0 1 40 0z" fill="#2B2B2B" stroke="#1a1a1a" stroke-width="3"/>'+
    '<path d="M13 9v12M35 9v12" stroke="#F2C230" stroke-width="5" stroke-linecap="round"/>'+
    '<rect x="4" y="22" width="40" height="4" fill="#1a1a1a"/><circle cx="24" cy="24" r="6" fill="#fff" stroke="#1a1a1a" stroke-width="3"/>',
  masterball:'<circle cx="24" cy="24" r="20" fill="#fff" stroke="#1a1a1a" stroke-width="3"/>'+
    '<path d="M4 24a20 20 0 0 1 40 0z" fill="#7B3FB8" stroke="#1a1a1a" stroke-width="3"/>'+
    '<circle cx="12" cy="15" r="4" fill="#E86AB0"/><circle cx="36" cy="15" r="4" fill="#E86AB0"/>'+
    '<path d="M19 18v-8l5 5 5-5v8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>'+
    '<rect x="4" y="22" width="40" height="4" fill="#1a1a1a"/><circle cx="24" cy="24" r="6" fill="#fff" stroke="#1a1a1a" stroke-width="3"/>',
  potion:'<rect x="19" y="4" width="10" height="6" rx="1" fill="#9AA3AD" stroke="#1a1a1a" stroke-width="2.5"/>'+
    '<path d="M14 12h20l-2 6v20a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6V18z" fill="#A65BD6" stroke="#1a1a1a" stroke-width="2.5"/>'+
    '<rect x="18" y="22" width="12" height="12" rx="2" fill="#fff" opacity=".85"/><path d="M24 24v8M20 28h8" stroke="#A65BD6" stroke-width="2.5"/>',
  superpotion:'<rect x="19" y="4" width="10" height="6" rx="1" fill="#9AA3AD" stroke="#1a1a1a" stroke-width="2.5"/>'+
    '<path d="M14 12h20l-2 6v20a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6V18z" fill="#F08A24" stroke="#1a1a1a" stroke-width="2.5"/>'+
    '<rect x="18" y="22" width="12" height="12" rx="2" fill="#fff" opacity=".85"/><path d="M24 24v8M20 28h8" stroke="#E3262E" stroke-width="2.5"/>',
  revive:'<path d="M24 4l14 20-14 20-14-20z" fill="#F7D33C" stroke="#1a1a1a" stroke-width="2.5" stroke-linejoin="round"/>'+
    '<path d="M24 11l8 13-8 13-8-13z" fill="#FFF3A8"/><path d="M10 24h28" stroke="#1a1a1a" stroke-width="1.5" opacity=".4"/>',
  rarecandy:'<path d="M6 16l9 8-9 8zM42 16l-9 8 9 8z" fill="#5AA9F0" stroke="#1a1a1a" stroke-width="2.5" stroke-linejoin="round"/>'+
    '<ellipse cx="24" cy="24" rx="11" ry="9" fill="#3E7FD6" stroke="#1a1a1a" stroke-width="2.5"/>'+
    '<path d="M18 20q6 8 12 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>',
  xpshare:'<rect x="9" y="8" width="30" height="32" rx="5" fill="#C9CFD6" stroke="#1a1a1a" stroke-width="2.5"/>'+
    '<rect x="14" y="13" width="20" height="10" rx="2" fill="#4FC1A2" stroke="#1a1a1a" stroke-width="2"/>'+
    '<path d="M15 30h18M15 35h12" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>'
};
function itemIcon(k,size){
  return '<svg class="gicon" viewBox="0 0 48 48" width="'+(size||28)+'" height="'+(size||28)+'" aria-hidden="true">'+
    (ICON[k]||ICON.pokeball)+"</svg>";
}
function take(item,n){ G.items[item]=Math.max(0,(G.items[item]||0)-(n||1)); }
function has(item){ return (G.items[item]||0)>0; }

/* prize tables, weighted. The masterball only ever comes from a century level. */
var COMMON=[["pokeball",6],["potion",4],["pokeball",6],["greatball",2],["revive",1],["rarecandy",1]];
var GOOD  =[["greatball",5],["superpotion",4],["ultraball",2],["rarecandy",3],["revive",2]];
function roll(table){
  var t=0,i; for(i=0;i<table.length;i++) t+=table[i][1];
  var r=Math.random()*t;
  for(i=0;i<table.length;i++){ r-=table[i][1]; if(r<=0) return table[i][0]; }
  return table[0][0];
}

/* ---------- day handling, streaks, the multiplier ---------- */
function todayKey(){ return dkey(new Date()); }
function rollDay(){
  var t=todayKey();
  if(G.day===t) return;
  if(G.day){
    var prev=new Date(G.day+"T12:00:00"), now=new Date(t+"T12:00:00");
    var gap=Math.round((now-prev)/864e5);
    G.streak = gap===1 ? G.streak+1 : 0;
  }else G.streak=0;
  G.day=t;
  /* a real reason to open it tomorrow */
  G.mult = Math.min(3, 1 + G.streak*0.15);
  G.goalsHit[t]=G.goalsHit[t]||{};
  prune();
  save();
}
function prune(){
  var keep=8, ks=Object.keys(G.goalsHit).sort();
  while(ks.length>keep) delete G.goalsHit[ks.shift()];
  var sk=Object.keys(G.spent).sort();
  while(sk.length>60) delete G.spent[sk.shift()];
}

/* ---------- player level ----------
   The player levels from looking after themselves, never from battling. */
function playerNeed(l){ return Math.round(30*Math.pow(l,1.35)); }
function givePlayerXp(n, why){
  n=Math.round(n*G.mult);
  if(n<=0) return;
  G.player.xp+=n;
  gain={n:n, at:Date.now()};
  var ups=0;
  while(G.player.xp>=playerNeed(G.player.lvl)){
    G.player.xp-=playerNeed(G.player.lvl); G.player.lvl++; ups++;
  }
  note("+"+n+" trainer xp"+(G.mult>1?" (x"+G.mult.toFixed(2)+")":"")+(why?" — "+why:""));
  if(ups) for(var i=0;i<ups;i++) levelPrize(G.player.lvl-ups+1+i);
  save(); paint();
}
function levelPrize(lvl){
  var pool = lvl%10===0 ? GOOD : COMMON;
  var item = roll(pool);
  award(item,1,"Trainer level "+lvl);
  var extra=null;
  if(lvl%100===0){                       /* a century. something absurd. */
    if(Math.random()<0.5){ award("masterball",1,"Level "+lvl+"!"); extra="masterball"; }
    else extra="mythic";
  }
  if(extra==="mythic") requestEncounter(pickSpecies(5), lvl);
}

/* ---------- picking a wild species ----------
   Weighted to the player's level: early on you meet weak things. */
function pickSpecies(forceTier){
  var all=names(), lvl=G.player.lvl, i, s, d;
  var maxTier = forceTier!==undefined ? forceTier
              : (lvl<5?0 : lvl<12?1 : lvl<25?2 : lvl<45?3 : lvl<80?3 : 4);
  var pool=[];
  for(i=0;i<all.length;i++){
    d=DEX.mon[all[i]];
    if(forceTier!==undefined ? d.r===forceTier : d.r<=maxTier) pool.push(all[i]);
  }
  if(!pool.length) pool=all;
  /* rare things stay rare even when they are in range */
  for(i=0;i<12;i++){
    s=pool[Math.floor(Math.random()*pool.length)];
    d=DEX.mon[s];
    if(forceTier!==undefined) return s;
    if(Math.random() < [1,.75,.5,.18,.05,.01][d.r]) return s;
  }
  return s;
}
function wildLevel(){
  var base=Math.max(2, Math.round(G.player.lvl*0.9));
  return Math.max(2, Math.min(100, base + Math.floor(Math.random()*7)-3));
}

/* ---------- encounter tokens ----------
   One per meal window per day, and spending is permanent: deleting the food and
   logging it again does not buy another. */
function tokenKey(meal){ return todayKey()+"|"+meal; }
function tokenFree(meal){ return !G.spent[tokenKey(meal)]; }
function spendToken(meal){ G.spent[tokenKey(meal)]=1; save(); }
/* an entry only counts if it was logged in its own window */
function inWindow(meal){ return meal===mealOfNow(); }

/* Is the player in the middle of something? A sheet open, a field focused, a
   popup up. A battle that lands on top of a half-typed recipe loses the recipe,
   so encounters wait their turn instead. */
function busy(){
  var host=document.getElementById("sheetHost");
  if(host && host.firstChild) return true;
  var a=document.activeElement;
  if(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
  var fx=document.getElementById("gameFx");
  if(fx && fx.querySelector(".gover,.gbattle,.gitem,.pxscreen")) return true;
  return false;
}
function requestEncounter(species, lvl){
  if(!DEX) return;
  if(busy()){ G.pendingEnc={s:species||null, l:lvl||null}; save(); return; }
  startEncounter(species||pickSpecies(), lvl);
}
function tryPending(){
  if(!G||!G.pendingEnc||!DEX||G.enc||busy()) return;
  var p=G.pendingEnc; G.pendingEnc=null; save();
  startEncounter(p.s||pickSpecies(), p.l||undefined);
}
function startEncounter(species, lvl){
  if(!DEX || G.enc) return;
  var m=makeMon(species, lvl||wildLevel());
  var me=firstHealthy();
  G.enc={mon:m, turn:"you", log:[], fled:false, ball:null, active:me?me.u:null};
  G.seen[species]=1;
  save(); openBattle();
}
/* the hook every action calls */
function maybeEncounter(meal, chance){
  if(!G.started||!DEX) return false;
  if(meal && !inWindow(meal)) return false;
  if(meal && !tokenFree(meal)) return false;
  if(Math.random() > (chance===undefined?0.34:chance)) return false;
  if(meal) spendToken(meal);
  requestEncounter(pickSpecies());
  return true;
}

/* ---------- battle ----------
   The rules decide the whole turn at once and save it; the screen then PLAYS
   it back as a list of steps (text, lunges, a health bar draining), the way the
   games do. Closing the app mid-animation loses nothing: the state is already
   settled. */
function battleXp(foe, won){
  var base=DEX.mon[foe.s].s.reduce(function(a,b){return a+b},0);
  return Math.round(base*foe.lvl/220 * (won?1:0.4));
}
function effText(r){
  if(r.miss) return null;
  if(r.e===0) return "It doesn't affect the foe…";
  if(r.e>1) return "It's super effective!";
  if(r.e<1) return "It's not very effective…";
  return null;
}
/* xp for whoever took the field, as steps for the xp bar */
function xpSteps(me, gained){
  if(!me || gained<=0) return [];
  var from={lvl:me.lvl, xp:me.xp}, ups=giveMonXp(me, gained);
  var st=[{say:nameOf(me)+" gained "+Math.round(gained)+" EXP. Points!"},
          {xp:{from:from, to:{lvl:me.lvl, xp:me.xp}}}];
  if(ups) st.push({say:nameOf(me)+" grew to Lv. "+me.lvl+"!"});
  return st;
}
function endBattle(msg){
  G.enc=null; save();
  closeBattle(); if(msg) toast(msg); paint();
  setTimeout(flushItems,400);
}
/* the foe's half of a turn, appended to the same step list */
function foeTurn(e, steps){
  var me=firstHealthy();
  if(!me) return false;
  var mv=e.mon.moves[Math.floor(Math.random()*e.mon.moves.length)];
  var before=me.hp, r=damage(e.mon,me,mv);
  me.hp=Math.max(0,me.hp-r.dmg);
  steps.push({say:"Wild "+pretty(e.mon.s)+" used "+moveLabel(mv)+"!", quick:1},{lunge:"foe"});
  if(r.miss) steps.push({say:"Its attack missed!"});
  else{
    steps.push({hurt:"me"},{hp:"me",from:before,to:me.hp,max:me.max});
    if(r.crit) steps.push({say:"A critical hit!"});
    var t=effText(r); if(t) steps.push({say:t});
  }
  if(me.hp<=0){
    steps.push({faint:"me"},{say:nameOf(me)+" fainted!"});
    var next=firstHealthy();
    if(next){ e.active=next.u; steps.push({send:next.u},{say:"Go! "+nameOf(next)+"!"}) }
  }
  return true;
}
function playerMove(idx){
  var e=G.enc; if(!e||e.turn!=="you"||FX.busy) return;
  var me=firstHealthy();
  if(!me){ endBattle("No pokemon able to fight"); return; }
  e.active=me.u;
  var mv=me.moves[idx]; if(!mv) return;
  var foe=e.mon, before=foe.hp, r=damage(me,foe,mv), steps=[];
  foe.hp=Math.max(0,foe.hp-r.dmg);
  steps.push({say:nameOf(me)+" used "+moveLabel(mv)+"!", quick:1},{lunge:"me"});
  if(r.miss) steps.push({say:nameOf(me)+"'s attack missed!"});
  else{
    steps.push({hurt:"foe"},{hp:"foe",from:before,to:foe.hp,max:foe.max});
    if(r.crit) steps.push({say:"A critical hit!"});
    var t=effText(r); if(t) steps.push({say:t});
  }
  e.log.push(nameOf(me)+" used "+moveLabel(mv));
  if(foe.hp<=0){
    steps.push({faint:"foe"},{say:"Wild "+pretty(foe.s)+" fainted!"});
    steps=steps.concat(xpSteps(me, battleXp(foe,true)));
    save();
    play(steps, function(){ endBattle() });
    return;
  }
  foeTurn(e, steps);
  if(!firstHealthy()){
    var lost=(e.active&&byUid(e.active))||me;
    steps.push({say:"You have no more pokemon that can fight!"});
    steps=steps.concat(xpSteps(lost, battleXp(foe,false)));
    save();
    play(steps, function(){ endBattle() });
    return;
  }
  e.turn="you"; save();
  play(steps);
}
/* catch odds: the weaker and rarer it is, the more it matters which ball */
function tryCatch(ball){
  var e=G.enc; if(!e||!has(ball)||FX.busy) return;
  take(ball,1);
  var d=DEX.mon[e.mon.s], hpFrac=e.mon.hp/e.mon.max;
  var rarity=[1,.9,.75,.5,.3,.12][d.r];
  var p = ITEMS[ball].rate>=255 ? 1
        : Math.min(0.95, rarity*(1.1-hpFrac*0.7)*ITEMS[ball].rate*0.75);
  var ok=Math.random()<p, shakes=ok?3:Math.floor(Math.random()*3);
  var steps=[{say:"You threw a "+ITEMS[ball].n+"!"},{ball:{kind:ball, shakes:shakes, caught:ok}}];
  e.log.push("Threw a "+ITEMS[ball].n);
  if(ok){
    var caught=e.mon;
    G.box.push(caught); G.caught[caught.s]=1;
    if(G.party.length<6) G.party.push(caught.u);
    var me=(e.active&&byUid(e.active))||firstHealthy();
    steps.push({say:"Gotcha! "+pretty(caught.s)+(caught.shiny?" ✦":"")+" was caught!"});
    steps=steps.concat(xpSteps(me, battleXp(caught,true)));
    save();
    play(steps, function(){ endBattle(); openNickname(caught); });
    return;
  }
  steps.push({say:["Oh no! The pokemon broke free!","Aww! It appeared to be caught!",
                   "Aargh! Almost had it!"][Math.min(2,shakes)]});
  foeTurn(e, steps);
  if(!firstHealthy()){
    steps.push({say:"You have no more pokemon that can fight!"});
    save(); play(steps, function(){ endBattle() }); return;
  }
  save(); play(steps);
}
function flee(){
  var e=G.enc; if(!e||FX.busy) return;
  G.enc=null; save();
  play([{say:"Got away safely!"}], function(){ closeBattle(); paint(); setTimeout(flushItems,400) });
}

/* ---------- healing: only by eating properly ---------- */
function healAll(why){
  var n=0;
  G.box.forEach(function(m){ if(m.hp<m.max){ m.hp=m.max; n++ } });
  if(n){ save(); toast("All pokemon restored — "+why); paint(); }
  return n;
}

/* ---------- missions ----------
   A bench pokemon asks for the thing the day is actually short of. */
function macroGap(){
  if(typeof totals!=="function") return null;
  var t=totals(), out=[];
  [[1,"protein","g"],[4,"fibre","g"],[2,"carbs","g"],[3,"fat","g"]].forEach(function(x){
    var g=goal(x[0]); if(g>0 && t[x[0]]<g*0.75) out.push({i:x[0],n:x[1],need:Math.round(g-t[x[0]]),u:x[2]});
  });
  return out;
}
function newMission(){
  if(!G.started||G.missions.length>=2) return;
  var p=party(); if(!p.length) return;
  var who=p[Math.floor(Math.random()*p.length)];
  var gaps=macroGap()||[], m;
  var water=(typeof waterTotal==="function")?waterTotal():0;
  var wg=(typeof waterGoal==="function")?waterGoal():100;
  if(water<wg*0.8 && Math.random()<0.5){
    m={id:"m"+Date.now(), who:who.u, kind:"water", amount:8,
       text:"Get 8 oz of water in", reward:"pokeball"};
  }else if(gaps.length){
    var g=gaps[Math.floor(Math.random()*gaps.length)];
    m={id:"m"+Date.now(), who:who.u, kind:"macro", idx:g.i, amount:Math.min(g.need,25),
       text:"Find "+Math.min(g.need,25)+" g more "+g.n, reward:"pokeball"};
  }else{
    m={id:"m"+Date.now(), who:who.u, kind:"log", amount:1,
       text:"Log one more thing today", reward:"potion"};
  }
  m.base = m.kind==="macro" ? totals()[m.idx] : (m.kind==="water"?water:(entries()||[]).length);
  G.missions.push(m); save(); paint();
  showMission(m);
}
function checkMissions(){
  if(!G.missions.length) return;
  var t=(typeof totals==="function")?totals():null;
  var water=(typeof waterTotal==="function")?waterTotal():0;
  var left=[];
  G.missions.forEach(function(m){
    var now = m.kind==="macro" ? (t?t[m.idx]:0)
            : m.kind==="water" ? water
            : (entries()||[]).length;
    if(now - m.base >= m.amount){
      var mon=byUid(m.who);
      award(m.reward,1,(mon?nameOf(mon):"Your pokemon")+" is pleased");
      if(mon) giveMonXp(mon, 26+G.player.lvl*2);
    } else left.push(m);
  });
  G.missions=left; save();
}

/* ---------- weekly ---------- */
function weekKey(d){
  d=d||new Date(); var x=new Date(d); x.setHours(12,0,0,0);
  x.setDate(x.getDate()-((x.getDay()+6)%7));
  return dkey(x);
}
function weekTick(hitToday){
  var k=weekKey();
  if(!G.week||G.week.k!==k) G.week={k:k, days:{}, paid:false};
  if(hitToday) G.week.days[todayKey()]=1;
  var n=Object.keys(G.week.days).length;
  if(n>=5 && !G.week.paid){
    G.week.paid=true;
    award(roll(GOOD),1,"Five good days this week"); award("ultraball",2,"Five good days this week");
    var p=party(); p.forEach(function(m){ giveMonXp(m, 220+G.player.lvl*6) });
    givePlayerXp(300,"five good days this week");
    toast("Five days on goal — the whole bench levelled up hard");
  }
  save();
}

/* ---------- hooks into the tracker ---------- */
var lastSeen={};
function scanEntries(){
  if(!G.started||!DEX) return;
  rollDay();
  var k=todayKey(), list=(S.days[k]||[]), fresh=[];
  list.forEach(function(e){ if(e.id && !lastSeen[e.id]){ lastSeen[e.id]=1; fresh.push(e) } });
  Object.keys(S.days).forEach(function(d){
    (S.days[d]||[]).forEach(function(e){ if(e.id) lastSeen[e.id]=1 });
  });
  fresh.forEach(function(e){
    if(inWindow(e.meal)){
      givePlayerXp(6,"logged "+e.meal.toLowerCase());
      maybeEncounter(e.meal);
    }else{
      note("Logged outside its window — no xp");
    }
  });
  checkGoals();
  checkMissions();
}
/* macro goals pay a ball each, once a day; all four also heals the team */
function checkGoals(){
  var k=todayKey(); G.goalsHit[k]=G.goalsHit[k]||{};
  var t=totals(), hit=G.goalsHit[k], got=0, all=true;
  [1,2,3].concat([0]).forEach(function(i){
    var g=goal(i); if(!g){ all=false; return; }
    var done = i===0 ? (t[0]>0 && t[0]<=g) : t[i]>=g;
    if(done && !hit[i]){ hit[i]=1; got++;
      award("pokeball",1,(["Calorie","Protein","Carb","Fat"][i])+" goal met");
      givePlayerXp(18,"hit a goal"); }
    if(!done) all=false;
  });
  if(all && !hit.all){
    hit.all=1;
    healAll("every macro goal met");
    award("revive",1,"All four goals today");
    givePlayerXp(60,"all four goals");
    weekTick(true);
  }
  save();
}
function hookWater(oz){
  if(!G.started) return;
  givePlayerXp(3,"water");
  maybeEncounter(null, 0.10);
  checkMissions();
}
function hookRecipe(id){
  if(!G.started) return;
  G.recipePaid=G.recipePaid||{};
  if(id && G.recipePaid[id]) return;           /* editing a recipe again pays nothing */
  if(id) G.recipePaid[id]=1;
  givePlayerXp(25,"saved a recipe");          /* no encounter: a fight here ate the recipe */
}
var scanPaid={};
function hookScan(){
  if(!G.started) return;
  var k=todayKey(); scanPaid[k]=(scanPaid[k]||0)+1;
  if(scanPaid[k]<=12) givePlayerXp(4,"scanned something");   /* a grocery haul is not a farm */
}

/* ---------- little log so the player can see what paid ---------- */
function note(t){ G.log.unshift({t:t,at:Date.now()}); G.log=G.log.slice(0,40); }

/* ---------- expose ---------- */
window.MLGame={
  state:function(){return G}, dexReady:function(){return !!DEX},
  makeMon:function(s,l,sh){return makeMon(s,l,sh)}, statsOf:statsOf, damage:damage, eff:eff,
  xpNeed:xpNeed, playerNeed:playerNeed, giveMonXp:giveMonXp, givePlayerXp:givePlayerXp,
  pickSpecies:pickSpecies, startEncounter:startEncounter, maybeEncounter:maybeEncounter,
  tokenFree:tokenFree, inWindow:inWindow, checkGoals:checkGoals, healAll:healAll,
  newMission:newMission, checkMissions:checkMissions, weekTick:weekTick, weekKey:weekKey,
  rollDay:rollDay, give:give, take:take, has:has, items:ITEMS, roll:roll,
  playerMove:playerMove, tryCatch:tryCatch, flee:flee, party:party, byUid:byUid,
  nameOf:nameOf, pretty:pretty, sprite:sprite, levelPrize:levelPrize, barPct:barPct,
  scanEntries:function(){return scanEntries()}, hookWater:hookWater,
  hookRecipe:hookRecipe, hookScan:hookScan, save:save,
  award:award, itemIcon:itemIcon, requestEncounter:requestEncounter, tryPending:tryPending,
  busy:busy, flushItems:flushItems, fx:function(){return FX}, renderBattle:function(){return renderBattle()},
  reset:function(){ G=blank(); save(); paint(); },
  /* the tracker keeps its state in a const, so hand out a reference for
     debugging and for the tests that drive the game from outside */
  tracker:function(){ return S; },
  openMon:function(m){ return openMon(m) },
  openStarter:function(){ return openStarter() },
  _setDex:function(d){ DEX=d; NAMES=null; }
};

/* =================== interface =================== */
function fxHost(){
  var h=document.getElementById("gameFx");
  if(!h){ h=document.createElement("div"); h.id="gameFx"; document.body.appendChild(h); }
  return h;
}
function esc2(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]}); }
function monImg(m,cls){
  return '<img class="mon '+(cls||"")+(m.shiny?" shiny":"")+'" src="'+sprite(m.s)+
         '" alt="'+esc2(pretty(m.s))+'" loading="lazy">';
}
/* One source of truth for how full a bar looks. A living pokemon always keeps a
   visible sliver, and zero is genuinely zero, so the two themes cannot disagree. */
function barPct(cur,max){
  if(!(max>0)||cur<=0) return 0;
  return Math.max(4, Math.min(100, Math.round(cur/max*100)));
}
function hpBar(m){
  var p=barPct(m.hp,m.max);
  return '<div class="hpb"><i class="'+(p<25?"low":p<55?"mid":"")+'" style="width:'+p+'%"></i></div>';
}

/* ---- the strip along the top of the day screen ---- */
function paint(){
  if(!G.started||!DEX) return;
  /* the Shamu look has its own level strip; two of them stacked is a mess */
  if(G.theme==="shamu"){
    var old=document.getElementById("gameStrip");
    if(old) old.remove();
    return;
  }
  var scr=document.getElementById("screen");
  var onDay=document.getElementById("navday")&&
            document.getElementById("navday").getAttribute("aria-current")==="true";
  var strip=document.getElementById("gameStrip");
  if(!onDay){ if(strip) strip.remove(); return; }
  if(!strip){
    strip=document.createElement("div"); strip.id="gameStrip"; strip.className="gstrip";
    scr.insertBefore(strip, scr.firstChild);
  }
  var p=party(), need=playerNeed(G.player.lvl);
  var xpNow=barPct(G.player.xp,need), xpWas=STRIP.xp, lvWas=STRIP.lvl;
  strip.innerHTML=
    '<div class="gtop"><div class="gplv">Trainer <b>Lv '+G.player.lvl+"</b></div>"+
      '<div class="gmult">'+(G.streak>0?"day "+(G.streak+1)+" · x"+G.mult.toFixed(2)+" xp":"open daily for a multiplier")+"</div></div>"+
    '<div class="gxp" id="gTrainerXp"><i style="width:'+(xpWas===null?xpNow:xpWas)+'%"></i>'+
      (gain&&Date.now()-gain.at<4000?'<b class="gxpgain">+'+gain.n+" xp</b>":"")+"</div>"+
    '<div class="gline">'+(p.length?p.map(function(m){
      var was=STRIP.hp[m.u], cur=barPct(m.hp,m.max);
      return '<button class="gslot'+(m.hp<=0?" ko":"")+'" data-mon="'+m.u+'">'+
        monImg(m)+'<span class="glv">'+m.lvl+"</span>"+
        '<div class="hpb"><i class="'+hpCls(was===undefined?cur:was)+'" data-to="'+cur+'" style="width:'+(was===undefined?cur:was)+'%"></i></div></button>';
    }).join(""):'<span class="gnone">No pokemon on the bench</span>')+
    '<button class="gslot gpc" id="gotoPC">PC</button></div>';
  strip.querySelectorAll("[data-mon]").forEach(function(b){
    b.onclick=function(){ openMon(byUid(+b.dataset.mon)) };
  });
  var pc=strip.querySelector("#gotoPC");
  if(pc) pc.onclick=function(){ S.view="pc"; render(); };
  /* animate from what was showing to the new value, and make it noticeable */
  var xpEl=strip.querySelector("#gTrainerXp i"), xpBox=strip.querySelector("#gTrainerXp");
  requestAnimationFrame(function(){ requestAnimationFrame(function(){
    if(xpEl){
      if(lvWas!==null && G.player.lvl>lvWas){
        xpEl.style.width="100%"; xpBox.classList.add("gain","lvup");
        setTimeout(function(){ xpEl.style.transition="none"; xpEl.style.width="0%"; void xpEl.offsetWidth;
          xpEl.style.transition=""; xpEl.style.width=xpNow+"%"; },900);
      }else if(xpWas!==null && xpNow!==xpWas){ xpEl.style.width=xpNow+"%"; xpBox.classList.add("gain"); }
      setTimeout(function(){ xpBox.classList.remove("gain","lvup") },2200);
    }
    strip.querySelectorAll(".hpb i[data-to]").forEach(function(i){
      var to=+i.dataset.to; if(parseFloat(i.style.width)!==to){ i.parentNode.classList.add("gain");
        i.style.width=to+"%"; i.className=hpCls(to);
        setTimeout(function(){ i.parentNode.classList.remove("gain") },1800); }
    });
  })});
  STRIP.xp=xpNow; STRIP.lvl=G.player.lvl;
  p.forEach(function(m){ STRIP.hp[m.u]=barPct(m.hp,m.max) });
}
var STRIP={xp:null, lvl:null, hp:{}}, gain=null;

/* ---- starter ---- */
var STARTERS=["bulbasaur","charmander","squirtle","chikorita","cyndaquil","totodile",
              "treecko","torchic","mudkip","turtwig","chimchar","piplup"];
function openStarter(){
  var pick=[], pool=STARTERS.slice();
  while(pick.length<3 && pool.length) pick.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  /* the themed version has its own welcome screen and framed cards */
  if(window.MLPixel && window.MLPixel.on() && window.MLPixelScreens){
    var take=function(sp){
      var m=makeMon(sp,5);
      G.box.push(m); G.party.push(m.u); G.caught[m.s]=1; G.seen[m.s]=1;
      G.started=true; rollDay(); save();
      toast("Take care of "+pretty(m.s));
      openNickname(m); render();
    };
    window.MLPixelScreens.welcome(function(){
      window.MLPixelScreens.starter(pick, take);
    });
    return;
  }
  fxHost().innerHTML='<div class="gover"><div class="gcard">'+
    "<h2>Pick your first pokemon</h2>"+
    "<p>It joins your bench. Look after yourself and it grows.</p>"+
    '<div class="grow3">'+pick.map(function(s){
      return '<button class="gpick" data-s="'+s+'"><img src="'+sprite(s)+'" alt="">'+
             "<span>"+pretty(s)+"</span><u>"+DEX.mon[s].t.join(" / ")+"</u></button>";
    }).join("")+"</div></div></div>";
  fxHost().querySelectorAll("[data-s]").forEach(function(b){
    b.onclick=function(){
      var m=makeMon(b.dataset.s,5);
      G.box.push(m); G.party.push(m.u); G.caught[m.s]=1; G.seen[m.s]=1;
      G.started=true; rollDay(); save();
      fxHost().innerHTML=""; toast("Take care of "+pretty(m.s));
      openNickname(m); render();
    };
  });
}
function openNickname(m){
  fxHost().innerHTML='<div class="gover"><div class="gcard">'+
    "<h2>Give it a name?</h2>"+monImg(m,"big")+
    '<input id="gnick" type="text" maxlength="14" placeholder="'+esc2(pretty(m.s))+'">'+
    '<div class="grow2"><button class="gbtn ghost" id="gskip">Keep '+esc2(pretty(m.s))+"</button>"+
    '<button class="gbtn" id="gok">Name it</button></div></div></div>';
  var i=document.getElementById("gnick");
  document.getElementById("gskip").onclick=function(){ fxHost().innerHTML=""; paint(); };
  document.getElementById("gok").onclick=function(){
    var v=i.value.trim(); if(v){ m.nick=v; save(); }
    fxHost().innerHTML=""; toast(nameOf(m)+" it is"); paint(); render();
  };
  setTimeout(function(){ i.focus() },120);
}

/* ---- battle screen ----
   Built once per battle and then only updated in place, so an animation that
   has started is never wiped by a redraw. Every theme uses the same element
   ids, so one set of animations serves Modern, Handheld and Emerald. */
var SHOWN={foe:null, me:null};           /* the hp each bar currently DISPLAYS */
function hpCls(p){ return p<25?"low":p<55?"mid":"" }
function infoBox(m, who){
  var p=barPct(m.hp,m.max), need=xpNeed(m.lvl);
  return '<div class="binfo '+who+'" id="b'+(who==="foe"?"Foe":"Me")+'Box">'+
    '<div class="bname"><span>'+esc2(who==="foe"?pretty(m.s):nameOf(m))+
      (m.shiny?' <em>✦</em>':"")+'</span><span class="blv" id="b'+(who==="foe"?"Foe":"Me")+'Lv">Lv'+m.lvl+"</span></div>"+
    '<div class="bhpline"><span class="bhplab">HP</span><div class="hpb big"><i id="b'+(who==="foe"?"Foe":"Me")+'Bar" class="'+hpCls(p)+'" style="width:'+p+'%"></i></div></div>'+
    (who==="me"?'<div class="bnum" id="bMeNum">'+m.hp+" / "+m.max+"</div>"+
      '<div class="bxpline"><span class="bxplab">EXP</span><div class="bxp"><i id="bMeXp" style="width:'+barPct(m.xp,need)+'%"></i></div></div>':"")+
  "</div>";
}
function battleMenu(me){
  var e=G.enc;
  var balls=Object.keys(ITEMS).filter(function(k){return ITEMS[k].kind==="ball"&&has(k)});
  return (me?me.moves.map(function(mv,i){
      var d=DEX.mv[mv];
      return '<button class="bmove" data-mv="'+i+'">'+esc2(moveLabel(mv))+
        "<u>"+(d?d[0]:"")+(d&&d[1]?" · "+d[1]:"")+"</u></button>";
    }).join(""):'<button class="bmove" disabled>No pokemon standing</button>')+
    '<div class="bballs">'+balls.map(function(k){
      return '<button class="bball" data-ball="'+k+'">'+itemIcon(k,20)+esc2(ITEMS[k].n)+" <u>"+G.items[k]+"</u></button>";
    }).join("")+'<button class="bball flee" id="bRun">Run</button></div>';
}
function openBattle(){ renderBattle(); }
function closeBattle(){ FX.q=[]; FX.busy=false; fxHost().innerHTML=""; tryPendingSoon(); }
function renderBattle(){
  var e=G.enc; if(!e) return;
  var me=(e.active&&byUid(e.active)&&byUid(e.active).hp>0&&byUid(e.active))||firstHealthy(), foe=e.mon;
  if(me) e.active=me.u;
  SHOWN.foe=foe.hp; SHOWN.me=me?me.hp:0;
  var px=window.MLPixel && window.MLPixel.on();
  fxHost().innerHTML='<div class="gbattle'+(px?" px":"")+'"><div class="bstage">'+
    '<div class="bfield'+(px?" pxfield":"")+'">'+
      infoBox(foe,"foe")+
      '<div class="bspr foe" id="bFoeImg">'+monImg(foe,"big")+"</div>"+
      '<div class="bspr me" id="bMeImg">'+(me?monImg(me,"big me"):"")+"</div>"+
      (me?infoBox(me,"me"):"")+
    "</div>"+
    '<div class="btext" id="bTextBox"><span id="bText"></span><span class="bcur" id="bCur"></span></div>'+
    (me?"":'<div class="bwarn">Every pokemon you have is fainted. You can still throw a '+
      "ball or run &mdash; but nothing heals until you hit all four macro goals in a day.</div>")+
    '<div class="bmenu" id="bMenu">'+battleMenu(me)+"</div>"+
  "</div></div>";
  wireBattle();
  var first=e.log.length?null:"A wild "+pretty(foe.s)+" appeared!";
  if(first) play([{say:first, hold:1}]);
  else setText(e.log[e.log.length-1]+"");
}
function wireBattle(){
  var h=fxHost();
  h.querySelectorAll("[data-mv]").forEach(function(b){ b.onclick=function(){ playerMove(+b.dataset.mv) } });
  h.querySelectorAll("[data-ball]").forEach(function(b){ b.onclick=function(){ tryCatch(b.dataset.ball) } });
  var r=document.getElementById("bRun"); if(r) r.onclick=flee;
  var tb=document.getElementById("bTextBox"); if(tb) tb.onclick=function(){ FX.tap() };
}
function setText(t){ var el=document.getElementById("bText"); if(el) el.textContent=t; }
function lockMenu(on){
  var m=document.getElementById("bMenu"); if(!m) return;
  m.classList.toggle("busy",!!on);
  m.querySelectorAll("button").forEach(function(b){ b.disabled=!!on });
}

/* ---- the director: plays steps one after another ---- */
var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var FX={busy:false, q:[], tapFn:null,
  tap:function(){ if(FX.tapFn){ var f=FX.tapFn; FX.tapFn=null; f(); } }};
function play(steps, done){
  FX.busy=true; lockMenu(true);
  var i=0;
  (function next(){
    if(!document.getElementById("bTextBox") && i<steps.length && !steps[i].say){ i++; return next(); }
    if(i>=steps.length){
      FX.busy=false; FX.tapFn=null;
      var cur=document.getElementById("bCur"); if(cur) cur.classList.remove("on");
      if(done) done(); else { lockMenu(false); var mm=byUid(G.enc&&G.enc.active); setText("What will "+(mm?nameOf(mm):"you")+" do?"); }
      return;
    }
    var st=steps[i++];
    runStep(st, next);
  })();
}
function runStep(st, next){
  if(st.say!==undefined) return say(st.say, next, st.hold, st.quick);
  if(st.lunge) return cls(st.lunge==="me"?"bMeImg":"bFoeImg", "lunge", 380, next);
  if(st.hurt)  return cls(st.hurt==="me"?"bMeImg":"bFoeImg", "hurt", 520, next);
  if(st.faint) return cls(st.faint==="me"?"bMeImg":"bFoeImg", "faint", 650, next, true);
  if(st.hp)    return drain(st.hp, st.from, st.to, st.max, next);
  if(st.xp)    return fillXp(st.xp.from, st.xp.to, next);
  if(st.ball)  return throwBall(st.ball, next);
  if(st.send){ var m=byUid(st.send); swapMe(m); return setTimeout(next, 350); }
  next();
}
function cls(id, c, ms, next, keep){
  var el=document.getElementById(id);
  if(!el||reduce){ if(el&&keep) el.classList.add(c); return setTimeout(next, reduce?60:0); }
  el.classList.remove(c); void el.offsetWidth; el.classList.add(c);
  setTimeout(function(){ if(!keep) el.classList.remove(c); next(); }, ms);
}
/* the text box: types a character at a time; a tap finishes it, the next tap
   (or a short pause) moves on, exactly like the games */
var TYPE_MS=26;
function say(text, next, hold, quick){
  var el=document.getElementById("bText"), cur=document.getElementById("bCur");
  if(!el){ return next(); }
  var i=0, full=String(text), timer=null, finished=false;
  el.textContent=""; if(cur) cur.classList.remove("on");
  function done(){
    if(finished) return; finished=true; clearInterval(timer); el.textContent=full;
    if(cur) cur.classList.add("on");
    var auto=setTimeout(go, hold?1400:quick?380:900+Math.min(900,full.length*12));
    FX.tapFn=function(){ clearTimeout(auto); go(); };
  }
  function go(){ FX.tapFn=null; if(cur) cur.classList.remove("on"); next(); }
  if(reduce){ return done(); }
  FX.tapFn=done;
  timer=setInterval(function(){ i+=1; el.textContent=full.slice(0,i); if(i>=full.length) done(); }, TYPE_MS);
}
/* hp drains the way it does in the games: steadily, the colour changing as it
   crosses each threshold, the numbers counting down, the box flashing so the
   eye goes to it */
function drain(who, from, to, max, next){
  var bar=document.getElementById(who==="me"?"bMeBar":"bFoeBar");
  var box=document.getElementById(who==="me"?"bMeBox":"bFoeBox");
  var num=who==="me"?document.getElementById("bMeNum"):null;
  if(!bar){ SHOWN[who]=to; return next(); }
  var dur=reduce?1:Math.max(550, Math.min(1500, Math.abs(from-to)/Math.max(1,max)*2400));
  if(box) box.classList.add("draining");
  var t0=null;
  function frame(ts){
    if(t0===null) t0=ts;
    var k=Math.min(1,(ts-t0)/dur), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
    var v=Math.round(from+(to-from)*e), p=barPct(v,max);
    bar.style.width=p+"%"; bar.className=hpCls(p);
    if(num) num.textContent=v+" / "+max;
    SHOWN[who]=v;
    if(k<1) requestAnimationFrame(frame);
    else{ if(box) box.classList.remove("draining"); setTimeout(next,180); }
  }
  bar.style.transition="none";
  requestAnimationFrame(frame);
}
/* the xp bar fills, and on a level up it fills to the end, flashes, and starts again */
function fillXp(from, to, next){
  var bar=document.getElementById("bMeXp"), box=document.getElementById("bMeBox"),
      lv=document.getElementById("bMeLv");
  if(!bar) return next();
  bar.style.transition="none";
  var segs=[], l=from.lvl, x=from.xp;
  while(l<to.lvl){ segs.push({l:l, a:x, b:xpNeed(l)}); l++; x=0; }
  segs.push({l:to.lvl, a:x, b:to.xp});
  if(box) box.classList.add("gaining");
  (function seg(j){
    if(j>=segs.length){ if(box) box.classList.remove("gaining"); return setTimeout(next,200); }
    var s=segs[j], need=xpNeed(s.l), dur=reduce?1:Math.max(450,Math.min(1300,(s.b-s.a)/need*1600)), t0=null;
    function frame(ts){
      if(t0===null) t0=ts;
      var k=Math.min(1,(ts-t0)/dur), v=s.a+(s.b-s.a)*k;
      bar.style.width=Math.max(0,Math.min(100,v/need*100))+"%";
      if(k<1) return requestAnimationFrame(frame);
      if(j<segs.length-1){                       /* levelled: flash, then wrap */
        if(lv) lv.textContent="Lv"+(s.l+1);
        if(box){ box.classList.remove("lvup"); void box.offsetWidth; box.classList.add("lvup"); }
        setTimeout(function(){ bar.style.width="0%"; seg(j+1); }, reduce?1:420);
      }else seg(j+1);
    }
    requestAnimationFrame(frame);
  })(0);
}
function swapMe(m){
  if(!m) return;
  var img=document.getElementById("bMeImg"), box=document.getElementById("bMeBox");
  if(img){ img.className="bspr me enter"; img.innerHTML=monImg(m,"big me"); }
  if(box){ var tmp=document.createElement("div"); tmp.innerHTML=infoBox(m,"me"); box.replaceWith(tmp.firstChild); }
  SHOWN.me=m.hp;
  var menu=document.getElementById("bMenu"); if(menu){ menu.innerHTML=battleMenu(m); wireBattle(); lockMenu(true); }
}
/* the ball: thrown, the foe vanishes into it, it wobbles, then pops or holds */
function throwBall(b, next){
  var field=document.querySelector(".gbattle .bfield"), foe=document.getElementById("bFoeImg");
  if(!field||reduce){ if(foe&&b.caught) foe.style.visibility="hidden"; return setTimeout(next,reduce?60:0); }
  var el=document.createElement("div");
  el.className="bthrown"; el.innerHTML=itemIcon(b.kind,40);
  field.appendChild(el);
  setTimeout(function(){ if(foe) foe.classList.add("absorbed"); },620);
  var t=900;
  for(var k=0;k<b.shakes;k++){ (function(k){ setTimeout(function(){
      el.classList.remove("wob"); void el.offsetWidth; el.classList.add("wob"); }, t+k*700); })(k); }
  t+=b.shakes*700+300;
  setTimeout(function(){
    if(b.caught){ el.classList.add("click"); setTimeout(next,500); }
    else{ el.remove(); if(foe){ foe.classList.remove("absorbed"); foe.classList.add("popout");
            setTimeout(function(){ foe.classList.remove("popout") },400); } next(); }
  }, t);
}

/* ---- item popup: an icon, what it is, why you got it, and an OK ---- */
function flushItems(){
  if(!itemQ.length) return;
  if(busy()||FX.busy){ clearTimeout(itemT); itemT=setTimeout(flushItems,900); return; }
  var batch=itemQ.splice(0,itemQ.length);
  var merged={}; batch.forEach(function(x){
    var k=x.item; if(!merged[k]) merged[k]={item:k,n:0,why:[]};
    merged[k].n+=x.n; if(x.why&&merged[k].why.indexOf(x.why)<0) merged[k].why.push(x.why);
  });
  var list=Object.keys(merged).map(function(k){return merged[k]});
  var head=list.length===1
    ? "You got "+(list[0].n>1?list[0].n+" "+ITEMS[list[0].item].n+"s":"a "+ITEMS[list[0].item].n)+"!"
    : "You got "+list.length+" items!";
  var h=document.createElement("div");
  h.className="gover gitem";
  h.innerHTML='<div class="gcard gitemcard" role="dialog" aria-label="'+esc2(head)+'">'+
    '<div class="gitemicons">'+list.map(function(x){
      return '<div class="gitemone"><div class="gitemglow">'+itemIcon(x.item,64)+"</div>"+
        "<b>"+esc2(ITEMS[x.item].n)+(x.n>1?" ×"+x.n:"")+"</b>"+
        (x.why.length?"<u>"+esc2(x.why.join(" · "))+"</u>":"")+"</div>";
    }).join("")+"</div>"+
    '<p class="gitemhead" id="gItemHead"></p>'+
    '<p class="gitemsub">Put away in your Bag.</p>'+
    '<button class="gbtn" id="gItemOk">OK</button></div>';
  fxHost().appendChild(h);
  var hd=h.querySelector("#gItemHead");
  if(window.MLPixel&&window.MLPixel.on()&&window.MLPixel.typeOut) window.MLPixel.typeOut(hd, head);
  else hd.textContent=head;
  var ok=h.querySelector("#gItemOk");
  ok.onclick=function(){ h.remove(); paint(); if(itemQ.length) setTimeout(flushItems,200); else tryPendingSoon(); };
  setTimeout(function(){ try{ ok.focus({preventScroll:true}) }catch(e){} },60);
}
function tryPendingSoon(){ setTimeout(function(){ tryPending(); flushItems(); }, 500); }

/* ---- prizes and missions ---- */
function showMission(m){
  var mon=byUid(m.who); if(!mon) return;
  var h=document.createElement("div");
  h.className="gpop mission";
  h.innerHTML=monImg(mon)+"<div><b>"+esc2(nameOf(mon))+"</b><span>"+esc2(m.text)+"</span></div>";
  fxHost().appendChild(h);
  setTimeout(function(){ h.remove() },5200);
}

/* ---- one pokemon ---- */
function openMon(m){
  if(!m) return;
  var st=statsOf(m), d=DEX.mon[m.s], onBench=G.party.indexOf(m.u)>=0;
  var body='<div class="gmon">'+monImg(m,"big")+
    '<h3>'+esc2(nameOf(m))+(m.shiny?' <em>✦</em>':"")+"</h3>"+
    '<p class="gt">'+d.t.map(function(t){return '<span class="ty t-'+t+'">'+t+"</span>"}).join("")+
      " · Lv "+m.lvl+"</p>"+
    hpBar(m)+'<p class="gsub">'+m.hp+" / "+m.max+" hp</p>"+
    '<div class="gxp small"><i style="width:'+barPct(m.xp,xpNeed(m.lvl))+'%"></i></div>'+
    '<p class="gsub">'+m.xp+" / "+xpNeed(m.lvl)+" xp to level "+(m.lvl+1)+"</p>"+
    '<div class="gstats">'+
      [["Atk",st.atk],["Def",st.def],["SpA",st.spa],["SpD",st.spd],["Spe",st.spe]].map(function(x){
        return "<div><u>"+x[0]+"</u><b>"+x[1]+"</b></div>"}).join("")+"</div>"+
    '<div class="gmoves">'+m.moves.map(function(mv){
      var dd=DEX.mv[mv];
      return "<div><b>"+esc2(moveLabel(mv))+"</b><u>"+(dd?dd[0]+" · "+(dd[1]||"—"):"")+"</u></div>";
    }).join("")+"</div>"+
    '<div class="grow2">'+
      '<button class="gbtn ghost" id="grename">Rename</button>'+
      '<button class="gbtn ghost" id="gbench">'+(onBench?"Send to PC":"Put on bench")+"</button>"+
    "</div>"+
    (has("rarecandy")?'<button class="gbtn" id="gcandy" style="margin-top:8px">Use a Rare Candy ('+G.items.rarecandy+")</button>":"")+
    (m.hp<m.max&&has("potion")?'<button class="gbtn ghost" id="gpotion" style="margin-top:8px">Use a Potion</button>':"")+
    (m.hp<=0&&has("revive")?'<button class="gbtn ghost" id="grevive" style="margin-top:8px">Use a Revive</button>':"")+
  "</div>";
  openSheet(nameOf(m), body, function(){
    document.getElementById("grename").onclick=function(){ closeSheet(); openNickname(m) };
    document.getElementById("gbench").onclick=function(){
      if(onBench) G.party=G.party.filter(function(u){return u!==m.u});
      else{ if(G.party.length>=6){ toast("The bench only holds six"); return } G.party.push(m.u) }
      save(); closeSheet(); render(); paint();
    };
    var c=document.getElementById("gcandy");
    if(c) c.onclick=function(){ take("rarecandy",1); giveMonXp(m,xpNeed(m.lvl)-m.xp);
      save(); closeSheet(); toast(nameOf(m)+" grew to level "+m.lvl); render(); paint(); };
    var po=document.getElementById("gpotion");
    if(po) po.onclick=function(){ take("potion",1); m.hp=Math.min(m.max,m.hp+ITEMS.potion.heal);
      save(); closeSheet(); toast("Restored "+ITEMS.potion.heal+" hp"); render(); paint(); };
    var rv=document.getElementById("grevive");
    if(rv) rv.onclick=function(){ take("revive",1); m.hp=Math.ceil(m.max/2);
      save(); closeSheet(); toast(nameOf(m)+" is back on its feet"); render(); paint(); };
  });
}

/* ---- the PC ---- */
function pcHTML(){
  if(!G.started) return '<div class="empty">Pick a starter first.</div>';
  if(!DEX) return '<div class="empty">Loading the dex…</div>';
  var p=party(), stored=G.box.filter(function(m){return G.party.indexOf(m.u)<0});
  var items=Object.keys(G.items).filter(function(k){return G.items[k]>0});
  return '<div class="head"><h1>PC</h1><p>'+G.box.length+" caught · "+
      Object.keys(G.caught).length+" species · "+Object.keys(G.seen).length+" seen</p></div>"+
    '<div class="sectlab">Bench ('+p.length+"/6)</div>"+
    '<div class="card gbox">'+(p.length?p.map(function(m){
      return '<button class="gcell'+(m.hp<=0?" ko":"")+'" data-mon="'+m.u+'">'+monImg(m)+
        "<b>"+esc2(nameOf(m))+"</b><u>Lv "+m.lvl+"</u>"+hpBar(m)+"</button>";
    }).join(""):'<p class="note" style="margin:0">Nothing on the bench.</p>')+"</div>"+
    '<div class="sectlab">Stored</div>'+
    '<div class="card gbox">'+(stored.length?stored.map(function(m){
      return '<button class="gcell" data-mon="'+m.u+'">'+monImg(m)+
        "<b>"+esc2(nameOf(m))+"</b><u>Lv "+m.lvl+"</u></button>";
    }).join(""):'<p class="note" style="margin:0">Nothing stored yet.</p>')+"</div>"+
    '<div class="sectlab">Bag</div>'+
    '<div class="card">'+(items.length?items.map(function(k){
      return '<div class="row gbagrow">'+itemIcon(k,30)+'<div class="main"><div class="nm">'+esc2(ITEMS[k].n)+"</div></div>"+
        '<div class="rt"><div class="mins">'+G.items[k]+"</div></div></div>";
    }).join(""):'<p class="note" style="margin:0">Empty.</p>')+"</div>"+
    '<div class="sectlab">Trainer</div>'+
    '<div class="big">'+
      '<div class="stat"><div class="v">'+G.player.lvl+'</div><div class="k">trainer level</div></div>'+
      '<div class="stat"><div class="v">x'+G.mult.toFixed(2)+'</div><div class="k">daily xp multiplier</div></div>'+
    "</div>"+
    '<div class="card"><span class="lab">How this works</span><p class="note" style="margin:0">'+
      "Your pokemon gain experience by battling and by doing what they ask. You gain trainer "+
      "experience by looking after yourself: logging in the right meal window, hitting goals, "+
      "drinking water. Fainted pokemon only recover when you hit all four macro goals in a day."+
      "</p></div>"+
    '<div class="sectlab">Look</div>'+
    '<div class="card"><div class="chips" id="gtheme">'+
      [["modern","Modern"],["gba","Handheld"],["pixel","Emerald"],["shamu","Shamu"]].map(function(t){
        return '<button data-theme="'+t[0]+'" aria-pressed="'+(G.theme===t[0])+'">'+t[1]+"</button>";
      }).join("")+"</div>"+
      '<p class="note">Handheld is a plain retro pass. <b>Emerald</b> is the full design: the boxes, '+
      "buttons and battle screen drawn from the art sheet, with text that types itself out. "+
      "<b>Shamu</b> is the original orange and blue one, with the whale, the gator and the geese. "+
      "Switch any time \u2014 nothing about your data changes.</p></div>";
}
function bindPC(el){
  el.querySelectorAll("[data-mon]").forEach(function(b){
    b.onclick=function(){ openMon(byUid(+b.dataset.mon)) };
  });
  el.querySelectorAll("[data-theme]").forEach(function(b){
    b.onclick=function(){ G.theme=b.dataset.theme; save(); applyTheme(); render(); };
  });
}
var THEMES={gba:1,pixel:1,shamu:1,modern:1};
/* The Shamu look already exists as a handed-out skin, so the theme reuses its
   stylesheet and script rather than duplicating them. They are fetched once,
   the first time anyone picks it. */
var shamuLoaded=false;
function loadShamu(){
  if(shamuLoaded) return;
  shamuLoaded=true;
  var l=document.createElement("link");
  l.rel="stylesheet"; l.href="shamu/shamu.css"; document.head.appendChild(l);
  var sc=document.createElement("script");
  sc.src="shamu/shamu.js"; sc.defer=true; document.head.appendChild(sc);
}
function applyTheme(){
  var t=THEMES[G.theme]?G.theme:"modern";
  document.documentElement.setAttribute("data-game-theme", t);
  if(t==="shamu"){
    loadShamu();
    document.documentElement.setAttribute("data-skin","shamu");
  }else if(document.documentElement.getAttribute("data-skin")==="shamu"
           && !/[?&]skin=shamu/.test(location.search)){
    /* leave the handed-out link alone; only undo what the theme set */
    document.documentElement.removeAttribute("data-skin");
  }
}

/* ---- boot ---- */
function boot(){
  if(typeof S==="undefined"||typeof render!=="function"){ return setTimeout(boot,60) }
  G=load(); applyTheme();
  dex().then(function(){
    /* the tab */
    var nav=document.querySelector(".tabbar>div");
    if(nav && !document.getElementById("navpc")){
      var b=document.createElement("button"); b.id="navpc";
      b.innerHTML='<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/>'+
        '<path d="M8 21h8M12 17v4"/></svg>PC';
      nav.appendChild(b);
      nav.style.gridTemplateColumns="repeat("+nav.children.length+",1fr)";
      b.onclick=function(){ S.view="pc"; window.scrollTo(0,0); render() };
    }
    /* views */
    var _render=window.render;
    window.render=function(){
      if(S.view==="pc"){
        ["day","meals","pasta","goals"].forEach(function(v){
          var n=document.getElementById("nav"+v); if(n) n.setAttribute("aria-current","false");
        });
        var pc=document.getElementById("navpc"); if(pc) pc.setAttribute("aria-current","true");
        var el=document.getElementById("screen");
        el.innerHTML=pcHTML(); bindPC(el);
        var fab=document.getElementById("fab"); if(fab) fab.hidden=true;
        return;
      }
      var pc2=document.getElementById("navpc"); if(pc2) pc2.setAttribute("aria-current","false");
      _render.apply(this,arguments);
      paint();
    };
    /* hooks */
    var _saveDay=window.saveDay;
    window.saveDay=function(){ _saveDay.apply(this,arguments); try{ scanEntries() }catch(e){} };
    if(typeof window.saveWater==="function"){
      var _sw=window.saveWater;
      window.saveWater=function(){ _sw.apply(this,arguments); try{ hookWater() }catch(e){} };
    }
    if(typeof window.closeSheet==="function"){
      var _cs=window.closeSheet;
      window.closeSheet=function(){ _cs.apply(this,arguments); tryPendingSoon(); };
    }
    if(typeof window.lookupBarcode==="function"){
      var _lb=window.lookupBarcode;
      window.lookupBarcode=function(){ try{ hookScan() }catch(e){} return _lb.apply(this,arguments) };
    }
    Object.keys(S.days||{}).forEach(function(d){
      (S.days[d]||[]).forEach(function(e){ if(e.id) lastSeen[e.id]=1 });
    });
    rollDay();
    setTimeout(tryPending, 1500);        /* an encounter owed from last time */
    if(!G.started) openStarter(); else { render(); paint();
      setTimeout(function(){ if(Math.random()<0.5) newMission() }, 9000); }
    setInterval(function(){ if(G.started&&Math.random()<0.25) newMission() }, 240000);
  }).catch(function(){ /* no dex, no game; the tracker is untouched */ });
}
boot();
})();
