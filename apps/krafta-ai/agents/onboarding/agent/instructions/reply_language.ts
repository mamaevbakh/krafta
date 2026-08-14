import { defineDynamic, defineInstructions } from "eve/instructions"

/**
 * Tells the model, every turn, which script the customer just used.
 *
 * The static instructions already say "answer in the script they wrote in",
 * and the model mostly obeys — but not reliably. Observed on 2026-08-11: a
 * customer wrote "Раҳмат. Латте нархи-чи?" in Uzbek Cyrillic and got
 * "Latte 28 000 soʻm" back in Latin, in a session where the previous Cyrillic
 * turn had been answered correctly. Inconsistent is worse than wrong: you
 * cannot test it away and a merchant cannot predict it.
 *
 * So we stop asking the model to notice. Script is a property of the bytes,
 * decidable without a model, and stated as a fact each turn. This is the one
 * thing the product is supposed to be better at than a foreign platform, and
 * "usually gets it right" is not better.
 *
 * Deliberately narrow: it decides SCRIPT (Cyrillic vs Latin), which is
 * mechanical and certain. It does not try to decide the language — Uzbek
 * Cyrillic and Russian share an alphabet, and a confident wrong guess there
 * would be worse than leaving that judgement to the model, which reads meaning
 * and not just codepoints.
 */

const CYRILLIC = /\p{Script=Cyrillic}/u
const LATIN = /\p{Script=Latin}/u

/** Letters that exist in Uzbek Cyrillic but not Russian. */
const UZBEK_CYRILLIC_MARKERS = /[ўқғҳЎҚҒҲ]/

function countMatches(text: string, re: RegExp): number {
  let n = 0
  for (const ch of text) if (re.test(ch)) n++
  return n
}

export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      const lastUser = [...ctx.messages].reverse().find((m) => m.role === "user")
      const text =
        typeof lastUser?.content === "string"
          ? lastUser.content
          : Array.isArray(lastUser?.content)
            ? lastUser.content
                .map((p) => (typeof p === "object" && p && "text" in p ? String(p.text) : ""))
                .join(" ")
            : ""

      const cyrillic = countMatches(text, CYRILLIC)
      const latin = countMatches(text, LATIN)

      if (process.env.KRAFTA_AI_DEBUG_LANG === "1") {
        console.log(
          `[reply_language] msgs=${ctx.messages.length} text=${JSON.stringify(text.slice(0, 60))} cyr=${cyrillic} lat=${latin}`
        )
      }

      // Too few letters to carry a language: "ok", "da", a phone number, an
      // order id, an emoji. Script is NOT language — "ok" is Latin, and
      // answering "in Latin" let the model drift into English when the
      // business speaks Uzbek. Say nothing and let the configured default win.
      const letters = cyrillic + latin
      if (letters < 4 || cyrillic === latin) {
        // Silence is not neutral. Left with no directive the model picked
        // ENGLISH after "ok" in an Uzbek conversation — a language this
        // business does not serve. Name the fallback explicitly instead.
        return defineInstructions({
          markdown: [
            "The customer's latest message carries no language signal (it is",
            "too short, or a number, or an emoji).",
            "",
            "Reply in this business's default language, named in your",
            "instructions above. Do NOT default to English, and do not switch",
            "the language of the conversation on the strength of a token like",
            '"ok" — carry on in whatever the customer was using before.',
          ].join("\n"),
        })
      }

      const script = cyrillic > latin ? "Cyrillic" : "Latin"
      const lines = [
        `The customer's latest message is written in **${script}** script.`,
        `Write your entire reply in ${script} script. Do not transliterate it`,
        `into the other script, even if the business's default differs.`,
      ]

      if (script === "Cyrillic" && UZBEK_CYRILLIC_MARKERS.test(text)) {
        lines.push(
          "",
          "It contains letters specific to Uzbek Cyrillic (ў, қ, ғ, ҳ), so this",
          "is Uzbek written in Cyrillic — not Russian. Reply in Uzbek, in",
          "Cyrillic."
        )
      }

      return defineInstructions({ markdown: lines.join("\n") })
    },
  },
})
