/* ===================================================================
   Kitchen — the Meals tab, split into three:

     Cooked       what is in the fridge right now, logged down portion by
                  portion; an X throws out whatever is left
     Recipe book  what you know how to make. "Cook" makes a batch from it at
                  any multiple (½, 1, 1½ …), with changes for just this time
     Pantry       everything you bought, scanned in at the shop, sorted by what
                  goes off first or by kind of food

   Nothing typed is ever lost: the recipe being written, the batch being
   cooked and the shopping trip being scanned are all saved as you go, so a
   battle, a phone call or an accidental close costs nothing.
   =================================================================== */
(function(){
"use strict";
var K="ml.k.", PANTRY="ml.pantry";
var get=function(k,d){ return lsGet(k,d) }, set=function(k,v){ lsSet(k,v) };
var H=function(s){ return esc(s) };

/* ---------------- shared bits ---------------- */
function seg(){ return get(K+"seg","cooked") }
function setSeg(v){ set(K+"seg",v); render() }
var SEGS=[["cooked","Cooked"],["book","Recipe book"],["pantry","Pantry"]];
function segHTML(){
  var cur=seg();
  return '<div class="kseg" role="tablist">'+SEGS.map(function(x){
    return '<button role="tab" data-kseg="'+x[0]+'" aria-selected="'+(cur===x[0])+'">'+x[1]+
      (x[0]==="pantry"&&expiringCount()?' <i class="kdot">'+expiringCount()+"</i>":"")+"</button>";
  }).join("")+"</div>";
}
function ingTotals(list){
  var t=new Array(18).fill(0);
  list.forEach(function(g){ for(var j=0;j<18;j++) t[j]+=(g.n[j]||0)*(+g.qty||0) });
  return t;
}
function perUnitLine(t,y,unit){
  y=+y||1;
  return '<div class="pk">'+fmt(t[0]/y)+'<small>kcal per '+H(singular(unit))+"</small></div>"+
    '<div class="pmac"><span><u>Protein</u>'+fmt(t[1]/y,1)+" g</span>"+
    '<span><u>Carbs</u>'+fmt(t[2]/y,1)+" g</span>"+
    '<span><u>Fat</u>'+fmt(t[3]/y,1)+" g</span></div>"+
    '<div class="pmg"><div><span>Whole batch</span><b>'+fmt(t[0])+" kcal</b></div>"+
    "<div><span>Makes</span><b>"+nQty(y)+" "+H(unit)+"</b></div></div>";
}
var copy=function(o){ return JSON.parse(JSON.stringify(o)) };
var num=function(v,d){ v=parseFloat(v); return isFinite(v)?v:d };

/* =================== COOKED: fridge and freezer ===================
   Freezing a portion splits the batch in two: the frozen part runs on its own
   freezer clock, the rest stays on the fridge one. Both keep the same
   nutrition per unit, and anything already logged stays counted against the
   original. Thawing does the reverse, onto a short fridge clock. */
var SNOW='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M4.2 6.5l15.6 9M4.2 17.5l15.6-9M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5M3 10l3.6 1-1 3.4M21 10l-3.6 1 1 3.4M3 14l3.6-1M21 14l-3.6-1"/></svg>';
var FREEZER_DAYS=[[30,"1 mo"],[60,"2 mo"],[90,"3 mo"],[180,"6 mo"]];
function cseg(){ return get(K+"cseg","fridge") }
function leftOf(b){ return Math.max(0,(parseFloat(b.yieldQty)||0)-batchUsed(b.id)) }
/* take `portion` units off batch b into a new batch; per-unit nutrition is unchanged */
function splitBatch(b, portion){
  var y=parseFloat(b.yieldQty)||0; if(!(portion>0)||!(y>0)) return null;
  var k=portion/y;
  var nb=copy(b); nb.id=uid(); nb.yieldQty=portion;
  nb.ing=b.ing.map(function(g){ return Object.assign(copy(g),{qty:g.qty*k}) });
  b.ing.forEach(function(g){ g.qty=g.qty*(1-k) });
  b.yieldQty=y-portion;
  return nb;
}
function freezeBatch(id, portion, days){
  var b=S.batches.find(function(x){return x.id===id}); if(!b) return null;
  var left=leftOf(b), target;
  if(portion>=left-1e-9) target=b;                  /* all of what is left: the batch itself goes in */
  else{ target=splitBatch(b,portion); S.batches.unshift(target); }
  target.frozen=true; target.frozenAt=Date.now(); target.freezerDays=days;
  target.fridgeCookedAt=target.cookedAt;
  saveBatches();
  return target;
}
function thawBatch(id, portion, fridgeDays){
  var b=S.batches.find(function(x){return x.id===id}); if(!b) return null;
  var left=leftOf(b), target;
  if(portion>=left-1e-9) target=b;
  else{ target=splitBatch(b,portion); S.batches.unshift(target); }
  target.frozen=false; target.thawedAt=Date.now();
  target.cookedAt=Date.now(); target.shelfDays=fridgeDays;   /* the fridge clock starts at thawing */
  saveBatches();
  return target;
}
function icyBar(fr){
  var pct=Math.round(Math.max(0,Math.min(1,fr.frac||0))*100);
  return '<div class="icebar'+(fr.over?" spent":"")+'" role="img" aria-label="'+H(fr.label)+'">'+
    '<i style="width:'+pct+'%"><b class="iceshine"></b></i>'+
    '<span class="icesnow">'+SNOW+"</span></div>";
}
function batchCard(b){
  var fr=freshness(b),pu=batchPerUnit(b), frozen=!!b.frozen;
  var y=parseFloat(b.yieldQty)||0,leftQ=leftOf(b);
  var unit=leftQ===1?singular(b.yieldUnit):b.yieldUnit;
  var when=frozen?"Frozen "+new Date(b.frozenAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})+
      " · cooked "+new Date(b.fridgeCookedAt||b.cookedAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})
    :(b.thawedAt?"Thawed ":"Cooked ")+H(new Date(b.cookedAt).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}));
  return '<div class="kcard'+(fr.over?" over":"")+(frozen?" frozen":"")+'">'+
    '<button class="batch" data-batch="'+b.id+'">'+
    '<div class="btop"><div><div class="bname">'+H(b.name)+(b.mult&&b.mult!==1?' <span class="kmult">×'+nQty(b.mult)+"</span>":"")+"</div>"+
      '<div class="bsub">'+when+"</div></div>"+
      '<span class="pill '+fr.cls+'">'+H(fr.label)+"</span></div>"+
    (frozen?icyBar(fr):'<div class="bmeter"><i class="'+(fr.over?"gone":"")+'" style="width:'+(y>0?Math.min(100,(leftQ/y)*100):0)+'%"></i></div>')+
    '<div class="bfoot"><span><b>'+nQty(leftQ)+" "+H(unit)+"</b>"+(frozen?" frozen":" left of "+nQty(y))+"</span>"+
      '<span class="per">'+fmt(pu[0])+" kcal · "+fmt(pu[1])+"P "+fmt(pu[2])+"C "+fmt(pu[3])+"F / "+H(singular(b.yieldUnit))+"</span></div>"+
    "</button>"+
    '<div class="kside">'+
      (frozen?'<button class="kx kthaw" data-thaw="'+b.id+'" aria-label="Thaw some of '+H(b.name)+'">'+
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/></svg></button>'
        :(leftQ>0?'<button class="kx kfreeze" data-freeze="'+b.id+'" aria-label="Freeze some of '+H(b.name)+'">'+SNOW+"</button>":""))+
      '<button class="kx" data-toss="'+b.id+'" aria-label="Throw out what is left of '+H(b.name)+'">×</button>'+
    "</div>"+
  "</div>";
}
function cookedHTML(){
  var fridge=S.batches.filter(function(b){return !b.frozen}), freezer=S.batches.filter(function(b){return b.frozen});
  var cur=cseg();
  var sub='<div class="kseg2" role="tablist">'+
    '<button role="tab" data-cseg="fridge" aria-selected="'+(cur==="fridge")+'">Fridge'+(fridge.length?" · "+fridge.length:"")+"</button>"+
    '<button role="tab" class="ice" data-cseg="freezer" aria-selected="'+(cur==="freezer")+'">'+SNOW+"Freezer"+(freezer.length?" · "+freezer.length:"")+"</button></div>";
  if(cur==="freezer"){
    if(!freezer.length) return sub+'<div class="empty"><b>The freezer is empty.</b><br><br>'+
      "Tap the snowflake on anything in the fridge to freeze some or all of it. Frozen portions get their own "+
      "freezer timer, and you thaw them back into the fridge when you want them.</div>";
    return sub+freezer.slice().sort(function(a,b){
      return (a.frozenAt+(a.freezerDays||90)*864e5)-(b.frozenAt+(b.freezerDays||90)*864e5) }).map(batchCard).join("");
  }
  if(!fridge.length)
    return sub+'<div class="empty"><b>Nothing in the fridge right now.</b><br><br>'+
      "Cook something from your <b>Recipe book</b> and it shows up here, with how much is left "+
      "and how many days it keeps.</div>";
  return sub+fridge.slice().sort(function(a,b){return b.cookedAt-a.cookedAt}).map(batchCard).join("");
}
/* how much, and for how long: a stepper and a few presets */
function portionPicker(left, unit, id){
  return '<div class="field"><label>How much</label><div class="qty"><button data-pstep="-1" aria-label="Less">−</button>'+
    '<input id="'+id+'" type="text" inputmode="decimal" value="'+nQty(left)+'"><button data-pstep="1" aria-label="More">+</button>'+
    '<span class="unit">of '+nQty(left)+" "+H(unit)+"</span></div>"+
    '<div class="chips kpreset" style="margin-top:8px">'+
      [[1,"1 "+singular(unit)],[left/2,"Half"],[left,"All of it"]].filter(function(x){return x[0]>0&&x[0]<=left+1e-9})
        .map(function(x){ return '<button data-pset="'+x[0]+'">'+H(x[1])+"</button>" }).join("")+"</div></div>";
}
function wirePortion(id, left){
  var inp=document.getElementById(id);
  var step=left>=6?1:left>=2?0.5:0.25;
  document.querySelectorAll("[data-pstep]").forEach(function(b){ b.onclick=function(){
    var v=Math.max(step,Math.min(left,(parseFloat(inp.value)||0)+(+b.dataset.pstep)*step)); inp.value=nQty(v) } });
  document.querySelectorAll("[data-pset]").forEach(function(b){ b.onclick=function(){ inp.value=nQty(+b.dataset.pset) } });
  return function(){ var v=parseFloat(inp.value); return isFinite(v)&&v>0?Math.min(v,left):0 };
}
function openFreeze(id){
  var b=S.batches.find(function(x){return x.id===id}); if(!b) return;
  var left=leftOf(b), days=get(K+"freezerDays",90);
  openSheet("Freeze "+b.name,
    '<p class="s">Whatever you freeze moves to the <b>Freezer</b> with its own timer. The rest stays in the fridge.</p>'+
    portionPicker(left,b.yieldUnit,"kFrQ")+
    '<div class="field"><label>Keeps in the freezer for</label><div class="chips" id="kFrD">'+
      FREEZER_DAYS.map(function(x){ return '<button data-fd="'+x[0]+'" aria-pressed="'+(days===x[0])+'">'+x[1]+"</button>" }).join("")+
    "</div></div>"+
    '<button class="btn kicebtn" id="kFrGo">'+SNOW+"Freeze it</button>",
    function(){
      var read=wirePortion("kFrQ",left);
      document.querySelectorAll("[data-fd]").forEach(function(x){ x.onclick=function(){
        days=+x.dataset.fd; document.querySelectorAll("[data-fd]").forEach(function(y){ y.setAttribute("aria-pressed",String(y===x)) }) } });
      document.getElementById("kFrGo").onclick=function(){
        var q=read(); if(!q){ toast("How much?"); return }
        set(K+"freezerDays",days);
        freezeBatch(id,q,days); set(K+"cseg","freezer");
        closeSheet(); render(); toast(nQty(q)+" "+(q===1?singular(b.yieldUnit):b.yieldUnit)+" frozen");
      };
    });
}
function openThaw(id){
  var b=S.batches.find(function(x){return x.id===id}); if(!b) return;
  var left=leftOf(b), fd=3;
  openSheet("Thaw "+b.name,
    '<p class="s">Thawed food goes back to the <b>Fridge</b> on a fresh, short timer. Thaw only what you will eat soon.</p>'+
    portionPicker(left,b.yieldUnit,"kThQ")+
    '<div class="field"><label>Keeps in the fridge once thawed (days)</label><input id="kThD" type="number" inputmode="numeric" value="'+fd+'"></div>'+
    '<button class="btn" id="kThGo">Thaw it</button>',
    function(){
      var read=wirePortion("kThQ",left);
      document.getElementById("kThGo").onclick=function(){
        var q=read(); if(!q){ toast("How much?"); return }
        var d=num(document.getElementById("kThD").value,3)||3;
        thawBatch(id,q,d); set(K+"cseg","fridge");
        closeSheet(); render(); toast(nQty(q)+" "+(q===1?singular(b.yieldUnit):b.yieldUnit)+" thawing in the fridge");
      };
    });
}
function tossBatch(id){
  var b=S.batches.find(function(x){return x.id===id}); if(!b) return;
  var left=leftOf(b);
  openSheet("Throw it out?",
    '<p class="s">Clear <b>'+H(b.name)+"</b>"+(b.frozen?" from the freezer":"")+(left>0?" ("+nQty(left)+" "+H(b.yieldUnit)+" left)":"")+
    ". Anything you already logged from it stays in your log.</p>"+
    '<button class="btn danger" id="kTossYes">Throw it out</button>'+
    '<button class="btn ghost" id="kTossNo" style="margin-top:9px">Keep it</button>',
    function(){
      document.getElementById("kTossYes").onclick=function(){
        S.batches=S.batches.filter(function(x){return x.id!==id}); saveBatches();
        var w=get(K+"waste",{n:0}); w.n++; set(K+"waste",w);
        closeSheet(); render(); toast("Cleared");
      };
      document.getElementById("kTossNo").onclick=closeSheet;
    });
}

