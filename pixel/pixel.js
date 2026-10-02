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

var G=function(){ return window.MLGame };
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]}); }
/* The battle itself now lives in game.js, one screen for every theme with the
   same animations; this theme only restyles it (pixel.css, .gbattle.px). */

/* =================== the four bespoke screens =================== */
function phone(cls, headHTML, bodyHTML){
  var host=document.getElementById("gameFx")||document.body;
  var wrap=document.createElement("div");
  wrap.className="pxscreen";
  wrap.innerHTML='<div class="pxphone">'+
    '<div class="pxhead"><span>Macro<em>Ledger</em></span></div>'+
    '<div class="pxscene '+cls+'">'+bodyHTML+"</div></div>";
  host.appendChild(wrap);
  return wrap;
}
function box(text,id){
  return '<div class="pxbox"><span class="t"'+(id?' id="'+id+'"':"")+'></span>'+
         '<span class="cursor"></span></div>';
}

/* 01 — the first thing anyone sees */
var WELCOME="Welcome to MacroLedger!\n\nTrack your nutrition.\nTrain your body.\nBuild a stronger you!";
function welcome(done){
  var w=phone("welcome","",box("","pxWelT"));
  var t=w.querySelector("#pxWelT");
  t.style.whiteSpace="pre-line";
  var typed=false;
  typeOut(t, WELCOME, function(){ typed=true });
  /* first tap finishes the text, second moves on */
  w.addEventListener("click",function(){
    if(!typed){ if(t.__skip) t.__skip(); return }
    w.remove(); if(done) done();
  });
  return w;
}

/* 02 — the starter picker, three framed cards over the overworld */
function starter(list, onPick){
  var g=G();
  var w=phone("starter","",
    box("Pick your first pokemon!","pxStA")+
    '<div class="pxcards">'+list.map(function(s){
      return '<button class="pxcard" data-s="'+s+'"><img src="'+g.sprite(s)+'" alt="">'+
             "<b>"+g.pretty(s)+"</b></button>";
    }).join("")+"</div>"+
    box("It joins your bench.\nLook after yourself\nand it grows.","pxStB"));
  w.querySelector("#pxStB").style.whiteSpace="pre-line";
  typeOut(w.querySelector("#pxStA"),"Pick your first pokemon!",function(){
    typeOut(w.querySelector("#pxStB"),"It joins your bench.\nLook after yourself\nand it grows.");
  });
  w.querySelectorAll("[data-s]").forEach(function(b){
    b.onclick=function(){
      w.querySelectorAll(".pxcard").forEach(function(c){c.classList.remove("on")});
      b.classList.add("on");
      setTimeout(function(){ w.remove(); onPick(b.dataset.s) },260);
    };
  });
  return w;
}

/* 08 — a real keypad instead of a prompt box */
function keypad(onDone){
  var val="";
  var w=phone("","",
    box("Enter barcode manually","pxKpT")+
    '<div class="pxread" id="pxKpV"><span class="caret">|</span></div>'+
    '<div class="pxpad" id="pxKp">'+
      [1,2,3,4,5,6,7,8,9].map(function(n){return "<button data-k='"+n+"'>"+n+"</button>"}).join("")+
      "<button data-k='back'>&#8592;</button><button data-k='0'>0</button>"+
      "<button class='ok' data-k='ok'>OK</button>"+
    "</div>"+
    '<button class="btn" id="pxKpX">Cancel</button>');
  w.querySelector(".pxscene").style.justifyContent="flex-end";
  typeOut(w.querySelector("#pxKpT"),"Enter barcode manually");
  var read=w.querySelector("#pxKpV");
  function paint(){ read.innerHTML=esc(val)+'<span class="caret">|</span>' }
  w.querySelectorAll("[data-k]").forEach(function(b){
    b.onclick=function(){
      var k=b.dataset.k;
      if(k==="back") val=val.slice(0,-1);
      else if(k==="ok"){ w.remove(); onDone(val); return }
      else if(val.length<14) val+=k;
      paint();
    };
  });
  w.querySelector("#pxKpX").onclick=function(){ w.remove(); onDone(null) };
  return w;
}
window.MLPixelDay={html:pxDay,bind:bindPxDay};
window.MLPixelScreens={welcome:welcome, starter:starter, keypad:keypad, phone:phone, box:box};

/* =================== the day screen, rebuilt to the sheet ===================
   Not a restyle of the existing markup -- the sheet's layout is genuinely
   different: a party slot, a dark KCAL panel, dark macro rows with coloured
   dots, and a menu box where the app had segment tabs. */
