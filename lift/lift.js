/* ===================================================================
   Lift — a deliberately small workout log. Pick a split or just train,
   record sets, and it feeds the collecting game: sessions level your
   pokemon, personal records pay the trainer.
   =================================================================== */
(function(){
"use strict";
var LS="ml.lift", L=null;

var SPLITS={
  ppl:{n:"Push / Pull / Legs", days:["Push","Pull","Legs"]},
  ul:{n:"Upper / Lower", days:["Upper","Lower"]},
  arnold:{n:"Arnold", days:["Chest & Back","Shoulders & Arms","Legs"]},
  fullbody:{n:"Full body", days:["Full body"]},
  custom:{n:"Custom", days:[]}
};
var WEEK=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function blank(){
  return {v:1, split:null, days:[], schedule:{}, sessions:[], prs:{},
          unit:"lb", draft:null};
}
function load(){
  try{ var v=JSON.parse(localStorage.getItem(LS));
       if(v&&typeof v==="object") return Object.assign(blank(),v) }catch(e){}
  return blank();
}
function save(){ try{ localStorage.setItem(LS,JSON.stringify(L)) }catch(e){} }

/* ---------- maths ---------- */
/* Epley. One number that lets a heavy triple beat a light set of ten. */
function e1rm(weight,reps){
  weight=+weight||0; reps=+reps||0;
  if(weight<=0||reps<=0) return 0;
  return Math.round(weight*(1+reps/30)*10)/10;
}
function volume(sess){
  return sess.sets.reduce(function(a,s){ return a+(+s.weight||0)*(+s.reps||0) },0);
}
var key=function(s){ return String(s||"").trim().toLowerCase() };

/* ---------- personal records ---------- */
function checkPRs(sess){
  var hits=[];
  sess.sets.forEach(function(s){
    var k=key(s.ex); if(!k) return;
    var score=e1rm(s.weight,s.reps); if(!score) return;
    var old=L.prs[k];
    if(!old || score>old.e1rm+0.01){
      hits.push({ex:s.ex, e1rm:score, weight:+s.weight, reps:+s.reps,
                 prev:old?old.e1rm:0, first:!old});
      L.prs[k]={e1rm:score, weight:+s.weight, reps:+s.reps, at:Date.now(), ex:s.ex};
    }
  });
  return hits;
}

/* ---------- finishing a session ---------- */
function finish(sess){
  if(!sess.sets.length) return null;
  sess.id=sess.id||("w"+Date.now());
  sess.at=sess.at||Date.now();
  sess.vol=Math.round(volume(sess));
  var prs=checkPRs(sess);
  sess.prs=prs.length;
  L.sessions.unshift(sess);
  L.sessions=L.sessions.slice(0,200);
  L.draft=null; save();

  var G=window.MLGame;
  if(G && G.state && G.state().started){
    /* the session itself pays the pokemon; records pay the trainer */
    var monXp = 40 + Math.min(160, Math.round(sess.vol/220)) + sess.sets.length*4;
    var party=G.party();
    party.forEach(function(m){ G.giveMonXp(m, Math.round(monXp/Math.max(1,party.length*0.6))) });
    if(party.length) toast("Your bench trained too — +"+monXp+" xp shared");
    if(prs.length){
      G.givePlayerXp(20+prs.length*18, prs.length===1?"a personal record":prs.length+" records");
      if(G.award) G.award("rarecandy", prs.length>=3?2:1, prs.length===1?"A personal record":prs.length+" personal records");
      else G.give("rarecandy", prs.length>=3?2:1);
    }else{
      G.givePlayerXp(12,"a session logged");
    }
    /* one wild encounter a day from training, however many sessions you log */
    if(G.tokenFree("Lift")){
      if(Math.random()<0.55){
        G.maybeEncounter(null,1);
      }
      G.state().spent[dkey(new Date())+"|Lift"]=1; G.save();
    }
  }
  return prs;
}

/* ---------- the tab ---------- */
function todayDay(){
  var d=new Date().getDay();
  var id=L.schedule[d];
  return id ? L.days.filter(function(x){return x.id===id})[0] : null;
}
function fmtSet(s){
  return (s.reps||0)+" x "+(s.weight||0)+L.unit+(s.note?" · "+s.note:"");
}
function liftHTML(){
  if(!L.split) return setupHTML();
  var plan=todayDay(), recent=L.sessions.slice(0,12);
  var prs=Object.keys(L.prs).map(function(k){return L.prs[k]})
            .sort(function(a,b){return b.at-a.at}).slice(0,8);
  var week=L.sessions.filter(function(s){return Date.now()-s.at<7*864e5}).length;
  var vol=L.sessions.filter(function(s){return Date.now()-s.at<7*864e5})
            .reduce(function(a,s){return a+(s.vol||0)},0);
  return '<div class="head"><h1>Lift</h1><p>'+esc(SPLITS[L.split].n)+
      (plan?" · today is "+esc(plan.name):"")+"</p></div>"+
    '<div class="big">'+
      '<div class="stat"><div class="v">'+week+'</div><div class="k">sessions this week</div></div>'+
      '<div class="stat"><div class="v">'+fmt(Math.round(vol/1000))+'k</div><div class="k">'+L.unit+' lifted this week</div></div>'+
    "</div>"+
    (L.draft?'<button class="btn" id="resumeW">Carry on: '+esc(L.draft.dayName||"workout")+" · "+
      L.draft.sets.length+" set"+(L.draft.sets.length===1?"":"s")+"</button>":"")+
    '<div class="sectlab">Start a workout</div>'+
    '<div class="lpick">'+L.days.map(function(d){
      var isToday=plan&&plan.id===d.id;
      return '<button class="lday'+(isToday?" today":"")+'" data-start="'+esc(d.id)+'"><b>'+esc(d.name)+"</b>"+
        "<span>"+(isToday?"today":lastDone(d.id))+"</span></button>";
    }).join("")+'<button class="lday other" data-start="__other"><b>Something else</b><span>one-off</span></button></div>'+
    '<div class="sectlab">Recent<button class="link" id="editSplit">Split</button></div>'+
    (recent.length?'<div class="card">'+recent.map(function(s){
      return '<button class="row" style="width:100%;text-align:left" data-sess="'+esc(s.id)+'">'+
        '<div class="main"><div class="nm">'+esc(s.dayName||"Workout")+
          (s.prs?'<span class="pill done">'+s.prs+" PR"+(s.prs>1?"s":"")+"</span>":"")+"</div>"+
        '<div class="sub">'+new Date(s.at).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})+
          " · "+s.sets.length+" sets · "+fmt(s.vol)+" "+L.unit+"</div></div>"+
        '<div class="rt"><div class="mins">&rsaquo;</div></div></button>';
    }).join("")+"</div>":'<div class="empty">Nothing logged yet.</div>')+
    (prs.length?'<div class="sectlab">Best lifts</div><div class="card">'+prs.map(function(p){
      return '<div class="row"><div class="main"><div class="nm">'+esc(p.ex)+"</div>"+
        '<div class="sub">'+p.weight+L.unit+" x "+p.reps+"</div></div>"+
        '<div class="rt"><div class="mins">'+p.e1rm+'</div><div class="sub">est 1rm</div></div></div>';
    }).join("")+"</div>":"")+
    '<p class="footnote">Estimated one-rep max uses Epley, so a heavy triple can beat a light ten. '+
    "A record pays the trainer; every session pays the bench.</p>";
}
function setupHTML(){
  return '<div class="head"><h1>Lift</h1><p>Pick how you train. You can change it later.</p></div>'+
    '<div class="card">'+Object.keys(SPLITS).map(function(k){
      var s=SPLITS[k];
      return '<button class="row" style="width:100%;text-align:left" data-split="'+k+'">'+
        '<div class="main"><div class="nm">'+esc(s.n)+"</div>"+
        '<div class="sub">'+(s.days.length?s.days.join(" · "):"name your own days")+"</div></div>"+
        '<div class="rt"><div class="mins">&rsaquo;</div></div></button>';
    }).join("")+"</div>"+
    '<p class="footnote">A split is only a set of names for your workouts. You can log a one-off '+
    "session whenever you like without following any plan.</p>";
}