/* =================== RECIPE BOOK =================== */
function bookHTML(){
  var d=get(K+"recipeDraft",null);
  var banner=d&&d.r&&(d.r.name||d.r.ing.length)
    ? '<div class="kbanner"><div><b>Unsaved recipe</b><span>'+H(d.r.name||"Untitled")+" · "+d.r.ing.length+
      " ingredient"+(d.r.ing.length===1?"":"s")+'</span></div><button class="link" id="kResume">Continue</button>'+
      '<button class="link kdim" id="kDropDraft">Discard</button></div>' : "";
  var c=get(K+"cookDraft",null), cr=c&&S.recipes.find(function(x){return x.id===c.rid});
  if(c&&cr) banner+='<div class="kbanner"><div><b>Cooking in progress</b><span>'+H(cr.name)+" ×"+nQty(c.mult)+
    '</span></div><button class="link" id="kResumeCook">Continue</button>'+
    '<button class="link kdim" id="kDropCook">Discard</button></div>';
  if(!S.recipes.length)
    return banner+'<div class="empty"><b>Your recipe book is empty.</b><br><br>'+
      "Tap <b>New recipe</b> and enter what goes in it once. After that, cooking it is one tap, "+
      "at whatever size you are making: half, double, one and a half.</div>";
  return banner+'<div class="krecipes">'+S.recipes.map(function(r){
    var t=recipeTotals(r), y=+r.yieldQty||1;
    return '<div class="krec">'+
      '<div class="krmain"><div class="bname">'+H(r.name)+"</div>"+
        '<div class="bsub">'+r.ing.length+" ingredient"+(r.ing.length===1?"":"s")+" · makes "+nQty(y)+" "+H(r.yieldUnit)+
        " · "+fmt(t[0]/y)+" kcal / "+H(singular(r.yieldUnit))+(r.used?" · cooked "+r.used+"×":"")+"</div></div>"+
      '<div class="kracts"><button class="kbtn" data-cook="'+r.id+'">Cook</button>'+
        '<button class="kbtn ghost" data-edit="'+r.id+'">Edit</button></div>'+
    "</div>";
  }).join("")+"</div>";
}

