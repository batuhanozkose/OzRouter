/**
 * Fact extraction from LLM responses.
 * Parses text for user preferences, decisions, patterns, requirements,
 * constraints, and technical choices in English and Turkish.
 * Stores extracted facts asynchronously (non-blocking).
 */

import { logger } from "../../../open-sse/utils/logger.ts";
import { createMemory } from "./store";
import { MemoryType } from "./types";

const log = logger("MEMORY_EXTRACTION");

// ─── Pattern Definitions ────────────────────────────────────────────────────

// ── English: Preferences ──

const EN_PREFERENCE_PATTERNS: RegExp[] = [
  /\bI\s+(?:really\s+)?prefer\s+([^.,\n]+)/gi,
  /\bI\s+(?:really\s+)?like\s+([^.,\n]+)/gi,
  /\bmy\s+(?:favorite|favourite)\s+(?:is|are)\s+([^.,\n]+)/gi,
  /\bI\s+(?:don'?t|do\s+not)\s+like\s+([^.,\n]+)/gi,
  /\bI\s+(?:hate|dislike|avoid)\s+([^.,\n]+)/gi,
  /\bI\s+enjoy\s+([^.,\n]+)/gi,
  /\bI\s+love\s+([^.,\n]+)/gi,
  // Negative preferences
  /\bI\s+(?:can'?t\s+stand|despise|detest|loathe)\s+([^.,\n]+)/gi,
  /\bI'?m\s+(?:not\s+a\s+fan\s+of|not\s+into|sick\s+of|tired\s+of)\s+([^.,\n]+)/gi,
  // Implicit preferences
  /\bI\s+find\s+(?:it\s+)?(?:easier|better|nicer|cleaner|faster)\s+(?:to\s+)?([^.,\n]+)/gi,
  /\bI'?d\s+(?:rather|prefer\s+to)\s+([^.,\n]+)/gi,
  /\bmy\s+go-to\s+(?:is|has\s+been)\s+([^.,\n]+)/gi,
];

// ── English: Decisions ──

const EN_DECISION_PATTERNS: RegExp[] = [
  /\bI'?(?:ll|will)\s+use\s+([^.,\n]+)/gi,
  /\bI\s+chose\s+([^.,\n]+)/gi,
  /\bI\s+(?:have\s+)?decided\s+(?:to\s+)?([^.,\n]+)/gi,
  /\bI'?m\s+going\s+(?:to\s+)?(?:use|with|adopt)\s+([^.,\n]+)/gi,
  /\bI\s+(?:selected|picked)\s+([^.,\n]+)/gi,
  /\bI\s+went\s+with\s+([^.,\n]+)/gi,
  // Additional decision phrases
  /\bI\s+(?:opted\s+(?:for|to\s+use)|settled\s+on|landed\s+on)\s+([^.,\n]+)/gi,
  /\bI\s+(?:ended\s+up\s+(?:using|with)|switched\s+to|moved\s+to|migrated\s+to)\s+([^.,\n]+)/gi,
  /\bI'?ve\s+(?:started\s+(?:using|to\s+use)|been\s+using|adopted)\s+([^.,\n]+)/gi,
  /\blet'?s\s+(?:use|go\s+with|try|stick\s+with)\s+([^.,\n]+)/gi,
];

// ── English: Behavioral Patterns ──

const EN_PATTERN_PATTERNS: RegExp[] = [
  /\bI\s+usually\s+([^.,\n]+)/gi,
  /\bI\s+always\s+([^.,\n]+)/gi,
  /\bI\s+never\s+([^.,\n]+)/gi,
  /\bI\s+typically\s+([^.,\n]+)/gi,
  /\bI\s+tend\s+to\s+([^.,\n]+)/gi,
  /\bI\s+(?:often|frequently|regularly)\s+([^.,\n]+)/gi,
  // Additional pattern phrases
  /\bI\s+(?:generally|normally|mostly|commonly)\s+([^.,\n]+)/gi,
  /\bmy\s+(?:workflow|process|approach|setup)\s+(?:is|involves)\s+([^.,\n]+)/gi,
  /\bI\s+(?:make\s+it\s+a\s+point\s+to|make\s+sure\s+to|try\s+to)\s+([^.,\n]+)/gi,
  /\bI\s+rarely\s+([^.,\n]+)/gi,
];

// ── English: Requirements / Needs ──

const EN_REQUIREMENT_PATTERNS: RegExp[] = [
  /\b(?:I|we)\s+need\s+(?:to\s+)?([^.,\n]+)/gi,
  /\b(?:I|we)\s+(?:must|have\s+to|gotta)\s+(?:have\s+)?([^.,\n]+)/gi,
  /\b(?:the|our)\s+(?:project|app|system|codebase)\s+(?:needs|requires|must\s+have)\s+([^.,\n]+)/gi,
  /\b(?:it|this|we)\s+(?:needs|requires)\s+(?:to\s+)?([^.,\n]+)/gi,
  /\b(?:we|I)\s+(?:can'?t|cannot)\s+(?:live|work|proceed)\s+without\s+([^.,\n]+)/gi,
  /\b(?:an?|the)\s+(?:important|critical|essential|key)\s+(?:requirement|need)\s+(?:is|was)\s+([^.,\n]+)/gi,
];

// ── English: Constraints / Limitations ──

const EN_CONSTRAINT_PATTERNS: RegExp[] = [
  /\b(?:we|I)\s+(?:can'?t|cannot|must\s+not|shouldn'?t)\s+(?:use|do|deploy|run)\s+([^.,\n]+)/gi,
  /\b(?:stuck\s+(?:with|on)|limited\s+to|restricted\s+to|locked\s+into)\s+(.+?)(?:\.|$)/gi,
  /\b(?:we|I)\s+(?:have|are)\s+(?:no|zero|limited)\s+(?:access\s+to|budget\s+for)\s+([^.,\n]+)/gi,
  /\b(?:budget|cost|price|latency|performance)\s+(?:constraint|limit|cap|ceiling)\s+(?:is|of)\s+([^.,\n]+)/gi,
  /\bcompatibility\s+(?:issue|problem|concern)\s+(?:with|for)\s+([^.,\n]+)/gi,
];

// ── English: Technical Preferences (code/style) ──

const EN_TECH_PREFERENCE_PATTERNS: RegExp[] = [
  /\b(?:I|we)\s+(?:wrote|write|built|build|code|coded)\s+.+?\s(?:with|using|in)\s+([^.,\n]+)/gi,
  /\b(?:I|we)\s+use\s+(?:a|an)?\s*([A-Za-z0-9_.+#-]+)\s+(?:for|as)\s+(?:the\s+)?(?:framework|library|database|tool|language|runtime|package|ORM|bundler|linter|formatter)/gi,
  /\b(?:our|the)\s+(?:stack|tech\s+stack|setup|architecture)\s+(?:is|uses|includes|consists\s+of)\s+(.+?)(?:\.|$)/gi,
  /\b(?:I|we)\s+(?:prefer|chose|picked|went\s+with)\s+([A-Za-z0-9_.+#-]+)\s+(?:over|instead\s+of|vs\.?)\s+([A-Za-z0-9_.+#-]+)/gi,
  /\b(?:I|we)\s+(?:configured|set\s+up)\s+(?:with|using)\s+([^.,\n]+)/gi,
];

// ── Turkish: Tercihler (Preferences) ──

const TR_PREFERENCE_PATTERNS: RegExp[] = [
  // Verb-first: "tercih ederim X"
  /(?:\bben\s+)?(?:daha\s+çok\s+)?tercih\s+ederim\s+([^.,\n]+)/gi,
  /(?:\b(?:ben|biz)\s+)?(?:pek\s+)?(?:çok\s+)?sev(?:iyorum|erim|diğimi\s+söyleyebilirim)\s+([^.,\n]+)/gi,
  /\b(?:benim\s+)?favorim\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:hiç\s+)?(?:sevmiyorum|sevmem|hoşlanmıyorum|hoşlanmam)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:nefret\s+ediyorum|nefret\s+ederim)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:bayılıyorum|hayranım|aşığım)\s+([^.,\n]+)/gi,
  /(?:benim\s+)?(?:için\s+)?(?:daha\s+)?(?:iyi|güzel|temiz|hızlı|kolay)\s+(?:olan|gelen)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:şunu|bunu)\s+(?:tercih\s+ederim|yeğlerim)\s*:?\s*([^.,\n]+)/gi,
  /(?:ben\s+)?(?:alışkınım|alıştım|alışığım)\s+([^.,\n]+)/gi,
  // "X kullanmaya/yapmaya alışkınım"
  /(\S+)\s+(?:kullanmaya|yapmaya|etmeye)\s+(?:alışkınım|alıştım|alışığım)/gi,
  /(?:ben\s+)?(?:hiç\s+)?(?:sevmedim|sevmemiştim|bir\s+türlü\s+)?(?:ısınamadım|ısınamıyorum)\s+([^.,\n]+)/gi,
  // Object-first: "X'e bir türlü ısınamadım"
  /(\S+?)(?:'e|'a|e|a|ye|ya)\s+(?:bir\s+türlü\s+)?(?:ısınamadım|ısınamıyorum)/gi,
  // Object-first (SOV): "X'i tercih ederim", "X'i seviyorum"
  // Exclude very short words (like "Ben") by requiring at least 3 chars or explicit suffix
  /(\S{4,})(?:'i|'ı|'u|'ü|'yi|'yı|'yu|'yü|yi|yı|yu|yü|n?i|n?ı|n?u|n?ü)?\s+(?:hiç\s+)?(?:daha\s+çok\s+)?(?:tercih\s+ederim|seviyorum|sevmiyorum|beğeniyorum|beğenmiyorum|kullanmayı\s+seviyorum)/gi,
  // "X'ten nefret ediyorum", "X'e bayılıyorum", "X'ten hoşlanıyorum"
  /(\S+?)(?:'e|'a|e|a|ye|ya|'ten|'tan|'den|'dan|ten|tan|den|dan|nden|ndan)\s+(?:bayılıyorum|hayranım|aşığım|nefret\s+ediyorum|nefret\s+ederim|hoşlanıyorum|hoşlanmıyorum|hoşlanırım|hoşlanmam)/gi,
  // "X ile Y yapmayı seviyorum"
  /(\S+)\s+(?:ile|le|la)\s+\S+\s+(?:geliştirmeyi\s+)?(?:çok\s+)?sev(?:iyorum|erim)/gi,
];

// ── Turkish: Kararlar (Decisions) ──

const TR_DECISION_PATTERNS: RegExp[] = [
  // Verb-first
  /(?:ben\s+)?kullan(?:acağım|acağız|maya\s+karar\s+verdim)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:seçtim|seçtik|karar\s+verdim|karar\s+verdik)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:şuna|buna)\s+(?:karar\s+verdim|karar\s+verdik|geçtim)\s*:?\s*([^.,\n]+)/gi,
  /(?:ben\s+)?(?:ile|le)\s+(?:devam\s+edeceğim|devam\s+ediyorum|ilerliyorum|gidiyorum)\s+([^.,\n]+)/gi,
  // "X ile devam edeceğim"
  /(\S+)\s+(?:ile|le)\s+(?:devam\s+edeceğim|devam\s+ediyorum|ilerliyorum|gidiyorum)/gi,
  /(?:ben\s+)?(?:geçtim|geçiş\s+yaptım|migrate\s+ettim|taşıdım)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:denedim|deneyeceğim)\s+([^.,\n]+)/gi,
  /(?:hadi|haydi)\s+(.+?)\s+(?:kullanalım|deneyelim|yapalım)/gi,
  // Object-first (SOV): "X kullanacağım", "X seçtim", "X'e geçtim"
  /(\S+?)(?:'e|'a|e|a|ye|ya)?\s+(?:geçmeye\s+)?(?:karar\s+verdim|karar\s+verdik|kullanacağım|kullanacağız|seçtim|seçtik|deneyeceğim|denedim|geçtim|geçiş\s+yaptım)/gi,
  // "X'den Y'e geçtim"
  /(\S+?)(?:'den|'dan|den|dan|nden|ndan)\s+(\S+?)(?:'e|'a|e|a|ye|ya)\s+geçtim/gi,
];