function bindLift(el){
  el.querySelectorAll("[data-split]").forEach(function(b){
    b.onclick=function(){ chooseSplit(b.dataset.split) };
  });
  el.querySelectorAll("[data-start]").forEach(function(b){
    b.onclick=function(){
      if(L.draft && L.draft.sets.length && !window.confirm("You have a workout in progress ("+
        (L.draft.dayName||"workout")+"). Start a new one and bin that?")) return;
      var id=b.dataset.start, d=L.days.filter(function(x){return x.id===id})[0];
      openSession({dayId:d?d.id:null, dayName:d?d.name:"Workout", sets:[], at:Date.now()});
    };
  });
  var r=el.querySelector("#resumeW");
  if(r) r.onclick=function(){ openSession(L.draft) };
  var e=el.querySelector("#editSplit");
  if(e) e.onclick=openSplitEditor;
  el.querySelectorAll("[data-sess]").forEach(function(b){
    b.onclick=function(){ openSession2(b.dataset.sess) };
  });
}
function chooseSplit(k){
  L.split=k;
  L.days=SPLITS[k].days.map(function(n,i){ return {id:"d"+i+Date.now().toString(36), name:n} });
  save();
  if(k==="custom") openSplitEditor(); else { render(); toast(SPLITS[k].n+" it is") }
}

