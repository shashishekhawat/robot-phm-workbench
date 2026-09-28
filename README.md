# PHM Workbench

A research work log and experiment record for a PhD on diagnostics and prognostics of industrial
robots. Static page, no build step, no backend — it reads and writes JSON files in a private
GitHub repository through the GitHub API, so every entry becomes a commit.

Live at **https://shashishekhawat.github.io/robot-phm-workbench/**

## What it does

**Today** — days since each of the four thesis objectives was last touched, questions closed of
61, this week's entries and hours, and the recent log. The objective-age row is the point of the
whole thing: a thesis stalls by one objective going quiet for months while the others feel busy.

**Log** — a sixty-second daily entry (date, objective, what you did, hours, what blocked you,
what's next) and a heavier experiment form (hypothesis, setup, result, verdict, where the data
lives). Refutations are counted as output, not failure.

**Questions** — the 61 critical questions agreed after DC-1, filterable by cluster and status.
Closing one means writing the answer, so the metric and the thesis material are the same act.

**Plan** — the work queue. Every task names the artifact that makes it done, what access it
needs (desk / robot / lab / external), an hour estimate and which of the 61 questions it closes.
Filter by *needs* first: most days you are at a desk. A task whose prerequisite is unfinished is
marked *waiting*. Click the status to move it along: backlog, next, doing, done.

**Threads** — two boards. *Question routes* is derived, not drawn: a question joins an objective
when a task in your plan says it closes that question and serves that objective, so **no route**
marks questions no planned work touches. *Paper board* is yours to draw, and holds more than
papers: **claim** and **concept** nodes, each able to carry a LaTeX equation. A claim records what
evidence actually backs it — assumed, simulated, bench, validated, contradicted — which is the
field the abstract never gives you.

Threads are typed and coloured: builds on, contradicts, supports, same method, assumes, superseded
by. *Suggest links* proposes edges from shared tags and dates; they arrive dashed and provisional,
and you click a thread to reject it. Three layouts: **free** (drag, positions saved),
**chronology** (ordinal axis over years that actually carry work, with gap markers) and **logic**
(stacked by dependency, so what everything rests on sits at the bottom). Only free mode saves
positions; dragging stays local until you press Save board.

**Field** — submission windows with an intent mark, and a literature feed with triage marks,
refreshed daily by a GitHub Action in the data repository.

The **Today** tab also carries a year heatmap: one cell per day, shaded by how much happened —
log entries, experiments, tasks finished, questions closed — with hours in the tooltip.

## Setup

1. **Data repository.** Create a **private** repo `robot-phm-workbench-data` and push the starter files
   (see that repo's README). This holds everything you write.
2. **This repository.** It must be **public** for GitHub Pages on a free account. It contains no
   personal data — only the app. Enable Pages: *Settings → Pages → Source: deploy from branch,
   `main`, `/ (root)`*.
3. **Token.** Open the page, go to the **Setup** tab, and follow the five steps to create a
   fine-grained token scoped to the data repository with *Contents: Read and write*. Paste it in.
   You do this once per browser; it is stored in `localStorage` and sent only to `api.github.com`.
4. **Install it** (optional). In Chrome or Edge, *Install app* from the address bar gives it its
   own window and icon on Windows and Linux.

Repeat step 3 on your second machine. Both read and write the same repository.

If you name the data repo differently, edit `config.js`.

## Why the token lives in the browser

A static page has no server to hold a secret for it. The alternatives were a small backend
(Cloudflare Workers, Supabase) — a second service to keep alive — or browser-only storage, which
would leave your Windows and Linux machines holding different data.

The token is scoped to one private repository with contents access only. It cannot reach your
other repositories or your account. If it leaks, revoke it and generate another; the worst case
is someone editing this log. That is a deliberate trade, not an oversight.

## Layout

```
index.html    markup for all five screens
styles.css    Ayu Mirage palette; single-theme by choice
app.js        rendering, plus a small GitHub Contents API store
config.js     which repository to read and write
```

`app.js` exposes `store.collection(name).add(obj)` and `.doc(id).update(patch)`. Each write
re-reads the file before committing, so a save from your other machine is never clobbered.

## Limits worth knowing

- **No offline writes.** Reads and writes both need the network. A service worker could cache the
  last read for offline viewing; it is not built yet.
- **Whole-file writes.** Each change rewrites one JSON file. Fine at this scale — a couple of
  thousand entries — and it keeps the git history readable.
- **GitHub API rate limit** is 5,000 requests per hour for a token. A heavy day of logging is
  perhaps fifty.
