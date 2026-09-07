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
  give(item,1);
  var extra=null;
  if(lvl%100===0){                       /* a century. something absurd. */
    if(Math.random()<0.5){ give("masterball",1); extra="masterball"; }
    else extra="mythic";
  }
  toast("Level "+lvl+" — got a "+ITEMS[item].n);
  showPrize(lvl,item,extra);
  if(extra==="mythic") setTimeout(function(){ startEncounter(pickSpecies(5), lvl) },1400);
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
  startEncounter(pickSpecies());
  return true;
}

/* ---------- battle ---------- */
function battleXp(foe, won){
  var base=DEX.mon[foe.s].s.reduce(function(a,b){return a+b},0);
  return Math.round(base*foe.lvl/220 * (won?1:0.4));
}
function afterBattle(gained, msg){
  /* whoever took the field earns it, fainted or not -- otherwise losing
     teaches nobody anything and the xp silently vanishes */
  var me=(G.enc && G.enc.active && byUid(G.enc.active)) || firstHealthy(), ups=0;
  if(me) ups=giveMonXp(me, gained);
  G.enc=null; save();
  closeBattle();
  toast(msg+(me?" — "+nameOf(me)+" +"+Math.round(gained)+" xp":""));
  if(ups) toast(nameOf(me)+" reached level "+me.lvl+"!");
  paint();
}
function playerMove(idx){
  var e=G.enc; if(!e||e.turn!=="you") return;
  var me=firstHealthy();
  if(me) e.active=me.u;
  if(!me){ afterBattle(0,"No pokemon able to fight"); return; }
  var mv=me.moves[idx]; if(!mv) return;
  var r=damage(me,e.mon,mv);
  e.mon.hp=Math.max(0,e.mon.hp-r.dmg);
  e.log.push(r.miss ? nameOf(me)+"'s "+moveLabel(mv)+" missed"
    : nameOf(me)+" used "+moveLabel(mv)+(r.e>1?" — super effective!":r.e===0?" — no effect":r.e<1?" — not very effective":"")+" ("+r.dmg+")");
  if(e.mon.hp<=0){ afterBattle(battleXp(e.mon,true), "Wild "+pretty(e.mon.s)+" fainted"); return; }
  e.turn="foe"; save(); renderBattle();
  setTimeout(foeMove, 700);
}
function foeMove(){
  var e=G.enc; if(!e) return;
  var me=firstHealthy();
  if(!me){ afterBattle(0,"Your team is out"); return; }
  var mv=e.mon.moves[Math.floor(Math.random()*e.mon.moves.length)];
  var r=damage(e.mon,me,mv);
  me.hp=Math.max(0,me.hp-r.dmg);
  e.log.push(r.miss ? "Wild "+pretty(e.mon.s)+"'s "+moveLabel(mv)+" missed"
    : "Wild "+pretty(e.mon.s)+" used "+moveLabel(mv)+" ("+r.dmg+")");
  if(me.hp<=0) e.log.push(nameOf(me)+" fainted");
  e.turn="you"; save();
  if(!firstHealthy()){ afterBattle(battleXp(e.mon,false),"Your team is out of it"); return; }
  renderBattle();
}
/* catch odds: the weaker and rarer it is, the more it matters which ball */
function tryCatch(ball){
  var e=G.enc; if(!e||!has(ball)) return;
  take(ball,1);
  var d=DEX.mon[e.mon.s], hpFrac=e.mon.hp/e.mon.max;
  var rarity=[1,.9,.75,.5,.3,.12][d.r];
  var p = ITEMS[ball].rate>=255 ? 1
        : Math.min(0.95, rarity*(1.1-hpFrac*0.7)*ITEMS[ball].rate*0.75);
  e.log.push("Threw a "+ITEMS[ball].n+"…");
  if(Math.random()<p){
    var caught=e.mon;
    G.box.push(caught); G.caught[caught.s]=1;
    if(G.party.length<6) G.party.push(caught.u);
    var xp=battleXp(caught,true);
    var me=(e.active&&byUid(e.active))||firstHealthy(); if(me) giveMonXp(me,xp);
    G.enc=null; save(); closeBattle();
    toast("Caught "+pretty(caught.s)+(caught.shiny?" ✦ SHINY":"")+"!");
    openNickname(caught);
    paint();
  }else{
    e.log.push("It broke free!");
    e.turn="foe"; save(); renderBattle(); setTimeout(foeMove,700);
  }
}
function flee(){
  var e=G.enc; if(!e) return;
  G.enc=null; save(); closeBattle(); toast("Got away safely"); paint();
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
      give(m.reward,1);
      if(mon) giveMonXp(mon, 26+G.player.lvl*2);
      toast((mon?nameOf(mon):"Your pokemon")+" is pleased — got a "+ITEMS[m.reward].n);
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
    give(roll(GOOD),1); give("ultraball",2);
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
    if(done && !hit[i]){ hit[i]=1; give("pokeball",1); got++;
      givePlayerXp(18,"hit a goal"); }
    if(!done) all=false;
  });
  if(got) toast("Goal met — "+got+" Poke Ball"+(got>1?"s":""));
  if(all && !hit.all){
    hit.all=1;
    healAll("every macro goal met");
    give("revive",1);
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
function hookRecipe(){ if(G.started){ givePlayerXp(25,"saved a recipe"); maybeEncounter(null,0.5) } }
function hookScan(){ if(G.started){ givePlayerXp(10,"scanned something"); maybeEncounter(null,0.4) } }

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
  strip.innerHTML=
    '<div class="gtop"><div class="gplv">Trainer <b>Lv '+G.player.lvl+"</b></div>"+
      '<div class="gmult">'+(G.streak>0?"day "+(G.streak+1)+" · x"+G.mult.toFixed(2)+" xp":"open daily for a multiplier")+"</div></div>"+
    '<div class="gxp"><i style="width:'+barPct(G.player.xp,need)+'%"></i></div>'+
    '<div class="gline">'+(p.length?p.map(function(m){
      return '<button class="gslot'+(m.hp<=0?" ko":"")+'" data-mon="'+m.u+'">'+
        monImg(m)+'<span class="glv">'+m.lvl+"</span>"+hpBar(m)+"</button>";
    }).join(""):'<span class="gnone">No pokemon on the bench</span>')+
    '<button class="gslot gpc" id="gotoPC">PC</button></div>';
  strip.querySelectorAll("[data-mon]").forEach(function(b){
    b.onclick=function(){ openMon(byUid(+b.dataset.mon)) };
  });
  var pc=strip.querySelector("#gotoPC");
  if(pc) pc.onclick=function(){ S.view="pc"; render(); };
}