/* ---------- split + schedule ---------- */
function openSplitEditor(){
  var body='<div class="card"><span class="lab">Your workouts</span>'+
    '<div id="dayList">'+L.days.map(function(d,i){
      return '<div class="row"><div class="main"><input class="dname" data-i="'+i+'" type="text" value="'+
        esc(d.name)+'"></div><button class="link" data-rm="'+i+'">Remove</button></div>';
    }).join("")+"</div>"+
    '<button class="btn ghost" id="addDay" style="margin-top:8px">Add a workout</button></div>'+
    '<div class="card"><span class="lab">A fixed week (optional)</span>'+
      '<p class="note" style="margin:0 0 10px">Set one and the tab will know what today is. Leave it '+
      "blank and just log whatever you did.</p>"+
      WEEK.map(function(w,i){
        return '<div class="row"><div class="main"><div class="nm">'+w+"</div></div>"+
          '<div class="rt"><select data-sched="'+i+'"><option value="">Rest</option>'+
          L.days.map(function(d){
            return '<option value="'+esc(d.id)+'"'+(L.schedule[i]===d.id?" selected":"")+">"+
              esc(d.name)+"</option>";
          }).join("")+"</select></div></div>";
      }).join("")+"</div>"+
    '<div class="card"><span class="lab">Weight in</span><div class="chips" id="unitPick">'+
      ["lb","kg"].map(function(u){
        return '<button data-unit="'+u+'" aria-pressed="'+(L.unit===u)+'">'+u+"</button>";
      }).join("")+"</div></div>"+
    '<button class="btn" id="doneSplit">Done</button>'+
    '<button class="btn ghost" id="otherSplit" style="margin-top:9px">Choose a different split</button>';
  openSheet("Your split", body, function(){
    var read=function(){
      document.querySelectorAll(".dname").forEach(function(inp){
        var d=L.days[+inp.dataset.i]; if(d) d.name=inp.value.trim()||d.name;
      });
      document.querySelectorAll("[data-sched]").forEach(function(sel){
        var i=+sel.dataset.sched;
        if(sel.value) L.schedule[i]=sel.value; else delete L.schedule[i];
      });
      save();
    };
    document.getElementById("addDay").onclick=function(){
      read();
      L.days.push({id:"d"+Date.now().toString(36), name:"Workout "+(L.days.length+1)});
      save(); closeSheet(); openSplitEditor();
    };
    document.querySelectorAll("[data-rm]").forEach(function(b){
      b.onclick=function(){
        read(); var d=L.days.splice(+b.dataset.rm,1)[0];
        Object.keys(L.schedule).forEach(function(k){ if(L.schedule[k]===d.id) delete L.schedule[k] });
        save(); closeSheet(); openSplitEditor();
      };
    });
    document.querySelectorAll("[data-unit]").forEach(function(b){
      b.onclick=function(){ read(); L.unit=b.dataset.unit; save(); closeSheet(); openSplitEditor() };
    });
    document.querySelectorAll("[data-sched]").forEach(function(s){ s.onchange=read });
    document.getElementById("doneSplit").onclick=function(){ read(); closeSheet(); render(); };
    document.getElementById("otherSplit").onclick=function(){
      read(); L.split=null; save(); closeSheet(); render();
    };
  });
}