// ── Turkish: Alışkanlıklar / Davranış Kalıpları (Behavioral Patterns) ──

const TR_PATTERN_PATTERNS: RegExp[] = [
  /(?:ben\s+)?genellikle\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:her\s+zaman|daima|sürekli)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:asla|hiçbir\s+zaman|hiç)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:genelde|çoğunlukla|ekseriyetle)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:eğilimindeyim|meyilliyim|yatkınım)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:sık\s+sık|sıklıkla|düzenli\s+olarak)\s+([^.,\n]+)/gi,
  /(?:ben\s+)?(?:nadiren|ender\s+olarak|seyrek)\s+([^.,\n]+)/gi,
  /(?:benim\s+)?(?:iş\s+akışım|sürecim|yaklaşımım|kurulumum)\s+(?:şöyle|şu\s+şekilde|böyle)\s*:?\s*([^.,\n]+)/gi,
  // Object-first: "X yapmaya eğilimindeyim"
  /(\S+)\s+(?:yapmaya|etmeye|kullanmaya)\s+(?:eğilimindeyim|meyilliyim|yatkınım)/gi,
];

// ── Turkish: İhtiyaçlar / Gereksinimler (Requirements) ──

const TR_REQUIREMENT_PATTERNS: RegExp[] = [
  /(?:bana|bize)\s+(.+?)\s+(?:lazım|gerek|gerekli|ihtiyacım\s+var)/gi,
  /(?:şunlara|bunlara)\s+(?:ihtiyacım|ihtiyacımız)\s+(?:var|olacak)\s*:?\s*([^.,\n]+)/gi,
  /(?:mutlaka|kesinlikle)\s+(.+?)\s+(?:olması|olmalı|gerekiyor|gerek)/gi,
  /(?:proje|uygulama|sistem)\s+(?:için\s+)?(.+?)\s+(?:gerekiyor|gerekli|lazım)/gi,
  /(?:vazgeçilmez|olmazsa\s+olmaz|kritik|önemli)\s+(?:olan|gereksinim|ihtiyaç)\s+(.+?)(?:\.|$)/gi,
];