/* ---- the recipe editor (new or edit). Its draft is saved on every keystroke ---- */
function blankRecipe(){ return {id:uid(),name:"",yieldQty:4,yieldUnit:"servings",shelfDays:5,ing:[],saved:0,used:0} }
function saveRDraft(d){ set(K+"recipeDraft",d) }
function openRecipeEditor(d){
  if(!d) d=get(K+"recipeDraft",null)||{edit:false,r:blankRecipe()};
  saveRDraft(d);
  var r=d.r;
  openSheet(d.edit?"Edit recipe":"New recipe",
    '<div class="field"><label>Recipe name</label><input id="kName" type="text" value="'+H(r.name)+'" placeholder="Chicken and rice"></div>'+
    '<div class="sectlab" style="padding-left:0">Ingredients for one batch<button class="link" id="kAddIng">+ Add ingredient</button></div>'+
    '<div id="kIngs">'+ingRows(r.ing)+"</div>"+
    '<div class="sectlab" style="padding-left:0">One batch makes</div>'+
    '<div class="grid2"><div class="field"><label>Amount</label><input id="kYield" type="number" inputmode="decimal" step="any" value="'+r.yieldQty+'"></div>'+
      '<div class="field"><label>Measured in</label><input id="kUnit" type="text" value="'+H(r.yieldUnit)+'" placeholder="cups"></div></div>'+
    '<div class="field"><label>Keeps for (days)</label><input id="kShelf" type="number" inputmode="numeric" value="'+r.shelfDays+'"></div>'+
    '<div class="preview" id="kPrev"></div>'+
    '<button class="btn" id="kSave">'+(d.edit?"Save changes":"Save to recipe book")+"</button>"+
    '<button class="btn ghost" id="kSaveCook" style="margin-top:9px">'+(d.edit?"Save and cook it now":"Save and cook it now")+"</button>"+
    (d.edit?'<button class="btn danger" id="kDel" style="margin-top:9px">Delete this recipe</button>':"")+
    '<p class="footnote">Everything here saves as you type. If anything interrupts you, it is waiting in the Recipe book.</p>',
    function(){
      var read=function(){
        r.name=document.getElementById("kName").value;
        r.yieldQty=num(document.getElementById("kYield").value,1)||1;
        r.yieldUnit=document.getElementById("kUnit").value.trim()||"servings";
        r.shelfDays=num(document.getElementById("kShelf").value,5)||5;
        saveRDraft(d); paint();
      };
      var paint=function(){ document.getElementById("kPrev").innerHTML=perUnitLine(ingTotals(r.ing),r.yieldQty,r.yieldUnit) };
      ["kName","kYield","kUnit","kShelf"].forEach(function(id){ document.getElementById(id).oninput=read });
      wireIngRows("kIngs", r.ing, function(){ saveRDraft(d); document.getElementById("kIngs").innerHTML=ingRows(r.ing); rewire(); paint(); });
      function rewire(){ wireIngRows("kIngs", r.ing, function(){ saveRDraft(d); document.getElementById("kIngs").innerHTML=ingRows(r.ing); rewire(); paint(); }) }
      document.getElementById("kAddIng").onclick=function(){
        read();
        openSearch({mode:"recipe",title:"Add to "+(r.name||"the recipe"),onPick:function(ing){
          r.ing.push(ing); saveRDraft(d); openRecipeEditor(d);
        }});
      };
      var commit=function(){
        read();
        if(!r.name.trim()){ toast("Give the recipe a name"); return null }
        if(!r.ing.length){ toast("Add at least one ingredient"); return null }
        r.name=r.name.trim(); r.saved=Date.now();
        var ix=S.recipes.findIndex(function(x){return x.id===r.id});
        if(ix>=0) S.recipes[ix]=copy(r); else S.recipes.unshift(copy(r));
        saveRecipes();
        if(window.MLGame&&window.MLGame.hookRecipe) window.MLGame.hookRecipe(r.id);
        set(K+"recipeDraft",null);
        return S.recipes.find(function(x){return x.id===r.id});
      };
      document.getElementById("kSave").onclick=function(){
        if(!commit()) return; set(K+"seg","book"); closeSheet(); render(); toast(d.edit?"Recipe updated":"Saved to your recipe book");
      };
      document.getElementById("kSaveCook").onclick=function(){
        var saved=commit(); if(!saved) return; set(K+"seg","book"); openCook(saved);
      };
      var del=document.getElementById("kDel");
      if(del) del.onclick=function(){
        if(!window.confirm("Delete "+(r.name||"this recipe")+" from your book?")) return;
        S.recipes=S.recipes.filter(function(x){return x.id!==r.id}); saveRecipes();
        set(K+"recipeDraft",null); closeSheet(); render(); toast("Recipe deleted");
      };
      paint();
      if(!r.name) setTimeout(function(){ var n=document.getElementById("kName"); if(n) n.focus() },150);
    });
}
/* an ingredient list you can adjust in place: amount, remove */
function ingRows(list){
  if(!list.length) return '<div class="empty" style="padding:18px 10px">No ingredients yet.</div>';
  return list.map(function(g,i){
    return '<div class="ing"><div class="ii">'+H(g.name)+"<u>"+(g.brand?H(g.brand)+" · ":"")+H(g.serving)+"</u></div>"+
      '<input class="kq" data-q="'+i+'" type="number" inputmode="decimal" step="any" value="'+nQty(g.qty)+'" aria-label="Servings of '+H(g.name)+'">'+
      '<span class="ik">'+fmt(g.n[0]*g.qty)+"</span>"+
      '<button class="x" data-rm="'+i+'" aria-label="Remove">×</button></div>';
  }).join("");
}
function wireIngRows(hostId, list, changed){
  var host=document.getElementById(hostId); if(!host) return;
  host.querySelectorAll("[data-q]").forEach(function(inp){
    inp.oninput=function(){ var g=list[+inp.dataset.q]; var v=parseFloat(inp.value);
      if(g&&isFinite(v)&&v>=0){ g.qty=v; var k=inp.parentNode.querySelector(".ik"); if(k) k.textContent=fmt(g.n[0]*v);
        changed.soft&&changed.soft(); } };
    inp.onchange=function(){ changed() };
  });
  host.querySelectorAll("[data-rm]").forEach(function(b){
    b.onclick=function(){ list.splice(+b.dataset.rm,1); changed() };
  });
}