/* ---------- logging a session ----------
   Pick the workout, then an exercise from the ones you have done in that
   workout before. The screen then shows your heaviest lift and what you did
   last time, with dates, and a set is two steppers and one button. */
function lastDone(dayId){
  for(var i=0;i<L.sessions.length;i++) if(L.sessions[i].dayId===dayId)
    return "last "+new Date(L.sessions[i].at).toLocaleDateString(undefined,{month:"short",day:"numeric"});
  return "not yet";
}
function dateShort(t){ return new Date(t).toLocaleDateString(undefined,{month:"short",day:"numeric"}) }
/* every exercise ever logged for this workout, most recent first */
function exForDay(dayId, dayName){
  var seen={}, out=[];
  L.sessions.forEach(function(s){
    if(!(dayId ? s.dayId===dayId : key(s.dayName)===key(dayName))) return;
    s.sets.forEach(function(x){ var k=key(x.ex); if(k&&!seen[k]){ seen[k]=1; out.push(x.ex) } });
  });
  return out;
}
function exNames(){
  var seen={}, out=[];
  L.sessions.forEach(function(s){ s.sets.forEach(function(x){
    var k=key(x.ex); if(k&&!seen[k]){ seen[k]=1; out.push(x.ex) }
  })});
  return out.slice(0,80);
}
/* heaviest weight ever moved for it, the most reps at that weight, and when */
function heaviest(ex){
  var k=key(ex), best=null;
  L.sessions.forEach(function(s){ s.sets.forEach(function(x){
    if(key(x.ex)!==k) return;
    var w=+x.weight||0, r=+x.reps||0; if(r<=0) return;
    if(!best || w>best.weight || (w===best.weight && r>best.reps) ||
       (w===best.weight && r===best.reps && s.at<best.at)) best={weight:w, reps:r, at:s.at};
  })});
  return best;
}
/* the most recent finished session that had it: when, and every set */
function lastTime(ex){
  var k=key(ex);
  for(var i=0;i<L.sessions.length;i++){
    var hit=L.sessions[i].sets.filter(function(s){return key(s.ex)===k});
    if(hit.length) return {at:L.sessions[i].at, sets:hit, day:L.sessions[i].dayName};
  }
  return null;
}
function lastFor(ex){ var t=lastTime(ex); return t?t.sets[t.sets.length-1]:null }
function openSession(draft){
  var plan=todayDay();
  var sess=draft || {dayId:plan?plan.id:null, dayName:plan?plan.name:(L.days[0]?L.days[0].name:"Workout"),
                     sets:[], at:Date.now()};
  L.draft=sess; save();
  openSheet(sess.dayName||"Workout", '<div id="lSess"></div>', function(){ drawSession(sess) });
}
function stepFor(){ return L.unit==="kg"?2.5:5 }
function drawSession(sess){
  var host=document.getElementById("lSess"); if(!host) return;
  var cur=sess.cur||null;
  var mine=exForDay(sess.dayId, sess.dayName);
  sess.sets.forEach(function(x){ if(x.ex && mine.map(key).indexOf(key(x.ex))<0) mine.unshift(x.ex) });
  var info="";
  if(cur){
    var best=heaviest(cur), last=lastTime(cur), here=sess.sets.filter(function(x){return key(x.ex)===key(cur)});
    var seed=here.length?here[here.length-1]:(last?last.sets[0]:null);
    if(sess.reps===undefined||sess.curSeed!==cur){ sess.reps=seed?+seed.reps:8; sess.weight=seed?+seed.weight:0; sess.curSeed=cur; }
    info='<div class="lcur">'+
      '<div class="lcurname">'+esc(cur)+'<button class="link" id="lChange">change</button></div>'+
      '<div class="lstats">'+
        '<div class="lstat"><u>Your max</u>'+(best?"<b>"+best.weight+" "+L.unit+" × "+best.reps+"</b><span>"+dateShort(best.at)+"</span>"
          :"<b>—</b><span>first time</span>")+"</div>"+
        '<div class="lstat"><u>Last time</u>'+(last?"<b>"+last.sets.map(function(x){return (x.reps||0)+"×"+(x.weight||0)}).join(", ")+
          "</b><span>"+dateShort(last.at)+(last.day&&key(last.day)!==key(sess.dayName)?" · "+esc(last.day):"")+"</span>"
          :"<b>—</b><span>nothing yet</span>")+"</div>"+
      "</div>"+
      '<div class="lsteps">'+
        '<div class="lstep"><u>Reps</u><div class="qty"><button data-adj="reps" data-d="-1" aria-label="One fewer rep">−</button>'+
          '<input id="lReps" type="text" inputmode="numeric" value="'+sess.reps+'"><button data-adj="reps" data-d="1" aria-label="One more rep">+</button></div></div>'+
        '<div class="lstep"><u>'+L.unit+'</u><div class="qty"><button data-adj="weight" data-d="-1" aria-label="Lighter">−</button>'+
          '<input id="lWt" type="text" inputmode="decimal" value="'+sess.weight+'"><button data-adj="weight" data-d="1" aria-label="Heavier">+</button></div></div>'+
      "</div>"+
      '<p class="lhint" id="lHint"></p>'+
      '<button class="btn" id="lLog">Log set'+(here.length?" "+(here.length+1):"")+"</button>"+
    "</div>";
  }
  host.innerHTML=
    '<div class="lwk">'+L.days.map(function(d){
      return '<button data-wk="'+esc(d.id)+'" aria-pressed="'+(sess.dayId===d.id)+'">'+esc(d.name)+"</button>";
    }).join("")+'<button data-wk="__other" aria-pressed="'+(!sess.dayId)+'">Other</button></div>'+
    info+
    (cur?"":'<div class="sectlab">'+(mine.length?"Exercises you do on "+esc(sess.dayName):"Pick an exercise")+"</div>")+
    '<div class="lexes'+(cur?" compact":"")+'">'+mine.map(function(n){
      var done=sess.sets.filter(function(x){return key(x.ex)===key(n)}).length;
      return '<button class="lex'+(cur&&key(cur)===key(n)?" on":"")+'" data-ex="'+esc(n)+'">'+esc(n)+
        (done?" <i>"+done+"</i>":"")+"</button>";
    }).join("")+'<button class="lex add" id="lNew">+ New exercise</button></div>'+
    '<div id="lNewBox" hidden><input id="lNewName" class="sx" list="exList" type="text" placeholder="Exercise name" autocomplete="off">'+
      '<datalist id="exList">'+exNames().map(function(n){return '<option value="'+esc(n)+'">'}).join("")+"</datalist>"+
      '<button class="btn ghost" id="lNewGo">Use it</button></div>'+
    (sess.sets.length?'<div class="sectlab">This session</div><div class="card slist">'+groupSets(sess)+"</div>":"")+
    '<div class="card gsum" id="wSum"></div>'+
    '<button class="btn" id="wDone">Finish workout</button>'+
    '<button class="btn ghost" id="wBin" style="margin-top:9px">Throw this one away</button>';
  bindSession2(sess);
}
function groupSets(sess){
  var order=[], by={};
  sess.sets.forEach(function(s,i){ var k=key(s.ex); if(!by[k]){ by[k]=[]; order.push(k) } by[k].push(i) });
  return order.map(function(k){
    var first=sess.sets[by[k][0]];
    return '<div class="lgroup"><div class="lgname">'+esc(first.ex)+"</div>"+by[k].map(function(i,n){
      var s=sess.sets[i], b=L.prs[key(s.ex)], pr=b?e1rm(s.weight,s.reps)>b.e1rm+0.01:!!s.ex;
      return '<div class="lset'+(pr?" pr":"")+'"><span>Set '+(n+1)+"</span><b>"+(s.reps||0)+" × "+(s.weight||0)+" "+L.unit+"</b>"+
        (pr?'<em>'+(b?"new best":"first")+"</em>":"")+
        '<button class="link" data-dup="'+i+'">again</button><button class="x" data-del="'+i+'" aria-label="Delete set">×</button></div>';
    }).join("")+"</div>";
  }).join("");
}
function bindSession2(sess){
  var redraw=function(){ L.draft=sess; save(); drawSession(sess) };
  var head=document.querySelector("#sheetHost .shead h3");
  if(head) head.textContent=sess.dayName||"Workout";
  document.querySelectorAll("[data-wk]").forEach(function(b){
    b.onclick=function(){
      var v=b.dataset.wk, d=L.days.filter(function(x){return x.id===v})[0];
      sess.dayId=d?d.id:null; sess.dayName=d?d.name:"Workout"; sess.cur=null; redraw();
    };
  });
  document.querySelectorAll("[data-ex]").forEach(function(b){
    b.onclick=function(){ sess.cur=b.dataset.ex; redraw() };
  });
  var ch=document.getElementById("lChange"); if(ch) ch.onclick=function(){ sess.cur=null; redraw() };
  var nb=document.getElementById("lNew");
  if(nb) nb.onclick=function(){ var box=document.getElementById("lNewBox"); box.hidden=false;
    var i=document.getElementById("lNewName"); i.focus(); };
  var ng=document.getElementById("lNewGo");
  if(ng) ng.onclick=function(){ var v=document.getElementById("lNewName").value.trim(); if(!v) return; sess.cur=v; redraw() };
  var ni=document.getElementById("lNewName");
  if(ni) ni.onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); ng.click() } };
  var reps=document.getElementById("lReps"), wt=document.getElementById("lWt");
  var hint=function(){
    var h=document.getElementById("lHint"); if(!h||!sess.cur) return;
    var b=L.prs[key(sess.cur)], score=e1rm(sess.weight,sess.reps);
    h.innerHTML=b&&score>b.e1rm+0.01?"<b>That would be a new best</b> (est. 1RM "+score+" vs "+b.e1rm+")"
      :b?"Est. 1RM "+score+" · best "+b.e1rm:"";
  };
  document.querySelectorAll("[data-adj]").forEach(function(b){
    b.onclick=function(){
      var f=b.dataset.adj, d=+b.dataset.d;
      if(f==="reps"){ sess.reps=Math.max(1,(+sess.reps||0)+d); reps.value=sess.reps }
      else{ sess.weight=Math.max(0,Math.round(((+sess.weight||0)+d*stepFor())*100)/100); wt.value=sess.weight }
      L.draft=sess; save(); hint();
    };
  });
  if(reps) reps.oninput=function(){ var v=parseInt(reps.value,10); if(v>0){ sess.reps=v; L.draft=sess; save(); hint() } };
  if(wt) wt.oninput=function(){ var v=parseFloat(wt.value); if(v>=0){ sess.weight=v; L.draft=sess; save(); hint() } };
  var lg=document.getElementById("lLog");
  if(lg) lg.onclick=function(){
    if(!(+sess.reps>0)){ toast("How many reps?"); return }
    sess.sets.push({ex:sess.cur, reps:+sess.reps, weight:+sess.weight||0, note:""});
    redraw(); toast("Set logged");
  };
  document.querySelectorAll("[data-dup]").forEach(function(b){
    b.onclick=function(){ var s=sess.sets[+b.dataset.dup];
      sess.sets.push({ex:s.ex,reps:s.reps,weight:s.weight,note:""}); redraw() };
  });
  document.querySelectorAll("[data-del]").forEach(function(b){
    b.onclick=function(){ sess.sets.splice(+b.dataset.del,1); redraw() };
  });
  var v=Math.round(volume(sess));
  var newBest=sess.sets.filter(function(s){
    var b=L.prs[key(s.ex)]; return s.ex && e1rm(s.weight,s.reps) > (b?b.e1rm:0)+0.01;
  }).length;
  document.getElementById("wSum").innerHTML=
    '<div class="gsumrow"><span>'+sess.sets.length+" sets</span><span>"+fmt(v)+" "+L.unit+" moved</span>"+
    "<span>"+(newBest?newBest+" on for a record":"no records yet")+"</span></div>";
  document.getElementById("wBin").onclick=function(){
    if(sess.sets.length && !window.confirm("Throw away this workout and its "+sess.sets.length+" sets?")) return;
    L.draft=null; save(); closeSheet(); render(); toast("Binned");
  };
  document.getElementById("wDone").onclick=function(){
    sess.sets=sess.sets.filter(function(s){ return key(s.ex) && (+s.reps>0) });
    if(!sess.sets.length){ toast("Log at least one set"); return }
    delete sess.cur; delete sess.reps; delete sess.weight; delete sess.curSeed;
    var prs=finish(sess);
    closeSheet(); render();
    if(prs && prs.length) showPR(prs);
    else toast("Logged — "+sess.sets.length+" sets, "+fmt(sess.vol)+" "+L.unit);
  };
  hint();
}
function showPR(prs){
  var h=document.getElementById("gameFx")||document.body;
  var d=document.createElement("div");
  d.className="prpop";
  d.innerHTML="<b>"+(prs.length>1?prs.length+" new records":"New record")+"</b>"+
    prs.slice(0,3).map(function(p){
      return "<span>"+esc(p.ex)+" — "+p.weight+L.unit+" x "+p.reps+
        (p.first?" (first time)":" · was "+p.prev)+"</span>";
    }).join("");
  h.appendChild(d);
  setTimeout(function(){ d.remove() },4200);
}

