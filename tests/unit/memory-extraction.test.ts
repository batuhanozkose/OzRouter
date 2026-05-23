import test from "node:test";
import assert from "node:assert/strict";

const { extractFactsFromText, extractFacts } = await import("../../src/lib/memory/extraction.ts");

// ═══════════════════════════════════════════════════════════════════════════════
// English: Preferences
// ═══════════════════════════════════════════════════════════════════════════════

test("EN: detects 'I prefer' preference", () => {
  const facts = extractFactsFromText("I prefer dark mode in my editor.");
  const pref = facts.find((f) => f.category === "preference");
  assert.ok(pref, "Should extract a preference fact");
  assert.ok(pref.content.toLowerCase().includes("dark mode"));
  assert.equal(pref.type, "factual");
});

test("EN: detects 'I like' preference", () => {
  const facts = extractFactsFromText("I like TypeScript over JavaScript.");
  const pref = facts.find((f) => f.category === "preference");
  assert.ok(pref);
  assert.ok(pref.content.toLowerCase().includes("typescript"));
});

test("EN: detects 'my favorite is' preference", () => {
  const facts = extractFactsFromText("My favorite is VS Code for editing.");
  const pref = facts.find((f) => f.category === "preference");
  assert.ok(pref);
  assert.ok(pref.content.toLowerCase().includes("vs code"));
});

test("EN: detects negative preference (I don't like)", () => {
  const facts = extractFactsFromText("I don't like JavaScript callbacks.");
  const pref = facts.find((f) => f.category === "preference");
  assert.ok(pref);
  assert.ok(pref.content.toLowerCase().includes("javascript callbacks"));
});

// ── New English preferences ──

