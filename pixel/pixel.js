/* =====================================================================
   Pixel theme behaviour: text that types itself out the way it does in
   the games, and a battle screen laid out from the design sheet.
   Everything is additive — turning the theme off restores the original
   screens untouched, because nothing here replaces the app's own code
   except while data-game-theme="pixel" is set.
   ===================================================================== */
(function(){
"use strict";
var ON=function(){ return document.documentElement.getAttribute("data-game-theme")==="pixel" };

/* ---------- the typewriter ----------
   Steps a character at a time, skips to the end on a tap, and reports
   when it has finished so the arrow can stop blinking and start bobbing. */
var SPEED=22;
function typeOut(el, text, done){
  if(!el) return;
  var full=String(text||""), i=0, timer=null, finished=false;
  el.textContent="";
  var cur=el.parentNode&&el.parentNode.querySelector(".cursor");
  if(cur) cur.classList.remove("done");
  function finish(){
    if(finished) return;
    finished=true; clearInterval(timer); el.textContent=full;
    if(cur) cur.classList.add("done");
    if(done) done();
  }
  timer=setInterval(function(){
    i++; el.textContent=full.slice(0,i);
    if(i>=full.length) finish();
  }, SPEED);
  el.__skip=finish;
  return finish;
}
function dialog(text, opts){
  opts=opts||{};
  var box=document.createElement("div");
  box.className="pxbox";
  box.innerHTML='<span class="t"></span><span class="cursor"></span>';
  var t=box.querySelector(".t");
  box.addEventListener("click",function(){ if(t.__skip) t.__skip() });
  if(opts.mount) opts.mount.appendChild(box);
  typeOut(t, text, opts.done);
  return box;
}

/* ---------- battle, drawn to the sheet's layout ---------- */
var G=function(){ return window.MLGame };
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]}); }

function infoBox(m, who, showNums){
  var g=G(), p=g.barPct(m.hp,m.max);
  return '<div class="pxinfo '+who+'">'+
    '<div class="nm"><span>'+esc(g.nameOf?g.nameOf(m):m.s)+"</span><span>Lv "+m.lvl+"</span></div>"+
    '<div class="hpline"><span class="hplab">HP</span>'+
      '<div class="hpb"><i class="'+(p<25?"low":p<55?"mid":"")+'" style="width:'+p+'%"></i></div></div>'+
    (showNums?'<div class="num">'+m.hp+" / "+m.max+"</div>":"")+
  "</div>";
}
/* Update in place. Rebuilding the stage every turn wiped the attack animation
   the instant it started, and restarted the typewriter from scratch. */
