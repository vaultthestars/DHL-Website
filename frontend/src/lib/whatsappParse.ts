export type WhatsAppMessage = {
  id: string;
  rawHeader: string;
  timestamp: string;
  sender: string;
  body: string;
  raw: string;
  attachmentNames: string[];
  isSystem: boolean;
};

export type MessageHitType = "keyword" | "location" | "media";

export type ScannedMessage = WhatsAppMessage & {
  keywordHits: string[];
  keywordScore: number;
  locationHits: string[];
  mediaHits: string[];
  hitTypes: MessageHitType[];
};

export type AttachmentKind = "image" | "video" | "audio" | "sticker" | "other";

export type ChatAttachment = {
  name: string;
  url: string;
  kind: AttachmentKind;
  mime: string;
};

const KEYWORD_PHRASES = [
  "ford explorer",
  "carro parado",
  "ice",
  "migra",
  "migracion",
  "inmigracion",
  "patrulla",
  "camioneta",
  "camion",
  "camión",
  "policia",
  "policía",
  "chaleco",
  "cuidado",
  "suv",
  "reten",
  "retén",
  "troca",
] as const;

/** Direct-hit keywords count double toward heat / alert score. */
const HIGH_WEIGHT_KEYWORDS = new Set(["ice", "migra", "migracion"]);

/** Extra detention-vehicle cues beyond the explicit list. */
const VEHICLE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "ford explorer", pattern: /\bford\s+explorer\b/i },
  { label: "suv", pattern: /\bsuvs?\b/i },
  { label: "van", pattern: /\b(van|vans|minivan)\b/i },
  { label: "pickup", pattern: /\b(pickup|pick[\s-]?up)\b/i },
  {
    label: "detention vehicle",
    pattern:
      /\b(tahoe|suburban|expedition|transit|sprinter|unmarked\s+car|unmarked\s+vehicle|unmarked\s+suv|black\s+suv|white\s+van|boxed?\s+truck)\b/i,
  },
  { label: "ford", pattern: /\bford\s+[a-z0-9-]+\b/i },
];

const LOCATION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "coordinates",
    pattern: /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/,
  },
  {
    label: "google maps",
    pattern:
      /(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.[^\s]+|google\.[^\s]+\/maps)[^\s]*/i,
  },
  {
    label: "apple maps",
    pattern: /(?:https?:\/\/)?maps\.apple\.com[^\s]*/i,
  },
  {
    label: "waze",
    pattern: /(?:https?:\/\/)?(?:www\.)?waze\.com[^\s]*/i,
  },
  {
    label: "geo link",
    pattern: /\bgeo:-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?\b/i,
  },
  {
    label: "openstreetmap",
    pattern: /(?:https?:\/\/)?(?:www\.)?openstreetmap\.org[^\s]*/i,
  },
  {
    label: "bing maps",
    pattern: /(?:https?:\/\/)?(?:www\.)?bing\.com\/maps[^\s]*/i,
  },
];

const MEDIA_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "attachment", pattern: /<attached:\s*[^>]+>/i },
  { label: "media omitted", pattern: /<media omitted>/i },
  {
    label: "image",
    pattern:
      /\b(image|photo|imagen|foto)\s+omitted\b|\bimagen\s+omitida\b|\bIMG-\d|-PHOTO-/i,
  },
  {
    label: "video",
    pattern: /\bvideo\s+(omitted|omitido)\b|\bVID-\d|-VIDEO-/i,
  },
  {
    label: "voice note",
    pattern:
      /\b(audio|ptt|voice\s*note|nota\s+de\s+voz)\s+(omitted|omitid[oa])?\b|\bPTT-\d|\baudio\s+omitido\b|-AUDIO-/i,
  },
  {
    label: "gif",
    pattern: /\bgif\s+(omitted|omitido)\b/i,
  },
  {
    label: "document",
    pattern: /\b(document|documento)\s+(omitted|omitido)\b/i,
  },
];