/* ---- cooking from the book ---- */
var MULTS=[0.5,1,1.5,2,3];
function startCook(r, mult){
  return {rid:r.id, mult:mult, shelfDays:r.shelfDays, yieldUnit:r.yieldUnit,
    yieldQty:(+r.yieldQty||1)*mult, yieldTouched:false,
    rows:r.ing.map(function(g){ return Object.assign(copy(g),{base:g.qty, qty:g.qty*mult, on:true}) }),
    extra:[]};
}
function openCook(r, c){
  if(!c){
    var saved=get(K+"cookDraft",null);
    c=(saved&&saved.rid===r.id)?saved:startCook(r,1);
  }
  set(K+"cookDraft",c);
  var body=
    '<div class="field"><label>How much are you making</label><div class="chips kmults">'+
      MULTS.map(function(m){ return '<button data-mult="'+m+'" aria-pressed="'+(Math.abs(c.mult-m)<1e-9)+'">'+
        (m===0.5?"½":m===1.5?"1½":String(m))+"×</button>" }).join("")+
      '<input id="kMult" class="mini" type="number" inputmode="decimal" step="any" value="'+nQty(c.mult)+'" aria-label="Custom multiple">'+
    "</div></div>"+
    '<div class="sectlab" style="padding-left:0">This time<button class="link" id="kCookAdd">+ Add something</button></div>'+
    '<p class="note kexplain">Untick anything you left out, change an amount you used more or less of.</p>'+
    '<div id="kRows"></div>'+
    '<div class="grid2"><div class="field"><label>It made</label><input id="kCY" type="number" inputmode="decimal" step="any" value="'+nQty(c.yieldQty)+'"></div>'+
      '<div class="field"><label>Measured in</label><input id="kCU" type="text" value="'+H(c.yieldUnit)+'"></div></div>'+
    '<div class="field"><label>Keeps for (days)</label><input id="kCS" type="number" inputmode="numeric" value="'+c.shelfDays+'"></div>'+
    '<div class="preview" id="kCPrev"></div>'+
    '<button class="btn" id="kCookGo">Cook it</button>'+
    '<button class="btn ghost" id="kCookDrop" style="margin-top:9px">Cancel this batch</button>';
  openSheet("Cook "+r.name, body, function(){
    var rowsHTML=function(){
      var all=c.rows.concat(c.extra);
      return all.map(function(g,i){
        var isExtra=i>=c.rows.length;
        var changed=!isExtra&&g.on&&Math.abs(g.qty-g.base*c.mult)>Math.max(0.01,g.base*c.mult*0.01);
        return '<div class="ing kcook'+(g.on?"":" off")+(changed||isExtra?" kchg":"")+'">'+
          '<label class="kchk"><input type="checkbox" data-on="'+i+'"'+(g.on?" checked":"")+' aria-label="Include '+H(g.name)+'"></label>'+
          '<div class="ii">'+H(g.name)+"<u>"+(isExtra?"added this time · ":changed?"changed · ":"")+H(g.serving)+"</u></div>"+
          '<input class="kq" data-cq="'+i+'" type="number" inputmode="decimal" step="any" value="'+nQty(g.qty)+'"'+(g.on?"":" disabled")+">"+
          '<span class="ik">'+fmt(g.on?g.n[0]*g.qty:0)+"</span></div>";
      }).join("");
    };
    var paint=function(){
      var used=c.rows.concat(c.extra).filter(function(g){return g.on});
      document.getElementById("kCPrev").innerHTML=perUnitLine(ingTotals(used),c.yieldQty,c.yieldUnit);
    };
    var draw=function(){ document.getElementById("kRows").innerHTML=rowsHTML(); wire(); paint(); set(K+"cookDraft",c) };
    var wire=function(){
      var all=c.rows.concat(c.extra);
      document.querySelectorAll("#kRows [data-on]").forEach(function(cb){
        cb.onchange=function(){ all[+cb.dataset.on].on=cb.checked; draw() };
      });
      document.querySelectorAll("#kRows [data-cq]").forEach(function(inp){
        inp.oninput=function(){ var g=all[+inp.dataset.cq], v=parseFloat(inp.value);
          if(g&&isFinite(v)&&v>=0){ g.qty=v; inp.parentNode.querySelector(".ik").textContent=fmt(g.n[0]*v); paint(); set(K+"cookDraft",c) } };
        inp.onchange=draw;
      });
    };
    var setMult=function(m){
      if(!(m>0)) return;
      c.mult=m;
      c.rows.forEach(function(g){ g.qty=g.base*m });
      if(!c.yieldTouched){ c.yieldQty=(+r.yieldQty||1)*m; document.getElementById("kCY").value=nQty(c.yieldQty) }
      document.getElementById("kMult").value=nQty(m);
      document.querySelectorAll("[data-mult]").forEach(function(b){ b.setAttribute("aria-pressed",String(Math.abs(+b.dataset.mult-m)<1e-9)) });
      draw();
    };
    document.querySelectorAll("[data-mult]").forEach(function(b){ b.onclick=function(){ setMult(+b.dataset.mult) } });
    document.getElementById("kMult").onchange=function(){ setMult(num(this.value,c.mult)) };
    document.getElementById("kCY").oninput=function(){ c.yieldQty=num(this.value,c.yieldQty); c.yieldTouched=true; paint(); set(K+"cookDraft",c) };
    document.getElementById("kCU").oninput=function(){ c.yieldUnit=this.value.trim()||"servings"; paint(); set(K+"cookDraft",c) };
    document.getElementById("kCS").oninput=function(){ c.shelfDays=num(this.value,5)||5; set(K+"cookDraft",c) };
    document.getElementById("kCookAdd").onclick=function(){
      set(K+"cookDraft",c);
      openSearch({mode:"recipe",title:"Add to this batch",onPick:function(ing){
        ing.on=true; ing.base=0; c.extra.push(ing); set(K+"cookDraft",c); openCook(r,c);
      }});
    };
    document.getElementById("kCookDrop").onclick=function(){ set(K+"cookDraft",null); closeSheet(); render() };
    document.getElementById("kCookGo").onclick=function(){ finishCook(r,c) };
    draw();
  });
}
function cookChanges(c){
  var out=[];
  c.rows.forEach(function(g){
    if(!g.on) out.push("left out "+g.name);
    else if(Math.abs(g.qty-g.base*c.mult)>Math.max(0.01,g.base*c.mult*0.01)) out.push("changed "+g.name);
  });
  c.extra.forEach(function(g){ if(g.on) out.push("added "+g.name) });
  return out;
}
function makeBatch(r,c){
  var used=c.rows.concat(c.extra).filter(function(g){return g.on&&g.qty>0});
  var b={id:uid(), name:r.name, cookedAt:Date.now(), shelfDays:c.shelfDays,
    yieldQty:c.yieldQty, yieldUnit:c.yieldUnit, recipeId:r.id, mult:c.mult,
    ing:used.map(function(g){ return {name:g.name,brand:g.brand||"",serving:g.serving,grams:g.grams||0,qty:g.qty,n:g.n.slice()} })};
  S.batches.unshift(b); saveBatches();
  r.used=(r.used||0)+1; saveRecipes();
  set(K+"cookDraft",null); set(K+"seg","cooked");
  return b;
}
function finishCook(r,c){
  if(!c.rows.concat(c.extra).some(function(g){return g.on&&g.qty>0})){ toast("Nothing is ticked"); return }
  var ch=cookChanges(c);
  if(!ch.length){ makeBatch(r,c); closeSheet(); render(); toast(r.name+" is in the fridge"); return }
  /* changed something: keep it as a new recipe, fold it into this one, or neither */
  openSheet("Keep these changes?",
    '<p class="s">This time you '+H(ch.slice(0,4).join(", "))+(ch.length>4?" and "+(ch.length-4)+" more":"")+".</p>"+
    '<div class="field"><label>Name for a new recipe</label><input id="kNewName" type="text" value="'+H(r.name+" (variation)")+'"></div>'+
    '<button class="btn" id="kAsNew">Save as a new recipe</button>'+
    '<button class="btn ghost" id="kUpd" style="margin-top:9px">Update “'+H(r.name)+'” with these changes</button>'+
    '<button class="btn ghost" id="kOnce" style="margin-top:9px">Just this once</button>'+
    '<button class="link" id="kBack" style="display:block;margin:14px auto 0">Go back and edit</button>',
    function(){
      var asRecipeIng=function(){
        return c.rows.concat(c.extra).filter(function(g){return g.on&&g.qty>0}).map(function(g){
          return {name:g.name,brand:g.brand||"",serving:g.serving,grams:g.grams||0,qty:g.qty/c.mult,n:g.n.slice()} });
      };
      document.getElementById("kAsNew").onclick=function(){
        var nm=document.getElementById("kNewName").value.trim()||r.name+" (variation)";
        var nr={id:uid(),name:nm,yieldQty:c.yieldQty/c.mult,yieldUnit:c.yieldUnit,shelfDays:c.shelfDays,
                ing:asRecipeIng(),saved:Date.now(),used:0};
        S.recipes.unshift(nr); saveRecipes();
        if(window.MLGame&&window.MLGame.hookRecipe) window.MLGame.hookRecipe(nr.id);
        makeBatch(nr,c); closeSheet(); render(); toast("Saved as "+nm+" and cooked");
      };
      document.getElementById("kUpd").onclick=function(){
        r.ing=asRecipeIng(); r.yieldQty=c.yieldQty/c.mult; r.yieldUnit=c.yieldUnit; r.shelfDays=c.shelfDays; r.saved=Date.now();
        saveRecipes(); makeBatch(r,c); closeSheet(); render(); toast(r.name+" updated and cooked");
      };
      document.getElementById("kOnce").onclick=function(){ makeBatch(r,c); closeSheet(); render(); toast(r.name+" is in the fridge") };
      document.getElementById("kBack").onclick=function(){ openCook(r,c) };
    });
}