// ── Turkish: Kısıtlamalar (Constraints) ──

const TR_CONSTRAINT_PATTERNS: RegExp[] = [
  /(.+?)\s+(?:kullanam(?:am|ıyoruz|ıyorum)|yapam(?:am|ıyoruz|ıyorum))/gi,
  /(?:sınırlı|kısıtlı|mahkum|mecbur)\s+(?:kaldık|kaldım|olduk|olduğumuz)\s+(.+?)(?:\.|$)/gi,
  // "X'e mecbur kaldık"
  /(.+?)(?:'e|'a|e|a|ye|ya)\s+(?:mecbur|mahkum)\s+(?:kaldık|kaldım|olduk|olduğumuz)/gi,
  /(?:erişim|bütçe|kaynak)\s+(?:sıkıntısı|sorunu|problemi|yok)\s+(.+?)(?:\.|$)/gi,
  /(?:uyumluluk|uyumsuzluk)\s+(?:sorunu|problemi)\s+(?:var|yaşıyoruz)\s+(.+?)(?:\.|$)/gi,
];

// ── Turkish: Teknik Tercihler (Technical Preferences) ──

const TR_TECH_PREFERENCE_PATTERNS: RegExp[] = [
  /(?:ile|kullanarak|ile\s+birlikte)\s+(?:yazdım|yazdık|kodladım|kodladık|geliştirdim|geliştirdik)\s+([^.,\n]+)/gi,
  // "X kullanarak geliştirdim"
  /(\S+)\s+(?:kullanarak|ile)\s+(?:yazdım|yazdık|kodladım|kodladık|geliştirdim|geliştirdik)/gi,
  /(?:framework|kütüphane|veritabanı|araç|dil|runtime)\s+(?:olarak)\s+([A-Za-z0-9_.+#-ğüşıöçĞÜŞİÖÇ]+)\s+(?:kullan(?:ıyorum|ıyoruz|dım|dık))/gi,
  /(?:teknoloji\s+)?(?:stack'?imiz|yığınımız|altyapımız)\s+(?:şöyle|şu\s+şekilde|şunlardan\s+oluşuyor)\s*:?\s*(.+?)(?:\.|$)/gi,
  // "X yerine Y kullanıyorum" — capture Y (the new preference)
  /\S+\s+(?:yerine|alternatif\s+olarak)\s+(\S+)\s+(?:kullan(?:dım|dık|ıyorum|ıyoruz)|tercih\s+ettim|geçtim)/gi,
  // "Y kullanıyorum artık" (preference stated directly)
  /(\S+)\s+kullan(?:ıyorum|ıyoruz)\s+(?:artık|şu\s+anda|genelde)/gi,
];

// Maximum length for extracted content
const MAX_FACT_LENGTH = 500;
// Minimum content length to avoid noise
const MIN_FACT_LENGTH = 3;
const MAX_EXTRACTION_TEXT_LENGTH = 64 * 1024;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExtractedFact {
  key: string;
  content: string;
  type: MemoryType;
  category: "preference" | "decision" | "pattern" | "requirement" | "constraint" | "tech_preference";
}

// ─── Extraction Logic ────────────────────────────────────────────────────────

/**
 * Sanitize a matched string: trim, collapse whitespace, cap length
 */
function sanitizeMatch(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_FACT_LENGTH);
}

function capExtractionText(text: string): string {
  if (text.length <= MAX_EXTRACTION_TEXT_LENGTH) return text;
  return text.slice(-MAX_EXTRACTION_TEXT_LENGTH);
}

/**
 * Generate a stable key for a fact (category + first 40 chars of content)
 */
function factKey(category: string, content: string): string {
  const slug = content
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 40)
    .replace(/_+$/, "");
  return `${category}:${slug}`;
}

/**
 * Run a set of patterns against text and collect extracted facts.
 * Deduplicates by key within the batch.
 */
function runPatterns(
  text: string,
  patterns: RegExp[],
  category: "preference" | "decision" | "pattern",
  memoryType: MemoryType,
  seen: Set<string>
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  for (const pattern of patterns) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1];
      if (!raw) continue;

      const content = sanitizeMatch(raw);
      if (content.length < MIN_FACT_LENGTH) continue;

      const key = factKey(category, content);
      if (seen.has(key)) continue;
      seen.add(key);

      facts.push({ key, content, type: memoryType, category });
    }

    // Reset again after use
    pattern.lastIndex = 0;
  }

  return facts;
}

