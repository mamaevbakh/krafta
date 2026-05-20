// IANA timezone identifiers. We pull the list from Intl.supportedValuesOf at
// runtime instead of maintaining a constant: the runtime tracks IANA updates
// (zone renames, splits, retirements) for free.
export function getTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone")
  }
  // Fallback for runtimes without supportedValuesOf (Node <18 / very old
  // browsers). Modern Next/Node won't hit this path; the short list is just
  // enough to keep the form functional rather than blank.
  return [
    "UTC",
    "Asia/Tashkent",
    "Asia/Almaty",
    "Asia/Bishkek",
    "Asia/Dushanbe",
    "Asia/Ashgabat",
    "Europe/Moscow",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
  ]
}

export function getTimezoneLabel(zone: string, now: Date = new Date()): string {
  try {
    const fmt = new Intl.DateTimeFormat("en", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    })
    const parts = fmt.formatToParts(now)
    const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? ""
    return offset ? `${zone} (${offset})` : zone
  } catch {
    return zone
  }
}