/* ---------- one past session ---------- */
function openSession2(id){
  var s=L.sessions.filter(function(x){return x.id===id})[0];
  if(!s) return;
  openSheet(s.dayName||"Workout",
    '<p class="s">'+new Date(s.at).toLocaleString(undefined,{weekday:"long",month:"long",
      day:"numeric",hour:"numeric",minute:"2-digit"})+" · "+fmt(s.vol)+" "+L.unit+"</p>"+
    '<div class="card">'+s.sets.map(function(x){
      return '<div class="row"><div class="main"><div class="nm">'+esc(x.ex)+"</div>"+
        (x.note?'<div class="sub">'+esc(x.note)+"</div>":"")+"</div>"+
        '<div class="rt"><div class="mins">'+(x.reps||0)+" x "+(x.weight||0)+"</div>"+
        '<div class="sub">'+L.unit+"</div></div></div>";
    }).join("")+"</div>"+
    '<button class="btn ghost" id="delSess">Delete this session</button>',
    function(){
      document.getElementById("delSess").onclick=function(){
        L.sessions=L.sessions.filter(function(x){return x.id!==id});
        save(); closeSheet(); render(); toast("Deleted");
      };
    });
}

/* ---------- boot ---------- */
window.MLLift={ state:function(){return L}, e1rm:e1rm, volume:volume, finish:finish,
  heaviest:heaviest, lastTime:lastTime, exForDay:exForDay, openSession:openSession,
  checkPRs:checkPRs, splits:SPLITS, save:save,
  reset:function(){ L=blank(); save(); } };