/** Stickers / emoji stickers — excluded from media flagging and previews. */
export function isStickerAttachmentName(name: string): boolean {
  return attachmentKindFromName(name) === "sticker";
}

const ATTACHED_FILE_RE = /<attached:\s*([^>\n]+)>/gi;

const MESSAGE_START =
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+([^\]]+)\]\s+([^:]+):\s?(.*)$/;

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u00a0\u202f]/g, " ");
}

function keywordHitWeight(phrase: string): number {
  return HIGH_WEIGHT_KEYWORDS.has(normalizeForMatch(phrase)) ? 2 : 1;
}

export function scoreKeywordHits(hits: string[]): number {
  return hits.reduce((sum, hit) => sum + keywordHitWeight(hit), 0);
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(0)
  );
  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWholePhrase(normalizedBody: string, phrase: string): boolean {
  const parts = phrase.trim().split(/\s+/).map(escapeRegExp);
  if (!parts.length) {
    return false;
  }
  const pattern = new RegExp(`(?:^|[^a-z0-9])${parts.join("[^a-z0-9]+")}(?:[^a-z0-9]|$)`);
  return pattern.test(normalizedBody);
}

function nearMatch(token: string, keyword: string): boolean {
  // Exact token match only here; substring / containment is too noisy
  // ("ice" in "experience", "car" in "camion", etc.).
  if (token === keyword) {
    return true;
  }
  // Fuzzy typos: only for longer keywords, similar-length tokens, 1 edit max.
  if (keyword.length < 5 || token.length < 5) {
    return false;
  }
  if (Math.abs(token.length - keyword.length) > 1) {
    return false;
  }
  return levenshtein(token, keyword) === 1;
}

function collectKeywordHits(body: string): string[] {
  const normalized = normalizeForMatch(body);
  const hits = new Set<string>();

  for (const phrase of KEYWORD_PHRASES) {
    const needle = normalizeForMatch(phrase);
    if (hasWholePhrase(normalized, needle)) {
      hits.add(phrase);
    }
  }

  for (const vehicle of VEHICLE_PATTERNS) {
    if (vehicle.pattern.test(body)) {
      hits.add(vehicle.label);
    }
  }

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  for (const phrase of KEYWORD_PHRASES) {
    const needle = normalizeForMatch(phrase);
    if (needle.includes(" ")) {
      continue;
    }
    for (const token of tokens) {
      if (nearMatch(token, needle)) {
        hits.add(phrase);
      }
    }
  }

  return Array.from(hits);
}

function collectPatternHits(
  body: string,
  patterns: Array<{ label: string; pattern: RegExp }>
): string[] {
  const hits = new Set<string>();
  for (const entry of patterns) {
    if (entry.pattern.test(body)) {
      hits.add(entry.label);
    }
  }
  return Array.from(hits);
}

