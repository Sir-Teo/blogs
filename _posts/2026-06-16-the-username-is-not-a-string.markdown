---
layout: post
title: "The Username Is Not a String"
description: "Unicode lets identifiers speak many languages, but raw string equality is the wrong security boundary. Normalization, case folding, script policy, and confusable detection each catch a different failure."
date: 2026-06-16 17:10:00 -0400
categories: software-engineering
tags: [unicode, security, identifiers, normalization, confusables, software-engineering]
excerpt: "Two usernames can look identical, compare unequal, normalize together, or spoof each other across scripts. The security policy is not equality. It is the whole comparison pipeline."
---

The product requirement sounds innocent:

```text
No two users can have the same username.
```

That sentence hides a trap. It assumes a username is a string, and that two
strings are the same when their bytes, code units, or code points are the same.

For internal database keys, maybe. For human-facing identifiers, not enough.

Unicode is doing something much larger than ASCII ever had to do. It represents
many writing systems, combining marks, compatibility characters, invisible
format controls, right-to-left text, and scripts whose letters can look like
letters from other scripts. That is not a bug. It is the point of Unicode. But
it means an identifier system needs a policy, not just an equality operator.

The username `paypal` and the username `раураl` are different strings. The
second one starts with Cyrillic letters that look like Latin letters in many
fonts. A database uniqueness constraint on raw strings will happily admit both.
A human reader may not.

The engineering question is not:

```text
are these code points equal?
```

It is:

```text
what distinctions does this product promise users they can rely on?
```

## Four Different Problems

Unicode security problems often get flattened into one phrase: homoglyph attack.
That is too blunt. At least four different mechanisms matter.

**Canonical equivalence.** The same abstract character may have multiple Unicode
representations. The character `é` can be a single precomposed code point or an
`e` followed by a combining acute accent. UAX #15 is the Unicode annex that
defines normalization forms; its summary says normalization gives equivalent
strings a unique binary representation when implementations keep text in a
normalized form.[^uax15] NFC is usually the first layer for stored display text.

**Compatibility equivalence.** Some characters are compatibility variants of
others. The Kelvin sign `K` normalizes under NFKC to `K`; Roman numeral `Ⅳ`
normalizes to `IV`. UAX #15 is careful here: compatibility equivalence can erase
visual or semantic distinctions that matter in some contexts.[^uax15] That is
why "normalize everything with NFKC" is not a universal answer. It is a policy
choice.

**Invisible and directional controls.** A zero-width joiner inside an identifier
can make the code-point sequence different without making the displayed string
obviously different. Bidirectional controls can be worse in source code:
Boucher and Anderson's Trojan Source work showed how maliciously encoded source
can appear different to a reviewer than to a compiler or interpreter.[^trojan]
That attack is about source code, not usernames, but the lesson travels: visual
review is not a parser.

**Confusable scripts.** Greek, Cyrillic, Latin, and other scripts contain
characters that can be visually confusable. Unicode Technical Standard #39
defines security mechanisms for identifiers, including identifier profiles,
confusable detection, mixed-script detection, and restriction levels.[^uts39]
This is the layer that catches `раураl` against `paypal`.

Each mechanism has a different false-positive surface. That is why mature
systems layer them instead of pretending one transform solves text.

## A Small Registry Lab

The lab below has eight existing usernames and eight proposed candidates. Move
the **Case** slider to choose the pair. Move **Policy** to see which comparison
pipeline would block it.

The policy ladder is:

1. raw equality;
2. NFC;
3. NFKC plus a small case-folding table;
4. the same key after removing selected default-ignorable controls;
5. a tiny UTS #39-style confusable skeleton plus a mixed-script guard.

This is intentionally not a production implementation of UTS #39. The real
standard has data files, profiles, context rules, and versioning concerns. The
browser lab uses a small readable table so the failure modes are visible.

<style>
  .unicode-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    max-width: 100%;
    overflow: hidden;
    padding: 1rem;
  }

  .unicode-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    margin-bottom: 1rem;
  }

  .unicode-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .unicode-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    min-height: 1.2rem;
  }

  .unicode-lab input[type="range"] {
    accent-color: #0f766e;
    width: 100%;
  }

  .unicode-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .unicode-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .unicode-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .unicode-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
  }

  .unicode-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .unicode-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .unicode-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    gap: 0.35rem;
  }

  .unicode-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .unicode-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="unicode-lab" data-unicode-lab>
  <div class="unicode-lab__controls">
    <label>
      Case <output data-value="case">canonical accent</output>
      <input type="range" data-param="case" min="0" max="7" step="1" value="0">
    </label>
    <label>
      Policy <output data-value="policy">raw equality</output>
      <input type="range" data-param="policy" min="0" max="4" step="1" value="0">
    </label>
  </div>
  <div class="unicode-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="Unicode identifier lab showing username normalization, confusable skeletons, mixed-script policy, code points, and registry collision counts"></canvas>
  <div class="unicode-lab__legend">
    <span><i style="background:#2563eb"></i> Normalization</span>
    <span><i style="background:#0f766e"></i> Identifier key</span>
    <span><i style="background:#be123c"></i> Blocked or reviewed</span>
    <span><i style="background:#7c3aed"></i> Mixed script</span>
  </div>
  <p class="unicode-lab__note">
    Deterministic toy registry. The audit checks nine expected failures:
    canonical equivalence, compatibility equivalence, case folding, invisible
    controls, mixed-script detection, and a small confusable skeleton. Production
    systems should use Unicode's full data files and a documented versioned profile.
  </p>
