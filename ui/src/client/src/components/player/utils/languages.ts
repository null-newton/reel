/**
 * Subtitle language helpers: normalise the many ways sources name a language
 * ("Dutch2", "eng", "Brazilian7", "English [CC]") to ISO 639-1 codes.
 */

export interface LanguageInfo {
    code: string // ISO 639-1
    name: string // English name
    native: string
    aliases: string[] // lowercase names / ISO 639-2 codes seen in the wild
}

export const LANGUAGES: LanguageInfo[] = [
    { code: "en", name: "English", native: "English", aliases: ["english", "eng"] },
    { code: "nl", name: "Dutch", native: "Nederlands", aliases: ["dutch", "nld", "dut", "flemish"] },
    { code: "de", name: "German", native: "Deutsch", aliases: ["german", "deu", "ger"] },
    { code: "fr", name: "French", native: "Français", aliases: ["french", "fra", "fre"] },
    { code: "es", name: "Spanish", native: "Español", aliases: ["spanish", "spa", "castilian", "latin american spanish"] },
    { code: "it", name: "Italian", native: "Italiano", aliases: ["italian", "ita"] },
    { code: "pt", name: "Portuguese", native: "Português", aliases: ["portuguese", "por", "brazilian", "portuguese (brazil)", "pob"] },
    { code: "da", name: "Danish", native: "Dansk", aliases: ["danish", "dan"] },
    { code: "sv", name: "Swedish", native: "Svenska", aliases: ["swedish", "swe"] },
    { code: "no", name: "Norwegian", native: "Norsk", aliases: ["norwegian", "nor", "nob", "nno"] },
    { code: "fi", name: "Finnish", native: "Suomi", aliases: ["finnish", "fin"] },
    { code: "pl", name: "Polish", native: "Polski", aliases: ["polish", "pol"] },
    { code: "cs", name: "Czech", native: "Čeština", aliases: ["czech", "ces", "cze"] },
    { code: "sk", name: "Slovak", native: "Slovenčina", aliases: ["slovak", "slk", "slo"] },
    { code: "hu", name: "Hungarian", native: "Magyar", aliases: ["hungarian", "hun"] },
    { code: "ro", name: "Romanian", native: "Română", aliases: ["romanian", "ron", "rum"] },
    { code: "bg", name: "Bulgarian", native: "Български", aliases: ["bulgarian", "bul"] },
    { code: "hr", name: "Croatian", native: "Hrvatski", aliases: ["croatian", "hrv"] },
    { code: "sr", name: "Serbian", native: "Srpski", aliases: ["serbian", "srp"] },
    { code: "bs", name: "Bosnian", native: "Bosanski", aliases: ["bosnian", "bos"] },
    { code: "sl", name: "Slovenian", native: "Slovenščina", aliases: ["slovenian", "slv"] },
    { code: "el", name: "Greek", native: "Ελληνικά", aliases: ["greek", "ell", "gre"] },
    { code: "tr", name: "Turkish", native: "Türkçe", aliases: ["turkish", "tur"] },
    { code: "ru", name: "Russian", native: "Русский", aliases: ["russian", "rus"] },
    { code: "uk", name: "Ukrainian", native: "Українська", aliases: ["ukrainian", "ukr"] },
    { code: "et", name: "Estonian", native: "Eesti", aliases: ["estonian", "est"] },
    { code: "lv", name: "Latvian", native: "Latviešu", aliases: ["latvian", "lav"] },
    { code: "lt", name: "Lithuanian", native: "Lietuvių", aliases: ["lithuanian", "lit"] },
    { code: "sq", name: "Albanian", native: "Shqip", aliases: ["albanian", "sqi", "alb"] },
    { code: "ar", name: "Arabic", native: "العربية", aliases: ["arabic", "ara"] },
    { code: "he", name: "Hebrew", native: "עברית", aliases: ["hebrew", "heb"] },
    { code: "fa", name: "Persian", native: "فارسی", aliases: ["persian", "farsi", "fas", "per"] },
    { code: "hi", name: "Hindi", native: "हिन्दी", aliases: ["hindi", "hin"] },
    { code: "zh", name: "Chinese", native: "中文", aliases: ["chinese", "zho", "chi", "chinese (simplified)", "chinese (traditional)", "mandarin", "cantonese"] },
    { code: "ja", name: "Japanese", native: "日本語", aliases: ["japanese", "jpn"] },
    { code: "ko", name: "Korean", native: "한국어", aliases: ["korean", "kor"] },
    { code: "th", name: "Thai", native: "ไทย", aliases: ["thai", "tha"] },
    { code: "vi", name: "Vietnamese", native: "Tiếng Việt", aliases: ["vietnamese", "vie"] },
    { code: "id", name: "Indonesian", native: "Bahasa Indonesia", aliases: ["indonesian", "ind"] },
    { code: "ms", name: "Malay", native: "Bahasa Melayu", aliases: ["malay", "msa", "may"] },
    { code: "af", name: "Afrikaans", native: "Afrikaans", aliases: ["afrikaans", "afr"] },
]

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]))

/** Languages the offline translator (Argos models in the desktop app) can write; it pivots through English. */
export const TRANSLATABLE_TARGETS = new Set(["en", "nl", "de", "fr", "es", "it", "pt", "da", "sv", "no", "fi", "pl", "cs", "sk", "hu", "ro", "bg", "sl", "el", "tr", "ru", "uk", "et", "lv", "lt", "sq", "ar", "he", "fa", "hi", "zh", "ja", "ko", "th", "vi", "id", "ms"])
/** Languages the translator can read. */
export const TRANSLATABLE_SOURCES = TRANSLATABLE_TARGETS

export function getLanguage(code?: string): LanguageInfo | undefined {
    return code ? BY_CODE.get(code) : undefined
}

export function languageName(code?: string) {
    return getLanguage(code)?.name ?? (code ? code.toUpperCase() : "Unknown")
}

/** "eng" / "en-US" / "nld" -> "en" / "en" / "nl" */
export function languageFromCode(code?: string): string | undefined {
    if (!code) return undefined
    const c = code.toLowerCase().split(/[-_]/)[0]
    if (BY_CODE.has(c)) return c
    return LANGUAGES.find((l) => l.aliases.includes(c))?.code
}

/** "Dutch2", "English [CC]", "Brazilian7", "Arabic Hi5", "Italian [Forced]" -> ISO code */
export function languageFromLabel(label?: string): string | undefined {
    if (!label) return undefined
    const clean = label
        .toLowerCase()
        .replace(/\[.*?\]/g, " ")
        .replace(/\b(hi|sdh|cc|forced|full|default)\b/g, " ")
        .replace(/\d+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    if (!clean) return undefined
    const exact = LANGUAGES.find((l) => l.aliases.includes(clean) || l.name.toLowerCase() === clean)
    if (exact) return exact.code
    // "Chinese (traditional)", "Portuguese (Brazil)" ...
    const first = clean.split(/[ (]/)[0]
    return LANGUAGES.find((l) => l.aliases.includes(first))?.code ?? languageFromCode(first)
}

export function isForcedLabel(label?: string) {
    return !!label && /forced/i.test(label)
}

/** Ad / credit lines that subtitle sites inject into files */
const AD_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ru|to|io|cc|me|tv|xyz)\b|opensubtitles|subtitles? by|synced (and|&) corrected|advertise your product|support us and become vip)/i
export function isAdCue(text: string) {
    return AD_PATTERN.test(text)
}