/* =================== PANTRY =================== */
var GROUPS=[
  ["produce","Produce",6,"#5FAE4E"],["dairy","Dairy & eggs",10,"#E8C547"],["meat","Meat & seafood",3,"#D9605A"],
  ["bakery","Bread & bakery",6,"#C98D4E"],["frozen","Frozen",120,"#5AA9E6"],["staples","Pantry staples",365,"#9B7FD1"],
  ["snacks","Snacks",90,"#E88C3A"],["drinks","Drinks",180,"#4FC1A2"],["sauces","Sauces & condiments",180,"#B85C8E"],
  ["other","Other",30,"#8C9690"]];
var GI={}; GROUPS.forEach(function(g,i){ GI[g[0]]=i });
function gname(k){ return (GROUPS[GI[k]]||GROUPS[GROUPS.length-1])[1] }
function gdays(k){ return (GROUPS[GI[k]]||GROUPS[GROUPS.length-1])[2] }
function gcol(k){ return (GROUPS[GI[k]]||GROUPS[GROUPS.length-1])[3] }
/* a first guess at the kind of food: Open Food Facts categories when we have
   them, otherwise words in the name. Always editable. */
var GUESS=[
  ["frozen",/frozen|ice cream|popsicle/],
  ["dairy",/milk|yogurt|yoghurt|cheese|butter|cream|egg|kefir|cottage|dairy/],
  ["meat",/chicken|beef|pork|turkey|ham|bacon|sausage|salmon|tuna|shrimp|fish|steak|meat|seafood|ground/],
  ["produce",/apple|banana|berr|lettuce|spinach|tomato|onion|potato|carrot|pepper|avocado|fruit|vegetable|salad|grape|orange|lemon|lime|broccoli|cucumber|kale|produce/],
  ["bakery",/bread|bagel|bun|tortilla|muffin|roll|croissant|bakery|pita/],
  ["drinks",/juice|soda|water|coffee|tea|drink|beverage|sparkling|kombucha|beer|wine|lemonade/],
  ["sauces",/sauce|ketchup|mustard|mayo|dressing|salsa|syrup|condiment|vinegar|honey|jam|peanut butter/],
  ["snacks",/chip|cracker|cookie|bar|snack|popcorn|pretzel|candy|chocolate|nut|trail mix/],
  ["staples",/rice|pasta|flour|sugar|oat|cereal|bean|lentil|canned|oil|spice|salt|grain|quinoa|noodle|soup|broth/]];
