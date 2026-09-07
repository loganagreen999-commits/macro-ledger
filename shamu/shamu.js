/* Shamu Stopper — levels, experience, and one silly goose.
   Loaded only when the page was opened with ?skin=shamu. It never edits the
   app's own code: it wraps render() and saveDay(), both global function
   declarations, and decorates afterwards. */
(function(){
  "use strict";
  var A="shamu/", LS="ml.shamu";
  var st=load();

  function load(){
    try{ var v=JSON.parse(localStorage.getItem(LS)); if(v&&typeof v==="object")return fill(v) }catch(e){}
    return fill({});
  }
  function fill(v){
    return {xp:+v.xp||0, level:Math.max(1,+v.level||1), best:Math.max(1,+v.best||v.level||1),
            counted:v.counted||{}, closed:v.closed||{}, banner:v.banner||null};
  }
  function save(){ try{ localStorage.setItem(LS,JSON.stringify(st)) }catch(e){} }

  /* ---- the curve. The first few are a formality; later ones are not. ---- */
  function need(L){ return Math.round(22*Math.pow(L,1.55)); }

  /* ---- how good was that, then ----
     Built from the same 18-slot vector every food in the app already carries.  */
  function score(e){
    var n=e.n||[], q=e.qty||1, g=function(i){ return (n[i]||0)*q; };
    var kcal=g(0)||1;
    var per=function(i){ return g(i)/kcal*100; };            /* per 100 kcal */
    var s=0;
    s += Math.min(6, per(1)*0.55);        /* protein density */
    s += Math.min(5, per(4)*1.7);         /* fibre */
    s -= Math.min(6, per(6)*1.1);         /* saturated fat */
    s -= Math.min(5, per(5)*0.16);        /* sugars */
    s -= Math.min(5, g(7)/kcal*100*0.09); /* sodium per 100 kcal */
    /* a little credit for actually carrying micronutrients */
    var micro=[8,9,10,11,12,13,14,15,16].reduce(function(a,i){ return a+(g(i)>0?1:0) },0);
    s += Math.min(2, micro*0.25);
    if(kcal<25) s*=0.35;                  /* a stick of gum is not a triumph */
    return Math.max(-9, Math.min(9, s));
  }

  function award(pts, why){
    if(!pts) return;
    st.xp += pts;
    var moved=0;
    while(st.xp >= need(st.level)){ st.xp-=need(st.level); st.level++; moved=1; }
    while(st.xp < 0){
      if(st.level<=1){ st.xp=0; break; }
      st.level--; st.xp += need(st.level); moved=-1;
    }
    if(st.level>st.best) st.best=st.level;
    save();
    if(moved) show(moved>0?"up":"down", why);
    else paintHud();
  }

  /* ---- yesterday, judged once ---- */
  function closeDays(){
    if(typeof S==="undefined"||!S.days) return;
    var now=new Date(), keys=Object.keys(S.days);
    var todayK=dkey(now);
    keys.concat(Object.keys(st.closed)).forEach(function(k){});
    /* look back a week for days that were never scored */
    for(var i=1;i<=7;i++){
      var d=new Date(now); d.setDate(d.getDate()-i);
      var k=dkey(d);
      if(st.closed[k]) continue;
      var list=S.days[k];
      var kcalGoal=(typeof goal==="function")?goal(0):0;
      if(!list||!list.length){
        st.closed[k]=1; save(); award(-14,"missed"); return;      /* one at a time */
      }
      var t=totals(list), pen=0;
      if(kcalGoal>0 && t[0]<=kcalGoal*1.05) pen+=10;               /* stayed under */
      if(goal(1)>0 && t[1]>=goal(1)*0.9)   pen+=10;                /* hit protein */
      if(goal(4)>0 && t[4]>=goal(4)*0.8)   pen+=5;                 /* ate some fibre */
      st.closed[k]=1; save();
      if(pen) { award(pen,"day"); return; }
    }
  }

  /* ---- the takeover ---- */
  var CAST={ up:{from:"down",to:"up"}, down:{from:"down",to:"up"} };
  function show(dir, why){
    var host=document.getElementById("shamuFx");
    if(!host) return;
    var beast=(st.level%2===0)?"whale":"gator";
    var arrow='<svg class="arrow" viewBox="0 0 100 40"><path d="M2 20h74M60 4l20 16-20 16" '+
      'fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    host.innerHTML=
      '<div class="slv '+dir+'"><div class="panel">'+
        '<figure><img src="'+A+'down-'+beast+'.png" alt=""><figcaption>before</figcaption></figure>'+
        arrow+
        '<figure><img src="'+A+'up-'+beast+'.png" alt=""><figcaption>after</figcaption></figure>'+
        '<div class="bolt"></div>'+
        '<div class="banner">'+(dir==="up"?"LEVEL "+st.level:"LEVEL "+st.level)+'</div>'+
        '<div class="sub">'+(dir==="up"
            ? "Shamu stopped. "+(why==="day"?"You hit your goals.":"Keep eating like that.")
            : (why==="missed"?"You skipped a day.":"That one cost you."))+"</div>"+
      "</div></div>";
    try{ if(navigator.vibrate) navigator.vibrate(dir==="up"?[40,50,90]:[140,70,140]) }catch(e){}
    clearTimeout(show.t);
    show.t=setTimeout(function(){ host.innerHTML=""; paintHud(); }, 3000);
  }

  /* ---- one silly goose ---- */
  var actx=null, honkBuf=null;
  function audioUp(){
    try{
      actx=actx||new (window.AudioContext||window.webkitAudioContext)();
      if(actx.state==="suspended") actx.resume();
      if(!honkBuf && actx){
        fetch(A+"honk.mp3").then(function(r){return r.arrayBuffer()})
          .then(function(b){ return actx.decodeAudioData(b) })
          .then(function(buf){ honkBuf=buf }).catch(function(){});
      }
    }catch(e){ actx=null }
  }
  /* every honk is its own source node, so they pile on top of each other
     instead of cutting the last one off */
  function honk(n){
    for(var i=0;i<n;i++){
      (function(i){
        setTimeout(function(){
          if(honkBuf&&actx){
            var s=actx.createBufferSource(), g=actx.createGain();
            s.buffer=honkBuf;
            s.playbackRate.value=0.82+Math.random()*0.55;
            g.gain.value=0.5;
            s.connect(g); g.connect(actx.destination);
            try{ s.start() }catch(e){}
          }else{
            var a=new Audio(A+"honk.mp3");        /* fallback: clones also stack */
            a.volume=0.5; a.play().catch(function(){});
          }
        }, i*115+Math.random()*70);
      })(i);
    }
  }
  function goose(){
    audioUp();
    var host=document.getElementById("shamuFx");
    if(!host) return;
    var h='<div class="sgoose">', i;
    for(i=0;i<26;i++){
      h+='<img src="'+A+'goose.png" alt="" style="left:'+(Math.random()*88)+
         '%;top:'+(Math.random()*82)+'%;--r:'+(Math.random()*60-30)+
         'deg;animation-delay:'+(Math.random()*0.5).toFixed(2)+'s">';
    }
    for(i=0;i<10;i++){
      h+='<span class="honkword" style="left:'+(Math.random()*78)+'%;top:'+(Math.random()*80)+
         '%;font-size:'+(20+Math.random()*30).toFixed(0)+'px;animation-delay:'+
         (Math.random()*0.7).toFixed(2)+'s">HONK</span>';
    }
    host.innerHTML=h+"</div>";
    honk(14);
    try{ if(navigator.vibrate) navigator.vibrate([60,40,60,40,60,40,120]) }catch(e){}
    clearTimeout(goose.t);
    goose.t=setTimeout(function(){ host.innerHTML=""; }, 4200);
  }
  /* the trigger list. Matches the name or the brand, so any brand's honey bun counts. */
  var SILLY=/honey\s*bun|eggo/i;
  function isSilly(e){ return SILLY.test((e.name||"")+" "+(e.brand||"")); }

  /* ---- decoration after every render ---- */
  function paintHud(){
    var hud=document.getElementById("shamuHud");
    if(!hud) return;
    var nx=need(st.level), pct=Math.max(0,Math.min(100, st.xp/nx*100));
    hud.innerHTML=
      '<div class="lvl"><b>'+st.level+"</b><u>level</u></div>"+
      '<div class="xw"><div class="xtop"><span>'+Math.round(st.xp)+" / "+nx+" xp</span>"+
        "<span>best "+st.best+"</span></div>"+
        '<div class="xbar"><i style="width:'+pct+'%"></i></div></div>'+
      '<img class="pals" src="'+A+'holdinghands.png" alt="">';
  }
  function decorate(){
    var mark=document.querySelector(".top .mark");
    if(mark && !mark.querySelector("img"))
      mark.innerHTML='<img src="'+A+'logo.png" alt="Shamu Stopper">';
    var app=document.querySelector(".app"), top=document.querySelector(".top");
    if(app && top && !document.getElementById("shamuHud")){
      var hud=document.createElement("div");
      hud.className="shud"; hud.id="shamuHud";
      top.parentNode.insertBefore(hud, top.nextSibling);
    }
    paintHud();
    if(!document.getElementById("shamuFx")){
      var fx=document.createElement("div"); fx.id="shamuFx"; document.body.appendChild(fx);
    }
    /* the pasta tab turns pink */
    var pasta=document.getElementById("navpasta");
    document.documentElement.setAttribute("data-pp",
      pasta && pasta.getAttribute("aria-current")==="true" ? "1" : "0");
    /* the mirror belongs on goals */
    var goals=document.getElementById("navgoals");
    if(goals && goals.getAttribute("aria-current")==="true"){
      var scr=document.getElementById("screen");
      if(scr && !scr.querySelector(".smirror")){
        var img=document.createElement("img");
        img.className="smirror"; img.src=A+"mirror.png"; img.alt="";
        scr.insertBefore(img, scr.firstChild);
      }
    }
  }

  /* ---- hook the app without touching it ---- */
  function hook(){
    if(typeof window.render!=="function"||typeof window.saveDay!=="function"){
      return setTimeout(hook,60);
    }
    var _render=window.render;
    window.render=function(){ _render.apply(this,arguments); decorate(); };

    var _saveDay=window.saveDay;
    window.saveDay=function(){
      _saveDay.apply(this,arguments);
      try{ judge() }catch(e){}
    };
    decorate();
    closeDays();
  }
  /* score anything logged that has not been scored before */
  function judge(){
    if(typeof S==="undefined"||!S.days) return;
    var pts=0, silly=false;
    Object.keys(S.days).forEach(function(k){
      (S.days[k]||[]).forEach(function(e){
        if(!e.id||st.counted[e.id]) return;
        st.counted[e.id]=1;
        pts+=score(e);
        if(isSilly(e)) silly=true;
      });
    });
    save();
    if(silly) goose();
    if(pts) award(Math.round(pts*10)/10,"food");
    else paintHud();
  }
  /* any tap unlocks audio for later, iOS insists */
  document.addEventListener("pointerdown",function once(){ audioUp();
    document.removeEventListener("pointerdown",once); }, {once:true});

  window.shamu={state:function(){return st}, need:need, score:score, award:award,
                goose:goose, show:show, isSilly:isSilly, judge:judge, reset:function(){
                  st=fill({}); save(); paintHud(); }};
  hook();
})();