/* ---- starter ---- */
var STARTERS=["bulbasaur","charmander","squirtle","chikorita","cyndaquil","totodile",
              "treecko","torchic","mudkip","turtwig","chimchar","piplup"];
function openStarter(){
  var pick=[], pool=STARTERS.slice();
  while(pick.length<3 && pool.length) pick.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
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

/* ---- battle screen ---- */
function openBattle(){
  if(window.MLPixel && window.MLPixel.on() && window.MLPixel.renderBattle()) return;
  renderBattle();
}
function closeBattle(){ fxHost().innerHTML=""; }
function renderBattle(){
  var e=G.enc; if(!e) return;
  if(window.MLPixel && window.MLPixel.on() && window.MLPixel.renderBattle()) return;
  var me=firstHealthy(), foe=e.mon;
  var balls=Object.keys(ITEMS).filter(function(k){return ITEMS[k].kind==="ball"&&has(k)});
  fxHost().innerHTML='<div class="gbattle">'+
    '<div class="bfield">'+
      '<div class="bfoe"><div class="bname">'+esc2(pretty(foe.s))+(foe.shiny?' <em>SHINY</em>':"")+
        ' <span>Lv '+foe.lvl+"</span></div>"+hpBar(foe)+monImg(foe,"big")+"</div>"+
      '<div class="bme">'+(me?monImg(me,"big me")+
        '<div class="bname">'+esc2(nameOf(me))+' <span>Lv '+me.lvl+"</span></div>"+hpBar(me)
        :'<div class="bname">No pokemon standing</div>')+"</div>"+
    "</div>"+
    '<div class="blog">'+(e.log.slice(-3).map(esc2).join("<br>")||"A wild "+esc2(pretty(foe.s))+" appeared!")+"</div>"+
    (me?"":'<div class="bwarn">Every pokemon you have is fainted. You can still throw a '+
      "ball or run &mdash; but nothing heals until you hit all four macro goals in a day.</div>")+
    '<div class="bacts">'+
      (me?me.moves.map(function(mv,i){
        var d=DEX.mv[mv];
        return '<button class="bmove" data-mv="'+i+'"'+(e.turn!=="you"?" disabled":"")+">"+
          esc2(moveLabel(mv))+"<u>"+(d?d[0]:"")+(d&&d[1]?" · "+d[1]:"")+"</u></button>";
      }).join(""):"")+
    "</div>"+
    '<div class="bballs">'+balls.map(function(k){
      return '<button class="bball" data-ball="'+k+'"'+(e.turn!=="you"?" disabled":"")+">"+
        esc2(ITEMS[k].n)+" <u>"+G.items[k]+"</u></button>";
    }).join("")+'<button class="bball flee" id="bflee">Run</button></div>'+
  "</div>";
  fxHost().querySelectorAll("[data-mv]").forEach(function(b){
    b.onclick=function(){ playerMove(+b.dataset.mv) };
  });
  fxHost().querySelectorAll("[data-ball]").forEach(function(b){
    b.onclick=function(){ tryCatch(b.dataset.ball) };
  });
  document.getElementById("bflee").onclick=flee;
}

/* ---- prizes and missions ---- */
function showPrize(lvl,item,extra){
  var h=document.createElement("div");
  h.className="gpop";
  h.innerHTML='<b>Level '+lvl+"</b><span>"+esc2(ITEMS[item].n)+
    (extra==="masterball"?" + MASTER BALL":extra==="mythic"?" + something stirs…":"")+"</span>";
  fxHost().appendChild(h);
  setTimeout(function(){ h.remove() },3200);
}
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
      return '<div class="row"><div class="main"><div class="nm">'+esc2(ITEMS[k].n)+"</div></div>"+
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
      [["modern","Modern"],["gba","Handheld"],["pixel","Shamu"]].map(function(t){
        return '<button data-theme="'+t[0]+'" aria-pressed="'+(G.theme===t[0])+'">'+t[1]+"</button>";
      }).join("")+"</div>"+
      '<p class="note">Handheld is a plain retro pass. <b>Shamu</b> is the full design: the boxes, '+
      "buttons and battle screen drawn from the art sheet, with text that types itself out. "+
      "Switch back any time \u2014 nothing about your data changes.</p></div>";
}
function bindPC(el){
  el.querySelectorAll("[data-mon]").forEach(function(b){
    b.onclick=function(){ openMon(byUid(+b.dataset.mon)) };
  });
  el.querySelectorAll("[data-theme]").forEach(function(b){
    b.onclick=function(){ G.theme=b.dataset.theme; save(); applyTheme(); render(); };
  });
}
var THEMES={gba:1,pixel:1,modern:1};
function applyTheme(){
  document.documentElement.setAttribute("data-game-theme", THEMES[G.theme]?G.theme:"modern");
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
    if(typeof window.saveRecipes==="function"){
      var _sr=window.saveRecipes;
      window.saveRecipes=function(){ _sr.apply(this,arguments); try{ hookRecipe() }catch(e){} };
    }
    if(typeof window.lookupBarcode==="function"){
      var _lb=window.lookupBarcode;
      window.lookupBarcode=function(){ try{ hookScan() }catch(e){} return _lb.apply(this,arguments) };
    }
    Object.keys(S.days||{}).forEach(function(d){
      (S.days[d]||[]).forEach(function(e){ if(e.id) lastSeen[e.id]=1 });
    });
    rollDay();
    if(!G.started) openStarter(); else { render(); paint();
      setTimeout(function(){ if(Math.random()<0.5) newMission() }, 9000); }
    setInterval(function(){ if(G.started&&Math.random()<0.25) newMission() }, 240000);
  }).catch(function(){ /* no dex, no game; the tracker is untouched */ });
}
boot();
})();