test("EN: detects 'I can't stand' negative preference", () => {
  const facts = extractFactsFromText("I can't stand YAML configuration files.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("YAML"));
  assert.ok(pref);
});

test("EN: detects 'I'm not a fan of' negative preference", () => {
  const facts = extractFactsFromText("I'm not a fan of microservices for small projects.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("microservices"));
  assert.ok(pref);
});

test("EN: detects 'I find it easier to' implicit preference", () => {
  const facts = extractFactsFromText("I find it easier to work with SQL than ORMs.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("SQL"));
  assert.ok(pref);
});

test("EN: detects 'I'd rather' preference", () => {
  const facts = extractFactsFromText("I'd rather use plain CSS than Tailwind.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("plain CSS"));
  assert.ok(pref);
});

test("EN: detects 'my go-to is' preference", () => {
  const facts = extractFactsFromText("My go-to is Bun for new projects.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("Bun"));
  assert.ok(pref);
});

// ═══════════════════════════════════════════════════════════════════════════════
// English: Decisions
// ═══════════════════════════════════════════════════════════════════════════════

test("EN: detects 'I'll use' decision", () => {
  const facts = extractFactsFromText("I'll use PostgreSQL for this project.");
  const dec = facts.find((f) => f.category === "decision");
  assert.ok(dec, "Should extract a decision fact");
  assert.ok(dec.content.toLowerCase().includes("postgresql"));
  assert.equal(dec.type, "episodic");
});

test("EN: detects 'I chose' decision", () => {
  const facts = extractFactsFromText("I chose React for the frontend.");
  const dec = facts.find((f) => f.category === "decision");
  assert.ok(dec);
  assert.ok(dec.content.toLowerCase().includes("react"));
});

test("EN: detects 'I decided to' decision", () => {
  const facts = extractFactsFromText("I decided to migrate to SQLite.");
  const dec = facts.find((f) => f.category === "decision");
  assert.ok(dec);
  assert.ok(dec.content.toLowerCase().includes("migrate to sqlite"));
});

test("EN: detects 'I went with' decision", () => {
  const facts = extractFactsFromText("I went with Tailwind for styling.");
  const dec = facts.find((f) => f.category === "decision");
  assert.ok(dec);
  assert.ok(dec.content.toLowerCase().includes("tailwind"));
});

// ── New English decisions ──

test("EN: detects 'I switched to' decision", () => {
  const facts = extractFactsFromText("I switched to pnpm from npm last month.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("pnpm"));
  assert.ok(dec);
});

test("EN: detects 'I ended up using' decision", () => {
  const facts = extractFactsFromText("I ended up using Zod for validation.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("Zod"));
  assert.ok(dec);
});

test("EN: detects 'let's use' collective decision", () => {
  const facts = extractFactsFromText("Let's use Drizzle ORM for this schema.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("Drizzle"));
  assert.ok(dec);
});

test("EN: detects 'I opted for' decision", () => {
  const facts = extractFactsFromText("I opted for Cloudflare Workers instead of AWS Lambda.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("Cloudflare Workers"));
  assert.ok(dec);
});

test("EN: detects 'I've started using' decision", () => {
  const facts = extractFactsFromText("I've started using Biome instead of ESLint.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("Biome"));
  assert.ok(dec);
});

// ═══════════════════════════════════════════════════════════════════════════════
// English: Behavioral Patterns
// ═══════════════════════════════════════════════════════════════════════════════

test("EN: detects 'I usually' pattern", () => {
  const facts = extractFactsFromText("I usually start with tests first.");
  const pat = facts.find((f) => f.category === "pattern");
  assert.ok(pat, "Should extract a pattern fact");
  assert.ok(pat.content.toLowerCase().includes("start with tests"));
  assert.equal(pat.type, "factual");
});

test("EN: detects 'I always' pattern", () => {
  const facts = extractFactsFromText("I always use ESLint in my projects.");
  const pat = facts.find((f) => f.category === "pattern");
  assert.ok(pat);
  assert.ok(pat.content.toLowerCase().includes("eslint"));
});

test("EN: detects 'I never' pattern", () => {
  const facts = extractFactsFromText("I never commit directly to main.");
  const pat = facts.find((f) => f.category === "pattern");
  assert.ok(pat);
  assert.ok(pat.content.toLowerCase().includes("commit directly to main"));
});

test("EN: detects 'I tend to' pattern", () => {
  const facts = extractFactsFromText("I tend to use functional components.");
  const pat = facts.find((f) => f.category === "pattern");
  assert.ok(pat);
  assert.ok(pat.content.toLowerCase().includes("functional components"));
});

// ── New English patterns ──

test("EN: detects 'I generally' pattern", () => {
  const facts = extractFactsFromText("I generally avoid ORMs in large projects.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("ORMs"));
  assert.ok(pat);
});

test("EN: detects 'my workflow involves' pattern", () => {
  const facts = extractFactsFromText("My workflow involves writing failing tests first.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("failing tests"));
  assert.ok(pat);
});

test("EN: detects 'I rarely' pattern", () => {
  const facts = extractFactsFromText("I rarely use class components in React.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("class components"));
  assert.ok(pat);
});

// ═══════════════════════════════════════════════════════════════════════════════
// English: Requirements
// ═══════════════════════════════════════════════════════════════════════════════

test("EN: detects 'I need' requirement", () => {
  const facts = extractFactsFromText("I need a database with full-text search support.");
  const req = facts.find((f) => f.category === "requirement");
  assert.ok(req, "Should extract a requirement fact");
  assert.ok(req.content.toLowerCase().includes("database"));
  assert.equal(req.type, "factual");
});

test("EN: detects 'we must have' requirement", () => {
  const facts = extractFactsFromText("We must have real-time sync across devices.");
  const req = facts.find((f) => f.category === "requirement" && f.content.includes("real-time"));
  assert.ok(req);
});

test("EN: detects 'the project needs' requirement", () => {
  const facts = extractFactsFromText("The project needs role-based access control.");
  const req = facts.find((f) => f.category === "requirement" && f.content.includes("role-based"));
  assert.ok(req);
});

test("EN: detects 'critical requirement is'", () => {
  const facts = extractFactsFromText("A critical requirement is sub-50ms API response times.");
  const req = facts.find((f) => f.category === "requirement" && f.content.includes("API response"));
  assert.ok(req);
});

// ═══════════════════════════════════════════════════════════════════════════════
// English: Constraints
// ═══════════════════════════════════════════════════════════════════════════════

test("EN: detects 'we can't use' constraint", () => {
  const facts = extractFactsFromText("We can't use any GPL-licensed libraries.");
  const con = facts.find((f) => f.category === "constraint");
  assert.ok(con, "Should extract a constraint fact");
  assert.ok(con.content.toLowerCase().includes("gpl-licensed"));
  assert.equal(con.type, "factual");
});

test("EN: detects 'stuck with' constraint", () => {
  const facts = extractFactsFromText("We're stuck with Node.js 18 for legacy reasons.");
  const con = facts.find((f) => f.category === "constraint" && f.content.includes("Node"));
  assert.ok(con);
});

test("EN: detects 'limited budget' constraint", () => {
  const facts = extractFactsFromText("We have zero budget for paid third-party APIs.");
  const con = facts.find((f) => f.category === "constraint" && f.content.includes("paid"));
  assert.ok(con);
});

// ═══════════════════════════════════════════════════════════════════════════════
// English: Technical Preferences
// ═══════════════════════════════════════════════════════════════════════════════

test("EN: detects 'our stack is' tech preference", () => {
  const facts = extractFactsFromText("Our stack is Next.js, PostgreSQL, and Prisma.");
  const tp = facts.find((f) => f.category === "tech_preference" && f.content.includes("Next"));
  assert.ok(tp, "Should extract a tech preference fact");
  assert.equal(tp.type, "factual");
});

test("EN: detects 'I wrote with' tech preference", () => {
  const facts = extractFactsFromText("I wrote the backend with Hono and Drizzle.");
  const tp = facts.find((f) => f.category === "tech_preference" && f.content.includes("Hono"));
  assert.ok(tp);
});

test("EN: detects tech choice with comparison", () => {
  const facts = extractFactsFromText("I chose Rust over Go for the CLI tool.");
  const tp = facts.find((f) => f.category === "tech_preference" && f.content.includes("Rust"));
  assert.ok(tp);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Turkish: Tercihler (Preferences)
// ═══════════════════════════════════════════════════════════════════════════════

test("TR: detects 'tercih ederim' preference", () => {
  const facts = extractFactsFromText("TypeScript'i daha çok tercih ederim.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("TypeScript"));
  assert.ok(pref, "Should extract a Turkish preference fact");
  assert.equal(pref.type, "factual");
});

test("TR: detects 'seviyorum' preference", () => {
  const facts = extractFactsFromText("React ile geliştirmeyi çok seviyorum.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("React"));
  assert.ok(pref);
});

test("TR: detects 'favorim' preference", () => {
  const facts = extractFactsFromText("Benim favorim VS Code.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("VS Code"));
  assert.ok(pref);
});

test("TR: detects 'sevmiyorum' negative preference", () => {
  const facts = extractFactsFromText("Java'yı hiç sevmiyorum açıkçası.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("Java"));
  assert.ok(pref);
});

test("TR: detects 'nefret ediyorum' strong negative", () => {
  const facts = extractFactsFromText("XML konfigürasyonlarından nefret ediyorum.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("konfigürasyon"));
  assert.ok(pref);
});

test("TR: detects 'bayılıyorum' strong positive", () => {
  const facts = extractFactsFromText("Rust'a bayılıyorum.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("Rust"));
  assert.ok(pref);
});

test("TR: detects 'daha iyi gelen' implicit preference", () => {
  const facts = extractFactsFromText("Benim için daha temiz gelen fonksiyonel yaklaşım.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("fonksiyonel"));
  assert.ok(pref);
});

test("TR: detects 'tercih ederim' in full sentence", () => {
  const facts = extractFactsFromText("Ben şunu tercih ederim: PostgreSQL veritabanı.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("PostgreSQL"));
  assert.ok(pref);
});

test("TR: detects 'alışkınım' preference", () => {
  const facts = extractFactsFromText("Ben Vim kullanmaya alışkınım.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("Vim"));
  assert.ok(pref);
});

test("TR: detects 'ısınamadım' negative preference", () => {
  const facts = extractFactsFromText("GraphQL'e bir türlü ısınamadım.");
  const pref = facts.find((f) => f.category === "preference" && f.content.includes("GraphQL"));
  assert.ok(pref);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Turkish: Kararlar (Decisions)
// ═══════════════════════════════════════════════════════════════════════════════

test("TR: detects 'kullanacağım' decision", () => {
  const facts = extractFactsFromText("Bu projede Next.js kullanacağım.");
  const dec = facts.find((f) => f.category === "decision");
  assert.ok(dec, "Should extract a Turkish decision fact");
  assert.ok(dec.content.toLowerCase().includes("next.js"));
  assert.equal(dec.type, "episodic");
});

test("TR: detects 'seçtim' decision", () => {
  const facts = extractFactsFromText("Backend için Go'yu seçtim.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("Go"));
  assert.ok(dec);
});

test("TR: detects 'karar verdim' decision", () => {
  const facts = extractFactsFromText("SQLite'a geçmeye karar verdim.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("SQLite"));
  assert.ok(dec);
});

test("TR: detects 'geçtim' decision (migration)", () => {
  const facts = extractFactsFromText("npm'den pnpm'e geçtim.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("pnpm"));
  assert.ok(dec);
});

test("TR: detects 'deneyeceğim' decision", () => {
  const facts = extractFactsFromText("Bun'u deneyeceğim bu sefer.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("Bun"));
  assert.ok(dec);
});

test("TR: detects 'hadi kullanalım' collective decision", () => {
  const facts = extractFactsFromText("Hadi Drizzle ORM kullanalım.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("Drizzle"));
  assert.ok(dec);
});

test("TR: detects 'ile devam edeceğim' decision", () => {
  const facts = extractFactsFromText("Şimdilik Tailwind ile devam edeceğim.");
  const dec = facts.find((f) => f.category === "decision" && f.content.includes("Tailwind"));
  assert.ok(dec);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Turkish: Alışkanlıklar (Patterns)
// ═══════════════════════════════════════════════════════════════════════════════

test("TR: detects 'genellikle' pattern", () => {
  const facts = extractFactsFromText("Ben genellikle önce testleri yazarım.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("testleri"));
  assert.ok(pat, "Should extract a Turkish pattern fact");
  assert.equal(pat.type, "factual");
});

test("TR: detects 'her zaman' pattern", () => {
  const facts = extractFactsFromText("Her zaman ESLint kullanırım projelerimde.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("ESLint"));
  assert.ok(pat);
});

test("TR: detects 'asla' pattern", () => {
  const facts = extractFactsFromText("Asla doğrudan main branch'e commit yapmam.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("main"));
  assert.ok(pat);
});

test("TR: detects 'genelde' pattern", () => {
  const facts = extractFactsFromText("Genelde functional component kullanırım.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("functional"));
  assert.ok(pat);
});

test("TR: detects 'eğilimindeyim' pattern", () => {
  const facts = extractFactsFromText("Over-engineering yapmaya eğilimindeyim.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("Over-engineering"));
  assert.ok(pat);
});

test("TR: detects 'sık sık' pattern", () => {
  const facts = extractFactsFromText("Sık sık refactoring yaparım.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("refactoring"));
  assert.ok(pat);
});

test("TR: detects 'nadiren' pattern", () => {
  const facts = extractFactsFromText("Nadiren class component kullanırım.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("class"));
  assert.ok(pat);
});

test("TR: detects 'iş akışım' pattern", () => {
  const facts = extractFactsFromText("Benim iş akışım şöyle: TDD ile başlar, PR ile bitiririm.");
  const pat = facts.find((f) => f.category === "pattern" && f.content.includes("TDD"));
  assert.ok(pat);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Turkish: İhtiyaçlar (Requirements)
// ═══════════════════════════════════════════════════════════════════════════════

test("TR: detects 'lazım' requirement", () => {
  const facts = extractFactsFromText("Bana full-text search desteği olan bir DB lazım.");
  const req = facts.find((f) => f.category === "requirement");
  assert.ok(req, "Should extract a Turkish requirement fact");
  assert.ok(req.content.toLowerCase().includes("full-text"));
  assert.equal(req.type, "factual");
});

test("TR: detects 'ihtiyacım var' requirement", () => {
  const facts = extractFactsFromText("Şunlara ihtiyacım var: WebSocket desteği, rate limiting.");
  const req = facts.find((f) => f.category === "requirement" && f.content.includes("WebSocket"));
  assert.ok(req);
});

test("TR: detects 'mutlaka olmalı' requirement", () => {
  const facts = extractFactsFromText("Mutlaka real-time sync olmalı.");
  const req = facts.find((f) => f.category === "requirement" && f.content.includes("real-time"));
  assert.ok(req);
});

test("TR: detects 'vazgeçilmez' requirement", () => {
  const facts = extractFactsFromText("Vazgeçilmez olan gereksinim: offline-first çalışma.");
  const req = facts.find((f) => f.category === "requirement" && f.content.includes("offline-first"));
  assert.ok(req);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Turkish: Kısıtlamalar (Constraints)
// ═══════════════════════════════════════════════════════════════════════════════

test("TR: detects 'kullanamıyorum' constraint", () => {
  const facts = extractFactsFromText("GPL lisanslı kütüphaneleri kullanamıyoruz.");
  const con = facts.find((f) => f.category === "constraint");
  assert.ok(con, "Should extract a Turkish constraint fact");
  assert.ok(con.content.toLowerCase().includes("gpl"));
  assert.equal(con.type, "factual");
});

test("TR: detects 'mecbur kaldık' constraint", () => {
  const facts = extractFactsFromText("Node.js 18'e mecbur kaldık legacy sebeplerden.");
  const con = facts.find((f) => f.category === "constraint" && f.content.includes("Node"));
  assert.ok(con);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Turkish: Teknik Tercihler (Technical Preferences)
// ═══════════════════════════════════════════════════════════════════════════════

test("TR: detects 'stack'imiz' tech preference", () => {
  const facts = extractFactsFromText("Stack'imiz şöyle: Next.js, PostgreSQL, Prisma.");
  const tp = facts.find((f) => f.category === "tech_preference" && f.content.includes("Next"));
  assert.ok(tp);
});

test("TR: detects 'kullanarak geliştirdim' tech preference", () => {
  const facts = extractFactsFromText("Backend'i Hono ve Drizzle kullanarak geliştirdim.");
  const tp = facts.find((f) => f.category === "tech_preference" && f.content.includes("Drizzle"));
  assert.ok(tp);
});

test("TR: detects tech comparison preference", () => {
  const facts = extractFactsFromText("Express.js yerine Hono kullanıyorum artık.");
  const tp = facts.find((f) => f.category === "tech_preference" && f.content.includes("Hono"));
  assert.ok(tp);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mixed language / Multi-category
// ═══════════════════════════════════════════════════════════════════════════════

test("Mixed: extracts both EN and TR facts from mixed text", () => {
  const text = "I prefer TypeScript. PostgreSQL kullanacağım. Her zaman test yazarım.";
  const facts = extractFactsFromText(text);

  const enPref = facts.find((f) => f.category === "preference" && f.content.includes("TypeScript"));
  const trDec = facts.find((f) => f.category === "decision" && f.content.includes("PostgreSQL"));
  const trPat = facts.find((f) => f.category === "pattern" && f.content.includes("test"));

  assert.ok(enPref, "Should extract English preference");
  assert.ok(trDec, "Should extract Turkish decision");
  assert.ok(trPat, "Should extract Turkish pattern");
});

test("extracts all four new categories from single text", () => {
  const text = "I need SSR support. We're stuck with no budget for cloud. Our stack is Next.js + Prisma. I hate class components.";
  const facts = extractFactsFromText(text);

  const categories = new Set(facts.map((f) => f.category));
  assert.ok(categories.has("requirement"), "Should extract requirement");
  assert.ok(categories.has("constraint"), "Should extract constraint");
  assert.ok(categories.has("tech_preference"), "Should extract tech preference");
  assert.ok(categories.has("preference"), "Should extract preference");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases (existing)
// ═══════════════════════════════════════════════════════════════════════════════

test("extractFactsFromText: returns empty array for empty string", () => {
  assert.deepEqual(extractFactsFromText(""), []);
});

test("extractFactsFromText: returns empty array for null", () => {
  assert.deepEqual(extractFactsFromText(null), []);
});

test("extractFactsFromText: returns empty array for unrelated text", () => {
  const facts = extractFactsFromText("The sky is blue. Water is wet. 2 + 2 = 4.");
  assert.deepEqual(facts, []);
});

test("extractFactsFromText: produces stable keys", () => {
  const facts = extractFactsFromText("I prefer dark mode.");
  assert.ok(facts.length > 0);
  assert.ok(
    facts[0].key.startsWith("preference:"),
    `Key should start with category: ${facts[0].key}`
  );
});

test("extractFactsFromText: truncates very long matches", () => {
  const longContent = "a".repeat(600);
  const facts = extractFactsFromText(`I prefer ${longContent}.`);
  if (facts.length > 0) {
    assert.ok(facts[0].content.length <= 500, "Content should be capped at 500 chars");
  }
});

test("extractFacts: returns immediately (non-blocking)", () => {
  const start = Date.now();

  extractFacts("I prefer dark mode.", "key-123", "session-456");

  const elapsed = Date.now() - start;
  assert.ok(elapsed < 50, `extractFacts should return in <50ms, took ${elapsed}ms`);
});

test("extractFacts: does not throw on empty inputs", () => {
  assert.doesNotThrow(() => extractFacts("", "key-123", "session-456"));
  assert.doesNotThrow(() => extractFacts("I prefer vim.", "", "session-456"));
  assert.doesNotThrow(() => extractFacts("I prefer vim.", "key-123", ""));
  assert.doesNotThrow(() => extractFacts(null, "key-123", "session-456"));
});

test("extractFactsFromText scans only the bounded tail of very large text", () => {
  const text =
    "I prefer prefix-only-editor. " + "x".repeat(70 * 1024) + " I prefer tail-only-editor.";
  const facts = extractFactsFromText(text);
  const contents = facts.map((fact) => fact.content.toLowerCase());

  assert.equal(
    contents.some((content) => content.includes("prefix-only-editor")),
    false
  );
  assert.equal(
    contents.some((content) => content.includes("tail-only-editor")),
    true
  );
});