</div>
<script defer src="{{ '/assets/js/unicode-identifier-lab.js?v=20260616a' | relative_url }}"></script>

The default case is `éclair` versus `e` plus a combining acute accent. Raw
equality misses it. NFC catches it.

Move to **compatibility letter**. Raw equality and NFC miss `Kilo`; NFKC plus
case folding collides it with `kilo`.

Move to **invisible joiner**. Even NFKC plus folding misses `ad + U+200D +
min`; the identifier key catches it only after selected default-ignorable
controls are removed.

Move to **Cyrillic lookalike**. Normalization does not save you. The candidate
is already a perfectly normal Unicode string. It needs a script/confusable
policy.

That progression is the point. A username policy is a pipeline:

```text
decode -> normalize -> validate profile -> fold -> remove/restrict controls
       -> script policy -> confusable policy -> store stable comparison key
```

The exact order and strictness depend on the product. A programming-language
compiler, a domain-name registry, a social network, and a private enterprise
directory should not all use the same policy.

## The False Positive Budget Is Product Design

It is tempting to make every identifier ASCII-only and declare victory. For some
systems, that is a good answer. Internal service names, package names, and
high-risk admin identifiers often benefit from a narrow alphabet.

For public names, ASCII-only can be exclusionary and commercially wrong. People
and organizations have real names outside ASCII. The hard product work is
deciding which distinctions users should be allowed to claim and which
distinctions are too dangerous to sell as identity.

UTS #39 frames this as profiles, restriction levels, mixed-script detection, and
confusable detection rather than a single ban list.[^uts39] IDNA2008 makes a
similar point in a domain-specific way: internationalized domain names have
their own protocol, definitions, and registry context, not just arbitrary
Unicode labels pushed into DNS.[^idna]

For usernames, I would usually separate three stored values:

```text
display_name      what the user chose and what other users see
comparison_key    normalized/folded/profiled key used for uniqueness
skeleton_key      spoofing key used for review, reservation, or blocking
```

The display name can preserve identity. The comparison key enforces ordinary
uniqueness. The skeleton key protects other users from names that are distinct
to the database but not reliably distinct to the eye.

The skeleton key should not silently rewrite the display name. It should decide
whether registration is allowed, reserved, reviewed, or shown with warnings.

## Versioning Is Part of the Schema

Unicode data changes over time. Standards evolve. UTR #36, for example, has
been stabilized, and the Unicode page now points readers toward newer material
such as UTS #39, UTS #55, and UAX #31 for some topics.[^utr36] That is a
reminder: identifier policy is not a one-time regex.

If you operate a registry, store the policy version beside the derived keys:

```text
username_display
username_key_v3
username_skeleton_v3
unicode_version
policy_version
review_status
```

Then migrations can be explicit. A new Unicode version may classify a character
or confusable differently. A new business policy may reserve names that were
previously allowed. You need to know whether an existing account is grandfathered,
renamed, reviewed, or merely protected from future collisions.

The worst migration is the invisible one:

```text
we changed normalization libraries and the uniqueness boundary moved
```

That is how a string bug becomes an identity bug.

## What I Would Ship

For a serious identifier surface, I would want:

1. a documented allowed-character profile;
2. one canonical comparison key for uniqueness;
3. a confusable skeleton key for high-risk collision review;
4. explicit handling of default-ignorable and bidirectional controls;
5. script-mixing rules that differ by product and locale;
6. UI that reveals code points or warnings when a name is risky;
7. migrations that record Unicode and policy versions.

The key design smell is using raw equality as the boundary while showing users a
rendered string as the identity.

Rendered text is an interface. Unicode code points are a representation.
Identity is a policy.

Treat the username like a security object, not a string.

## Works Cited

[^uax15]: Unicode Consortium, "Unicode Standard Annex #15: Unicode Normalization Forms." [UAX #15](https://www.unicode.org/reports/tr15/).

[^uts39]: Unicode Consortium, "Unicode Technical Standard #39: Unicode Security Mechanisms." [UTS #39](https://www.unicode.org/reports/tr39/).

[^utr36]: Unicode Consortium, "Unicode Security Considerations" stabilized report page, noting that UTR #36 is no longer maintained and that some material has been superseded by newer standards. [UTR #36](https://www.unicode.org/reports/tr36/).

[^idna]: John Klensin, "Internationalized Domain Names for Applications (IDNA): Definitions and Document Framework," RFC 5890, IETF, 2010. [RFC 5890](https://datatracker.ietf.org/doc/html/rfc5890). See also RFC 5891 for the IDNA protocol. [RFC 5891](https://www.rfc-editor.org/info/rfc5891/).

[^trojan]: Nicholas Boucher and Ross Anderson, "Trojan Source: Invisible Vulnerabilities," USENIX Security 2023; first disclosed in 2021. [USENIX PDF](https://www.usenix.org/system/files/sec23fall-prepub-151-boucher.pdf), [arXiv](https://arxiv.org/abs/2111.00169).
