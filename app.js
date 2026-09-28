window.WB_BUILD = '2026-09-28';
(function(){
  "use strict";
  var MS_DAY = 86400000;
  var VERDICTS = ["confirmed","refuted","inconclusive"];

  var objectives = [];   // [{id,num,short,title,track,order}]
  var worklog = [];
  var experiments = [];
  var questions = [];
  var papers = [];
  var deadlines = [];
  var dbRef = null;
  var tasks = [];
  var board = [];
  var library = [];
  var srcFilter = "all";
  var thWhich = "questions";
  var thMode = "move";
  var thLayout = "free";
  var thSel = null;
  var thDirty = false;
  var ready = {obj:false, work:false, exp:false, q:false, pp:false, dl:false, tk:false};
  var plFilter = {needs:"all", objective:"all", track:"all"};
  var tkOpenId = null;
  var qFilter = {status:"open", cluster:"all"};
  var qOpenId = null;
  var ppFilter = "todo";

  /* ---------- helpers ---------- */
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function el(id){ return document.getElementById(id); }
  function midnight(d){ var x = new Date(d); x.setHours(0,0,0,0); return x; }
  function todayISO(){
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") +
           "-" + String(d.getDate()).padStart(2,"0");
  }
  function daysSince(iso){
    if (!iso) return null;
    var t = new Date(iso + "T00:00:00");
    if (isNaN(t)) return null;
    return Math.round((midnight(new Date()) - midnight(t)) / MS_DAY);
  }
  function fmtShort(iso){
    var t = new Date(iso + "T00:00:00");
    if (isNaN(t)) return {top:iso, bottom:""};
    return {
      top: t.toLocaleDateString(undefined,{day:"numeric",month:"short"}),
      bottom: String(t.getFullYear())
    };
  }
  function store(k,v){
    try{ if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k,v); }
    catch(e){ return null; }
  }

  /* ---------- tabs ---------- */
  var TABS = [["today","tab-today","view-today"],["log","tab-log","view-log"],
              ["q","tab-q","view-q"],["plan","tab-plan","view-plan"],["threads","tab-threads","view-threads"],["field","tab-field","view-field"],
              ["setup","tab-set","view-setup"]];
  function showTab(which){
    if (!TABS.some(function(t){ return t[0] === which; })) which = "today";
    TABS.forEach(function(t){
      var on = t[0] === which;
      el(t[1]).setAttribute("aria-selected", String(on));
      el(t[2]).hidden = !on;
    });
    store("wb.tab", which);
  }
  TABS.forEach(function(t){
    el(t[1]).addEventListener("click", function(){ showTab(t[0]); });
  });
  showTab(store("wb.tab") || "today");

  /* ---------- chip groups ---------- */
  function chipGroup(host, items, selected){
    host.innerHTML = items.map(function(it){
      return '<button type="button" class="chip" data-v="' + esc(it.value) + '"' +
             ' aria-pressed="' + (it.value === selected ? "true" : "false") + '">' +
             esc(it.label) + '</button>';
    }).join("");
  }
  function chipValue(host){
    var on = host.querySelector('.chip[aria-pressed="true"]');
    return on ? on.getAttribute("data-v") : null;
  }
  function wireChips(host){
    host.addEventListener("click", function(ev){
      var b = ev.target.closest(".chip");
      if (!b || !host.contains(b)) return;
      host.querySelectorAll(".chip").forEach(function(c){
        c.setAttribute("aria-pressed", String(c === b));
      });
    });
  }
  wireChips(el("w-obj")); wireChips(el("e-obj")); wireChips(el("e-verdict"));

  function objChips(){
    var items = objectives.map(function(o){
      return {value:o.id, label:(o.num ? o.num + " " : "") + o.short};
    });
    if (!items.length) return;
    var first = objectives[0].id;
    chipGroup(el("w-obj"), items, chipValue(el("w-obj")) || first);
    chipGroup(el("e-obj"), items, chipValue(el("e-obj")) || first);
  }
  chipGroup(el("e-verdict"), VERDICTS.map(function(v){ return {value:v,label:v}; }), "confirmed");

  /* ---------- rendering: today ---------- */
  function lastTouch(objId){
    var best = null;
    function scan(rows){
      rows.forEach(function(r){
        if (r.objective !== objId || !r.date) return;
        if (best === null || String(r.date) > best) best = String(r.date);
      });
    }
    scan(worklog); scan(experiments);
    return best;
  }

  function renderAges(){
    var host = el("ages");
    var tracked = objectives.filter(function(o){ return o.track !== false; });
    if (!tracked.length){
      host.innerHTML = '<div class="msg">No objectives on file yet.</div>';
      el("ages-tally").textContent = "0";
      return;
    }
    el("ages-tally").textContent = tracked.length + " tracked";
    host.style.gridTemplateColumns = "repeat(" + Math.min(tracked.length,4) + ",minmax(0,1fr))";

    var worst = null;
    host.innerHTML = tracked.map(function(o){
      var iso = lastTouch(o.id), d = daysSince(iso), s = "s-ok", n, u;
      if (d === null){ s = "s-stale"; n = "—"; u = "no entries"; }
      else {
        if (d > 21) s = "s-stale"; else if (d > 7) s = "s-soon";
        n = String(d); u = d === 0 ? "today" : (d === 1 ? "day" : "days");
      }
      /* never-touched ranks above any number of days */
      var rank = (d === null) ? Infinity : d;
      if (worst === null || rank > worst.rank) worst = {o:o, d:d, rank:rank};
      return '<article class="age ' + s + '">' +
        '<div class="stripe"></div>' +
        '<div class="age-body">' +
          '<span class="n">' + esc(n) + '</span>' +
          '<span class="u">' + esc(u) + '</span>' +
          '<div class="lbl"><span class="num">' + esc(o.num || "") + '</span>' + esc(o.short) + '</div>' +
        '</div>' +
      '</article>';
    }).join("");

    var line = el("neglect");
    if (worst && (worst.d === null || worst.d > 14)){
      line.hidden = false;
      line.innerHTML = worst.d === null
        ? 'Nothing recorded yet against <b>' + esc(worst.o.num + " " + worst.o.short) + '</b>. ' + esc(worst.o.title || "")
        : 'Longest untouched: <b>' + esc(worst.o.num + " " + worst.o.short) + '</b>, ' + worst.d + ' days. ' + esc(worst.o.title || "");
    } else {
      line.hidden = true;
    }
  }

  function weekRows(rows){
    return rows.filter(function(r){
      var d = daysSince(r.date);
      return d !== null && d >= 0 && d < 7;
    });
  }

  function renderCounts(){
    var w = weekRows(worklog), e = weekRows(experiments);
    var hours = w.reduce(function(a,r){ var h = parseFloat(r.hours); return a + (isFinite(h) ? h : 0); }, 0);
    var byVerdict = {};
    experiments.forEach(function(r){ byVerdict[r.verdict] = (byVerdict[r.verdict]||0) + 1; });
    var tallied = (byVerdict.confirmed||0) + (byVerdict.refuted||0) + (byVerdict.inconclusive||0);

    el("counts").innerHTML =
      cell(w.length, w.length === 1 ? "entry this week" : "entries this week") +
      cell(hours ? (Math.round(hours*10)/10) : 0, "hours this week") +
      cell(e.length, e.length === 1 ? "experiment this week" : "experiments this week") +
      cell(tallied, "experiments on record");

    function cell(n,u){
      return '<div class="cnt"><span class="n">' + esc(n) + '</span><span class="u">' + esc(u) + '</span></div>';
    }

    var last = null;
    worklog.concat(experiments).forEach(function(r){
      if (r.date && (last === null || String(r.date) > last)) last = String(r.date);
    });
    var ld = daysSince(last);
    el("s-last").textContent = last === null ? "never"
      : (ld === 0 ? "today" : ld === 1 ? "yesterday" : ld + " days ago");
    el("s-week").textContent = w.length + " entries";

    var from = new Date(); from.setDate(from.getDate() - 6);
    el("week-range").textContent = from.toLocaleDateString(undefined,{day:"numeric",month:"short"}) +
      " – " + new Date().toLocaleDateString(undefined,{day:"numeric",month:"short"});
  }

  function objLabel(id){
    for (var i=0;i<objectives.length;i++) if (objectives[i].id === id)
      return (objectives[i].num ? objectives[i].num + " " : "") + objectives[i].short;
    return id || "unassigned";
  }

  function renderRecent(){
    var host = el("recent");
    var rows = worklog.map(function(r){ return {k:"log", r:r}; })
      .concat(experiments.map(function(r){ return {k:"exp", r:r}; }));
    rows.sort(function(a,b){
      var c = String(b.r.date||"").localeCompare(String(a.r.date||""));
      if (c) return c;
      return String(b.r.createdAt||"").localeCompare(String(a.r.createdAt||""));
    });
    el("recent-tally").textContent = worklog.length + " log / " + experiments.length + " exp";

    if (!rows.length){
      host.innerHTML = '<div class="msg">Nothing logged yet. Open <b>Log</b> and record what you did today — even one line starts the clocks above.</div>';
      return;
    }

    host.innerHTML = rows.slice(0,12).map(function(x){
      var r = x.r, w = fmtShort(r.date);
      if (x.k === "log"){
        return '<article class="row">' +
          '<div class="stripe"></div>' +
          '<div class="row-when"><b>' + esc(w.top) + '</b>' + esc(w.bottom) + '</div>' +
          '<div class="row-body">' +
            '<p class="what">' + esc(r.what) + '</p>' +
            '<div class="row-meta">' +
              '<span class="k">log</span>' +
              '<span>' + esc(objLabel(r.objective)) + '</span>' +
              (r.hours ? '<span>' + esc(r.hours) + ' h</span>' : '') +
            '</div>' +
            (r.blocker ? '<p class="row-note"><em>blocked</em>' + esc(r.blocker) + '</p>' : '') +
            (r.next ? '<p class="row-note"><em>next</em>' + esc(r.next) + '</p>' : '') +
          '</div>' +
        '</article>';
      }
      return '<article class="row v-' + esc(r.verdict || "") + '">' +
        '<div class="stripe"></div>' +
        '<div class="row-when"><b>' + esc(w.top) + '</b>' + esc(w.bottom) + '</div>' +
        '<div class="row-body">' +
          '<p class="what">' + esc(r.hypothesis) + '</p>' +
          '<div class="row-meta">' +
            '<span class="k">' + esc(r.verdict || "experiment") + '</span>' +
            '<span>' + esc(objLabel(r.objective)) + '</span>' +
            (r.dataPath ? '<span>' + esc(r.dataPath) + '</span>' : '') +
          '</div>' +
          (r.result ? '<p class="row-note"><em>result</em>' + esc(r.result) + '</p>' : '') +
        '</div>' +
      '</article>';
    }).join("");
  }

  /* ---------- rendering: questions ---------- */
  var QSTATUS = [
    {value:"open", label:"open"},
    {value:"answered", label:"answered"},
    {value:"dropped", label:"dropped"},
    {value:"all", label:"all"}
  ];
  chipGroup(el("q-status"), QSTATUS, qFilter.status);
  el("q-status").addEventListener("click", function(ev){
    var b = ev.target.closest(".chip");
    if (!b) return;
    qFilter.status = b.getAttribute("data-v");
    qOpenId = null;
    renderQuestions();
  });
  wireChips(el("q-status"));
  el("q-cluster").addEventListener("change", function(){
    qFilter.cluster = this.value; qOpenId = null; renderQuestions();
  });

  function closedCount(){
    return questions.filter(function(q){ return q.status === "answered" || q.status === "dropped"; }).length;
  }

  function renderProgress(){
    var total = questions.length, done = closedCount();
    var pct = total ? Math.round(done / total * 100) : 0;
    el("q-tally").textContent = total ? pct + "%" : "—";
    el("q-tally-2").textContent = done + " of " + total + " closed";
    if (!total){
      el("q-progress").innerHTML = '<div class="msg">No questions on file yet.</div>';
      return;
    }
    var clusters = {};
    questions.forEach(function(q){
      var c = clusters[q.cluster] || (clusters[q.cluster] = {n:0,d:0});
      c.n++; if (q.status === "answered" || q.status === "dropped") c.d++;
    });
    el("q-progress").innerHTML =
      '<div class="prog">' +
        '<span class="big">' + done + '</span>' +
        '<span class="of">of ' + total + ' closed</span>' +
        '<span class="bar"><i style="width:' + pct + '%"></i></span>' +
      '</div>' +
      '<div class="bycluster">' + Object.keys(clusters).map(function(k){
        return '<span>' + esc(k) + ' <b>' + clusters[k].d + '/' + clusters[k].n + '</b></span>';
      }).join("") + '</div>';
  }

  function renderClusterFilter(){
    var sel = el("q-cluster"), seen = [];
    questions.forEach(function(q){ if (seen.indexOf(q.cluster) < 0) seen.push(q.cluster); });
    var want = ['<option value="all">All clusters</option>'].concat(seen.map(function(c){
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    })).join("");
    if (sel.innerHTML !== want){ sel.innerHTML = want; sel.value = qFilter.cluster; }
  }

  function renderQuestions(){
    renderProgress(); renderClusterFilter();
    var host = el("q-list");
    var rows = questions.filter(function(q){
      if (qFilter.cluster !== "all" && q.cluster !== qFilter.cluster) return false;
      if (qFilter.status === "all") return true;
      return (q.status || "open") === qFilter.status;
    }).sort(function(a,b){ return (a.n||0) - (b.n||0); });

    if (!rows.length){
      host.innerHTML = '<div class="msg">Nothing matches that filter.</div>';
      return;
    }

    host.innerHTML = rows.map(function(q){
      var st = q.status || "open", open = q.id === qOpenId;
      var body = "";
      if (open){
        body = '<div class="q-open">' +
          (st === "open" ? "" :
            '<p class="q-ans">' + esc(q.answer || "(no answer recorded)") + '</p>' +
            '<p class="q-when">' + esc(st) + (q.answeredOn ? " · " + esc(q.answeredOn) : "") + '</p>') +
          '<div class="field"><label for="q-ans-box">Answer</label>' +
          '<textarea id="q-ans-box">' + esc(q.answer || "") + '</textarea></div>' +
          '<div class="actions">' +
            '<button type="button" class="btn" data-act="answer" data-id="' + esc(q.id) + '">Mark answered</button>' +
            '<button type="button" class="btn ghost" data-act="drop" data-id="' + esc(q.id) + '">Drop</button>' +
            (st === "open" ? "" :
              '<button type="button" class="btn ghost" data-act="reopen" data-id="' + esc(q.id) + '">Reopen</button>') +
            '<span class="said" id="q-said"></span>' +
          '</div>' +
        '</div>';
      }
      return '<article class="q st-' + esc(st) + '">' +
        '<button class="q-head" type="button" data-open="' + esc(q.id) + '" aria-expanded="' + open + '">' +
          '<span class="stripe"></span>' +
          '<span class="q-n">' + esc(q.n) + '</span>' +
          '<span class="q-t">' + esc(q.text) + '</span>' +
          '<span class="q-c">' + esc(q.cluster) + '</span>' +
        '</button>' + body +
      '</article>';
    }).join("");
  }

  el("q-list").addEventListener("click", function(ev){
    var head = ev.target.closest("[data-open]");
    if (head){
      var id = head.getAttribute("data-open");
      qOpenId = (qOpenId === id) ? null : id;
      renderQuestions();
      return;
    }
    var btn = ev.target.closest("[data-act]");
    if (!btn || !dbRef) return;
    var act = btn.getAttribute("data-act"), qid = btn.getAttribute("data-id");
    var box = el("q-ans-box");
    var answer = box ? box.value.trim() : "";
    var patch = act === "reopen"
      ? {status:"open", answeredOn:""}
      : {status:(act === "answer" ? "answered" : "dropped"),
         answer:answer, answeredOn:todayISO()};
    if (act === "answer" && !answer){
      var s = el("q-said"); if (s) say(s, "Write the answer first.");
      return;
    }
    btn.disabled = true;
    dbRef.collection("questions").doc(qid).update(patch).then(function(){
      qOpenId = null;
    })["catch"](function(e){
      var s = el("q-said"); if (s) say(s, failText(e));
      btn.disabled = false;
    });
  });

  /* ---------- rendering: field ---------- */
  var TRIAGE = ["unread","reading","read","cited","irrelevant"];
  var INTENT = ["submitting","considering","ignore"];

  chipGroup(el("pp-filter"), [
    {value:"todo", label:"to triage"}, {value:"active", label:"active"},
    {value:"all", label:"all"}
  ], ppFilter);
  wireChips(el("pp-filter"));
  el("pp-filter").addEventListener("click", function(ev){
    var b = ev.target.closest(".chip"); if (!b) return;
    ppFilter = b.getAttribute("data-v"); renderPapers();
  });

  function fmtDue(iso){
    var t = new Date(iso + "T00:00:00");
    if (isNaN(t)) return iso;
    return t.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
  }
  function daysUntil(iso){
    if (!iso) return null;
    var t = new Date(iso + "T00:00:00");
    if (isNaN(t)) return null;
    return Math.round((midnight(t) - midnight(new Date())) / MS_DAY);
  }

  function renderDeadlines(){
    var host = el("deadlines");
    if (!deadlines.length){
      host.innerHTML = '<div class="msg">No submission windows on file yet.</div>';
      el("dl-tally").textContent = "0"; return;
    }
    function rank(r){
      if (!r.due) return 1;
      var d = daysUntil(r.due);
      return (d === null || d < 0) ? 2 : 0;
    }
    var rows = deadlines.slice().sort(function(a,b){
      var ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return String(a.due||"").localeCompare(String(b.due||""));
    });
    var open = rows.filter(function(r){ return rank(r) !== 2; }).length;
    var mine = rows.filter(function(r){ return r.intent === "submitting"; }).length;
    el("dl-tally").textContent = open + " open" + (mine ? " · " + mine + " mine" : "");

    host.innerHTML = rows.map(function(r){
      var d = daysUntil(r.due), cls, n, u;
      if (!r.due){ cls = "d-open"; n = "OPEN"; u = "no date"; }
      else if (d === null || d < 0){ cls = "d-closed"; n = "—"; u = "closed"; }
      else if (d <= 21){ cls = "d-urgent"; n = String(d); u = d === 0 ? "today" : (d === 1 ? "day" : "days"); }
      else if (d <= 60){ cls = "d-soon"; n = String(d); u = "days"; }
      else { cls = "d-ok"; n = String(d); u = "days"; }
      var title = r.url
        ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.title) + '</a>'
        : esc(r.title);
      return '<article class="dl ' + cls + ' i-' + esc(r.intent || "none") + '">' +
        '<div class="stripe"></div>' +
        '<div class="dl-n"><span class="n">' + esc(n) + '</span><span class="u">' + esc(u) + '</span></div>' +
        '<div class="dl-b">' +
          '<h3>' + title + '</h3>' +
          '<div class="tags">' +
            '<span class="tag">' + esc(r.kind || "event") + '</span>' +
            '<span class="tag">' + esc(r.venue || "") + '</span>' +
            '<span class="tag">' + (r.due ? esc(fmtDue(r.due)) : "rolling") + '</span>' +
          '</div>' +
          '<div class="mini">' + INTENT.map(function(v){
            return '<button type="button" data-dl="' + esc(r.id) + '" data-v="' + v + '"' +
                   ' aria-pressed="' + (r.intent === v) + '">' + v + '</button>';
          }).join("") + '</div>' +
        '</div>' +
      '</article>';
    }).join("");
  }

  function renderPapers(){
    var host = el("papers");
    var untriaged = papers.filter(function(p){ return !p.triage || p.triage === "unread"; }).length;
    el("s-feed").textContent = untriaged + " to triage";
    if (!papers.length){
      host.innerHTML = '<div class="msg">No literature on file yet.</div>';
      el("pp-tally").textContent = "0"; return;
    }
    var rows = papers.filter(function(p){
      var t = p.triage || "unread";
      if (ppFilter === "todo") return t === "unread";
      if (ppFilter === "active") return t === "reading" || t === "read" || t === "cited";
      return true;
    }).sort(function(a,b){ return String(b.posted).localeCompare(String(a.posted)); });

    el("pp-tally").textContent = untriaged + " untriaged / " + papers.length;
    if (!rows.length){
      host.innerHTML = '<div class="msg">Nothing matches that filter.</div>'; return;
    }

    host.innerHTML = rows.map(function(p){
      var t = p.triage || "unread";
      var w = /^\d{4}-\d{2}$/.test(String(p.posted))
        ? (function(){ var d = new Date(p.posted + "-01T00:00:00");
            return {top:d.toLocaleDateString(undefined,{month:"short"}), bottom:String(d.getFullYear())}; })()
        : {top:String(p.posted||""), bottom:""};
      var title = p.url
        ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.title) + '</a>'
        : esc(p.title);
      return '<article class="pp t-' + esc(t) + '">' +
        '<div class="stripe"></div>' +
        '<div class="pp-w"><b>' + esc(w.top) + '</b>' + esc(w.bottom) +
          (p.arxivId || p.source ? '<div style="margin-top:4px">' + esc(p.arxivId || p.source) + '</div>' : '') +
        '</div>' +
        '<div class="pp-b">' +
          '<h3>' + title + '</h3>' +
          '<div class="tags">' + (p.tags||[]).map(function(x){
            return '<span class="tag">' + esc(x) + '</span>'; }).join("") + '</div>' +
          '<div class="mini">' + TRIAGE.slice(1).map(function(v){
            return '<button type="button" data-pp="' + esc(p.id) + '" data-v="' + v + '"' +
                   ' aria-pressed="' + (t === v) + '">' + v + '</button>';
          }).join("") + '</div>' +
        '</div>' +
      '</article>';
    }).join("");
  }

  el("view-field").addEventListener("click", function(ev){
    var b = ev.target.closest("[data-pp],[data-dl]");
    if (!b || !dbRef) return;
    var v = b.getAttribute("data-v"), pressed = b.getAttribute("aria-pressed") === "true";
    if (b.hasAttribute("data-pp")){
      dbRef.collection("papers").doc(b.getAttribute("data-pp"))
        .update({triage: pressed ? "unread" : v})["catch"](function(){});
    } else {
      dbRef.collection("opportunities").doc(b.getAttribute("data-dl"))
        .update({intent: pressed ? "none" : v})["catch"](function(){});
    }
  });

  /* ---------- rendering: plan ---------- */
  var FLOW = ["backlog","next","doing","done"];
  var NEEDS = ["desk","robot","lab","external"];

  chipGroup(el("pl-needs"), [{value:"all",label:"all"}].concat(
    NEEDS.map(function(n){ return {value:n,label:n}; })), "all");
  wireChips(el("pl-needs"));
  el("pl-needs").addEventListener("click", function(ev){
    var b = ev.target.closest(".chip"); if (!b) return;
    plFilter.needs = b.getAttribute("data-v"); renderPlan();
  });
  el("pl-obj").addEventListener("change", function(){ plFilter.objective = this.value; renderPlan(); });
  el("pl-track").addEventListener("change", function(){ plFilter.track = this.value; renderPlan(); });

  el("pl-new").addEventListener("click", function(){
    var f = el("f-task"); f.hidden = !f.hidden;
    if (!f.hidden) el("k-title").focus();
  });
  el("k-cancel").addEventListener("click", function(){ el("f-task").hidden = true; });

  function byId(id){ for (var i=0;i<tasks.length;i++) if (tasks[i].id===id) return tasks[i]; return null; }
  function waitingOn(t){
    return (t.after || []).filter(function(id){
      var p = byId(id); return p && p.status !== "done";
    });
  }

  function fillSelect(node, opts, val){
    var want = opts.map(function(o){
      return '<option value="' + esc(o.v) + '">' + esc(o.l) + '</option>'; }).join("");
    if (node.innerHTML !== want) node.innerHTML = want;
    if (val != null) node.value = val;
  }

  function renderPlan(){
    var tracks = []; tasks.forEach(function(t){ if (t.track && tracks.indexOf(t.track)<0) tracks.push(t.track); });
    fillSelect(el("pl-obj"), [{v:"all",l:"All objectives"}].concat(objectives.map(function(o){
      return {v:o.id, l:(o.num? o.num+" ":"")+o.short}; })), plFilter.objective);
    fillSelect(el("pl-track"), [{v:"all",l:"All tracks"}].concat(tracks.map(function(t){
      return {v:t,l:t}; })), plFilter.track);
    fillSelect(el("k-obj"), objectives.map(function(o){
      return {v:o.id, l:(o.num? o.num+" ":"")+o.short}; }), null);

    var rows = tasks.filter(function(t){
      if (plFilter.needs !== "all" && t.needs !== plFilter.needs) return false;
      if (plFilter.objective !== "all" && t.objective !== plFilter.objective) return false;
      if (plFilter.track !== "all" && t.track !== plFilter.track) return false;
      return true;
    });

    var open = rows.filter(function(t){ return t.status !== "done"; });
    var hrs = open.reduce(function(a,t){ return a + (+t.effort || 0); }, 0);
    el("plan-tally").textContent = open.length + " open · " + Math.round(hrs) + " h estimated";

    if (!rows.length){ el("plan-list").innerHTML = '<div class="msg">Nothing matches that filter.</div>'; return; }

    var order = ["doing","next","backlog","blocked","done"];
    var html = "";
    order.forEach(function(st){
      var g = rows.filter(function(t){ return (t.status||"backlog") === st; })
                  .sort(function(a,b){ return (a.n||0)-(b.n||0); });
      if (!g.length) return;
      var gh = g.reduce(function(a,t){ return a + (+t.effort || 0); }, 0);
      html += '<div class="grouphead"><b>' + esc(st) + '</b> · ' + g.length +
              (st !== "done" ? " · " + Math.round(gh) + " h" : "") + '</div>';
      html += g.map(taskRow).join("");
    });
    el("plan-list").innerHTML = html;
  }

  function taskRow(t){
    var st = t.status || "backlog", wait = waitingOn(t), open = t.id === tkOpenId;
    var next = FLOW[(FLOW.indexOf(st) + 1) % FLOW.length];
    var edit = open ? '<div class="tk-edit">' +
        '<div class="field"><label for="tk-note">Notes and outcome</label>' +
        '<textarea id="tk-note">' + esc(t.note || "") + '</textarea></div>' +
        '<div class="two"><div class="field"><label for="tk-act">Actual hours</label>' +
        '<input type="number" id="tk-act" step="0.5" min="0" value="' + esc(t.actual == null ? "" : t.actual) + '"></div>' +
        '<div class="field"><label for="tk-week">Target week</label>' +
        '<input type="text" id="tk-week" placeholder="2026-W40" value="' + esc(t.week || "") + '"></div></div>' +
        '<div class="actions"><button type="button" class="btn" data-tk="save" data-id="' + esc(t.id) + '">Save</button>' +
        '<button type="button" class="btn ghost" data-tk="block" data-id="' + esc(t.id) + '">' +
        (st === "blocked" ? "Unblock" : "Blocked") + '</button>' +
        '<span class="said" id="tk-said"></span></div></div>' : "";
    return '<article class="tk st-' + esc(st) + (wait.length && st !== "done" ? " waiting" : "") + '">' +
      '<div class="stripe"></div>' +
      '<div class="tk-s"><button type="button" data-tk="flow" data-id="' + esc(t.id) +
        '" title="Move to ' + esc(next) + '">' + esc(st) + '</button></div>' +
      '<div class="tk-b">' +
        '<p class="tk-t" data-tk="open" data-id="' + esc(t.id) + '">' + esc(t.title) + '</p>' +
        '<p class="tk-d">' + esc(t.done) + '</p>' +
        '<div class="tk-m">' +
          '<span class="need">' + esc(t.needs) + '</span>' +
          '<span>' + esc(objLabel(t.objective)) + '</span>' +
          '<span>' + esc(t.track) + '</span>' +
          (t.effort ? '<span>' + esc(t.effort) + ' h est</span>' : '') +
          (t.actual != null ? '<span>' + esc(t.actual) + ' h actual</span>' : '') +
          (t.week ? '<span>' + esc(t.week) + '</span>' : '') +
          (wait.length && st !== "done" ? '<span class="wait">waiting on ' + esc(wait.join(", ")) + '</span>' : '') +
          ((t.answers||[]).length ? '<span>closes ' + esc(t.answers.join(", ")) + '</span>' : '') +
        '</div>' +
      '</div>' + edit +
    '</article>';
  }

  function renderDoNow(){
    var live = tasks.filter(function(t){
      var st = t.status || "backlog";
      return (st === "doing" || st === "next") && !waitingOn(t).length;
    }).sort(function(a,b){
      var w = {desk:0, external:1, robot:2, lab:3};
      var d = (w[a.needs]==null?9:w[a.needs]) - (w[b.needs]==null?9:w[b.needs]);
      return d || (a.n||0)-(b.n||0);
    });
    el("now-tally").textContent = live.length ? live.length + " ready" : "nothing queued";
    if (!live.length){
      el("donow").innerHTML = '<div class="msg">Nothing is marked <b>next</b> or <b>doing</b>. Open <b>Plan</b> and pull something into the queue.</div>';
      return;
    }
    el("donow").innerHTML = live.slice(0,5).map(function(t){
      return '<article class="tk st-' + esc(t.status) + '">' +
        '<div class="stripe"></div>' +
        '<div class="tk-s"><button type="button" data-tk="flow" data-id="' + esc(t.id) + '">' + esc(t.status) + '</button></div>' +
        '<div class="tk-b"><p class="tk-t">' + esc(t.title) + '</p>' +
        '<p class="tk-d">' + esc(t.done) + '</p>' +
        '<div class="tk-m"><span class="need">' + esc(t.needs) + '</span>' +
        '<span>' + esc(objLabel(t.objective)) + '</span>' +
        (t.effort ? '<span>' + esc(t.effort) + ' h est</span>' : '') + '</div></div></article>';
    }).join("");
  }

  function taskClicks(ev){
    var b = ev.target.closest("[data-tk]");
    if (!b || !dbRef) return;
    var act = b.getAttribute("data-tk"), id = b.getAttribute("data-id"), t = byId(id);
    if (!t) return;
    if (act === "open"){ tkOpenId = (tkOpenId === id) ? null : id; renderPlan(); return; }
    if (act === "flow"){
      var st = t.status || "backlog";
      var nx = st === "blocked" ? "next" : FLOW[(FLOW.indexOf(st) + 1) % FLOW.length];
      var patch = {status: nx};
      if (nx === "doing" && !t.startedOn) patch.startedOn = todayISO();
      if (nx === "done") patch.doneOn = todayISO();
      if (nx === "backlog"){ patch.startedOn = ""; patch.doneOn = ""; }
      b.disabled = true;
      dbRef.collection("tasks").doc(id).update(patch)["catch"](function(){ b.disabled = false; });
      return;
    }
    if (act === "block"){
      dbRef.collection("tasks").doc(id).update({status: t.status === "blocked" ? "next" : "blocked"})["catch"](function(){});
      return;
    }
    if (act === "save"){
      var act_h = parseFloat((el("tk-act")||{}).value);
      b.disabled = true;
      dbRef.collection("tasks").doc(id).update({
        note: (el("tk-note")||{}).value || "",
        actual: isFinite(act_h) ? act_h : null,
        week: (el("tk-week")||{}).value || ""
      }).then(function(){ tkOpenId = null; })["catch"](function(e){
        var s = el("tk-said"); if (s) say(s, failText(e));
        b.disabled = false;
      });
    }
  }
  el("view-plan").addEventListener("click", taskClicks);
  el("donow").addEventListener("click", taskClicks);

  el("f-task").addEventListener("submit", function(ev){
    ev.preventDefault();
    if (!dbRef) return;
    var title = el("k-title").value.trim(), done = el("k-done").value.trim();
    if (!title || !done) return;
    var eff = parseFloat(el("k-eff").value);
    var btn = el("k-save"); btn.disabled = true;
    dbRef.collection("tasks").add({
      n: tasks.reduce(function(m,t){ return Math.max(m, t.n||0); }, 0) + 1,
      title: title, done: done,
      objective: el("k-obj").value || "", needs: el("k-needs").value || "desk",
      track: "", effort: isFinite(eff) ? eff : null, status: "backlog",
      week: "", after: [], answers: [], note: "", startedOn: "", doneOn: "", actual: null
    }).then(function(){
      el("k-title").value = ""; el("k-done").value = ""; el("k-eff").value = "";
      el("f-task").hidden = true;
    })["catch"](function(e){ say(el("k-said"), failText(e)); })
     ["finally"](function(){ btn.disabled = false; });
  });


  /* ================= year heatmap ================= */
  var HEAT_RAMP = ["#232830","#5C4A28","#8A6B2E","#C79A45","#FFCC66"];

  function dayCounts(){
    var m = {};
    function bump(d, what, h){
      if (!d) return;
      var c = m[d] || (m[d] = {n:0, hours:0, parts:[]});
      c.n++; if (h) c.hours += h;
      if (c.parts.indexOf(what) < 0) c.parts.push(what);
    }
    worklog.forEach(function(r){ bump(r.date, "log", parseFloat(r.hours) || 0); });
    experiments.forEach(function(r){ bump(r.date, "experiment"); });
    tasks.forEach(function(t){ if (t.doneOn) bump(t.doneOn, "task done"); });
    questions.forEach(function(q){ if (q.answeredOn) bump(q.answeredOn, "question closed"); });
    return m;
  }

  function renderHeat(){
    var counts = dayCounts(), host = el("heat");
    var today = midnight(new Date());
    var end = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()));
    var start = new Date(end); start.setDate(start.getDate() - (53 * 7 - 1));

    var CELL = 11, GAP = 3, STEP = CELL + GAP, PADL = 26, PADT = 16;
    var W = PADL + 53 * STEP, H = PADT + 7 * STEP + 4;
    var cells = "", months = "", lastMonth = -1, lastMonthW = -3, total = 0, active = 0, streak = 0, best = 0;

    for (var w = 0; w < 53; w++){
      for (var d = 0; d < 7; d++){
        var day = new Date(start); day.setDate(day.getDate() + w * 7 + d);
        if (day > today) continue;
        var iso = day.getFullYear() + "-" + String(day.getMonth()+1).padStart(2,"0") +
                  "-" + String(day.getDate()).padStart(2,"0");
        var c = counts[iso], n = c ? c.n : 0;
        total += n; if (n) { active++; streak++; best = Math.max(best, streak); } else streak = 0;
        var lvl = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4;
        var label = day.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}) +
          (c ? " — " + c.n + (c.n === 1 ? " entry" : " entries") +
               (c.hours ? ", " + (Math.round(c.hours*10)/10) + " h" : "") +
               " (" + c.parts.join(", ") + ")"
             : " — nothing logged");
        cells += '<rect class="cell" x="' + (PADL + w*STEP) + '" y="' + (PADT + d*STEP) +
                 '" width="' + CELL + '" height="' + CELL + '" rx="2" fill="' + HEAT_RAMP[lvl] +
                 '"><title>' + esc(label) + '</title></rect>';
        if (d === 0 && day.getMonth() !== lastMonth && (w - lastMonthW) >= 3){
          lastMonth = day.getMonth(); lastMonthW = w;
          months += '<text x="' + (PADL + w*STEP) + '" y="10">' +
                    day.toLocaleDateString(undefined,{month:"short"}) + '</text>';
        }
      }
    }
    ["Mon","Wed","Fri"].forEach(function(nm, i){
      cells += '<text x="0" y="' + (PADT + (1 + i*2)*STEP + 9) + '">' + nm + '</text>';
    });

    el("heat-tally").textContent = total + " in the year · " + active + " active days";
    host.innerHTML = '<div class="heat-wrap"><svg width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily research activity">' +
      months + cells + '</svg></div>' +
      '<div class="heat-legend"><span>longest run ' + best + ' days</span><span>·</span><span>less</span>' +
      HEAT_RAMP.map(function(c){ return '<i style="background:' + c + '"></i>'; }).join("") +
      '<span>more</span></div>';
  }

  /* ================= threads board ================= */
  var REL = ["builds on","contradicts","same method","supports my claim"];

  chipGroup(el("th-which"), [{value:"questions",label:"question routes"},
                             {value:"papers",label:"paper board"}], "questions");
  wireChips(el("th-which"));
  el("th-which").addEventListener("click", function(ev){
    var b = ev.target.closest(".chip"); if (!b) return;
    thWhich = b.getAttribute("data-v"); thSel = null; renderBoard();
  });
  chipGroup(el("th-src"), [{value:"all",label:"all"},{value:"library",label:"my library"},
                           {value:"feed",label:"feed"}], "all");
  wireChips(el("th-src"));
  el("th-src").addEventListener("click", function(ev){
    var b = ev.target.closest(".chip"); if (!b) return;
    srcFilter = b.getAttribute("data-v"); renderPaperBoard();
  });
  chipGroup(el("th-layout"), [{value:"free",label:"free"},{value:"chrono",label:"chronology"},
                              {value:"logic",label:"logic"}], "free");
  wireChips(el("th-layout"));
  el("th-layout").addEventListener("click", function(ev){
    var b = ev.target.closest(".chip"); if (!b) return;
    thLayout = b.getAttribute("data-v"); thSel = null; renderPaperBoard();
  });
  chipGroup(el("th-mode"), [{value:"move",label:"move"},{value:"connect",label:"connect"}], "move");
  wireChips(el("th-mode"));
  el("th-mode").addEventListener("click", function(ev){
    var b = ev.target.closest(".chip"); if (!b) return;
    thMode = b.getAttribute("data-v"); thSel = null; paintThreads();
  });

  function fillRelSelect(){
    var s = el("th-rel");
    if (s.options.length) return;
    s.innerHTML = RELS.map(function(r){
      return '<option value="' + esc(r.v) + '">' + esc(r.v) + '</option>'; }).join("");
  }

  function boardDoc(){
    for (var i=0;i<board.length;i++) if (board[i].id === "papers") return board[i];
    return {id:"papers", positions:{}, edges:[], nodes:[], notes:[]};
  }

  var nodeBoxes = [];   // {id, x, y, w, h}

  function curve(a, b, sag){
    var x1 = a.x + a.w/2, y1 = a.y + a.h/2, x2 = b.x + b.w/2, y2 = b.y + b.h/2;
    var mx = (x1+x2)/2, my = (y1+y2)/2 + (sag == null ? 26 : sag);
    return "M" + x1 + "," + y1 + " Q" + mx + "," + my + " " + x2 + "," + y2;
  }

  function measureNodes(){
    el("nodes").querySelectorAll(".nd").forEach(function(n){
      var b = boxOf(n.getAttribute("data-id"));
      if (b){ b.w = n.offsetWidth; b.h = n.offsetHeight; }
    });
  }
  function boxOf(id){ for (var i=0;i<nodeBoxes.length;i++) if (nodeBoxes[i].id===id) return nodeBoxes[i]; return null; }

  var edgeList = [];    // {from, to, kind}
  function paintThreads(first){
    var svg = el("threads"), out = "";
    edgeList.forEach(function(e, i){
      var a = boxOf(e.from), b = boxOf(e.to);
      if (!a || !b) return;
      var cl = [relClass(e.kind)];
      if (e.auto) cl.push("auto");
      if (first) cl.push("drawin");
      out += '<path d="' + curve(a,b) + '" data-e="' + i + '" class="' +
             cl.join(" ").trim() + '"></path>';
    });
    svg.innerHTML = out;
    if (first) requestAnimationFrame(function(){
      svg.querySelectorAll("path.drawin").forEach(function(p){
        try { p.style.setProperty("--len", p.getTotalLength()); } catch(e){}
      });
    });
  }

  function litFor(id){
    var svg = el("threads");
    var paths = svg.querySelectorAll("path");
    if (!id){ paths.forEach(function(p){ p.classList.remove("lit","dim"); });
      el("nodes").querySelectorAll(".nd").forEach(function(n){ n.classList.remove("dim"); });
      return; }
    var touches = edgeList.some(function(e){ return e.from === id || e.to === id; });
    if (!touches){
      paths.forEach(function(p){ p.classList.remove("lit","dim"); });
      el("nodes").querySelectorAll(".nd").forEach(function(n){ n.classList.remove("dim"); });
      return;
    }
    var keep = {};
    keep[id] = 1;
    paths.forEach(function(p){
      var e = edgeList[+p.getAttribute("data-e")];
      if (e && (e.from === id || e.to === id)){
        p.classList.add("lit"); p.classList.remove("dim");
        keep[e.from] = 1; keep[e.to] = 1;
      } else { p.classList.add("dim"); p.classList.remove("lit"); }
    });
    el("nodes").querySelectorAll(".nd").forEach(function(n){
      n.classList.toggle("dim", !keep[n.getAttribute("data-id")]);
    });
  }

  /* --- magnetic cursor --- */
  var magRaf = null, magPt = null;
  function magnet(ev){
    var r = el("board").getBoundingClientRect();
    magPt = {x: ev.clientX - r.left, y: ev.clientY - r.top};
    if (magRaf) return;
    magRaf = requestAnimationFrame(function(){
      magRaf = null;
      if (!magPt) return;
      el("nodes").querySelectorAll(".nd").forEach(function(n){
        var b = boxOf(n.getAttribute("data-id")); if (!b) return;
        var dx = magPt.x - (b.x + b.w/2), dy = magPt.y - (b.y + b.h/2);
        var d = Math.hypot(dx, dy);
        if (d > 130 || d < 1){ n.style.transform = ""; return; }
        var k = (1 - d/130) * 7;
        n.style.transform = "translate(" + (dx/d*k).toFixed(2) + "px," + (dy/d*k).toFixed(2) + "px)";
      });
      if (thMode === "connect" && thSel){
        var a = boxOf(thSel);
        if (a) el("threads").insertAdjacentHTML("beforeend",
          '<path class="live" d="M' + (a.x+a.w/2) + ',' + (a.y+a.h/2) +
          ' Q' + ((a.x+a.w/2+magPt.x)/2) + ',' + ((a.y+a.h/2+magPt.y)/2 + 20) +
          ' ' + magPt.x + ',' + magPt.y + '"></path>');
      }
    });
  }
  el("board").addEventListener("pointermove", function(ev){
    if (thMode === "connect" && thSel){
      el("threads").querySelectorAll("path.live").forEach(function(p){ p.remove(); });
    }
    magnet(ev);
  });
  el("board").addEventListener("pointerleave", function(){
    magPt = null;
    el("nodes").querySelectorAll(".nd").forEach(function(n){ n.style.transform = ""; });
    el("threads").querySelectorAll("path.live").forEach(function(p){ p.remove(); });
    litFor(null);
  });

  /* --- the two boards --- */
  function renderQuestionRoutes(){
    var clusters = [];
    questions.forEach(function(q){ if (clusters.indexOf(q.cluster) < 0) clusters.push(q.cluster); });
    var tracked = objectives.filter(function(o){ return o.track !== false; });

    var HUBW = 150, COLW = 86, TOP = 96, ROWH = 40;
    var routes = {};   // qid -> {objId:1}
    tasks.forEach(function(t){
      (t.answers || []).forEach(function(qid){
        (routes[qid] || (routes[qid] = {}))[t.objective] = 1;
      });
    });

    nodeBoxes = []; edgeList = [];
    var html = "", W = Math.max(clusters.length * COLW + 40, tracked.length * (HUBW + 24));

    tracked.forEach(function(o, i){
      var x = 20 + i * (W - HUBW - 20) / Math.max(tracked.length - 1, 1), y = 8;
      nodeBoxes.push({id:"hub-"+o.id, x:x, y:y, w:HUBW, h:58});
      html += '<div class="nd hub" data-id="hub-' + esc(o.id) + '" style="left:' + x + 'px;top:' + y + 'px">' +
              '<b>' + esc(o.num || "") + '</b><span>' + esc(o.short) + '</span></div>';
    });

    var noRoute = 0, routed = 0;
    clusters.forEach(function(cl, ci){
      var x = 20 + ci * COLW;
      var short = cl.replace(/^(the|a)\s+/i, "").split(" ")[0].slice(0, 7);
      html += '<div class="clab" title="' + esc(cl) + '" style="left:' + x + 'px;top:' + (TOP - 16) +
              'px;width:' + (COLW - 10) + 'px">' + esc(short) + '</div>';
      questions.filter(function(q){ return q.cluster === cl; }).forEach(function(q, qi){
        var y = TOP + qi * ROWH;
        var r = routes[q.id], has = r && Object.keys(r).length;
        if (has) routed++; else noRoute++;
        var cls = "nd q" + (q.status === "answered" || q.status === "dropped" ? " closed" : (has ? " routed" : ""));
        nodeBoxes.push({id:q.id, x:x, y:y, w:52, h:30});
        html += '<div class="' + cls + '" data-id="' + esc(q.id) + '" data-kind="q" style="left:' +
                x + 'px;top:' + y + 'px" title="' + esc(q.text.slice(0,120)) + '">' +
                esc("Q" + q.n) + '</div>';
        if (has) Object.keys(r).forEach(function(oid){
          if (boxOf("hub-" + oid)) edgeList.push({from:q.id, to:"hub-"+oid});
        });
      });
    });

    el("th-head").textContent = "Question routes";
    el("th-tally").textContent = routed + " routed · " + noRoute + " with no route";
    ["th-mode","th-layout","th-src","th-rel","th-add","th-auto","th-save"].forEach(function(i){ el(i).hidden = true; });
    el("th-note-q").hidden = false; el("th-note-p").hidden = true;
    el("nodes").innerHTML = html;
    var maxY = nodeBoxes.reduce(function(m,b){ return Math.max(m, b.y + b.h); }, 0);
    el("board").style.width = W + "px";
    el("board").style.height = (maxY + 40) + "px";
    measureNodes(); paintThreads(true);
  }

  /* ---------------- paper board ---------------- */
  var RELS = [
    {v:"builds on",   k:"",             c:"#FFCC66"},
    {v:"contradicts", k:"k-contradicts",c:"#F28779"},
    {v:"supports",    k:"k-supports",   c:"#BAE67E"},
    {v:"same method", k:"k-same",       c:"#73D0FF"},
    {v:"assumes",     k:"k-assumes",    c:"#D4BFFF"},
    {v:"superseded by",k:"k-superseded",c:"#88888A"}
  ];
  var EVID = ["assumed","simulated","bench","validated","contradicted"];
  function relClass(kind){
    for (var i=0;i<RELS.length;i++) if (RELS[i].v === kind) return RELS[i].k;
    return "";
  }
  function tex(s){
    if (!s) return "";
    if (!window.katex) return '<div class="eq"><code>' + esc(s) + '</code></div>';
    try { return '<div class="eq">' + window.katex.renderToString(s, {throwOnError:false}) + '</div>'; }
    catch(e){ return '<div class="eq">' + esc(s) + '</div>'; }
  }
  function yearOf(v){
    var m = String(v || "").match(/(\d{4})(?:-(\d{2}))?/);
    if (!m) return null;
    return +m[1] + (m[2] ? (+m[2] - 1) / 12 : 0.5);
  }

  /* every node on the board: papers from the feed plus your own */
  function boardNodes(){
    var doc = boardDoc(), pos = doc.positions || {}, out = [];
    if (srcFilter !== "feed") library.forEach(function(r){
      out.push({id:r.id, type:"paper", kind:r.kind || "paper", text:r.title, date:r.posted,
                meta:(r.kind || "paper") + (r.n ? " · [" + r.n + "]" : "") +
                     (r.venue ? " · " + String(r.venue).slice(0,26) : ""),
                tags:r.tags || [], note:r.note, w:190});
    });
    if (srcFilter !== "library") papers.forEach(function(p){
      if (!pos[p.id] && ["reading","read","cited"].indexOf(p.triage) < 0) return;
      out.push({id:p.id, type:"paper", kind:"feed", text:p.title, date:p.posted,
                meta:"feed · " + (p.triage || "unread"), tags:p.tags || [], w:190});
    });
    (doc.nodes || []).forEach(function(n){
      out.push({id:n.id, type:n.type || "note", text:n.text, date:n.date,
                status:n.status, latex:n.latex, tags:[], w:n.type === "concept" ? 150 : 186});
    });
    return out;
  }

  function layoutFree(ns){
    var pos = boardDoc().positions || {}, placed = [], i = 0;
    /* dragged cards keep where you put them; the rest fill the grid. A grid
       slot a dragged card is sitting on gets skipped, or the two would stack
       and the one underneath would become unclickable. */
    ns.forEach(function(n){
      var d = pos[n.id]; if (!d) return;
      n.x = d.x; n.y = d.y; placed.push(n);
    });
    function free(x, y, w){
      return !placed.some(function(m){
        return x < m.x + m.w + 10 && m.x < x + w + 10 &&
               y < m.y + 130 && m.y < y + 130;
      });
    }
    ns.forEach(function(n){
      if (pos[n.id]) return;
      var x, y;
      do { x = 30 + (i % 6) * 215; y = 30 + Math.floor(i / 6) * 150; i++; }
      while (!free(x, y, n.w) && i < 4000);
      n.x = x; n.y = y; placed.push(n);
    });
    return {deco:""};
  }

  /* place nodes left to right by x, pushing down only when they would overlap */
  function packRows(list, top, rowH){
    var rows = [];
    list.forEach(function(n){
      for (var r = 0; ; r++){
        var row = rows[r] || (rows[r] = []);
        var clash = row.some(function(m){ return n.x < m.x + m.w + 12 && m.x < n.x + n.w + 12; });
        if (!clash){ row.push(n); n.y = top + r * rowH; return; }
      }
    });
    return rows.length * rowH;
  }

  function layoutChrono(ns){
    /* ordinal axis: only years that actually carry a node, so a lone 2003
       reference does not stretch the scale across two empty decades */
    var years = [];
    ns.forEach(function(n){
      var y = yearOf(n.date); if (y == null) return;
      var Y = Math.floor(y); if (years.indexOf(Y) < 0) years.push(Y);
    });
    years.sort(function(p,q){ return p - q; });
    var slot = {}; years.forEach(function(Y,i){ slot[Y] = i; });

    var PX = years.length > 10 ? 200 : 268, LEFT = 96, deco = "", top = 34;
    ["paper","claim","concept","note"].forEach(function(L){
      var list = ns.filter(function(n){ return (n.type || "note") === L; });
      if (!list.length) return;
      list.forEach(function(n){
        var y = yearOf(n.date);
        n.x = y == null ? 8 : Math.round(LEFT + slot[Math.floor(y)] * PX +
              (y - Math.floor(y)) * (PX * 0.45));
      });
      list.sort(function(p,q){ return p.x - q.x; });
      deco += '<div class="lanelab" style="left:6px;top:' + top + 'px">' + L + '</div>';
      top += packRows(list, top, L === "paper" ? 96 : 84) + 26;
    });

    years.forEach(function(Y, i){
      var x = LEFT + i * PX;
      var jump = i > 0 && Y - years[i-1] > 1;
      deco += '<div class="axis" style="left:' + x + 'px;top:0;width:1px;height:' + (top + 20) +
              'px;border-top:0;border-left:1px dashed var(--line-soft)"><span>' + Y +
              (jump ? ' <em style="color:var(--s-stale);font-style:normal">⋯' +
                      (Y - years[i-1] - 1) + 'y gap</em>' : '') + '</span></div>';
    });
    return {deco:deco, width:LEFT + Math.max(years.length,1) * PX + 240};
  }

  function layoutLogic(ns, edges){
    /* depth = how much a node rests on; sources sit at the bottom */
    var dep = {}, idx = {};
    ns.forEach(function(n){ idx[n.id] = n; dep[n.id] = 0; });
    var UP = {"builds on":1, "assumes":1, "supports":1};
    for (var pass = 0; pass < 6; pass++){
      edges.forEach(function(e){
        if (!UP[e.kind || "builds on"]) return;
        if (idx[e.from] && idx[e.to]) dep[e.from] = Math.max(dep[e.from], (dep[e.to] || 0) + 1);
      });
    }
    var byLevel = {}, maxL = 0;
    ns.forEach(function(n){
      var L = dep[n.id] || 0; maxL = Math.max(maxL, L);
      (byLevel[L] || (byLevel[L] = [])).push(n);
    });
    var deco = "", W = 600, top = 34;
    for (var L = maxL; L >= 0; L--){
      var row = byLevel[L]; if (!row) continue;
      row.forEach(function(n, i){ n.x = 100 + i * (n.w + 26); });
      deco += '<div class="lanelab" style="left:6px;top:' + top + 'px">' +
              (L === 0 ? "rests on nothing" : "level " + L) + '</div>';
      var h = packRows(row, top, 100);
      W = Math.max(W, row.reduce(function(m,n){ return Math.max(m, n.x + n.w); }, 0) + 60);
      top += h + 30;
    }
    return {deco:deco, width:W};
  }

  function suggestEdges(ns, existing){
    var have = {};
    existing.forEach(function(e){ have[e.from + ">" + e.to] = 1; have[e.to + ">" + e.from] = 1; });
    var papersOnly = ns.filter(function(n){ return n.type === "paper"; });
    var out = [];
    for (var i = 0; i < papersOnly.length; i++){
      for (var j = i + 1; j < papersOnly.length; j++){
        var A = papersOnly[i], B = papersOnly[j];
        var shared = (A.tags || []).filter(function(t){ return (B.tags || []).indexOf(t) >= 0; });
        if (shared.length < 2) continue;
        if (have[A.id + ">" + B.id]) continue;
        var ya = yearOf(A.date), yb = yearOf(B.date);
        var older = (ya != null && yb != null && ya > yb) ? B : A;
        var newer = older === A ? B : A;
        out.push({from:newer.id, to:older.id,
                  kind: (ya != null && yb != null) ? "builds on" : "same method",
                  auto:true, note:"shared: " + shared.join(", ")});
        have[A.id + ">" + B.id] = 1;
      }
    }
    return out;
  }

  function renderPaperBoard(){
    var doc = boardDoc();
    var ns = boardNodes();
    edgeList = (doc.edges || []).slice();
    var lay = thLayout === "chrono" ? layoutChrono(ns)
            : thLayout === "logic"  ? layoutLogic(ns, edgeList)
            : layoutFree(ns);

    nodeBoxes = ns.map(function(n){ return {id:n.id, x:n.x, y:n.y, w:n.w, h:80}; });

    var html = lay.deco || "";
    ns.forEach(function(n){
      var cls = n.type === "paper" ? ("nd pc kd-" + (n.kind || "paper"))
              : n.type === "claim" ? "nd cl ev-" + (n.status || "assumed")
              : n.type === "concept" ? "nd cn" : "nd pin";
      var body;
      if (n.type === "paper"){
        body = '<h4>' + esc(String(n.text).slice(0,78)) + (String(n.text).length > 78 ? "…" : "") +
               '</h4><div class="mt">' + esc(n.meta || "") + (n.date ? " · " + esc(n.date) : "") +
               (n.note ? '</div><div class="mt own">' + esc(n.note) : "") + '</div>';
      } else {
        body = '<div class="txt">' + esc(n.text) + '</div>' + tex(n.latex) +
               (n.type === "claim" ? '<span class="ev">' + esc(n.status || "assumed") +
                 (n.date ? " · " + esc(n.date) : "") + '</span>' : "");
      }
      html += '<div class="' + cls + '" data-id="' + esc(n.id) + '" data-kind="' + esc(n.type) +
              '" style="left:' + n.x + 'px;top:' + n.y + 'px">' + body + '</div>';
    });

    el("th-head").textContent = "Paper board";
    el("th-tally").textContent = ns.length + " nodes · " + edgeList.length + " threads" +
      (edgeList.filter(function(e){ return e.auto; }).length ? " (" +
        edgeList.filter(function(e){ return e.auto; }).length + " suggested)" : "") +
      (thDirty ? " · unsaved" : "");
    ["th-mode","th-layout","th-src","th-rel","th-add","th-auto","th-save"].forEach(function(i){ el(i).hidden = false; });
    el("th-mode").hidden = thLayout !== "free";
    el("th-note-q").hidden = true; el("th-note-p").hidden = false;
    el("nodes").innerHTML = html;

    var maxX = Math.max(lay.width || 0, nodeBoxes.reduce(function(m,b){ return Math.max(m, b.x + b.w); }, 600));
    var maxY = nodeBoxes.reduce(function(m,b){ return Math.max(m, b.y + b.h); }, 400);
    el("board").style.width = (maxX + 60) + "px";
    el("board").style.height = (maxY + 80) + "px";
    measureNodes(); paintThreads(true);
    renderRelLegend();
    if (inspId) markOpen(inspId);
  }

  function renderRelLegend(){
    var n = el("th-legend");
    if (!n){
      n = document.createElement("div"); n.id = "th-legend"; n.className = "legend-rel";
      el("view-threads").insertBefore(n, el("th-detail"));
    }
    n.innerHTML = RELS.map(function(r){
      return '<span><i style="background:' + r.c + '"></i>' + esc(r.v) + '</span>'; }).join("") +
      '<span><i style="background:var(--muted)"></i>dashed = suggested, not yours</span>';
  }
  function renderBoard(){
    if (!ready.q || !ready.obj) return;
    fillRelSelect();
    if (thWhich === "papers") renderPaperBoard(); else { closeInspector(); renderQuestionRoutes(); }
  }

  /* ---------------- paper inspector ----------------
     A node is a card with eighty characters on it. This is where the rest of
     it lives: what it claims, what you made of it, and the file itself. */
  var inspId = null, inspWhere = null;

  function rowIn(list, id){
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /* A stored Drive link if there is one, otherwise a Drive search that will
     land on it. The fallback means every entry is one click from the file
     before any direct links have been filled in. */
  function driveHref(r){
    if (r.drive) return r.drive;
    var q = r.file ? String(r.file).split(/[\\\/]/).pop().replace(/\.[a-z0-9]+$/i, "")
                   : String(r.title || "");
    q = q.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
    return q ? "https://drive.google.com/drive/search?q=" + encodeURIComponent(q) : null;
  }
  function openInspector(id){
    var r = rowIn(library, id), where = "library";
    if (!r){ r = rowIn(papers, id); where = "papers"; }
    if (!r) return closeInspector();
    inspId = id; inspWhere = where;

    el("insp-kind").textContent = (where === "papers" ? "feed · " : "") + (r.kind || "paper");
    el("insp-title").textContent = r.title || "(untitled)";

    var bits = [];
    if (r.authors) bits.push(esc(r.authors));
    if (r.venue && r.venue !== r.authors) bits.push(esc(r.venue));
    if (r.posted)  bits.push(esc(r.posted));
    if (r.n)       bits.push("DC-1 ref [" + esc(r.n) + "]");
    if (r.triage)  bits.push(esc(r.triage));
    el("insp-meta").innerHTML = bits.join(" · ");

    var have = r.have !== false;
    var links = [], d = have ? driveHref(r) : null;
    if (d) links.push('<a class="btn ghost" target="_blank" rel="noopener" href="' + esc(d) +
                      '">' + (r.drive ? "Open in Drive" : "Find in Drive") + '</a>');
    if (r.doi) links.push('<a class="btn ghost" target="_blank" rel="noopener" ' +
                          'href="https://doi.org/' + esc(r.doi) + '">DOI</a>');
    if (r.url) links.push('<a class="btn ghost" target="_blank" rel="noopener" href="' +
                          esc(r.url) + '">Source</a>');
    if (!have) links.push('<span class="insp-path">not acquired yet</span>');
    else if (r.file) links.push('<span class="insp-path" title="' + esc(r.file) + '">on disk</span>');
    el("insp-links").innerHTML = links.join("");

    /* Context you curated elsewhere — the tier and the why-it-matters line.
       Read-only on purpose: the notes box below is yours, and nothing should
       be writing into the same field you type in. */
    var why = el("insp-why");
    if (r.why || r.tier){
      why.innerHTML = (r.tier ? "<b>" + esc(r.tier) + "</b> " : "") + esc(r.why || "");
      why.hidden = false;
    } else why.hidden = true;

    /* A book downloaded chapter by chapter is one work with many files, not
       twenty works. One node on the board; every chapter reachable from here. */
    var chBox = el("insp-ch"), chs = Array.isArray(r.chapters) ? r.chapters : [];
    if (chs.length){
      chBox.innerHTML = '<div class="insp-lab">' + chs.length + ' chapter files</div>' +
        chs.map(function(c){
          var href = c.drive || driveHref({file: c.file, title: c.label});
          var name = c.label || String(c.file || "").split(/[\\\/]/).pop();
          return href
            ? '<a class="insp-chl" target="_blank" rel="noopener" href="' + esc(href) + '">' +
              esc(name) + '</a>'
            : '<span class="insp-chl">' + esc(name) + '</span>';
        }).join("");
      chBox.hidden = false;
    } else chBox.hidden = true;

    el("insp-abs").value  = r.abstract || "";
    el("insp-note").value = r.note || "";
    el("insp-said").textContent = "";
    el("insp").hidden = false;
    document.body.classList.add("insp-open");
    markOpen(id);
  }
  function markOpen(id){
    el("nodes").querySelectorAll(".nd.open").forEach(function(x){ x.classList.remove("open"); });
    if (!id) return;
    var n = el("nodes").querySelector('.nd[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (n) n.classList.add("open");
  }
  function closeInspector(){
    inspId = null; el("insp").hidden = true;
    document.body.classList.remove("insp-open");
    markOpen(null);
  }

  el("insp-close").addEventListener("click", closeInspector);
  document.addEventListener("keydown", function(ev){
    if (ev.key === "Escape" && !el("insp").hidden) closeInspector();
  });
  el("insp-save").addEventListener("click", function(){
    if (!inspId) return;
    var id = inspId, where = inspWhere;
    var abs = el("insp-abs").value.trim(), note = el("insp-note").value.trim();
    say(el("insp-said"), "saving…");
    mutate(where, function(rows){
      rows.forEach(function(x){
        if (x.id !== id) return;
        if (abs) x.abstract = abs; else delete x.abstract;
        if (note) x.note = note; else delete x.note;
      });
    }, "Notes on " + id).then(function(){
      say(el("insp-said"), "saved");
      if (inspId === id) markOpen(id);
    })["catch"](function(e){
      say(el("insp-said"), "not saved — " + (e && e.message ? e.message : "unknown error"));
    });
  });

  /* --- interaction --- */
  el("nodes").addEventListener("pointerover", function(ev){
    var n = ev.target.closest(".nd"); if (n) litFor(n.getAttribute("data-id"));
  });

  el("nodes").addEventListener("click", function(ev){
    var n = ev.target.closest(".nd"); if (!n) return;
    var id = n.getAttribute("data-id"), kind = n.getAttribute("data-kind");
    if (thWhich === "questions"){
      var q = null; questions.forEach(function(x){ if (x.id === id) q = x; });
      if (!q) return;
      var closers = tasks.filter(function(t){ return (t.answers||[]).indexOf(id) >= 0; });
      el("th-detail").hidden = false;
      el("th-detail").innerHTML = '<b>Q' + esc(q.n) + ' · ' + esc(q.cluster) + '</b><br>' + esc(q.text) +
        '<br><br>' + (closers.length
          ? 'Closed by: ' + closers.map(function(t){ return esc(t.title); }).join("; ")
          : '<b>No task in your plan closes this.</b>');
      return;
    }
    if (thMode !== "connect"){
      if (kind === "paper") openInspector(id);
      return;
    }
    if (!thSel){ thSel = id; n.classList.add("sel"); return; }
    if (thSel === id){ thSel = null; n.classList.remove("sel"); return; }
    var rel = el("th-rel").value || "builds on";
    (boardDoc().edges || (boardDoc().edges = [])).push({from: thSel, to: id, kind: rel});
    thSel = null; thDirty = true;
    el("nodes").querySelectorAll(".sel").forEach(function(x){ x.classList.remove("sel"); });
    renderPaperBoard();
  });

  el("threads").addEventListener("click", function(ev){
    var p = ev.target.closest("path"); if (!p || thWhich !== "papers") return;
    var e = edgeList[+p.getAttribute("data-e")]; if (!e) return;
    var doc = boardDoc();
    doc.edges = (doc.edges || []).filter(function(x){
      return !(x.from === e.from && x.to === e.to && (x.kind || "") === (e.kind || ""));
    });
    thDirty = true; renderPaperBoard();
  });
  el("th-auto").addEventListener("click", function(){
    var doc = boardDoc(), ns = boardNodes();
    var add = suggestEdges(ns, doc.edges || []);
    if (!add.length){ say(el("th-said"), "Nothing new to suggest."); return; }
    doc.edges = (doc.edges || []).concat(add);
    thDirty = true; renderPaperBoard();
    say(el("th-said"), add.length + " suggested — click a thread to reject it.");
  });

  el("th-add").addEventListener("click", function(){
    var f = el("f-node"); f.hidden = !f.hidden;
    if (!f.hidden) el("n-text").focus();
  });
  el("n-cancel").addEventListener("click", function(){ el("f-node").hidden = true; });
  el("f-node").addEventListener("submit", function(ev){
    ev.preventDefault();
    var text = el("n-text").value.trim(); if (!text) return;
    var doc = boardDoc();
    (doc.nodes || (doc.nodes = [])).push({
      id: "n-" + Date.now().toString(36),
      type: el("n-type").value, text: text,
      status: el("n-status").value, date: el("n-date").value.trim(),
      latex: el("n-latex").value.trim()
    });
    ["n-text","n-date","n-latex"].forEach(function(i){ el(i).value = ""; });
    el("f-node").hidden = true; thDirty = true; renderPaperBoard();
  });

  /* drag, papers board only */
  (function(){
    var drag = null;
    el("nodes").addEventListener("pointerdown", function(ev){
      if (thWhich !== "papers" || thMode !== "move" || thLayout !== "free") return;
      var n = ev.target.closest(".nd"); if (!n) return;
      var b = boxOf(n.getAttribute("data-id")); if (!b) return;
      var r = el("board").getBoundingClientRect();
      drag = {n:n, b:b, dx: ev.clientX - r.left - b.x, dy: ev.clientY - r.top - b.y,
              x0: ev.clientX, y0: ev.clientY, moved: false};
      n.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    el("nodes").addEventListener("pointermove", function(ev){
      if (!drag) return;
      if (!drag.moved &&
          Math.abs(ev.clientX - drag.x0) < 4 && Math.abs(ev.clientY - drag.y0) < 4) return;
      drag.moved = true;
      var r = el("board").getBoundingClientRect();
      drag.b.x = Math.max(0, ev.clientX - r.left - drag.dx);
      drag.b.y = Math.max(0, ev.clientY - r.top - drag.dy);
      drag.n.style.left = drag.b.x + "px"; drag.n.style.top = drag.b.y + "px";
      paintThreads();
    });
    el("nodes").addEventListener("pointerup", function(){
      if (!drag) return;
      /* a click that never moved is a click, not a drag — do not pin the card */
      if (!drag.moved){ drag = null; return; }
      var doc = boardDoc();
      (doc.positions || (doc.positions = {}))[drag.b.id] = {x: Math.round(drag.b.x), y: Math.round(drag.b.y)};
      drag = null; thDirty = true;
      el("th-tally").textContent = el("th-tally").textContent.replace(/ · unsaved$/, "") + " · unsaved";
    });
  })();

  el("nodes").addEventListener("dblclick", function(ev){
    var n = ev.target.closest(".nd.pin, .nd.cl, .nd.cn"); if (!n) return;
    var doc = boardDoc(), id = n.getAttribute("data-id");
    var row = (doc.nodes || []).filter(function(x){ return x.id === id; })[0];
    if (!row) return;
    var box = document.createElement("textarea");
    box.value = row.text; box.style.width = "100%"; box.style.minHeight = "58px";
    n.innerHTML = ""; n.appendChild(box); box.focus();
    box.addEventListener("blur", function(){
      row.text = box.value.trim() || row.text; thDirty = true; renderPaperBoard();
    });
  });

  el("th-save").addEventListener("click", function(){
    if (!dbRef) return;
    var doc = boardDoc(), btn = el("th-save");
    btn.disabled = true;
    dbRef.collection("board").doc("papers").update({
      positions: doc.positions || {}, edges: doc.edges || [],
      nodes: doc.nodes || [], notes: doc.notes || []
    }).then(function(){ thDirty = false; say(el("th-said"), "Layout saved."); })
     ["catch"](function(e){ say(el("th-said"), failText(e)); })
     ["finally"](function(){ btn.disabled = false; });
  });

  function renderAll(){
    if (ready.obj) { renderAges(); objChips(); }
    if (ready.obj && ready.tk) { renderPlan(); renderDoNow(); }
    if (ready.work && ready.exp && ready.q && ready.tk) renderHeat();
    if (ready.q && ready.obj && ready.tk && ready.pp) renderBoard();
    if (ready.work && ready.exp) { renderCounts(); renderRecent(); }
    if (ready.q) { renderQuestions(); }
    if (ready.pp) { renderPapers(); }
    if (ready.dl) { renderDeadlines(); }
  }

  /* ---------- offline ---------- */
  function offline(msg){
    el("ages").innerHTML = '<div class="msg">' + esc(msg) + '</div>';
    el("counts").innerHTML = '<div class="msg">' + esc(msg) + '</div>';
    el("recent").innerHTML = '<div class="msg">' + esc(msg) + '</div>';
    el("q-progress").innerHTML = '<div class="msg">' + esc(msg) + '</div>';
    el("q-list").innerHTML = '<div class="msg">' + esc(msg) + '</div>';
    el("heat").innerHTML = '<div class="msg">' + esc(msg) + '</div>';
    el("heat-tally").textContent = "—";
    el("th-tally").textContent = "—";
    el("plan-list").innerHTML = '<div class="msg">' + esc(msg) + '</div>';
    el("donow").innerHTML = '<div class="msg">' + esc(msg) + '</div>';
    el("plan-tally").textContent = "—";
    el("now-tally").textContent = "—";
    el("deadlines").innerHTML = '<div class="msg">' + esc(msg) + '</div>';
    el("papers").innerHTML = '<div class="msg">' + esc(msg) + '</div>';
    el("dl-tally").textContent = "—";
    el("pp-tally").textContent = "—";
    el("s-feed").textContent = "—";
    el("q-tally").textContent = "—";
    el("q-tally-2").textContent = "—";
    el("ages-tally").textContent = "—";
    el("recent-tally").textContent = "—";
    el("s-last").textContent = "—";
    el("s-week").textContent = "—";
    el("w-save").disabled = true;
    el("e-save").disabled = true;
    el("w-said").textContent = "Not connected to the data repository.";
  }

  /* ---------- saving ---------- */
  function say(node, text){
    node.textContent = text;
    if (text) setTimeout(function(){ if (node.textContent === text) node.textContent = ""; }, 4000);
  }
  function failText(e){
    var c = e && e.code;
    if (c === "quota_exceeded") return "Store is full — prune old entries.";
    if (c === "resource_exhausted") return "Too many writes just now. Try again in a moment.";
    if (c === "revoked" || c === "not_granted") return "No longer allowed to write here.";
    return "Could not save. Try again.";
  }

  el("f-work").addEventListener("submit", function(ev){
    ev.preventDefault();
    if (!dbRef) return;
    var what = el("w-what").value.trim();
    if (!what) return;
    var btn = el("w-save"); btn.disabled = true;
    var hours = parseFloat(el("w-hours").value);
    dbRef.collection("worklog").add({
      date: el("w-date").value || todayISO(),
      objective: chipValue(el("w-obj")) || "",
      what: what,
      hours: isFinite(hours) ? hours : null,
      blocker: el("w-block").value.trim(),
      next: el("w-next").value.trim(),
      createdAt: new Date().toISOString()
    }).then(function(){
      el("w-what").value = ""; el("w-hours").value = "";
      el("w-block").value = ""; el("w-next").value = "";
      say(el("w-said"), "Saved.");
      el("w-what").focus();
    })["catch"](function(e){
      say(el("w-said"), failText(e));
    })["finally"](function(){ btn.disabled = false; });
  });

  el("f-exp").addEventListener("submit", function(ev){
    ev.preventDefault();
    if (!dbRef) return;
    var hyp = el("e-hyp").value.trim();
    if (!hyp) return;
    var btn = el("e-save"); btn.disabled = true;
    dbRef.collection("experiments").add({
      date: el("e-date").value || todayISO(),
      objective: chipValue(el("e-obj")) || "",
      hypothesis: hyp,
      setup: el("e-setup").value.trim(),
      result: el("e-result").value.trim(),
      verdict: chipValue(el("e-verdict")) || "inconclusive",
      dataPath: el("e-path").value.trim(),
      createdAt: new Date().toISOString()
    }).then(function(){
      el("e-hyp").value = ""; el("e-setup").value = "";
      el("e-result").value = ""; el("e-path").value = "";
      say(el("e-said"), "Saved.");
      el("e-hyp").focus();
    })["catch"](function(e){
      say(el("e-said"), failText(e));
    })["finally"](function(){ btn.disabled = false; });
  });

  function ctrlEnter(form){
    form.addEventListener("keydown", function(ev){
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter"){
        ev.preventDefault();
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit",{cancelable:true}));
      }
    });
  }
  ctrlEnter(el("f-work")); ctrlEnter(el("f-exp"));

  /* ---------- boot ---------- */
  el("w-date").value = todayISO();
  el("e-date").value = todayISO();

  /* ==========================================================
     Storage — GitHub Contents API against the private data repo.
     Exposes the same tiny surface the renderers already use:
       store.collection(name).add(obj)
       store.collection(name).doc(id).update(patch)
     Each write re-reads the file first, so a save from the other
     machine is never silently clobbered.
     ========================================================== */
  var CFG = window.WB_CONFIG || {};
  var FILES = ["objectives","questions","worklog","experiments","papers","opportunities","tasks","board","library"];
  var files = {};        // name -> {rows, sha}
  var token = null;

  function b64encode(str){
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64){
    var bin = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function apiUrl(name){
    return "https://api.github.com/repos/" + CFG.owner + "/" + CFG.repo +
           "/contents/" + (CFG.dir || "data") + "/" + name + ".json";
  }
  function headers(){
    return {"Authorization":"Bearer " + token,
            "Accept":"application/vnd.github+json",
            "X-GitHub-Api-Version":"2022-11-28"};
  }
  function ghError(res, body){
    var e = new Error((body && body.message) || ("GitHub returned " + res.status));
    e.status = res.status; return e;
  }

  function readFile(name){
    return fetch(apiUrl(name) + "?ref=" + encodeURIComponent(CFG.branch || "main"),
                 {headers: headers(), cache: "no-store"})
      .then(function(res){
        if (res.status === 404) return {rows: [], sha: null};   // not created yet
        return res.json().then(function(j){
          if (!res.ok) throw ghError(res, j);
          var rows;
          try { rows = JSON.parse(b64decode(j.content)); }
          catch(e){ throw new Error(name + ".json is not valid JSON"); }
          return {rows: Array.isArray(rows) ? rows : [], sha: j.sha};
        });
      });
  }

  function writeFile(name, rows, sha, message){
    var body = {message: message,
                content: b64encode(JSON.stringify(rows, null, 2) + "\n"),
                branch: CFG.branch || "main"};
    if (sha) body.sha = sha;
    return fetch(apiUrl(name), {
      method: "PUT",
      headers: Object.assign({"Content-Type":"application/json"}, headers()),
      body: JSON.stringify(body)
    }).then(function(res){
      return res.json().then(function(j){
        if (!res.ok) throw ghError(res, j);
        return j.content.sha;
      });
    });
  }

  /* Read fresh, apply the change, commit. One retry on a conflict. */
  function mutate(name, apply, message, attempt){
    return readFile(name).then(function(cur){
      files[name] = cur;
      apply(cur.rows);
      return writeFile(name, cur.rows, cur.sha, message).then(function(sha){
        files[name].sha = sha;
        syncGlobals(); renderAll();
      });
    })["catch"](function(e){
      if ((e.status === 409 || e.status === 422) && !attempt)
        return mutate(name, apply, message, 1);
      throw e;
    });
  }

  function newId(prefix){
    return prefix + "-" + Date.now().toString(36) +
           Math.random().toString(36).slice(2, 6);
  }

  var gitStore = {
    collection: function(name){
      return {
        add: function(data){
          var row = Object.assign({id: newId(name.slice(0,4))}, data);
          return mutate(name, function(rows){ rows.push(row); },
                        "log: add " + name.replace(/s$/,"") + " " + (data.date || ""));
        },
        doc: function(id){
          return {
            update: function(patch){
              return mutate(name, function(rows){
                for (var i = 0; i < rows.length; i++)
                  if (rows[i].id === id) { Object.assign(rows[i], patch); return; }
              }, "log: update " + name.replace(/s$/,"") + " " + id);
            }
          };
        }
      };
    }
  };

  /* Copy loaded files into the arrays the renderers read. */
  function syncGlobals(){
    objectives = (files.objectives.rows || []).slice().sort(function(a,b){
      return (a.order == null ? 99 : a.order) - (b.order == null ? 99 : b.order); });
    questions   = files.questions.rows   || [];
    worklog     = files.worklog.rows     || [];
    experiments = files.experiments.rows || [];
    papers      = files.papers.rows      || [];
    deadlines   = files.opportunities.rows || [];
    tasks = (files.tasks.rows || []).slice().sort(function(a,b){ return (a.n||0)-(b.n||0); });
    board = files.board.rows || [];
    library = files.library.rows || [];
    ready = {obj:true, work:true, exp:true, q:true, pp:true, dl:true, tk:true};
  }

  /* ---------- token handling ---------- */
  function setStatus(text, ok){
    var n = el("gh-status");
    if (n){ n.textContent = text; n.className = "said" + (ok === false ? " bad" : ""); }
  }

  function loadAll(){
    setStatus("Loading…");
    return Promise.all(FILES.map(function(n){
      return readFile(n).then(function(f){ files[n] = f; });
    })).then(function(){
      dbRef = gitStore;
      syncGlobals(); renderAll();
      el("view-setup").hidden = true;
      el("tab-set").hidden = false;
      el("s-repo").textContent = CFG.owner + "/" + CFG.repo;
      setStatus("Connected.");
      showTab(store("wb.tab") || "today");
    });
  }

  function connect(t){
    token = t;
    return loadAll()["catch"](function(e){
      token = null;
      offline(e.status === 401 ? "That token was rejected. Check it has not expired."
            : e.status === 404 ? "Cannot see " + CFG.owner + "/" + CFG.repo +
                                 ". Check the repository name and that the token grants it access."
            : "Could not reach GitHub: " + e.message);
      setStatus(e.message, false);
      throw e;
    });
  }

  el("f-token").addEventListener("submit", function(ev){
    ev.preventDefault();
    var t = el("gh-token").value.trim();
    if (!t) return;
    var btn = el("gh-save"); btn.disabled = true;
    connect(t).then(function(){
      store("wb.token", t);
      el("gh-token").value = "";
    })["catch"](function(){})["finally"](function(){ btn.disabled = false; });
  });

  el("gh-forget").addEventListener("click", function(){
    try { localStorage.removeItem("wb.token"); } catch(e){}
    location.reload();
  });

  function boot(){
    var saved = store("wb.token");
    if (saved) { connect(saved)["catch"](function(){}); }
    else {
      el("view-setup").hidden = false;
      el("tab-set").hidden = false;
      showTab("setup");
      setStatus("No token yet.");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