function guessGroup(text){
  var t=String(text||"").toLowerCase();
  for(var i=0;i<GUESS.length;i++) if(GUESS[i][1].test(t)) return GUESS[i][0];
  return "other";
}
function pantry(){ return get(PANTRY,[]) }
function savePantry(p){ set(PANTRY,p) }
function daysLeft(it){ return Math.ceil((it.expires-Date.now())/864e5) }
function expLabel(d){
  if(d<0) return {cls:"gone",t:"Expired "+(-d)+"d ago"};
  if(d===0) return {cls:"gone",t:"Today"};
  if(d===1) return {cls:"soon",t:"Tomorrow"};
  if(d<=3) return {cls:"soon",t:d+" days"};
  if(d>60) return {cls:"fresh",t:Math.round(d/30)+" mo"};
  return {cls:"fresh",t:d+" days"};
}
function expiringCount(){ return pantry().filter(function(it){return daysLeft(it)<=2}).length }
function pantryHTML(){
  var p=pantry(), by=get(K+"psort","soon");
  var trip=get(K+"trip",[]);
  var head='<div class="kptools"><button class="kbtn" id="kScanTrip">'+
      '<svg viewBox="0 0 24 24"><path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10.5 8v8M14 8v8M17 8v8"/></svg>Scan groceries</button>'+
      '<button class="kbtn ghost" id="kAddItem">Add by hand</button></div>'+
    (trip.length?'<div class="kbanner"><div><b>Shopping trip in progress</b><span>'+trip.length+" item"+(trip.length===1?"":"s")+
      ' scanned, not yet put away</span></div><button class="link" id="kTripResume">Review</button></div>':"")+
    (p.length?'<div class="ksort" role="group" aria-label="Sort pantry">'+
      [["soon","Goes off first"],["group","By kind of food"]].map(function(x){
        return '<button data-psort="'+x[0]+'" aria-pressed="'+(by===x[0])+'">'+x[1]+"</button>"}).join("")+"</div>":"");
  if(!p.length) return head+'<div class="empty"><b>Your pantry is empty.</b><br><br>'+
    "Next time you go shopping, tap <b>Scan groceries</b> and scan each thing as you put it away. "+
    "It guesses what kind of food it is and how long it keeps; you can change both.</div>";
  var row=function(it){
    var d=daysLeft(it), e=expLabel(d);
    return '<div class="kitem"><button class="kirow" data-item="'+it.id+'">'+
      '<i class="kg" style="background:'+gcol(it.group)+'"></i>'+
      '<div class="kimain"><div class="kin">'+H(it.name)+(it.qty>1?' <u>×'+nQty(it.qty)+"</u>":"")+"</div>"+
        '<div class="kis">'+(it.brand?H(it.brand)+" · ":"")+H(gname(it.group))+"</div></div>"+
      '<span class="pill '+e.cls+'">'+H(e.t)+"</span></button>"+
      '<button class="kx" data-used="'+it.id+'" aria-label="Used up or thrown out">×</button></div>';
  };
  var list;
  if(by==="group"){
    list=GROUPS.map(function(g){
      var items=p.filter(function(it){return (GI[it.group]===undefined?"other":it.group)===g[0]})
                 .sort(function(a,b){return a.expires-b.expires});
      return items.length?'<div class="sectlab">'+H(g[1])+" · "+items.length+"</div>"+items.map(row).join(""):"";
    }).join("");
  }else{
    var s=p.slice().sort(function(a,b){return a.expires-b.expires});
    var soon=s.filter(function(it){return daysLeft(it)<=3}), later=s.filter(function(it){return daysLeft(it)>3});
    list=(soon.length?'<div class="sectlab">Use these first · '+soon.length+"</div>"+soon.map(row).join(""):"")+
         (later.length?'<div class="sectlab">Everything else</div>'+later.map(row).join(""):"");
  }
  return head+'<div class="card kplist">'+list+"</div>";
}
function itemFromFood(f, group){
  var g=group||guessGroup(f.name+" "+(f.cats||""));
  return {id:uid(), name:f.name||"Unnamed", brand:f.brand||"", group:g, qty:1,
    days:gdays(g), barcode:f.barcode||"", foodId:f.id||null};
}
function putAway(items){
  var p=pantry(), now=Date.now();
  items.forEach(function(t){
    p.push({id:uid(), name:t.name, brand:t.brand||"", group:t.group, qty:+t.qty||1,
      added:now, expires:now+(+t.days||gdays(t.group))*864e5, barcode:t.barcode||"", foodId:t.foodId||null});
  });
  savePantry(p);
}

