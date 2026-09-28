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
  var ready = {obj:false, work:false, exp:false, q:false, pp:false, dl:false};
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
              ["q","tab-q","view-q"],["field","tab-field","view-field"],
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

  function renderAll(){
    if (ready.obj) { renderAges(); objChips(); }
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
  var FILES = ["objectives","questions","worklog","experiments","papers","opportunities"];
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
    ready = {obj:true, work:true, exp:true, q:true, pp:true, dl:true};
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
