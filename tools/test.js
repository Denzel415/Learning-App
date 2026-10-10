// Checks the scheduler, the session builder, and every query unit's worked answer.
// Run: node tools/test.js
const assert = require("assert");
const path = require("path");
const root = path.join(__dirname, "..");
const { schedule, buildQueue, compareResults, retention } = require(path.join(root, "app.js"));
global.window = {};
require(path.join(root, "data/crm.js"));
require(path.join(root, "courses/sql-1.js"));
const COURSE = window.COURSE, DATA = window.CRM_DATA;

// Scheduler
let c = schedule(undefined, "got", 100);
assert.deepStrictEqual([c.interval, c.due, c.reps, c.lapses], [2, 102, 1, 0]);
c = schedule(c, "got", 102); assert.strictEqual(c.interval, 5);
c = schedule(c, "got", 107); assert.ok(c.interval >= 11 && c.interval <= 13, "third interval " + c.interval);
const before = c.interval;
c = schedule(c, "partial", 120); assert.ok(c.interval > before && c.interval < before * 2);
c = schedule(c, "miss", 140); assert.deepStrictEqual([c.interval, c.due, c.reps, c.lapses], [1, 141, 0, 1]);
assert.ok(c.ease >= 1.3);
const fresh = schedule(undefined, "miss", 10); assert.deepStrictEqual([fresh.due, fresh.lapses], [11, 0]);
let grow = undefined, last = 0;
for (let d = 0, i = 0; i < 8; i++) { grow = schedule(grow, "got", d); assert.ok(grow.interval > last); last = grow.interval; d = grow.due; }

// Session builder
const units = COURSE.units;
let q = buildQueue(units, {}, 100, {});
assert.deepStrictEqual(q, units.slice(0, 4).map((u) => u.id), "first session is the first four new units, in order");
const cards = {};
units.slice(0, 6).forEach((u, i) => { cards[u.id] = { due: i < 4 ? 100 : 105, last: 99, reps: 1, interval: 1, ease: 2.3, lapses: 0 }; });
q = buildQueue(units, cards, 100, {});
assert.strictEqual(q.length, 8); assert.strictEqual(new Set(q).size, 8);
assert.ok(!q.includes(units[4].id), "not-yet-due units stay out");
assert.strictEqual(buildQueue(units, cards, 100, { limit: 4 }).length, 4);
assert.strictEqual(buildQueue(units, cards, 100, { lockedChapters: new Set(["ch1"]) }).length, 0);

// Retention
const r = retention([{ g: "got", gap: 2 }, { g: "miss", gap: 3 }, { g: "got", gap: 9 }, { g: "got", gap: 0, n: 1 }, { g: "partial", gap: 40 }]);
assert.deepStrictEqual(r.map((b) => [b.ok, b.n]), [[1, 2], [1, 1], [1, 1]]);

// Every query unit: the worked answer runs, returns rows, and plausible wrong answers are caught.
require(path.join(root, "vendor/sql-asm.js"))().then((SQL) => {
  const run = (sql) => {
    const d = new SQL.Database();
    const t = DATA.accounts;
    d.run("CREATE TABLE accounts (" + t.columns.map((x) => x[0] + " " + x[1]).join(", ") + ")");
    const s = d.prepare("INSERT INTO accounts VALUES (" + t.columns.map(() => "?").join(",") + ")");
    t.rows.forEach((row) => s.run(row)); s.free();
    const out = d.exec(sql); d.close();
    return out.length ? out[out.length - 1] : { columns: [], values: [] };
  };
  const wrong = {
    "select-columns": "SELECT name FROM accounts",
    "where-text": "SELECT name, state FROM accounts WHERE industry = 'software'",
    "where-number": "SELECT name, employees FROM accounts WHERE employees > 1100",
    "and": "SELECT name, employees FROM accounts WHERE industry = 'Software' AND state = 'CA'",
    "in-list": "SELECT name, state FROM accounts WHERE state = 'CA'",
    "like": "SELECT name, industry FROM accounts WHERE name LIKE 'Labs%'",
    "is-null": "SELECT name, state FROM accounts WHERE owner = NULL",
    "top-five": "SELECT name, annual_revenue FROM accounts ORDER BY annual_revenue LIMIT 5",
    "icp-list": "SELECT name, industry, employees, owner FROM accounts WHERE industry = 'Software' OR industry = 'Fintech' AND employees >= 100 AND employees <= 1000 AND owner IS NOT NULL ORDER BY employees DESC",
  };
  const ids = new Set();
  units.forEach((u) => {
    assert.ok(!ids.has(u.id), "duplicate id " + u.id); ids.add(u.id);
    ["prompt", "gap", "use", "task", "topic"].forEach((k) => assert.ok(u[k], u.id + " missing " + k));
    assert.ok(u.alt.plain && u.alt.analogy && u.alt.trace && u.stuck.length >= 2 && u.source.url, u.id + " missing layers");
    if (u.type === "choice") assert.ok(u.options[u.answer], u.id + " answer index");
    if (u.type === "explain") assert.ok(u.model && u.rubric, u.id + " model/rubric");
    if (u.type !== "query") return;
    const exp = run(u.solution);
    assert.ok(exp.values.length > 0 && exp.values.length < 40 || u.id === "select-columns", u.id + " returns " + exp.values.length + " rows");
    assert.ok(compareResults(exp, exp, u).ok, u.id + " self-compare");
    assert.ok(wrong[u.id], "no wrong answer listed for " + u.id);
    const w = compareResults(run(wrong[u.id]), exp, u);
    assert.ok(!w.ok, u.id + ": wrong answer was accepted");
    console.log(u.id.padEnd(16), String(exp.values.length).padStart(2), "rows | wrong answer ->", w.why);
  });
  // A correct answer written differently still passes, and row order is ignored unless the unit sorts.
  const u = units.find((x) => x.id === "in-list");
  assert.ok(compareResults(run("select name, state from accounts where state='CA' or state='WA' or state='CO' order by name"), run(u.solution), u).ok);
  const icp = units.find((x) => x.id === "icp-list");
  assert.ok(compareResults(run("SELECT name, industry, employees, owner FROM accounts WHERE (industry='Software' OR industry='Fintech') AND employees BETWEEN 100 AND 1000 AND owner IS NOT NULL ORDER BY employees DESC, name DESC"), run(icp.solution), icp).ok);
  console.log("NULL owners:", run("SELECT count(*) FROM accounts WHERE owner IS NULL").values[0][0]);
  console.log("All checks passed.");
}).catch((e) => { console.error(e); process.exit(1); });