/**
 * Extract facts from a text string.
 * Returns structured fact objects without storing them.
 * Safe to call from tests without a DB.
 */
export function extractFactsFromText(text: string): ExtractedFact[] {
  if (!text || typeof text !== "string") return [];

  text = capExtractionText(text);

  const seen = new Set<string>();
  const facts: ExtractedFact[] = [];

  // ── English patterns ──

  // Preferences → factual memory
  facts.push(
    ...runPatterns(text, EN_PREFERENCE_PATTERNS, "preference", MemoryType.FACTUAL, seen)
  );

  // Decisions → episodic memory (tied to a moment in time)
  facts.push(
    ...runPatterns(text, EN_DECISION_PATTERNS, "decision", MemoryType.EPISODIC, seen)
  );

  // Behavioral patterns → factual memory (persistent behavioral facts)
  facts.push(
    ...runPatterns(text, EN_PATTERN_PATTERNS, "pattern", MemoryType.FACTUAL, seen)
  );

  // Requirements → factual memory
  facts.push(
    ...runPatterns(text, EN_REQUIREMENT_PATTERNS, "requirement", MemoryType.FACTUAL, seen)
  );

  // Constraints → factual memory
  facts.push(
    ...runPatterns(text, EN_CONSTRAINT_PATTERNS, "constraint", MemoryType.FACTUAL, seen)
  );

  // Technical preferences → factual memory
  facts.push(
    ...runPatterns(text, EN_TECH_PREFERENCE_PATTERNS, "tech_preference", MemoryType.FACTUAL, seen)
  );

  // ── Turkish patterns ──

  facts.push(
    ...runPatterns(text, TR_PREFERENCE_PATTERNS, "preference", MemoryType.FACTUAL, seen)
  );
  facts.push(
    ...runPatterns(text, TR_DECISION_PATTERNS, "decision", MemoryType.EPISODIC, seen)
  );
  facts.push(
    ...runPatterns(text, TR_PATTERN_PATTERNS, "pattern", MemoryType.FACTUAL, seen)
  );
  facts.push(
    ...runPatterns(text, TR_REQUIREMENT_PATTERNS, "requirement", MemoryType.FACTUAL, seen)
  );
  facts.push(
    ...runPatterns(text, TR_CONSTRAINT_PATTERNS, "constraint", MemoryType.FACTUAL, seen)
  );
  facts.push(
    ...runPatterns(text, TR_TECH_PREFERENCE_PATTERNS, "tech_preference", MemoryType.FACTUAL, seen)
  );

  return facts;
}

