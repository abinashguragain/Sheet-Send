# Sheet Send — Purpose and Vision

## The Original Goal

The starting problem was simple: stop manually copying and pasting text from the browser into a Google Sheet. Highlight something, right-click, and have it land in a sheet as a new row. This goal has been accomplished. The extension works in Chrome, and Brave as per my testing with a popup for managing destinations, accounts, and settings.

This original goal was the starting point, not the destination. What follows is where the project is actually headed.

## Near-Term Roadmap

Two concrete improvements are planned on top of the current foundation:

**Custom column names and more dynamic data fetching.** Right now, columns are limited to a fixed set: selected text, timestamp, source URL, page title. The next step is letting a person define their own column names and choose what data fills each one, rather than being limited to this fixed list. This makes each destination adaptable to whatever the person is actually tracking, instead of a one-size-fits-all row shape.

**Domain-based destination routing.** Right now, a person manually picks a destination from the right-click menu or the popup every time. The next step is letting destinations be assigned automatically based on the domain of the page being visited. Content captured on instagram.com could route to one sheet, content from tiktok.com to another, each with its own custom tab, not just a different tab within the same sheet but a genuinely separate configured destination per domain. This turns Sheet Send from a manual capture tool into something that sorts itself as it goes.

## The Actual Purpose of This Extension

The core use case this project exists for is lead collection.

The real workflow: someone is browsing profiles, on Instagram, LinkedIn, TikTok, Facebook, or similar, actively looking for leads. Right now, capturing a profile means manually copying a name, a handle, a bio line, whatever is relevant, and pasting it somewhere. The purpose of Sheet Send is to remove that manual step entirely.

The target behavior: even without selecting any text, simply visiting a profile page on a supported platform should surface a "Send to [sheet name]" action, pre-configured for that platform, that captures the relevant profile information and sends it straight to the assigned sheet. No highlighting required, no copy-paste, no manual data entry. Someone doing outbound prospecting could move through profile after profile, clicking one button each time, and end up with a structured lead list building itself in real time.

This is the actual reason the extension exists. Everything built so far, right-click text capture, destination management, cross-browser support, is the infrastructure this use case sits on top of. The near-term roadmap items (custom columns, domain-based routing) are also in direct service of this: a lead-generation workflow needs custom fields (name, handle, platform, notes) and needs different platforms to route to different sheets without being told to every time.

## Additional Use Case: Save Link (Reading List)

A separate, smaller use case worth building alongside the main one: a "Save Link" action, functioning similarly to Instapaper or a read-it-later tool. Rather than capturing selected text, this captures the current page's link itself, saved to a designated sheet or tab functioning as a reading list, for revisiting later. This does not require text selection either, it is a whole-page action rather than a text-fragment action, and would likely share the same underlying "act on the current page without selecting text" mechanism the profile-capture feature needs.

## What This Means Going Forward

Two categories of interaction are now on the table, not just one:

1. **Text-selection capture** (already built) — highlight something, right-click, send it.
2. **Whole-page / no-selection capture** (not yet built) — visit a page, click a pre-configured action, capture structured data about that page or profile without selecting anything.

The second category is where the extension's real value is meant to live. It is worth treating as its own build phase, with its own spec, once the current cross-browser OAuth and popup work is fully stable.
