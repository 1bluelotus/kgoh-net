---
layout: case-study.njk
title: "ShamCheck"
subtitle: "A free scam-detection tool that reframes how everyday users understand and identify online scams — built for the people most at risk."
company: "Three Clicks Corporation"
role: "Lead UX & Visual Designer"
platforms: "Web, iOS, Android"
launched: "March 2026"
---

## Overview

ShamCheck lets users submit a suspicious message — via screenshot or text — and receive an AI-powered analysis explaining whether it's a scam and why. It's built specifically for Boomers and Gen X: the demographic most frequently targeted by scammers and most underserved by existing tools.

I served as the primary UX contributor on the web product, designing the core interactive components and user flows that the mobile app was later built from. I also owned the mobile app store presence end-to-end — icon design, store copy, screenshots, and submission across iOS and Android.

<div class="cs-img-wrap" data-caption="Core scan interface">
<img src="/shamcheck-scan-interface.png" alt="ShamCheck core scan interface" class="cs-img" />
</div>

---

## The Research Insight
### Reframing the problem

Existing scam-detection tools had a categorization problem. Industry terminology was technical, jargon-heavy, and designed for security professionals — not the everyday user trying to figure out if a text message from "Amazon" was real. The categories didn't map to how people actually experienced being scammed.

The question wasn't just how to detect scams — it was how to make scam literacy intuitive.

Early research into the target demographic surfaced a key insight: older users tend to prefer tangible, tactile modes of learning over abstract digital interfaces. They trust things that feel familiar and grounded. This informed both the core taxonomy and the educational design of the product.

> ShamCheck redefines scams not by technical mechanism, but by the emotional angle they exploit — what we call a "sham." Six sham categories replace a fragmented landscape of technical terminology, making the threat legible to the people most at risk.

To bring these categories to life in a way that felt approachable rather than clinical, I designed an educational feature built around interactive trading cards — one per sham type. The format borrowed from a tactile, collectible reference object that the target demographic already understood intuitively. The result was an educational layer that invited exploration rather than demanding attention.

<div class="cs-img-wrap" data-caption="Trading cards feature">
<img src="/shamcheck-trading-cards.png" alt="ShamCheck trading cards feature showing sham type categories" class="cs-img" />
</div>

---

## Design Decisions
### What got built and why

**Chat-based scan interface**

Early explorations tried various input methods for submitting a suspicious message — structured fields, multi-step flows, form-based layouts. All of them had the same problem: they felt like filling out a form. When a user suspects they're being scammed, they're already anxious. Making them work through a structured input process at that moment creates friction at exactly the wrong time.
The redesign centered on a single insight: just let them paste it. Drop a screenshot into a chat box, get an immediate scan and comprehensive breakdown. No forms, no steps, no decisions to make before they get an answer. Further context is optional, not required. The result is an interaction that matches the emotional state of the user — fast, direct, and low-effort at a high-stress moment.

<div class="cs-img-wrap" data-caption="Clarification system">
<img src="/shamcheck-clarification.png" alt="ShamCheck clarification system showing scan results and analysis" class="cs-img" />
</div>

**Clarification system**

The AI surfaces its assumptions about a submitted message and lets users flag any that are incorrect, prompting a re-analysis. Early iterations re-prompted on every individual click, which felt disruptive and slow. The final design lets users address multiple incorrect assumptions at once before resubmitting — reducing friction and keeping the interaction feeling responsive rather than laborious.

---

## App Store
### End-to-end mobile launch

Competitive research across the app store category revealed two consistent gaps: no product was leading with the user's moment of uncertainty — the "is this real?" question — and privacy claims across the category were vague or unsubstantiated. ShamCheck's no-account, no-data-collection approach was a genuine differentiator that competitors weren't communicating clearly.

I wrote the final store listing copy for both App Store and Google Play around those two findings, then designed the app icon through multiple iterations and produced all production assets — iOS via Apple Icon Composer, Android as clean compound-path SVGs for VectorDrawable compatibility. The six-slide screenshot story arc was exported via a Playwright-based pipeline across four platform targets, and I coordinated the full submission process through App Store Connect and Google Play Console.

<div class="cs-img-wrap" data-caption="App icon + store screenshots">
<img src="/shamcheck-app-store.png" alt="ShamCheck app icon and App Store screenshots" class="cs-img" />
</div>

---

## Outcome
### Shipped across three platforms

ShamCheck launched on web, iOS, and Android in March 2026. The product went from concept to cross-platform release with a small team, with my UX work on the web product serving as the foundation the mobile app was built from.

- 3 platforms launched simultaneously
- 6 sham categories defined and designed
- Public launch: March 2026

<a href="https://shamcheck.com" target="_blank" class="cs-ext-link">shamcheck.com &rarr;</a>
