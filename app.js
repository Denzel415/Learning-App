// Learning App. One file, no build step.
// Sections: settings, scheduler, storage, SQL engine, session builder, screens, events.
// The scheduler and session builder are plain functions so tools/test.js can check them.

(function () {
  "use strict";

  // ---------- Settings you can change ----------
  const SETTINGS = {
    newPerSession: 4,     // new units introduced per session
    maxReviews: 12,       // cap on due reviews per session
    shortSession: 4,      // the "bad day" minimum
    requeueGap: 3,        // a missed unit returns this many cards later
    gatePass: 0.8,        // share correct needed to pass a chapter gate
    minutesPerCard: 1,
  };

  // ---------- Scheduler ----------
  // grade: "got" | "partial" | "miss". Returns the unit's new card.
  function schedule(card, grade, day) {
    const c = card ? Object.assign({}, card) : { reps: 0, interval: 0, ease: 2.3, lapses: 0 };
    const prev = c.interval;
    if (grade === "miss") {
      if (card) c.lapses += 1;
      c.reps = 0;
      c.ease = Math.max(1.3, c.ease - 0.2);
      c.interval = 1;
    } else if (grade === "partial") {
      c.ease = Math.max(1.3, c.ease - 0.1);
      c.interval = c.reps === 0 ? 1 : Math.max(2, Math.round(prev * 1.3));
      c.reps += 1;
    } else {
      c.interval = c.reps === 0 ? 2 : c.reps === 1 ? 5 : Math.max(prev + 1, Math.round(prev * c.ease));
      c.reps += 1;
      c.ease = Math.min(2.8, c.ease + 0.05);
    }
    c.due = day + c.interval;
    c.last = day;
    return c;
  }

  function shuffle(a, rnd) {
    const r = rnd || Math.random;
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Due reviews shuffled across topics, with new units (in course order) spread between them.
  function buildQueue(units, cards, day, opts) {
    opts = opts || {};
    const open = units.filter((u) => !opts.lockedChapters || !opts.lockedChapters.has(u.chapter));
    const due = shuffle(open.filter((u) => cards[u.id] && cards[u.id].due <= day), opts.rnd).slice(0, SETTINGS.maxReviews);
    const fresh = open.filter((u) => !cards[u.id]).slice(0, opts.newCap == null ? SETTINGS.newPerSession : opts.newCap);
    const queue = [];
    const step = fresh.length ? Math.max(1, Math.floor(due.length / fresh.length)) : 0;
    let d = 0;
    fresh.forEach((u) => {
      for (let k = 0; k < step && d < due.length; k++) queue.push(due[d++].id);
      queue.push(u.id);
    });
    while (d < due.length) queue.push(due[d++].id);
    return opts.limit ? queue.slice(0, opts.limit) : queue;
  }

  function compareResults(user, expected, unit) {
    if (!user.values.length) {
      return { ok: false, why: "Your query ran but no rows came back. The right answer has " + expected.values.length +
        ". Something in your filter matches nothing." };
    }
    if (user.columns.length !== expected.columns.length) {
      return { ok: false, why: "Your result has " + user.columns.length + " column" + (user.columns.length === 1 ? "" : "s") +
        ". The request asks for " + expected.columns.length + ": " + expected.columns.join(", ") + "." };
    }
    if (user.values.length !== expected.values.length) {
      const more = user.values.length > expected.values.length;
      return { ok: false, why: "Your query returned " + user.values.length + " rows. The right answer has " + expected.values.length +
        ". Your filter is " + (more ? "letting too much through." : "cutting too much out.") };
    }
    const key = (r) => JSON.stringify(r);
    const a = user.values.map(key).sort(), b = expected.values.map(key).sort();
    if (a.some((x, i) => x !== b[i])) {
      return { ok: false, why: "Right number of rows, but some of the rows or columns differ. Check which columns you selected and in what order." };
    }
    if (unit.orderCol != null) {
      const seq = (res) => res.values.map((r) => r[unit.orderCol]);
      const ua = seq(user), ea = seq(expected);
      if (ua.some((x, i) => x !== ea[i])) return { ok: false, why: "The right rows, in the wrong order. Check the sort and its direction." };
    }
    return { ok: true };
  }

  // Share of reviews recalled, grouped by how long the unit had been away.
  function retention(log) {
    const buckets = [
      { label: "After 1+ days", min: 1, max: 6, ok: 0, n: 0 },
      { label: "After 1+ weeks", min: 7, max: 29, ok: 0, n: 0 },
      { label: "After 1+ months", min: 30, max: 1e9, ok: 0, n: 0 },
    ];
    log.forEach((e) => {
      if (e.n) return;
      const b = buckets.find((x) => e.gap >= x.min && e.gap <= x.max);
      if (!b) return;
      b.n += 1;
      if (e.g !== "miss") b.ok += 1;
    });
    return buckets;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { schedule, buildQueue, compareResults, retention, SETTINGS };
    return;
  }

  // ---------- Storage ----------
  const COURSE = window.COURSE;
  const DATA = window.CRM_DATA;
  const UNIT = Object.fromEntries(COURSE.units.map((u) => [u.id, u]));
  const KEY = "learning-app:" + COURSE.id;
  const today = () => (window.__today != null ? window.__today :
    Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000));

  let state = { cards: {}, log: [], notes: [], own: {}, gates: {}, updatedAt: 0 };
  let db = null, sample = null, storeNote = "";

  function loadLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = Object.assign(state, JSON.parse(raw));
    } catch (e) { /* storage unavailable: carry on in memory */ }
  }
  function save() {
    state.updatedAt = Date.now();
    if (state.log.length > 3000) state.log = state.log.slice(-3000);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    if (db) {
      db.doc("progress/" + COURSE.id).set(JSON.parse(JSON.stringify(state))).then(
        () => { storeNote = ""; },
        () => { storeNote = "Could not save to your account just now. Progress is kept on this device."; }
      );
    }
  }
  async function connect() {
    if (!window.claude || !window.claude.use) return;
    window.claude.use("sample").then((s) => { sample = s; });
    const d = await window.claude.use("db");
    if (!d) return;
    db = d;
    try {
      const snap = await db.doc("progress/" + COURSE.id).get();
      if (snap.exists) {
        const remote = snap.data();
        if ((remote.updatedAt || 0) >= (state.updatedAt || 0)) {
          state = Object.assign({ cards: {}, log: [], notes: [], own: {}, gates: {}, updatedAt: 0 }, JSON.parse(JSON.stringify(remote)));
          if (view === "home") render();
        } else save();
      } else if (state.updatedAt) save();
    } catch (e) { /* keep local copy */ }
  }

  // ---------- SQL engine (SQLite compiled to JavaScript, loaded on first use) ----------
  let enginePromise = null;
  function engine() {
    if (!enginePromise) {
      enginePromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "vendor/sql-asm.js";
        s.onload = () => window.initSqlJs().then(resolve, reject);
        s.onerror = () => reject(new Error("The SQL engine did not load."));
        document.head.appendChild(s);
      });
    }
    return enginePromise;
  }
  async function runSQL(sql) {
    const SQL = await engine();
    const d = new SQL.Database();
    try {
      Object.keys(DATA).forEach((name) => {
        const t = DATA[name];
        d.run("CREATE TABLE " + name + " (" + t.columns.map((c) => c[0] + " " + c[1]).join(", ") + ")");
        const stmt = d.prepare("INSERT INTO " + name + " VALUES (" + t.columns.map(() => "?").join(",") + ")");
        t.rows.forEach((r) => stmt.run(r));
        stmt.free();
      });
      const out = d.exec(sql);
      return out.length ? out[out.length - 1] : { columns: [], values: [] };
    } finally { d.close(); }
  }

  // ---------- Session ----------
  let view = "home";
  let S = null; // the running session

  function lockedChapters() {
    const locked = new Set();
    COURSE.chapters.forEach((ch, i) => {
      const prev = COURSE.chapters[i - 1];
      if (ch.locked || (prev && !state.gates[prev.id])) locked.add(ch.id);
    });
    return locked;
  }
  // New units are capped per day, so a session cannot be repeated to cram the whole chapter.
  function newLeftToday() {
    const day = today();
    return Math.max(0, SETTINGS.newPerSession - state.log.filter((e) => e.n && e.d === day).length);
  }
  function counts() {
    const locked = lockedChapters();
    const q = buildQueue(COURSE.units, state.cards, today(), { lockedChapters: locked, newCap: newLeftToday() });
    const fresh = q.filter((id) => !state.cards[id]).length;
    const unseen = COURSE.units.filter((u) => !locked.has(u.chapter) && !state.cards[u.id]).length;
    return { total: q.length, fresh, due: q.length - fresh, unseen };
  }
  function start(mode, chapter) {
    let queue;
    if (mode === "gate") queue = shuffle(COURSE.units.filter((u) => u.chapter === chapter).map((u) => u.id));
    else if (mode === "extra") queue = shuffle(COURSE.units.filter((u) => state.cards[u.id]).map((u) => u.id)).slice(0, SETTINGS.shortSession);
    else queue = buildQueue(COURSE.units, state.cards, today(), { lockedChapters: lockedChapters(), limit: mode === "short" ? SETTINGS.shortSession : 0,
      newCap: mode === "more" ? SETTINGS.newPerSession : newLeftToday() });
    if (!queue.length) return;
    S = { mode, chapter, queue, idx: 0, results: [], graded: new Set(), switches: 0 };
    for (let i = 1; i < queue.length; i++) if (UNIT[queue[i]].topic !== UNIT[queue[i - 1]].topic) S.switches += 1;
    openCard();
    view = "session";
    render();
  }
  function openCard() {
    const id = S.queue[S.idx];
    S.card = { id, phase: "attempt", isNew: !state.cards[id], sql: "", text: "", pick: null, conf: "fair",
      hints: 0, run: null, runError: "", verdict: null, why: "", alt: "plain", ai: "", yours: null, expected: null };
  }
  function finishCard(grade, why) {
    const c = S.card, id = c.id, day = today();
    c.phase = "feedback";
    c.verdict = grade;
    c.why = why || "";
    const first = !S.graded.has(id);
    if (first) {
      S.graded.add(id);
      S.results.push({ id, grade, isNew: c.isNew });
      if (S.mode !== "extra") {
        const old = state.cards[id];
        state.log.push({ u: id, d: day, g: grade, n: c.isNew ? 1 : 0, gap: old ? day - old.last : 0 });
        let next = schedule(old, grade, day);
        if (grade === "miss" && c.conf === "certain") next.ease = Math.max(1.3, next.ease - 0.1);
        state.cards[id] = next;
        save();
      }
      if (grade === "miss" && S.mode !== "gate") {
        S.queue.splice(Math.min(S.queue.length, S.idx + 1 + SETTINGS.requeueGap), 0, id);
      }
    }
    render();
    window.scrollTo(0, 0);
  }
  function nextCard() {
    S.idx += 1;
    if (S.idx >= S.queue.length) {
      if (S.mode === "gate") {
        const ok = S.results.filter((r) => r.grade !== "miss").length / S.results.length;
        S.gatePassed = ok >= SETTINGS.gatePass;
        if (S.gatePassed) { state.gates[S.chapter] = today(); save(); }
      }
      view = "summary";
    } else openCard();
    render();
    window.scrollTo(0, 0);
  }

  async function check() {
    const c = S.card, u = UNIT[c.id];
    if (u.type === "choice") {
      if (c.pick == null) return;
      const ok = c.pick === u.answer;
      return finishCard(ok ? (c.conf === "guess" ? "partial" : "got") : "miss");
    }
    if (u.type === "query") {
      if (!c.sql.trim()) return finishCard("miss", "No attempt this time. Read the worked answer, then it comes back.");
      c.busy = true; render();
      try {
        c.expected = await runSQL(u.solution);
        c.yours = await runSQL(c.sql);
        c.runError = "";
      } catch (e) {
        c.busy = false;
        c.runError = String(e.message || e);
        return render();
      }
      c.busy = false;
      const res = compareResults(c.yours, c.expected, u);
      if (!res.ok) return finishCard("miss", res.why);
      return finishCard(c.hints >= 2 || c.conf === "guess" ? "partial" : "got",
        c.hints >= 2 ? "Correct, with hints. It comes back a little sooner so you can do it cold." : "");
    }
    // explain
    if (!c.text.trim()) return finishCard("miss", "No attempt this time. Read the answer, then it comes back.");
    if (!sample) { c.phase = "selfgrade"; return render(); }
    c.busy = true; render();
    try {
      const out = await sample.json(
        "You are grading a learner's short answer in a SQL course, the way an expert tutor would.\n\n" +
        "Question:\n" + u.prompt + "\n\nModel answer:\n" + u.model + "\n\nGrading guide:\n" + u.rubric +
        "\n\nLearner's answer:\n" + c.text.slice(0, 2000) +
        "\n\nReply with only a JSON object: {\"verdict\": \"got\" | \"partial\" | \"miss\", \"feedback\": string}. " +
        "feedback is at most two sentences, addressed to the learner as \"you\", and names the specific idea they got or missed. " +
        "Do not restate the whole model answer.", { modelTier: "quick", cache: false });
      c.busy = false;
      const v = ["got", "partial", "miss"].includes(out && out.verdict) ? out.verdict : null;
      if (!v) { c.phase = "selfgrade"; return render(); }
      finishCard(v, String(out.feedback || ""));
    } catch (e) {
      c.busy = false;
      if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e && e.code)) sample = null;
      c.phase = "selfgrade";
      render();
    }
  }
  async function askWhy() {
    const c = S.card, u = UNIT[c.id];
    if (!sample || c.aiBusy) return;
    c.aiBusy = true; c.ai = "Thinking…"; render();
    const mine = u.type === "query" ? c.sql : u.type === "choice" ? u.options[c.pick] : c.text;
    const right = u.type === "query" ? u.solution : u.type === "choice" ? u.options[u.answer] : u.model;
    try {
      const out = await sample(
        "You are an expert SQL tutor. A learner answered a practice question incorrectly. In three or four plain sentences, " +
        "name the exact misconception behind THEIR answer and what to notice next time. Speak to them as \"you\". " +
        "No headings, no lists, no restating the full correct answer.\n\n" +
        "Table: accounts(" + DATA.accounts.columns.map((x) => x[0]).join(", ") + ")\n\nQuestion:\n" + u.prompt +
        "\n\nTheir answer:\n" + String(mine || "(blank)").slice(0, 2000) + "\n\nCorrect answer:\n" + right,
        { cache: false, onText: (t) => { c.ai = t.text; const el = document.getElementById("ai-out"); if (el) el.textContent = t.text; } });
      c.ai = out.text;
    } catch (e) {
      c.ai = e && e.text ? e.text : "Could not get an explanation just now.";
    }
    c.aiBusy = false;
    render();
  }

  // ---------- Screens ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  const inDays = (n) => (n <= 0 ? "today" : n === 1 ? "tomorrow" : n < 14 ? "in " + n + " days" : n < 60 ? "in " + Math.round(n / 7) + " weeks" : "in " + Math.round(n / 30) + " months");
  const KIND = { fact: "Fact", procedure: "Procedure", concept: "Concept", "tell-apart": "Tell these apart" };
  const ICON = {
    close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    bulb: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/></svg>',
    clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };

  function table(res, max) {
    if (!res || !res.columns.length) return '<p class="muted small">No rows came back.</p>';
    const rows = res.values.slice(0, max || 8);
    return '<div class="scroll"><table><thead><tr>' + res.columns.map((c) => "<th>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((v) => "<td>" + (v == null ? '<span class="null">NULL</span>' : esc(v)) + "</td>").join("") + "</tr>").join("") +
      "</tbody></table></div>" + '<p class="muted small">' + plural(res.values.length, "row") +
      (res.values.length > rows.length ? ", first " + rows.length + " shown" : "") + "</p>";
  }
  function schema() {
    const t = DATA.accounts;
    return '<details class="schema"><summary><span class="mono">accounts</span> ' + esc(t.columns.map((c) => c[0]).join(", ")) + "</summary>" +
      table({ columns: t.columns.map((c) => c[0]), values: t.rows.slice(0, 5) }, 5).replace(/<p class="muted small">.*?<\/p>/, '<p class="muted small">5 of ' + t.rows.length + " rows</p>") + "</details>";
  }
  function noteBox() {
    return '<form class="note" data-form="note"><label for="note">Something about the app annoy you? Note it and keep going.</label>' +
      '<div class="row"><input id="note" type="text" autocomplete="off" placeholder="e.g. the Run button is too small"><button class="btn quiet" type="submit">Save</button></div></form>';
  }

  function home() {
    const c = counts(), day = today(), locked = lockedChapters();
    const upcoming = Object.values(state.cards).map((x) => x.due).filter((d) => d > day).sort((a, b) => a - b)[0];
    const ret = retention(state.log).filter((b) => b.n);
    let todayCard;
    if (c.total) {
      todayCard = '<h1>' + (c.due ? plural(c.due, "review") + " due" : "No reviews due") + (c.fresh ? ", " + c.fresh + " new" : "") + "</h1>" +
        '<p class="muted">About ' + plural(Math.max(1, Math.round(c.total * SETTINGS.minutesPerCard)), "minute") + ". Reviews are mixed across topics on purpose.</p>" +
        '<div class="stack"><button class="btn primary" data-act="start">Start session</button>' +
        (c.total > SETTINGS.shortSession ? '<button class="btn quiet" data-act="short">Short session, ' + SETTINGS.shortSession + " cards</button>" : "") + "</div>";
    } else {
      todayCard = "<h1>Nothing is due today</h1>" + '<p class="muted">' + (upcoming ? "Your next review is " + inDays(upcoming - day) + "." : "Pass the chapter gate to unlock more.") +
        (c.unseen ? " You have taken on today's new units. Spacing them out is what makes them last." : "") + "</p>" +
        (c.unseen ? '<div class="stack"><button class="btn quiet" data-act="more">Add ' + Math.min(c.unseen, SETTINGS.newPerSession) + " more new units anyway</button></div>" : "") +
        (Object.keys(state.cards).length ? '<div class="stack"><button class="btn quiet" data-act="extra">Extra practice, ' + SETTINGS.shortSession + " cards</button></div>" +
          '<p class="muted small">Extra practice does not change your schedule.</p>' : "");
    }
    const chapters = COURSE.chapters.map((ch) => {
      const units = COURSE.units.filter((u) => u.chapter === ch.id);
      const seen = units.filter((u) => state.cards[u.id]).length;
      const solid = units.filter((u) => state.cards[u.id] && state.cards[u.id].reps >= 1).length;
      const isLocked = locked.has(ch.id);
      const gateReady = units.length && solid === units.length && !state.gates[ch.id];
      const status = state.gates[ch.id] ? "Gate passed" : ch.locked ? ch.locked : isLocked ? "Locked until the previous gate is passed" :
        gateReady ? "Ready for the gate" : seen + " of " + units.length + " started, " + solid + " recalled at least once";
      return '<li class="chapter' + (isLocked ? " locked" : "") + '"><div class="between"><strong>' + esc(ch.title) + "</strong>" +
        (state.gates[ch.id] ? '<span class="chip good">Passed</span>' : "") + "</div>" +
        '<p class="muted small">' + esc(ch.covers) + "</p>" +
        (units.length ? '<div class="bar"><span style="width:' + Math.round((solid / units.length) * 100) + '%"></span></div>' : "") +
        '<p class="small">' + esc(status) + "</p>" +
        (gateReady ? '<button class="btn primary" data-act="gate" data-ch="' + ch.id + '">Take the gate, ' + units.length + " questions</button>" : "") + "</li>";
    }).join("");
    const retBlock = ret.length ? '<section class="panel dark"><h2>What you still know</h2>' + ret.map((b) =>
      '<div class="ret"><span>' + b.label + '</span><div class="bar"><span style="width:' + Math.round((b.ok / b.n) * 100) + '%"></span></div><span class="mono">' + b.ok + "/" + b.n + "</span></div>").join("") + "</section>" :
      '<section class="panel"><h2>What you still know</h2><p class="muted">This fills in once reviews start coming back. It counts how much you recalled after a day, a week and a month away.</p></section>';
    const notes = state.notes.length ? '<section><div class="between"><h2>App improvements</h2><button class="btn quiet" data-act="copynotes">Copy all</button></div><ul class="notes">' +
      state.notes.slice().reverse().map((n, i) => "<li><span>" + esc(n.t) + '</span><button class="link" data-act="delnote" data-i="' + (state.notes.length - 1 - i) + '" aria-label="Remove note">Remove</button></li>').join("") +
      '</ul><textarea id="notes-copy" class="mono" readonly hidden></textarea></section>' : "";
    return '<header class="top"><p class="eyebrow">' + esc(COURSE.title) + "</p></header>" +
      '<section class="today">' + todayCard + "</section>" + (storeNote ? '<p class="warn small">' + esc(storeNote) + "</p>" : "") + retBlock +
      "<section><h2>Chapters</h2><ul class=\"chapters\">" + chapters + "</ul></section>" +
      '<section><h2>The data</h2><p class="muted">Every question runs against a sample CRM. Tap to see the table.</p>' + schema() + "</section>" +
      notes + noteBox();
  }

  function attempt() {
    const c = S.card, u = UNIT[c.id], card = state.cards[c.id], day = today();
    const status = S.mode === "gate" ? '<span class="chip">Gate</span>' : c.isNew ? '<span class="chip new">New to you</span>' :
      S.graded.has(c.id) ? '<span class="chip">Second try</span>' : '<span class="chip">Review, last seen ' + (card ? (day - card.last === 0 ? "today" : plural(day - card.last, "day") + " ago") : "") + "</span>";
    let body = "";
    if (u.type === "query") {
      body = schema() + '<div class="field"><label for="sql">Your query</label><textarea id="sql" class="mono" rows="6" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="SELECT ...">' + esc(c.sql) + "</textarea></div>" +
        '<div class="row"><button class="btn quiet" data-act="run">Run it</button>' +
        (S.mode !== "gate" && c.hints < u.hints.length ? '<button class="btn quiet" data-act="hint">' + (c.hints ? "Another hint" : "Hint") + "</button>" : "") + "</div>" +
        (c.runError ? '<p class="warn mono small">' + esc(c.runError) + "</p>" : "") + (c.run ? table(c.run, 6) : "") +
        (c.hints ? '<ol class="hints">' + u.hints.slice(0, c.hints).map((h) => "<li>" + esc(h) + "</li>").join("") + "</ol>" : "");
    } else if (u.type === "choice") {
      body = '<fieldset class="options"><legend class="sr">Pick one</legend>' + u.options.map((o, i) =>
        '<label class="option' + (c.pick === i ? " picked" : "") + '"><input type="radio" name="pick" value="' + i + '"' + (c.pick === i ? " checked" : "") + "><span>" + esc(o) + "</span></label>").join("") + "</fieldset>";
    } else {
      body = '<div class="field"><label for="text">Your answer, in your own words</label><textarea id="text" rows="5" placeholder="Because…">' + esc(c.text) + "</textarea></div>";
    }
    const conf = '<fieldset class="conf"><legend>How sure are you?</legend><div class="three">' +
      [["guess", "Guessing"], ["fair", "Fairly sure"], ["certain", "Certain"]].map(([v, l]) =>
        '<label class="seg' + (c.conf === v ? " picked" : "") + '"><input type="radio" name="conf" value="' + v + '"' + (c.conf === v ? " checked" : "") + "><span>" + l + "</span></label>").join("") + "</div></fieldset>";
    return sessionTop() + '<div class="chips"><span class="chip ink">' + esc(u.topic) + '</span><span class="chip">' + KIND[u.kind] + "</span>" + status + "</div>" +
      '<h1 class="prompt">' + esc(u.prompt) + "</h1>" + '<p class="muted small">On the job: ' + esc(u.task.toLowerCase()) + ".</p>" +
      (c.isNew && S.mode !== "gate" ? '<p class="callout">' + ICON.bulb + "<span><strong>Guess first.</strong> You have not been taught this yet. A wrong attempt now makes the explanation stick.</span></p>" : "") +
      body + conf + '<div class="stack end"><button class="btn primary" data-act="check"' + (c.busy ? " disabled" : "") + ">" + (c.busy ? "Checking…" : "Check my answer") + "</button>" +
      '<button class="btn quiet" data-act="idk">I have no idea yet</button></div>';
  }

  function selfgrade() {
    const c = S.card, u = UNIT[c.id];
    return sessionTop() + '<h1 class="prompt">Compare your answer</h1>' +
      '<div class="panel"><p class="label">You wrote</p><p>' + esc(c.text) + '</p><hr><p class="label good">Model answer</p><p>' + esc(u.model) + "</p></div>" +
      '<p class="muted">Be strict. Did your answer contain the same ideas?</p><div class="stack">' +
      '<button class="btn primary" data-act="self" data-g="got">I had it</button><button class="btn quiet" data-act="self" data-g="partial">Partly</button><button class="btn quiet" data-act="self" data-g="miss">Missed it</button></div>';
  }

  function feedback() {
    const c = S.card, u = UNIT[c.id], card = state.cards[c.id], day = today();
    const head = c.verdict === "got" ? "Correct." : c.verdict === "partial" ? "Partly there." : c.isNew ? "Not yet. That is the point of guessing first." : "Missed this time.";
    let mine = "";
    if (u.type === "query") {
      mine = (c.sql.trim() ? '<p class="label">Your query</p><pre class="code">' + esc(c.sql) + "</pre>" + (c.verdict === "miss" && c.yours ? table(c.yours, 4) : "") : "") +
        '<p class="label good">Worked answer</p><pre class="code">' + esc(u.solution) + "</pre>" + (c.expected ? table(c.expected, 4) : "");
    } else if (u.type === "choice") {
      mine = (c.pick != null && c.pick !== u.answer ? '<p class="label">You picked</p><p>' + esc(u.options[c.pick]) + "</p>" : "") +
        '<p class="label good">Answer</p><p>' + esc(u.options[u.answer]) + "</p>";
    } else {
      mine = (c.text.trim() ? '<p class="label">You wrote</p><p>' + esc(c.text) + "</p>" : "") + '<p class="label good">Model answer</p><p>' + esc(u.model) + "</p>";
    }
    const tabs = [["plain", "Plain"], ["analogy", "Analogy"], ["trace", "Step by step"]];
    const again = S.mode === "extra" ? "Practice only. Your schedule is unchanged." :
      (c.verdict === "miss" && S.mode !== "gate" ? "Coming back later this session, then " : "Back ") + (card ? inDays(card.due - day) : "") + ", from memory.";
    return sessionTop() + '<h1 class="prompt">' + head + "</h1>" + (c.why ? '<p class="why">' + esc(c.why) + "</p>" : "") +
      (c.verdict === "miss" && c.conf === "certain" ? '<p class="muted small">You were certain. Being sure and wrong is the most useful signal there is, so this one returns sooner.</p>' : "") +
      '<div class="panel">' + mine + '<hr><p class="label good">The idea</p><p>' + esc(u.gap) + "</p></div>" +
      (sample && c.verdict !== "got" ? '<div><button class="btn quiet" data-act="why"' + (c.aiBusy ? " disabled" : "") + ">Why was mine wrong?</button>" +
        (c.ai ? '<p id="ai-out" class="panel ai">' + esc(c.ai) + "</p>" : "") + "</div>" : "") +
      '<section><h2>Explain it another way</h2><div class="row" role="tablist">' + tabs.map(([k, l]) =>
        '<button class="tab' + (c.alt === k ? " on" : "") + '" role="tab" aria-selected="' + (c.alt === k) + '" data-act="alt" data-k="' + k + '">' + l + "</button>").join("") +
      '</div><p class="panel">' + esc(u.alt[c.alt]) + "</p></section>" +
      '<section><h2>Where you will use this</h2><div class="panel tint"><p>' + esc(u.use) + '</p><div class="field"><label for="own">Now you: where would this show up in work you want to do?</label>' +
      '<input id="own" type="text" autocomplete="off" placeholder="One sentence is enough" value="' + esc(state.own[u.id] || "") + '"></div></div></section>' +
      '<section><h2>Where people get stuck</h2><ol class="stuck">' + u.stuck.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ol>" +
      '<p class="small">Source: <a href="' + esc(u.source.url) + '" target="_blank" rel="noopener">' + esc(u.source.title) + ", " + esc(COURSE.spine) + "</a></p></section>" +
      '<div class="stack end"><p class="muted small when">' + ICON.clock + "<span>" + esc(again) + '</span></p><button class="btn primary" data-act="next">' +
      (S.idx + 1 >= S.queue.length ? "Finish session" : "Next: " + esc(UNIT[S.queue[S.idx + 1]].topic)) + "</button></div>";
  }

  function sessionTop() {
    return '<header class="bar-top"><button class="icon" data-act="quit" aria-label="End session">' + ICON.close + '</button><div class="segs" aria-hidden="true">' +
      S.queue.map((_, i) => '<span class="' + (i < S.idx ? "done" : i === S.idx ? "now" : "") + '"></span>').join("") +
      '</div><span class="muted small">' + (S.idx + 1) + " of " + S.queue.length + "</span></header>";
  }

  function summary() {
    const day = today(), r = S.results, ok = r.filter((x) => x.grade !== "miss").length;
    const ret = retention(state.log).filter((b) => b.n);
    const back = r.map((x) => ({ u: UNIT[x.id], card: state.cards[x.id], grade: x.grade })).filter((x) => x.card)
      .sort((a, b) => a.card.due - b.card.due).slice(0, 6);
    const tomorrow = Object.values(state.cards).filter((c) => c.due <= day + 1).length;
    const gate = S.mode === "gate" ? '<p class="callout ' + (S.gatePassed ? "good" : "") + '"><span><strong>' + (S.gatePassed ? "Gate passed." : "Not through the gate yet.") + "</strong> " +
      ok + " of " + r.length + " correct. " + (S.gatePassed ? "The next chapter unlocks when it is written." : "You need " + Math.ceil(r.length * SETTINGS.gatePass) + ". The missed ones come back tomorrow, then try again.") + "</span></p>" : "";
    return '<header class="top"><p class="eyebrow">Session done, ' + plural(r.length, "unit") + "</p><h1>" + ok + " of " + r.length + " from memory</h1></header>" + gate +
      (S.mode !== "gate" ? '<p class="callout">' + ICON.bulb + "<span><strong>That felt hard because it is working.</strong> You switched topic " + plural(S.switches, "time") +
        " and pulled every answer from memory" + (r.some((x) => x.isNew) ? ", including " + plural(r.filter((x) => x.isNew).length, "unit") + " you had never been taught" : "") + ".</span></p>" : "") +
      (ret.length ? '<section class="panel dark"><h2>What you still know</h2>' + ret.map((b) =>
        '<div class="ret"><span>' + b.label + '</span><div class="bar"><span style="width:' + Math.round((b.ok / b.n) * 100) + '%"></span></div><span class="mono">' + b.ok + "/" + b.n + "</span></div>").join("") + "</section>" : "") +
      (back.length ? '<section><h2>Coming back</h2><ul class="back">' + back.map((x) => '<li><div><strong>' + esc(x.u.topic) + '</strong><span class="muted small">' + esc(KIND[x.u.kind]) +
        (x.grade === "miss" ? ", missed today" : "") + '</span></div><span class="' + (x.grade === "miss" ? "amber" : "good") + '">' + esc(inDays(x.card.due - day)) + "</span></li>").join("") + "</ul></section>" : "") +
      '<p class="muted small center">Due tomorrow: ' + plural(tomorrow, "review") + ".</p>" +
      '<div class="stack"><button class="btn primary" data-act="home">Done for today</button></div>' + noteBox();
  }

  // ---------- Events ----------
  const app = document.getElementById("app");
  function sync() {
    if (!S || !S.card) return;
    const g = (id) => document.getElementById(id);
    if (g("sql")) S.card.sql = g("sql").value;
    if (g("text")) S.card.text = g("text").value;
    if (g("own")) { const v = g("own").value.trim(); if (v !== (state.own[S.card.id] || "")) { if (v) state.own[S.card.id] = v; else delete state.own[S.card.id]; save(); } }
  }
  function render() {
    const focus = document.activeElement && document.activeElement.id;
    app.innerHTML = view === "home" ? home() : view === "summary" ? summary() :
      S.card.phase === "attempt" ? attempt() : S.card.phase === "selfgrade" ? selfgrade() : feedback();
    if (focus && document.getElementById(focus) && /^(sql|text|own|note)$/.test(focus)) document.getElementById(focus).focus();
  }
  app.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    sync();
    if (act === "start") start("normal");
    else if (act === "short") start("short");
    else if (act === "more") start("more");
    else if (act === "extra") start("extra");
    else if (act === "gate") start("gate", b.dataset.ch);
    else if (act === "home" || act === "quit") { S = null; view = "home"; render(); window.scrollTo(0, 0); }
    else if (act === "run") {
      const c = S.card;
      try { c.run = await runSQL(c.sql); c.runError = ""; } catch (err) { c.run = null; c.runError = String(err.message || err); }
      render();
    }
    else if (act === "hint") { S.card.hints += 1; render(); }
    else if (act === "check") check();
    else if (act === "idk") finishCard("miss", "No attempt this time. Read the answer, then it comes back.");
    else if (act === "self") finishCard(b.dataset.g);
    else if (act === "alt") { S.card.alt = b.dataset.k; render(); }
    else if (act === "why") askWhy();
    else if (act === "next") nextCard();
    else if (act === "delnote") { state.notes.splice(Number(b.dataset.i), 1); save(); render(); }
    else if (act === "copynotes") {
      const text = state.notes.map((n) => "- " + n.t).join("\n");
      try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; }
      catch (err) { const ta = document.getElementById("notes-copy"); ta.hidden = false; ta.value = text; ta.rows = Math.min(8, state.notes.length + 1); ta.select(); }
    }
  });
  app.addEventListener("change", (e) => {
    if (!S || !S.card) return;
    if (e.target.name === "pick") { sync(); S.card.pick = Number(e.target.value); render(); }
    if (e.target.name === "conf") { sync(); S.card.conf = e.target.value; render(); }
  });
  app.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.dataset.form !== "note") return;
    const input = e.target.querySelector("input");
    const t = input.value.trim();
    if (!t) return;
    state.notes.push({ t, d: today() });
    save();
    sync();
    input.value = "";
    if (view === "home") render(); else { input.placeholder = "Saved. It is on the home screen."; }
  });

  loadLocal();
  render();
  connect();
})();