var MEALS=["Breakfast","Lunch","Dinner","Snacks"];
function pxDay(){
  var t=totals(), g=goal(0), left=g-t[0], over=left<0;
  var d=parseKey(S.date), today=new Date(); today.setHours(0,0,0,0);
  var lead=G()&&G().state().started?G().party()[0]:null;
  var counts={}; MEALS.forEach(function(m){ counts[m]=0 });
  (entries()||[]).forEach(function(e){ if(counts[e.meal]!==undefined) counts[e.meal]++ });
  var macro=[[1,"PROTEIN","p"],[2,"CARBS","c"],[3,"FAT","f"]];

  return '<div class="pxday">'+
    '<div class="pxdate">'+esc(d.toLocaleDateString(undefined,{weekday:"short"}))+", "+
      esc(d.toLocaleDateString(undefined,{month:"short"}))+" "+d.getDate()+"</div>"+
    (lead?'<div class="pxslot"><img src="'+G().sprite(lead.s)+'" alt="">'+
      '<div class="pxslotmain"><div class="pxslotname"><span>'+esc(G().nameOf(lead))+
        "</span><span>Lv "+lead.lvl+"</span></div>"+
      '<div class="hpline"><span class="hplab">HP</span>'+
        '<div class="hpb"><i style="width:'+G().barPct(lead.hp,lead.max)+'%"></i></div></div>'+
      "</div></div>":"")+
    '<div class="pxkcal"><div class="pxbig">'+fmt(t[0])+"<small>KCAL</small></div>"+
      '<div class="pxrem"><b class="'+(over?"over":"")+'">'+fmt(Math.abs(left))+"</b>"+
      "<span>"+(over?"over":"remaining")+"</span></div></div>"+
    '<div class="pxmac">'+macro.map(function(m){
      return '<button class="pxmacrow" data-nut="'+m[0]+'">'+
        '<i class="dot '+m[2]+'"></i><b class="'+m[2]+'">'+m[1]+"</b>"+
        "<span>"+fmt(t[m[0]],1)+" / "+fmt(goal(m[0]))+"g</span></button>";
    }).join("")+"</div>"+
    '<div class="pxmenu" id="pxDayMenu">'+
      [["log","Log"],["micro","Micronutrients"],["water","Water"]].map(function(x){
        return '<button data-tab="'+x[0]+'" class="'+(S.tab===x[0]?"on":"")+'">'+x[1]+"</button>";
      }).join("")+"</div>"+
    (S.tab==="log"
      ? '<div class="pxlist">'+MEALS.map(function(m){
          return '<button class="pxmeal" data-meal="'+m+'"><i class="mi '+m.toLowerCase()+'"></i>'+
            "<b>"+m+"</b><span>"+counts[m]+"</span></button>";
        }).join("")+"</div>"+
        '<button class="pxadd" id="pxAdd"><span>+</span> Add food<i class="tri"></i></button>'
      : '<div class="pxpanel">'+(S.tab==="micro"?microHTML():waterHTML())+"</div>")+
  "</div>";
}
function bindPxDay(el){
  el.querySelectorAll("[data-tab]").forEach(function(b){
    b.onclick=function(){ S.tab=b.dataset.tab; render() };
  });
  el.querySelectorAll("[data-nut]").forEach(function(b){
    b.onclick=function(){ openContributors(+b.dataset.nut) };
  });
  el.querySelectorAll("[data-meal]").forEach(function(b){
    b.onclick=function(){ openSearch({mode:"log",meal:b.dataset.meal}) };
  });
  var a=el.querySelector("#pxAdd");
  if(a) a.onclick=function(){ openSearch({mode:"log",meal:mealOfNow()}) };
  /* the sub-panels keep their own wiring */
  if(S.tab==="water"&&typeof bindWater==="function") bindWater(el);
  el.querySelectorAll("[data-entry]").forEach(function(b){
    b.onclick=function(){ openEntry(b.dataset.entry) };
  });
}

/* ---------- wire in without replacing anything permanently ---------- */
function hook(){
  if(!window.MLGame||!window.MLGame.state){ return setTimeout(hook,80) }
  var g=window.MLGame;
  /* the day screen is rebuilt rather than restyled */
  var _r=window.render;
  window.render=function(){
    _r.apply(this,arguments);
    if(!ON()) return;
    var day=document.getElementById("navday");
    if(day && day.getAttribute("aria-current")==="true"){
      var el=document.getElementById("screen");
      if(el && !el.querySelector(".pxday")){ el.innerHTML=pxDay(); bindPxDay(el) }
    }
  };
  if(ON()) window.render();
}
window.MLPixel={typeOut:typeOut, dialog:dialog, on:ON, speed:function(n){SPEED=n}};
hook();
})();