/**
 * Extract facts from an LLM response and store them asynchronously.
 * Non-blocking: fires-and-forgets via setImmediate.
 * Does NOT extract from tool call results (tool_calls check).
 *
 * @param response - The LLM response text to parse
 * @param apiKeyId - API key owning this memory
 * @param sessionId - Session context for the memory
 */
export function extractFacts(response: string, apiKeyId: string, sessionId: string): void {
  if (!response || !apiKeyId || !sessionId) return;

  const cappedResponse = capExtractionText(response);

  log.info("memory.extraction.start", { apiKeyId });

  // Non-blocking: schedule after current event loop tick
  setImmediate(() => {
    const facts = extractFactsFromText(cappedResponse);
    if (facts.length === 0) return;

    for (const fact of facts) {
      log.debug("memory.extraction.fact_found", { key: fact.key, category: fact.category });

      createMemory({
        apiKeyId,
        sessionId,
        type: fact.type,
        key: fact.key,
        content: fact.content,
        metadata: {
          category: fact.category,
          extractedAt: new Date().toISOString(),
          source: "llm_response",
        },
        expiresAt: null,
      }).catch((err) => {
        log.error("memory.extraction.background.failed", { err: err?.message, apiKeyId });
      });
    }

    log.info("memory.extraction.complete", { apiKeyId, factCount: facts.length });
  });
}