function collectAttachmentNames(body: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  ATTACHED_FILE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTACHED_FILE_RE.exec(body)) !== null) {
    const name = match[1].trim();
    if (!name || seen.has(name) || isStickerAttachmentName(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
}

function stripInvisible(value: string): string {
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}

/**
 * WhatsApp group status lines (joins, deletes, encryption notice, etc.).
 * These often mention admin names like "Yolanda ICE Group" and should not be flagged.
 */
export function isWhatsAppSystemMessage(body: string): boolean {
  const text = stripInvisible(body).replace(/[\u00a0\u202f]/g, " ").trim();
  if (!text || text.includes("\n")) {
    return false;
  }
  // Real chat content with an attachment is never a status line.
  if (/<attached:\s*[^>]+>/i.test(text)) {
    return false;
  }

  if (/^this message was deleted\b/i.test(text)) {
    return true;
  }
  if (/^messages and calls are end-to-end encrypted\b/i.test(text)) {
    return true;
  }
  if (/^este mensaje fue eliminado\b/i.test(text)) {
    return true;
  }
  if (/^los mensajes y las llamadas están cifrados\b/i.test(text)) {
    return true;
  }
  if (/\bjoined using (a|this) group'?s? link\.?$/i.test(text)) {
    return true;
  }
  if (/\bse uni[oó] usando el enlace (de|del) (este )?grupo\.?$/i.test(text)) {
    return true;
  }
  if (/\bcreated this group\.?$/i.test(text) || /\bcre[oó] este grupo\.?$/i.test(text)) {
    return true;
  }
  if (/^.+\s+left\.?$/i.test(text) && text.length < 100) {
    return true;
  }
  if (/^.+\s+sali[oó]( del grupo)?\.?$/i.test(text) && text.length < 100) {
    return true;
  }

  const membership = text.match(
    /^(.*?)\s+(added|removed|a[nñ]adi[oó]|elimin[oó])\s+(you|te|(.*))\.?$/i
  );
  if (membership && text.length < 180) {
    const actor = membership[1];
    const target = membership[3];
    if (looksLikeContactLabel(actor) && looksLikeContactLabel(target)) {
      return true;
    }
  }

  if (
    /\b(changed (the )?subject|changed this group'?s? (icon|description)|turned (on|off) disappearing messages|is now an admin|you'?re now an admin|security code changed)\b/i.test(
      text
    ) &&
    text.length < 200
  ) {
    return true;
  }
  return false;
}

function looksLikeContactLabel(value: string): boolean {
  const cleaned = value.replace(/^~\s*/, "").trim();
  if (!cleaned || cleaned.length > 80) {
    return false;
  }
  // Allow periods in nicknames like "M.Sil"; block sentence punctuation.
  if (/[!?,/\\]/.test(cleaned)) {
    return false;
  }
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8) {
    return false;
  }
  // Sentence leftovers — keep this tight so display names like
  // "M.Sil Mel From FD" still count as contacts.
  const banned =
    /^(near|today|because|when|where|about|into|onto|over|under|after|before|there|here|algo|sobre|porque|hoy|cerca)$/i;
  return !words.some((word) => banned.test(word));
}

export function attachmentKindFromName(name: string): AttachmentKind {
  const lower = name.toLowerCase();
  if (/-sticker-|\.webp$/i.test(lower)) {
    return "sticker";
  }
  if (/\.(jpe?g|png|gif|bmp|heic)$/i.test(lower) || /-photo-/i.test(lower)) {
    return "image";
  }
  if (/\.(mp4|mov|m4v|webm|avi)$/i.test(lower) || /-video-/i.test(lower)) {
    return "video";
  }
  if (
    /\.(opus|ogg|mp3|m4a|wav|aac|oga)$/i.test(lower) ||
    /-audio-/i.test(lower)
  ) {
    return "audio";
  }
  return "other";
}

export function mimeFromAttachmentName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".opus")) return "audio/ogg; codecs=opus";
  if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

export function parseWhatsAppDump(raw: string): WhatsAppMessage[] {
  const text = stripInvisible(
    raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  );
  const lines = text.split("\n");
  const messages: WhatsAppMessage[] = [];
  let current: WhatsAppMessage | null = null;

  const pushCurrent = () => {
    if (!current) {
      return;
    }
    current.body = current.body.replace(/\n+$/, "");
    current.attachmentNames = collectAttachmentNames(current.body);
    current.isSystem = isWhatsAppSystemMessage(current.body);
    current.raw = `[${current.timestamp}] ${current.sender}: ${current.body}`;
    messages.push(current);
  };

  for (const line of lines) {
    const match = line.match(MESSAGE_START);
    if (match) {
      pushCurrent();
      const timestamp = `${match[1]}, ${match[2]}`.replace(/[\u00a0\u202f]/g, " ");
      const sender = match[3].replace(/[\u00a0\u202f]/g, " ").trim();
      const body = match[4] ?? "";
      current = {
        id: `msg-${messages.length}`,
        rawHeader: line,
        timestamp,
        sender,
        body,
        raw: line,
        attachmentNames: [],
        isSystem: false,
      };
      continue;
    }

    if (current) {
      current.body = `${current.body}\n${line}`;
    }
  }

  pushCurrent();
  return messages;
}