/* ---- the shopping trip: scan, scan, scan, then review once ---- */
var OFF_FIELDS="product_name,brands,serving_size,nutriments,categories_tags";
function lookupForTrip(code, done){
  var known=S.foods.find(function(f){return f.barcode===code});
  if(known) return done(Object.assign({},known,{cats:""}));
  fetch(OFF_URL+encodeURIComponent(code)+".json?fields="+OFF_FIELDS)
    .then(function(r){ return r.ok?r.json():null })
    .then(function(j){
      if(!j||j.status===0||!j.product) return done({name:"",barcode:code,cats:""});
      var f=offToFood(code,j.product);
      f.cats=(j.product.categories_tags||[]).join(" ").replace(/en:/g,"").replace(/-/g," ");
      /* keep it as one of your foods, so logging it later is instant and offline */
      if(f.name&&f.fields>=1&&!S.foods.some(function(x){return x.barcode===code})){
        var food={id:uid(),name:f.name,brand:f.brand,serving:f.serving,grams:f.grams,n:f.n,custom:true,barcode:code};
        S.foods.unshift(food); saveMeta(); f.id=food.id;
      }
      done(f);
    })
    .catch(function(){ done({name:"",barcode:code,cats:"",offline:true}) });
}
function tripAdd(f){
  var trip=get(K+"trip",[]);
  var same=f.barcode&&trip.find(function(t){return t.barcode===f.barcode});
  if(same) same.qty=(+same.qty||1)+1;
  else trip.unshift(itemFromFood(f));
  set(K+"trip",trip);
  return same||trip[0];
}
function openTrip(){
  var trip=get(K+"trip",[]);
  openSheet("Scan your groceries",
    '<div class="camwrap pxview kcam"><video id="scanVid" playsinline muted autoplay></video>'+
      '<i></i><i></i><i></i><i></i><div class="aim"></div></div>'+
    '<p class="scanmsg" id="scanMsg">Starting the camera…</p>'+
    '<div class="grid2"><button class="btn ghost" id="kTypeCode">Type a number</button>'+
      '<button class="btn ghost" id="kNoCode">No barcode</button></div>'+
    '<div class="sectlab" style="padding-left:0">This trip · <span id="kTripN">'+trip.length+"</span></div>"+
    '<div id="kTripList">'+tripListHTML(trip)+"</div>"+
    '<button class="btn" id="kTripDone"'+(trip.length?"":" disabled")+'>Review and put away</button>',
    function(){
      var refresh=function(){
        var t=get(K+"trip",[]);
        document.getElementById("kTripList").innerHTML=tripListHTML(t);
        document.getElementById("kTripN").textContent=t.length;
        document.getElementById("kTripDone").disabled=!t.length;
      };
      var onCode=function(code){
        scanStatus("Looking up "+code+"…");
        if(navigator.vibrate) try{navigator.vibrate(40)}catch(e){}
        if(window.MLGame&&window.MLGame.hookScan) window.MLGame.hookScan();
        lookupForTrip(code,function(f){
          if(!f.name){ f.name="Barcode "+code; }
          var it=tripAdd(f);
          scanStatus("Added "+it.name+(it.qty>1?" (×"+it.qty+")":"")+" — "+gname(it.group)+", keeps ~"+it.days+" days");
          refresh();
        });
      };
      document.getElementById("kTypeCode").onclick=function(){
        var c=(prompt("Barcode number under the bars")||"").replace(/\D/g,"");
        if(c) onCode(c);
      };
      document.getElementById("kNoCode").onclick=function(){
        var n=(prompt("What is it?")||"").trim();
        if(n){ tripAdd({name:n}); refresh(); scanStatus("Added "+n); }
      };
      document.getElementById("kTripDone").onclick=function(){ stopScanner(); openTripReview() };
      runScan(document.getElementById("scanVid"),{continuous:true,onCode:onCode});
    },
    '<button class="link" id="sheetClose">Done</button>');
}
function tripListHTML(trip){
  if(!trip.length) return '<div class="empty" style="padding:14px">Nothing scanned yet.</div>';
  return trip.slice(0,30).map(function(t){
    return '<div class="ing"><i class="kg" style="background:'+gcol(t.group)+'"></i><div class="ii">'+H(t.name)+
      (t.qty>1?" ×"+t.qty:"")+"<u>"+H(gname(t.group))+" · ~"+t.days+" days</u></div></div>";
  }).join("")+(trip.length>30?'<p class="note">and '+(trip.length-30)+" more</p>":"");
}
function groupSelect(cur, attr){
  return '<select '+attr+'>'+GROUPS.map(function(g){
    return '<option value="'+g[0]+'"'+(g[0]===cur?" selected":"")+">"+H(g[1])+"</option>"}).join("")+"</select>";
}
function openTripReview(){
  var trip=get(K+"trip",[]);
  if(!trip.length){ openTrip(); return }
  openSheet("Put it away",
    '<p class="s">Check the kind of food and how many days it keeps. Everything else was filled in from the scan.</p>'+
    '<div class="card krev">'+trip.map(function(t,i){
      return '<div class="krevrow"><div class="krevtop"><input class="kname" data-tn="'+i+'" type="text" value="'+H(t.name)+'">'+
        '<button class="x" data-trm="'+i+'" aria-label="Remove">×</button></div>'+
        '<div class="krevbot">'+groupSelect(t.group,'data-tg="'+i+'"')+
        '<label class="kdays">keeps <input data-td="'+i+'" type="number" inputmode="numeric" value="'+t.days+'"> days</label>'+
        '<label class="kdays">qty <input data-tq="'+i+'" type="number" inputmode="decimal" value="'+t.qty+'"></label></div></div>';
    }).join("")+"</div>"+
    '<button class="btn" id="kPutAway">Add '+trip.length+" item"+(trip.length===1?"":"s")+" to the pantry</button>"+
    '<button class="btn ghost" id="kMoreScan" style="margin-top:9px">Scan more</button>',
    function(){
      var save=function(){ set(K+"trip",trip) };
      document.querySelectorAll("[data-tn]").forEach(function(i){ i.oninput=function(){ trip[+i.dataset.tn].name=i.value; save() } });
      document.querySelectorAll("[data-tg]").forEach(function(s){ s.onchange=function(){
        var t=trip[+s.dataset.tg]; var wasDefault=t.days===gdays(t.group);
        t.group=s.value; if(wasDefault){ t.days=gdays(t.group);
          var d=document.querySelector('[data-td="'+s.dataset.tg+'"]'); if(d) d.value=t.days; }
        save() } });
      document.querySelectorAll("[data-td]").forEach(function(i){ i.oninput=function(){ trip[+i.dataset.td].days=num(i.value,7); save() } });
      document.querySelectorAll("[data-tq]").forEach(function(i){ i.oninput=function(){ trip[+i.dataset.tq].qty=num(i.value,1); save() } });
      document.querySelectorAll("[data-trm]").forEach(function(b){ b.onclick=function(){ trip.splice(+b.dataset.trm,1); save(); openTripReview() } });
      document.getElementById("kPutAway").onclick=function(){
        putAway(trip); var n=trip.length; set(K+"trip",[]); set(K+"seg","pantry");
        closeSheet(); render(); toast(n+" item"+(n===1?"":"s")+" in the pantry");
      };
      document.getElementById("kMoreScan").onclick=openTrip;
    });
}
function openItem(id, isNew){
  var p=pantry(), it=isNew?null:p.find(function(x){return x.id===id});
  var draft=it?copy(it):{id:uid(),name:"",brand:"",group:"produce",qty:1,added:Date.now(),
    expires:Date.now()+gdays("produce")*864e5};
  var dl=Math.max(0,daysLeft(draft));
  var food=draft.foodId&&S.foods.find(function(f){return f.id===draft.foodId});
  openSheet(it?it.name:"Add to pantry",
    '<div class="field"><label>What is it</label><input id="kiName" type="text" value="'+H(draft.name)+'" placeholder="Greek yogurt"></div>'+
    '<div class="grid2"><div class="field"><label>Kind of food</label>'+groupSelect(draft.group,'id="kiGroup"')+"</div>"+
      '<div class="field"><label>How many</label><input id="kiQty" type="number" inputmode="decimal" value="'+draft.qty+'"></div></div>'+
    '<div class="field"><label>Days left</label><div class="qty"><button id="kiMinus" aria-label="One day less">−</button>'+
      '<input id="kiDays" type="text" inputmode="numeric" value="'+dl+'"><button id="kiPlus" aria-label="One day more">+</button>'+
      '<span class="unit" id="kiDate"></span></div></div>'+
    '<button class="btn" id="kiSave">'+(it?"Save":"Add it")+"</button>"+
    (food?'<button class="btn ghost" id="kiLog" style="margin-top:9px">Log some of this</button>':"")+
    (it?'<div class="grid2" style="margin-top:9px"><button class="btn ghost" id="kiUsed">Used it up</button>'+
        '<button class="btn danger" id="kiToss">Threw it out</button></div>':""),
    function(){
      var dEl=document.getElementById("kiDays"), dateEl=document.getElementById("kiDate");
      var showDate=function(){ var d=num(dEl.value,0); dateEl.textContent=new Date(Date.now()+d*864e5).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}) };
      document.getElementById("kiMinus").onclick=function(){ dEl.value=Math.max(0,num(dEl.value,0)-1); showDate() };
      document.getElementById("kiPlus").onclick=function(){ dEl.value=num(dEl.value,0)+1; showDate() };
      dEl.oninput=showDate;
      document.getElementById("kiGroup").onchange=function(){ if(!it){ dEl.value=gdays(this.value); showDate() } };
      document.getElementById("kiSave").onclick=function(){
        var nm=document.getElementById("kiName").value.trim(); if(!nm){ toast("What is it?"); return }
        draft.name=nm; draft.group=document.getElementById("kiGroup").value;
        draft.qty=num(document.getElementById("kiQty").value,1)||1;
        draft.expires=Date.now()+num(dEl.value,0)*864e5;
        var all=pantry(), ix=all.findIndex(function(x){return x.id===draft.id});
        if(ix>=0) all[ix]=draft; else all.push(draft);
        savePantry(all); set(K+"seg","pantry"); closeSheet(); render(); toast(it?"Saved":"Added to the pantry");
      };
      var rm=function(msg,waste){ return function(){
        savePantry(pantry().filter(function(x){return x.id!==draft.id}));
        if(waste){ var w=get(K+"waste",{n:0}); w.n++; set(K+"waste",w) }
        closeSheet(); render(); toast(msg) } };
      var u=document.getElementById("kiUsed"); if(u) u.onclick=rm("Used up",false);
      var t=document.getElementById("kiToss"); if(t) t.onclick=rm("Thrown out",true);
      var lg=document.getElementById("kiLog"); if(lg) lg.onclick=function(){ openDetail(Object.assign({},food,{custom:true}),{mode:"log",meal:mealOfNow()}) };
      showDate();
      if(!it) setTimeout(function(){ document.getElementById("kiName").focus() },150);
    });
}
function quickRemove(id){
  var all=pantry(), it=all.find(function(x){return x.id===id}); if(!it) return;
  openSheet(it.name,
    '<p class="s">Take it off the pantry list.</p>'+
    '<div class="grid2"><button class="btn" id="kqUsed">Used it up</button>'+
    '<button class="btn danger" id="kqToss">Threw it out</button></div>'+
    (it.qty>1?'<button class="btn ghost" id="kqOne" style="margin-top:9px">Used one of '+nQty(it.qty)+"</button>":""),
    function(){
      var rm=function(waste){ savePantry(pantry().filter(function(x){return x.id!==id}));
        if(waste){ var w=get(K+"waste",{n:0}); w.n++; set(K+"waste",w) } closeSheet(); render(); };
      document.getElementById("kqUsed").onclick=function(){ rm(false); toast("Used up") };
      document.getElementById("kqToss").onclick=function(){ rm(true); toast("Thrown out") };
      var one=document.getElementById("kqOne");
      if(one) one.onclick=function(){ var a=pantry(), x=a.find(function(y){return y.id===id});
        if(x){ x.qty=Math.max(0,x.qty-1); savePantry(a) } closeSheet(); render(); toast(nQty(x.qty)+" left") };
    });
}