function updatePixelBattle(){
  var g=G(), st=g.state(), e=st.enc;
  var stage=document.querySelector(".pxstage");
  if(!stage||!e) return false;
  var me=g.party().filter(function(x){return x.hp>0})[0];
  function setInfo(sel,m,nums){
    var box=stage.querySelector(sel); if(!box||!m) return;
    var p=g.barPct(m.hp,m.max), bar=box.querySelector(".hpb i");
    if(bar){ bar.style.width=p+"%";
      bar.className=(p<25?"low":p<55?"mid":""); }
    var n=box.querySelector(".num"); if(n&&nums) n.textContent=m.hp+" / "+m.max;
  }
  setInfo(".pxinfo.foe", e.mon, false);
  setInfo(".pxinfo.me", me, true);
  var line=e.log.length?e.log[e.log.length-1]:null;
  if(line && line!==stage.__line){ stage.__line=line; typeOut(document.getElementById("pxT"), line) }
  stage.querySelectorAll("[data-mv],[data-ball]").forEach(function(b){
    b.disabled = (e.turn!=="you");
  });
  return true;
}
function renderPixelBattle(){
  var g=G(); if(!g) return false;
  var st=g.state(), e=st.enc; if(!e) return false;
  var host=document.getElementById("gameFx"); if(!host) return false;
  if(updatePixelBattle()) return true;
  var me=g.party().filter(function(x){return x.hp>0})[0];
  var foe=e.mon;
  var balls=Object.keys(g.items).filter(function(k){return g.items[k].kind==="ball"&&g.has(k)});
  host.innerHTML='<div class="gbattle px"><div class="pxstage">'+
    '<div class="pxfield">'+
      infoBox(foe,"foe",false)+
      '<div class="pxfoe" id="pxFoe"><img src="'+g.sprite(foe.s)+'" alt=""></div>'+
      (me?infoBox(me,"me",true)+
          '<div class="pxme" id="pxMe"><img src="'+g.sprite(me.s)+'" alt=""></div>':"")+
    "</div>"+
    '<div class="pxtext"><div class="pxbox"><span class="t" id="pxT"></span>'+
      '<span class="cursor"></span></div></div>'+
    '<div class="pxmenuwrap"><div class="pxacts" id="pxActs">'+
      (me?me.moves.map(function(mv,i){
        return '<button data-mv="'+i+'">'+esc(g.pretty(mv))+"</button>" }).join("")
        :'<button disabled>No pokemon</button>')+
      balls.map(function(k){
        return '<button data-ball="'+k+'">'+esc(g.items[k].n)+" x"+st.items[k]+"</button>" }).join("")+
      '<button id="pxRun">Run</button>'+
    "</div></div>"+
  "</div></div>";
  var line=e.log.length?e.log[e.log.length-1]:("A wild "+g.pretty(foe.s)+" appeared!");
  typeOut(document.getElementById("pxT"), line);
  host.querySelectorAll("[data-mv]").forEach(function(b){
    b.onclick=function(){ lunge("pxMe"); g.playerMove(+b.dataset.mv) };
  });
  host.querySelectorAll("[data-ball]").forEach(function(b){
    b.onclick=function(){ throwBall(); g.tryCatch(b.dataset.ball) };
  });
  var r=document.getElementById("pxRun"); if(r) r.onclick=function(){ g.flee() };
  return true;
}
function lunge(id){
  var el=document.getElementById(id); if(!el) return;
  el.classList.add("attacking");
  setTimeout(function(){ el.classList.remove("attacking") },460);
  var other=document.getElementById(id==="pxMe"?"pxFoe":"pxMe");
  if(other){ setTimeout(function(){ other.classList.add("pxhurt");
    setTimeout(function(){ other.classList.remove("pxhurt") },420) },200); }
}
/* throw, wobble, then either open with a burst of stars or just vanish */
function throwBall(){
  var f=document.querySelector(".pxfield"); if(!f) return;
  var b=document.createElement("img");
  b.className="pxball"; b.src="pixel/pokeball.png";
  b.onerror=function(){ b.remove() };
  f.appendChild(b);
  var foe=document.getElementById("pxFoe");
  setTimeout(function(){ if(foe) foe.style.visibility="hidden" },700);
  setTimeout(function(){ b.classList.add("wobbling") },760);
  setTimeout(function(){
    var caught=!G().state().enc;                 /* the game has already decided */
    if(caught){
      b.src="pixel/pokeball-open.png";
      var st=document.createElement("img");
      st.className="pxburst"; st.src="pixel/star-burst.png";
      st.onerror=function(){ st.remove() };
      f.appendChild(st);
      setTimeout(function(){ st.remove(); b.remove() },900);
    }else{
      if(foe) foe.style.visibility="";
      b.remove();
    }
  },2300);
}

/* ---------- wire in without replacing anything permanently ---------- */
function hook(){
  if(!window.MLGame||!window.MLGame.state){ return setTimeout(hook,80) }
  var g=window.MLGame;
  var _render=g.renderBattle;
  /* the game calls its own renderBattle internally, so intercept at the
     surface the theme owns: watch for the battle appearing and restyle it */
  var host=document.getElementById("gameFx");
  if(!host){ host=document.createElement("div"); host.id="gameFx"; document.body.appendChild(host) }
  new MutationObserver(function(){
    if(!ON()) return;
    var st=g.state();
    if(st && st.enc && !host.querySelector(".pxstage")) renderPixelBattle();
  }).observe(host,{childList:true,subtree:false});
  /* the game re-renders after each turn; catch that and refresh in place */
  var poll=setInterval(function(){
    if(!ON()) return;
    var st=g.state();
    if(st && st.enc) updatePixelBattle();
  }, 160);
  window.addEventListener("pagehide",function(){ clearInterval(poll) });
  /* first paint, if a battle is already up when the theme is switched on */
  if(ON() && g.state() && g.state().enc) renderPixelBattle();
}
window.MLPixel={typeOut:typeOut, dialog:dialog, renderBattle:renderPixelBattle,
                update:updatePixelBattle,
                on:ON, speed:function(n){SPEED=n}};
hook();
})();