export function scanWhatsAppMessages(messages: WhatsAppMessage[]): ScannedMessage[] {
  return messages.map((message) => {
    if (message.isSystem) {
      return {
        ...message,
        keywordHits: [],
        keywordScore: 0,
        locationHits: [],
        mediaHits: [],
        hitTypes: [],
      };
    }

    const keywordHits = collectKeywordHits(message.body);
    const locationHits = collectPatternHits(message.body, LOCATION_PATTERNS);
    const attachmentNames = message.attachmentNames.filter(
      (name) => !isStickerAttachmentName(name)
    );
    let mediaHits = collectPatternHits(message.body, MEDIA_PATTERNS).filter(
      (label) => label !== "attachment" || attachmentNames.length > 0
    );
    // Sticker-only / emoji-sticker lines are not media hits.
    if (
      /\bsticker\s+(omitted|omitido)\b|-STICKER-|\bemoji\s+sticker\b/i.test(
        message.body
      ) &&
      attachmentNames.length === 0
    ) {
      mediaHits = mediaHits.filter(
        (label) => label !== "media omitted" && label !== "attachment"
      );
    }
    if (attachmentNames.length > 0 && !mediaHits.includes("attachment")) {
      mediaHits.push("attachment");
    }
    const hitTypes: MessageHitType[] = [];
    if (keywordHits.length) {
      hitTypes.push("keyword");
    }
    if (locationHits.length) {
      hitTypes.push("location");
    }
    if (mediaHits.length) {
      hitTypes.push("media");
    }
    return {
      ...message,
      attachmentNames,
      keywordHits,
      keywordScore: scoreKeywordHits(keywordHits),
      locationHits,
      mediaHits,
      hitTypes,
    };
  });
}

export function keywordHeatColor(score: number): string {
  if (score <= 0) {
    return "transparent";
  }
  // Weighted score: 1 = yellow soft hit; 2 (e.g. single "ice") already hot;
  // higher scores deepen toward red.
  const t = Math.min(1, (score - 1) / 5);
  const hue = 52 - t * 48;
  const sat = 88;
  const light = 58 - t * 14;
  return `hsla(${hue}, ${sat}%, ${light}%, 0.78)`;
}

/** Parse WhatsApp export timestamps like `2/10/26, 8:27:57 AM`. */
export function parseWhatsAppTimestamp(timestamp: string): number | null {
  const normalized = timestamp.replace(/[\u00a0\u202f]/g, " ").trim();
  const match = normalized.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
  );
  if (!match) {
    return null;
  }
  let year = Number(match[3]);
  if (year < 100) {
    year += 2000;
  }
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] ? Number(match[6]) : 0;
  const ampm = match[7]?.toUpperCase();
  if (ampm === "PM" && hour < 12) {
    hour += 12;
  }
  if (ampm === "AM" && hour === 12) {
    hour = 0;
  }
  const month = Number(match[1]) - 1;
  const day = Number(match[2]);
  const date = new Date(year, month, day, hour, minute, second);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function formatTimelineLabel(ms: number, zoomMinutes: number): string {
  const date = new Date(ms);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  let hour = date.getHours();
  const minute = date.getMinutes();
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  const time =
    zoomMinutes >= 60
      ? `${hour} ${ampm}`
      : `${hour}:${String(minute).padStart(2, "0")} ${ampm}`;
  return `${month}/${day} ${time}`;
}

/** Hour + minute only, e.g. `10:30 AM`. */
export function formatMessageClock(timestamp: string): string {
  const ms = parseWhatsAppTimestamp(timestamp);
  if (ms == null) {
    // Fallback: strip seconds from the raw string if present.
    return timestamp
      .replace(/(\d{1,2}:\d{2}):\d{2}/, "$1")
      .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s*/, "")
      .trim();
  }
  const date = new Date(ms);
  let hour = date.getHours();
  const minute = date.getMinutes();
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${ampm}`;
}

/** e.g. `2/10` (month/day). */
export function formatDayLabel(ms: number): string {
  const date = new Date(ms);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function dayKeyFromMs(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