/* =================== the tab =================== */
function kitchenHTML(){
  var s=seg();
  return segHTML()+(s==="book"?bookHTML():s==="pantry"?pantryHTML():cookedHTML());
}
function bindKitchen(el){
  el.querySelectorAll("[data-kseg]").forEach(function(b){ b.onclick=function(){ setSeg(b.dataset.kseg) } });
  el.querySelectorAll("[data-batch]").forEach(function(b){ b.onclick=function(){ openBatch(b.dataset.batch) } });
  el.querySelectorAll("[data-toss]").forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); tossBatch(b.dataset.toss) } });
  el.querySelectorAll("[data-freeze]").forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); openFreeze(b.dataset.freeze) } });
  el.querySelectorAll("[data-thaw]").forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); openThaw(b.dataset.thaw) } });
  el.querySelectorAll("[data-cseg]").forEach(function(b){ b.onclick=function(){ set(K+"cseg",b.dataset.cseg); render() } });
  el.querySelectorAll("[data-cook]").forEach(function(b){ b.onclick=function(){
    var r=S.recipes.find(function(x){return x.id===b.dataset.cook}); if(r) openCook(r) } });
  el.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){
    var r=S.recipes.find(function(x){return x.id===b.dataset.edit}); if(!r) return;
    var d=get(K+"recipeDraft",null);
    openRecipeEditor(d&&d.edit&&d.r.id===r.id?d:{edit:true,r:copy(r)}) } });
  var on=function(id,fn){ var x=el.querySelector("#"+id); if(x) x.onclick=fn };
  on("kResume",function(){ openRecipeEditor() });
  on("kDropDraft",function(){ set(K+"recipeDraft",null); render() });
  on("kResumeCook",function(){ var c=get(K+"cookDraft",null), r=c&&S.recipes.find(function(x){return x.id===c.rid}); if(r) openCook(r,c) });
  on("kDropCook",function(){ set(K+"cookDraft",null); render() });
  on("kScanTrip",openTrip);
  on("kTripResume",openTripReview);
  on("kAddItem",function(){ openItem(null,true) });
  el.querySelectorAll("[data-psort]").forEach(function(b){ b.onclick=function(){ set(K+"psort",b.dataset.psort); render() } });
  el.querySelectorAll("[data-item]").forEach(function(b){ b.onclick=function(){ openItem(b.dataset.item) } });
  el.querySelectorAll("[data-used]").forEach(function(b){ b.onclick=function(){ quickRemove(b.dataset.used) } });
}
function fab(){
  var s=seg();
  if(s==="pantry") return openTrip();
  if(s==="book") return openRecipeEditor();
  /* from Cooked: cook something from the book, or write a new recipe */
  if(!S.recipes.length) return openRecipeEditor();
  openSheet("Cook something",
    '<div class="card rlist">'+S.recipes.map(function(r){
      return '<button class="crow" data-pick="'+r.id+'"><div class="cmain"><div class="cn">'+H(r.name)+"</div>"+
        '<div class="csub">makes '+nQty(r.yieldQty)+" "+H(r.yieldUnit)+(r.used?" · cooked "+r.used+"×":"")+"</div></div>"+
        '<div class="crt"><div class="mins">&rsaquo;</div></div></button>';
    }).join("")+"</div>"+
    '<button class="btn ghost" id="kNewR">Write a new recipe</button>',
    function(){
      document.querySelectorAll("[data-pick]").forEach(function(b){ b.onclick=function(){
        var r=S.recipes.find(function(x){return x.id===b.dataset.pick}); if(r) openCook(r) } });
      document.getElementById("kNewR").onclick=function(){ openRecipeEditor() };
    });
}
function fabLabel(){ var s=seg(); return s==="pantry"?"Scan groceries":s==="book"?"New recipe":"Cook something" }

window.MLKitchen={fab:fab, html:kitchenHTML, guessGroup:guessGroup, putAway:putAway, pantry:pantry,
  daysLeft:daysLeft, startCook:startCook, cookChanges:cookChanges, makeBatch:makeBatch,
  openCook:openCook, openRecipeEditor:openRecipeEditor, openTrip:openTrip, tripAdd:tripAdd,
  openTripReview:openTripReview, tossBatch:tossBatch, groups:GROUPS, expLabel:expLabel,
  freezeBatch:freezeBatch, thawBatch:thawBatch, splitBatch:splitBatch, openFreeze:openFreeze, openThaw:openThaw};

(function boot(){
  if(typeof render!=="function"||typeof openSheet!=="function"||typeof S==="undefined"){ return setTimeout(boot,60) }
  /* the old single "Recipes" sheet is folded into the Recipe book */
  var _render=window.render;
  window.render=function(){
    _render.apply(this,arguments);
    if(S.view!=="meals") return;
    var el=document.getElementById("screen");
    el.innerHTML=kitchenHTML(); bindKitchen(el);
    var lab=document.getElementById("fabLabel"); if(lab) lab.textContent=fabLabel();
  };
  if(S.view==="meals") window.render();
})();
})();
