// SQL Course 1: Querying a CRM.
// Each unit follows the rules in the course brief:
//   kind   = what sort of knowledge it is (fact, procedure, concept, tell-apart). It decides the technique.
//   type   = how you answer in the app: "query" (write SQL that runs), "choice", or "explain" (your own words).
//   task   = the job task this unit serves. Shown on every card.
//   orderCol = for query units where sort order matters, the position (0-based) of the sorted column.
// To add a unit, copy one, give it a new id, and edit. Order in this file is the order new units are introduced.

const SRC = "https://www.thoughtspot.com/sql-tutorial/";

window.COURSE = {
  id: "sql-1",
  title: "SQL 1: Querying a CRM",
  spine: "Mode SQL Tutorial (now hosted by ThoughtSpot)",
  chapters: [
    { id: "ch1", title: "Asking a table questions", covers: "SELECT, WHERE, ORDER BY, LIMIT, NULL" },
    { id: "ch2", title: "Summarizing", covers: "COUNT, SUM, AVG, GROUP BY, HAVING, CASE", locked: "Not written yet" },
    { id: "ch3", title: "Connecting tables", covers: "The CRM data model, INNER and LEFT JOIN", locked: "Not written yet" },
  ],
  units: [
    {
      id: "select-columns", chapter: "ch1", kind: "procedure", type: "query", topic: "SELECT",
      task: "Pull a list of accounts",
      prompt: "Sales wants a simple list: every account's name and industry.",
      solution: "SELECT name, industry\nFROM accounts;",
      hints: [
        "A query needs two things: which columns, and which table.",
        "The columns go after SELECT, separated by commas. The table goes after FROM.",
        "SELECT name, industry FROM ...",
      ],
      gap: "SELECT lists the columns you want, in the order you want them. FROM names the table. Every query you write starts from these two lines.",
      alt: {
        plain: "You are telling the database: from this table, hand me these columns, for every row.",
        analogy: "A spreadsheet with most columns hidden. SELECT is you choosing which columns stay visible.",
        trace: "The database goes to the accounts table first (FROM), reads all 40 rows, then keeps only the name and industry cells from each (SELECT).",
      },
      use: "Every export, report and dashboard query begins this way. A lead list for a campaign is a SELECT of the handful of columns marketing needs.",
      stuck: [
        "Forgetting the comma between columns, which makes SQL read the second name as a nickname for the first.",
        "Writing the table before the columns. SELECT always comes first in the text, even though FROM runs first.",
      ],
      source: { title: "SQL SELECT", url: SRC + "sql-select" },
    },
    {
      id: "select-star", chapter: "ch1", kind: "fact", type: "choice", topic: "SELECT",
      task: "Pull a list of accounts",
      prompt: "What does SELECT * FROM accounts return?",
      options: [
        "Every column, for every row in accounts",
        "Only the first row of accounts",
        "A count of the rows in accounts",
        "Every table in the database",
      ],
      answer: 0,
      gap: "The star means all columns. With no WHERE, you also get all rows. It is the fastest way to look at a table you have never seen.",
      alt: {
        plain: "Star is shorthand for typing out every column name.",
        analogy: "Opening the whole spreadsheet with nothing hidden and no filter on.",
        trace: "FROM accounts loads the table. SELECT * keeps all 8 columns. Result: 40 rows by 8 columns.",
      },
      use: "You will run SELECT * with a LIMIT constantly to get a feel for a new table. In saved reports, name the columns, so the report does not change when someone adds a column.",
      stuck: [
        "Using * in a saved report or pipeline, then having it break when the table changes.",
        "Reading * as a count because COUNT(*) looks similar.",
      ],
      source: { title: "SQL SELECT", url: SRC + "sql-select" },
    },
    {
      id: "where-text", chapter: "ch1", kind: "procedure", type: "query", topic: "WHERE",
      task: "Pull a list of accounts that match an ICP",
      prompt: "List the name and state of every account in the Software industry.",
      solution: "SELECT name, state\nFROM accounts\nWHERE industry = 'Software';",
      hints: [
        "You need a third line that keeps only some rows.",
        "WHERE goes after FROM and holds a condition that is true or false for each row.",
        "Text values go in single quotes: WHERE industry = 'Software'",
      ],
      gap: "WHERE filters rows. The database checks the condition against each row and keeps the ones where it is true. Text you are matching goes in single quotes.",
      alt: {
        plain: "SELECT picks columns. WHERE picks rows.",
        analogy: "A bouncer with one rule. Every row walks up, the rule is checked, and the row gets in or it doesn't.",
        trace: "FROM loads 40 rows. WHERE tests industry = 'Software' on each and keeps the matches. SELECT then trims those rows to name and state.",
      },
      use: "Segmenting is most of GTM work: accounts in one industry, leads from one campaign, deals in one stage. Each of those is a WHERE.",
      stuck: [
        "Matching is exact. 'software' in lowercase is a different value in most databases.",
        "Filtering on a column you did not SELECT is fine. WHERE can use any column in the table.",
      ],
      source: { title: "SQL WHERE", url: SRC + "sql-where" },
    },
    {
      id: "quotes", chapter: "ch1", kind: "tell-apart", type: "choice", topic: "WHERE",
      task: "Pull a list of accounts that match an ICP",
      prompt: "Which filter correctly finds accounts in California with more than 500 employees?",
      options: [
        "WHERE state = 'CA' AND employees > 500",
        "WHERE state = CA AND employees > '500'",
        "WHERE state = \"CA\" AND employees > 500",
        "WHERE state == 'CA' AND employees > 500",
      ],
      answer: 0,
      gap: "Text values take single quotes. Numbers take none. Without quotes, CA is read as a column name. Double quotes also mean a column name in standard SQL, and equality is one equals sign.",
      alt: {
        plain: "Quotes say: this is a piece of text. No quotes say: this is a number or the name of a column.",
        analogy: "In a sentence, quoting a word means you are talking about the word itself. SQL works the same way.",
        trace: "state = CA makes the database look for a column called CA, find none, and stop with an error before reading a single row.",
      },
      use: "The error \"column CA does not exist\" is one you will see in your first week. Knowing it means a missing quote saves a lot of time.",
      stuck: [
        "Double quotes work in some databases and fail in others. Single quotes work everywhere.",
        "Putting quotes around numbers, which turns a numeric comparison into a text comparison.",
      ],
      source: { title: "SQL Comparison Operators", url: SRC + "sql-comparison-operators" },
    },
    {
      id: "where-number", chapter: "ch1", kind: "procedure", type: "query", topic: "WHERE",
      task: "Pull a list of accounts that match an ICP",
      prompt: "Find the enterprise accounts: name and employees for every account with at least 1,000 employees.",
      solution: "SELECT name, employees\nFROM accounts\nWHERE employees >= 1000;",
      hints: [
        "\"At least\" includes the number itself.",
        "The comparison operators are =, <>, <, <=, >, >=.",
        "WHERE employees >= 1000, with no comma inside the number.",
      ],
      gap: "\"At least 1,000\" is >=, which includes 1,000 exactly. Using > would silently drop any account with exactly 1,000 employees.",
      alt: {
        plain: "Translate the English first. At least means >=. More than means >. At most means <=. Fewer than means <.",
        analogy: "A height sign at a ride that says \"must be 48 inches\". Someone exactly 48 inches gets on.",
        trace: "Each row's employees value is compared with 1000. The row with 1100 passes. A row with exactly 1000 would pass. 820 fails.",
      },
      use: "Segment boundaries (SMB, mid-market, enterprise) are defined by cutoffs like this. Off-by-one mistakes at the boundary put accounts in the wrong segment and nobody notices.",
      stuck: [
        "Using > when the request says \"at least\", or >= when it says \"more than\".",
        "Typing 1,000 with a comma, which SQL reads as two separate things.",
      ],
      source: { title: "SQL Comparison Operators", url: SRC + "sql-comparison-operators" },
    },
    {
      id: "and", chapter: "ch1", kind: "procedure", type: "query", topic: "AND / OR",
      task: "Pull a list of accounts that match an ICP",
      prompt: "A rep covers California software companies. List the name and employees of Software accounts in CA with more than 200 employees.",
      solution: "SELECT name, employees\nFROM accounts\nWHERE industry = 'Software'\n  AND state = 'CA'\n  AND employees > 200;",
      hints: [
        "There are three conditions and a row has to pass all of them.",
        "Join conditions with AND. Each one is a full comparison on its own.",
        "WHERE industry = 'Software' AND state = 'CA' AND ...",
      ],
      gap: "AND keeps a row only when every condition is true. Each condition is complete by itself: a column, an operator, a value.",
      alt: {
        plain: "Each AND makes the list shorter, because rows now have one more test to pass.",
        analogy: "Stacking filters on a shopping site: brand, then size, then price. Each one narrows what is left.",
        trace: "40 rows. After industry = 'Software', the software accounts remain. After state = 'CA', fewer. After employees > 200, the final list.",
      },
      use: "An ICP definition is a stack of ANDs: right industry, right size, right region. Turning a written ICP into a WHERE clause is a core GTM engineering task.",
      stuck: [
        "Writing WHERE industry = 'Software' AND 'CA', leaving the column off the second condition.",
        "Using a comma between conditions out of habit from the SELECT list.",
      ],
      source: { title: "SQL Logical Operators", url: SRC + "sql-logical-operators" },
    },
    {
      id: "and-or-order", chapter: "ch1", kind: "concept", type: "choice", topic: "AND / OR",
      task: "Pull a list of accounts that match an ICP",
      prompt: "You want big accounts in CA or NY. You write:\n\nWHERE state = 'CA' OR state = 'NY' AND employees > 1000\n\nWhat comes back?",
      options: [
        "Every CA account of any size, plus NY accounts over 1,000 employees",
        "CA and NY accounts over 1,000 employees",
        "Only NY accounts over 1,000 employees",
        "An error, because AND and OR cannot be mixed",
      ],
      answer: 0,
      gap: "AND is evaluated before OR, the way multiplication comes before addition. The size filter attaches only to NY. Parentheses fix it: WHERE (state = 'CA' OR state = 'NY') AND employees > 1000.",
      alt: {
        plain: "AND grabs the two conditions next to it first. Whatever is left gets joined by OR.",
        analogy: "2 + 3 × 4 is 14, because the multiplication happens first. If you want 20, you write (2 + 3) × 4.",
        trace: "A CA account with 60 employees: state = 'CA' is true, so the whole thing is true, and it is kept. The size test never mattered for it.",
      },
      use: "This bug produces a list that looks plausible and is wrong. It is how a campaign meant for enterprise accounts ends up emailing forty small ones.",
      stuck: [
        "Reading the clause left to right like English and assuming the last filter applies to everything.",
        "Skipping parentheses because the query ran without an error.",
      ],
      source: { title: "SQL Logical Operators", url: SRC + "sql-logical-operators" },
    },
    {
      id: "in-list", chapter: "ch1", kind: "procedure", type: "query", topic: "IN",
      task: "Pull a list of accounts that match an ICP",
      prompt: "The West region is CA, WA and CO. List the name and state of every account in the West.",
      solution: "SELECT name, state\nFROM accounts\nWHERE state IN ('CA', 'WA', 'CO');",
      hints: [
        "You could chain three ORs. There is a shorter way to match against a list.",
        "IN takes a list of values in parentheses.",
        "WHERE state IN ('CA', 'WA', 'CO')",
      ],
      gap: "IN checks whether a value appears in a list. It means the same as chaining ORs on one column, it is shorter, and it avoids the AND/OR ordering trap.",
      alt: {
        plain: "IN asks: is this row's value one of these?",
        analogy: "A guest list at the door. Your name is on it or it isn't.",
        trace: "For each row the database looks at state and checks it against CA, WA, CO. A match on any one keeps the row.",
      },
      use: "Territories, tiers, and lists of target industries are all sets of values. IN is how those sets show up in a query.",
      stuck: [
        "Leaving out the parentheses or the quotes around each value.",
        "Chaining ORs and then adding an AND, which brings back the ordering bug.",
      ],
      source: { title: "SQL Logical Operators", url: SRC + "sql-logical-operators" },
    },
    {
      id: "like", chapter: "ch1", kind: "procedure", type: "query", topic: "LIKE",
      task: "Find duplicates and messy records",
      prompt: "Someone asks for \"all the Labs companies\". List the name and industry of every account with Labs in its name.",
      solution: "SELECT name, industry\nFROM accounts\nWHERE name LIKE '%Labs%';",
      hints: [
        "An equals sign needs the whole value. You only know part of it.",
        "LIKE matches a pattern. The percent sign stands for any run of characters.",
        "WHERE name LIKE '%Labs%'",
      ],
      gap: "LIKE matches text against a pattern. A percent sign stands for any characters, including none. '%Labs%' means Labs anywhere in the value.",
      alt: {
        plain: "Percent is a blank that can be filled with anything. Put it where you don't care what the text says.",
        analogy: "Searching your inbox for a word, where you don't care what comes before or after it.",
        trace: "'Northwind Labs' fits the pattern: 'Northwind ' fills the first %, nothing fills the second. 'Brightpath Health' has no Labs, so it fails.",
      },
      use: "Company names are entered by hand and never consistent. Pattern matching is how you find 'Acme', 'Acme Inc' and 'ACME Corp.' when cleaning up a CRM.",
      stuck: [
        "Using = with a percent sign, which looks for a literal percent character.",
        "'Labs%' only matches names that start with Labs. The leading % matters.",
      ],
      source: { title: "SQL Logical Operators", url: SRC + "sql-logical-operators" },
    },
    {
      id: "null-equals", chapter: "ch1", kind: "concept", type: "explain", topic: "NULL",
      task: "Find duplicates and messy records",
      prompt: "Six accounts have no owner. This query returns zero rows:\n\nSELECT name FROM accounts WHERE owner = NULL;\n\nIn your own words, why?",
      model: "NULL means the value is unknown or missing. It is the absence of a value. Comparing anything to an unknown with = gives unknown, never true, and WHERE only keeps rows where the condition is true. So no row passes. The test for missing values is IS NULL.",
      rubric: "Full credit needs both ideas: (1) NULL is the absence of a value / unknown, so = NULL is never true (it evaluates to unknown, not true), and (2) the correct test is IS NULL. Partial if only one is present. Miss if the answer blames syntax, quotes, or says there are no null rows.",
      gap: "NULL is the absence of a value. Any comparison with it using = comes out unknown, and WHERE drops everything that is not true. Use IS NULL to find missing values.",
      alt: {
        plain: "You cannot ask whether something equals a blank. You can only ask whether it is blank.",
        analogy: "Asking \"is your middle name the same as the middle name of someone whose middle name I don't know?\" The only fair answer is \"can't say\".",
        trace: "Row 4, owner is NULL. NULL = NULL evaluates to unknown. WHERE needs true. Row dropped. The same happens to all 40 rows.",
      },
      use: "Missing data is everywhere in a CRM: no owner, no close date, no industry. Queries that mishandle NULL undercount without any error, which is the worst kind of wrong.",
      stuck: [
        "Expecting an error. The query runs fine and returns nothing, which looks like \"there are none\".",
        "Thinking NULL is the same as an empty string or zero.",
      ],
      source: { title: "SQL IS NULL", url: SRC + "sql-is-null" },
    },
    {
      id: "is-null", chapter: "ch1", kind: "procedure", type: "query", topic: "NULL",
      task: "Find duplicates and messy records",
      prompt: "RevOps wants to assign orphaned accounts. List the name and state of every account with no owner.",
      solution: "SELECT name, state\nFROM accounts\nWHERE owner IS NULL;",
      hints: [
        "\"No owner\" means the owner value is missing.",
        "Missing values are tested with a special phrase, since = does not work on them.",
        "WHERE owner IS NULL",
      ],
      gap: "IS NULL is the only test that finds missing values. Its opposite is IS NOT NULL.",
      alt: {
        plain: "IS NULL asks: is this cell empty?",
        analogy: "Checking which seats at a table have no name card.",
        trace: "For each row the database checks whether owner holds a value. Six rows hold none, and those six are returned.",
      },
      use: "\"Unassigned\", \"missing\", \"never contacted\" and \"no close date\" all translate to IS NULL. These are among the most common data hygiene requests.",
      stuck: [
        "Writing = NULL or = 'NULL'. The second one looks for the four-letter word.",
        "Forgetting that <> also skips NULLs: owner <> 'Priya Shah' leaves out accounts with no owner.",
      ],
      source: { title: "SQL IS NULL", url: SRC + "sql-is-null" },
    },
    {
      id: "order-direction", chapter: "ch1", kind: "tell-apart", type: "choice", topic: "ORDER BY",
      task: "Pull a list of accounts",
      prompt: "ORDER BY created_at, with nothing after it, puts which accounts first?",
      options: [
        "The oldest accounts",
        "The newest accounts",
        "Whatever order they were entered in",
        "It depends on the database",
      ],
      answer: 0,
      gap: "ORDER BY sorts ascending unless told otherwise: smallest number, earliest date, A before Z. Add DESC for the reverse.",
      alt: {
        plain: "The default is low to high. For dates, low means earlier.",
        analogy: "A timeline read left to right starts with the oldest event.",
        trace: "The database sorts the created_at values from smallest to largest. 2023-01-04 comes before 2026-09-12, so 2023 rows are on top.",
      },
      use: "\"Most recent\" and \"biggest\" are the usual requests, and both need DESC. Forgetting it hands someone the oldest or smallest by mistake.",
      stuck: [
        "Assuming a table has a natural order. Without ORDER BY, row order is not guaranteed.",
        "Putting DESC on the wrong column when sorting by two.",
      ],
      source: { title: "SQL ORDER BY", url: SRC + "sql-order-by" },
    },
    {
      id: "top-five", chapter: "ch1", kind: "procedure", type: "query", topic: "ORDER BY", orderCol: 1,
      task: "Rank accounts",
      prompt: "The VP of Sales wants the five biggest accounts by annual revenue: name and annual_revenue, largest first.",
      solution: "SELECT name, annual_revenue\nFROM accounts\nORDER BY annual_revenue DESC\nLIMIT 5;",
      hints: [
        "Two steps: put the rows in the right order, then keep only the first few.",
        "ORDER BY sorts, DESC flips it to largest first, LIMIT keeps the top rows.",
        "ORDER BY annual_revenue DESC, then LIMIT 5 on the last line.",
      ],
      gap: "Top-N is always the same pair: ORDER BY ... DESC to put the biggest first, then LIMIT to cut the list. Without the ORDER BY, LIMIT returns five arbitrary rows.",
      alt: {
        plain: "Sort the pile, then take from the top.",
        analogy: "A leaderboard. Rank everyone by score, then show the first five.",
        trace: "All 40 rows are sorted by annual_revenue from largest to smallest. LIMIT 5 then returns rows 1 through 5 of that sorted list.",
      },
      use: "Top accounts, top reps, top campaigns, most recent signups. Leadership asks for a top-N list almost daily.",
      stuck: [
        "Putting LIMIT before ORDER BY. LIMIT is always the last line.",
        "Leaving off DESC and returning the five smallest.",
      ],
      source: { title: "SQL ORDER BY", url: SRC + "sql-order-by" },
    },
    {
      id: "icp-list", chapter: "ch1", kind: "procedure", type: "query", topic: "Putting it together", orderCol: 2,
      task: "Pull a list of accounts that match an ICP",
      prompt: "Build the outbound list. ICP: Software or Fintech, between 100 and 1,000 employees inclusive, and already assigned to an owner. Return name, industry, employees and owner, biggest companies first.",
      solution: "SELECT name, industry, employees, owner\nFROM accounts\nWHERE industry IN ('Software', 'Fintech')\n  AND employees >= 100\n  AND employees <= 1000\n  AND owner IS NOT NULL\nORDER BY employees DESC;",
      hints: [
        "Take the ICP one phrase at a time. Each phrase becomes one condition.",
        "Industry is a list (IN). Size is two comparisons. \"Assigned\" means the owner is not missing.",
        "WHERE industry IN (...) AND employees >= 100 AND employees <= 1000 AND owner IS NOT NULL ORDER BY employees DESC, name",
      ],
      gap: "A written ICP translates phrase by phrase: a set of industries becomes IN, a size range becomes two comparisons, \"assigned\" becomes IS NOT NULL. Using IN for the industries keeps OR out of the clause, so nothing needs parentheses.",
      alt: {
        plain: "Underline each requirement in the request. Write one condition per underline. Join them with AND.",
        analogy: "A casting call: right role, right age range, and has an agent. Each requirement is checked independently, and you need all of them.",
        trace: "40 rows. The industry filter keeps Software and Fintech. The size filter drops the very small and very large. IS NOT NULL drops unassigned accounts. What remains is sorted by employees, largest first.",
      },
      use: "This is the request itself. \"Can you pull a list of accounts that match our ICP\" is one of the most common asks a GTM engineer gets, and this query is the answer.",
      stuck: [
        "Writing industry = 'Software' OR industry = 'Fintech' AND ..., which reintroduces the ordering bug.",
        "Reading \"between 100 and 1,000\" as exclusive and dropping companies at exactly 100 or 1,000.",
      ],
      source: { title: "SQL Logical Operators", url: SRC + "sql-logical-operators" },
    },
  ],
};