(function boot(){
  if(typeof render!=="function"||typeof openSheet!=="function"){ return setTimeout(boot,60) }
  L=load();
  var nav=document.querySelector(".tabbar>div");
  if(nav && !document.getElementById("navlift")){
    var b=document.createElement("button"); b.id="navlift";
    b.innerHTML='<svg viewBox="0 0 24 24"><path d="M4 9v6M20 9v6M7 6v12M17 6v12M7 12h10"/></svg>Lift';
    /* sits before the PC if that has already been added */
    var pc=document.getElementById("navpc");
    if(pc) nav.insertBefore(b,pc); else nav.appendChild(b);
    nav.style.gridTemplateColumns="repeat("+nav.children.length+",1fr)";
    b.onclick=function(){ S.view="lift"; window.scrollTo(0,0); render() };
  }
  var _render=window.render;
  window.render=function(){
    if(S.view==="lift"){
      ["day","meals","pasta","goals","pc"].forEach(function(v){
        var n=document.getElementById("nav"+v); if(n) n.setAttribute("aria-current","false");
      });
      var lf=document.getElementById("navlift"); if(lf) lf.setAttribute("aria-current","true");
      var el=document.getElementById("screen");
      el.innerHTML=liftHTML(); bindLift(el);
      var fab=document.getElementById("fab"); if(fab) fab.hidden=true;
      return;
    }
    var lf2=document.getElementById("navlift"); if(lf2) lf2.setAttribute("aria-current","false");
    _render.apply(this,arguments);
  };
})();
})();
