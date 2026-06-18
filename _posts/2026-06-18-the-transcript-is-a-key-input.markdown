---
layout: post
title: "The Transcript Is a Key Input"
description: "TLS 1.3 does not only derive keys from Diffie-Hellman bytes. It feeds the handshake transcript into HKDF labels, CertificateVerify, and Finished so both endpoints commit to the same negotiation."
date: 2026-06-18 01:11:00 -0400
categories: computer-science
tags: [tls-13, hkdf, transcript-hash, cryptography, protocol-design, security]
excerpt: "A TLS key is not just a secret. It is a secret under a transcript. Change what either endpoint believes was negotiated and the hashes, signatures, or Finished MACs stop lining up."
---

A TLS handshake is easy to misread as a courier story:

```text
do Diffie-Hellman
get a shared secret
turn it into encryption keys
```

That is too small. A shared secret says two parties landed on the same private
ingredient. It does not, by itself, say they agree on what was negotiated, which
certificate was authenticated, which protocol version was chosen, which ALPN
value was selected, or which extensions were present.

TLS 1.3's more accurate story is:

```text
traffic key = KDF(shared secret, transcript hash, label)
```

The transcript is not decoration. It is part of the key input.

## The Handshake Has To Be A Receipt

RFC 8446 defines `Derive-Secret` using `HKDF-Expand-Label` with
`Transcript-Hash(Messages)` as context.[^rfc8446-key-schedule] It also says the
handshake messages in that hash include their handshake type and length fields,
but not record-layer headers.[^rfc8446-messages]

That detail is easy to pass over. It means the key schedule is not only asking:

```text
do we share ECDHE bytes?
```

It is asking:

```text
do we share ECDHE bytes under this exact handshake log?
```

This matters because negotiation is attack surface. A protocol endpoint is not
only authenticating a public key. It is authenticating a structured agreement:
version, cipher suite, named group, extensions, certificate, application
protocol, and several anti-downgrade choices.

RFC 7627, the TLS 1.2 Extended Master Secret extension, is the historical scar
that makes this principle concrete. It says the TLS master secret was not
cryptographically bound to important session parameters such as the server
certificate, then defines an extension that binds the master secret to the full
handshake log that computed it.[^rfc7627] TLS 1.3 folds that instinct into the
base key schedule.

## HKDF Is The Plumbing

HKDF has two stages. `HKDF-Extract` uses HMAC to concentrate input keying
material into a pseudorandom key. `HKDF-Expand` uses that pseudorandom key plus
context-specific information to derive output bytes.[^rfc5869]

TLS 1.3 wraps that second stage in `HKDF-Expand-Label`:

```text
HKDF-Expand-Label(Secret, Label, Context, Length)
```

where the label is namespaced with `"tls13 "` and the context is often a
transcript hash. The label keeps different uses separate. The transcript hash
binds the use to the handshake state.

In the server handshake-traffic branch, the shape is:

```text
Handshake Secret
  -> Derive-Secret("s hs traffic", ClientHello...ServerHello)
  -> server_handshake_traffic_secret
```

That transcript slice is early: it covers the hello messages. Later
authentication checks bind more of the transcript.

## Two Later Locks

TLS 1.3 has more than one transcript checkpoint.

`CertificateVerify` signs a value derived from the handshake transcript, with a
context string that identifies the operation.[^rfc8446-cv] This prevents a
signature from floating into another protocol role or another handshake shape.

`Finished` then computes:

```text
verify_data = HMAC(finished_key, Transcript-Hash(...))
```

where `finished_key` is derived from the relevant traffic secret.[^rfc8446-finished]
If either side has a different transcript or a different traffic secret, the
Finished value does not verify.

So there are distinct failure surfaces:

- a `ServerHello` rewrite changes the transcript used for handshake traffic
  secrets;
- an `EncryptedExtensions` or certificate rewrite may leave hello traffic keys
  unchanged, but breaks `CertificateVerify` and `Finished`;
- an ECDHE mismatch breaks the secret even when the transcript matches.

That separation is useful. It tells you where a protocol disagreement should be
caught.

## Lab: Split The Transcript

The lab below is deliberately narrow. It uses real SHA-256, HMAC-SHA-256, HKDF
Extract/Expand, and TLS-style `HKDF-Expand-Label` encoding. It does not implement
record encryption, X.509 path validation, ECDHE arithmetic, or real digital
signatures. `CertificateVerify` uses a toy HMAC proof so the browser can show
the same "transcript was signed" dependency without shipping a signature stack.

The modeled handshake messages are simplified `key=value` bodies, but each body
is encoded with a one-byte handshake type and a three-byte length before hashing.
That matches the part of RFC 8446 that matters for this experiment: the transcript
hash is over handshake structures, not over a casual pretty-print of fields.

Default measured values:

| Item | Prefix |
| --- | --- |
| hello transcript hash | `7e6de03a5a1e7050...` |
| authentication transcript hash | `6ce5c86812930522...` |
| server handshake traffic secret | `ec37fa71013fb996...` |
| CertificateVerify toy proof | `1326724fc5b27365...` |
| server Finished MAC | `c590dc32efe53dc9...` |

<style>
  .tls-lab {
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
  .tls-lab__controls {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    margin-bottom: 1rem;
  }
  .tls-lab__controls label {
    color: #5d6872;
    display: grid;
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .tls-lab__controls input,
  .tls-lab__controls select {
    accent-color: #2563eb;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-width: 0;
    padding: 0.35rem 0.45rem;
  }
  .tls-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
  }
  .tls-lab__metrics {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    margin: 0 0 1rem;
  }
  .tls-lab__metric {
    background: #f8fafc;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
  }
  .tls-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .tls-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.02rem;
    font-variant-numeric: tabular-nums;
    margin-top: 0.15rem;
  }
  .tls-lab__metric--good strong {
    color: #0f766e;
  }
  .tls-lab__metric--bad strong {
    color: #be123c;
  }
  .tls-lab__metric--warn strong {
    color: #b45309;
  }
  .tls-lab canvas {
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .tls-lab__note {
    color: #5d6872;
    font-size: 0.85rem;
    margin: 0.75rem 0;
  }
  .tls-lab__table {
    border-collapse: collapse;
    font-size: 0.78rem;
    margin-top: 0.85rem;
    width: 100%;
  }
  .tls-lab__table th,
  .tls-lab__table td {
    border-top: 1px solid #e5ebf1;
    padding: 0.38rem 0.45rem;
    text-align: left;
    word-break: break-word;
  }
  .tls-lab__table th {
    color: #5d6872;
    font-weight: 800;
    width: 9.5rem;
  }
  .tls-lab__table td {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .tls-lab__table .ok {
    color: #0f766e;
  }
  .tls-lab__table .bad {
    color: #be123c;
  }
  .tls-lab__legend {
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    margin-top: 0.75rem;
  }
  .tls-lab__legend span {
    align-items: center;
    display: inline-flex;
    font-size: 0.8rem;
    font-weight: 700;
    gap: 0.35rem;
  }
  .tls-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }
  @media (max-width: 720px) {
    .tls-lab {
      padding: 0.75rem;
    }
    .tls-lab__controls,
    .tls-lab__metrics {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="tls-lab" data-tls-transcript-lab>
  <div class="tls-lab__controls">
    <label>
      Scenario <output data-value="scenario">matching transcript</output>
      <select data-param="scenario" aria-label="Transcript split scenario">
        <option value="clean" selected>Matching transcript</option>
        <option value="hello">ServerHello rewrite</option>
        <option value="extension">Extension rewrite</option>
        <option value="certificate">Certificate swap</option>
        <option value="secret">ECDHE mismatch</option>
      </select>
    </label>
    <label>
      Client random seed <output data-value="seed">37</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="37" aria-label="Client random seed">
    </label>
    <label>
      ALPN <output data-value="alpn">h2</output>
      <select data-param="alpn" aria-label="Negotiated ALPN">
        <option value="h2" selected>h2</option>
        <option value="http1">http/1.1</option>
        <option value="grpc">grpc-exp</option>
      </select>
    </label>
    <label>
      ECDHE secret version <output data-value="secret">11</output>
      <input type="range" data-param="secret" min="1" max="64" step="1" value="11" aria-label="ECDHE secret version">
    </label>
  </div>
  <div class="tls-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="790" aria-label="TLS transcript binding lab showing client and server transcript hashes, HKDF key schedule, CertificateVerify, and Finished checks"></canvas>
  <div class="tls-lab__legend">
    <span><i style="background:#7c3aed"></i>Server view</span>
    <span><i style="background:#2563eb"></i>Client view</span>
    <span><i style="background:#0f766e"></i>Match or verified</span>
    <span><i style="background:#be123c"></i>Split or failed</span>
  </div>
  <p class="tls-lab__note" data-note>
    Matching transcript. Both endpoints hash the same handshake bytes and share
    the same ECDHE secret.
  </p>
  <table class="tls-lab__table">
    <thead>
      <tr>
        <th>Message</th>
        <th>Server bytes</th>
        <th>Client bytes</th>
      </tr>
    </thead>
    <tbody data-messages></tbody>
  </table>
</div>

<script defer src="{{ '/assets/js/tls-transcript-lab.js?v=20260618c' | relative_url }}"></script>

## What Each Scenario Teaches

The clean run is unsurprising: both endpoints compute the same hello hash, the
same traffic secret, the same toy `CertificateVerify` proof, and the same
Finished MAC.

The interesting rows are the failures:

| Scenario | Hello hash | TLS-style traffic secret | Secret-only demo key | CertificateVerify | Finished |
| --- | --- | --- | --- | --- | --- |
| matching transcript | match | match | match | passes | passes |
| ServerHello rewrite | different | different | match | fails | fails |
| extension rewrite | match | match | match | fails | fails |
| certificate swap | match | match | match | fails | fails |
| ECDHE mismatch | match | different | different | passes | fails |

The `Secret-only demo key` column is intentionally not TLS. It is the
counterfactual mistake: derive a key from the secret and a label, but ignore the
transcript. In the `ServerHello rewrite`, that demo key still matches. The real
TLS-style traffic secret does not.

The extension and certificate rows explain why the later authentication checks
also matter. The hello traffic secret is derived before `EncryptedExtensions`
and `Certificate`, so those later rewrites do not change the handshake traffic
secret in this simplified model. They do change the transcript signed by
`CertificateVerify` and checked by `Finished`.

The ECDHE mismatch row is the other boundary. Transcript binding cannot rescue
two endpoints that did not compute the same shared secret.

You can reproduce the scenario grid from Node:

```js
const lab = require("./assets/js/tls-transcript-lab.js");
const EXPECTED_CRITICAL_CHECKS = 1;
const EXPECTED_ROWS = 6;
const EXPECTED_CASES = 7;
const EXPECTED_CHECKS = 30;
const EXPECTED_TOTALS = {
  criticalChecks: EXPECTED_CRITICAL_CHECKS,
  rows: EXPECTED_ROWS,
  passed: EXPECTED_CASES,
  total: EXPECTED_CASES,
  passedChecks: EXPECTED_CHECKS,
  totalChecks: EXPECTED_CHECKS,
  hkdfVectorOk: true
};
const EXPECTED_SCENARIO_SHAPE = [
  "certificate:5/5:1",
  "clean:8/8:2",
  "extension:5/5:1",
  "hello:6/6:1",
  "secret:5/5:1"
];
const EXPECTED_ROW_SHAPE = [
  "clean:4/4:match:match:match:ok:ok",
  "hello:6/6:split:split:match:fail:fail",
  "extension:5/5:match:match:match:fail:fail",
  "certificate:5/5:match:match:match:fail:fail",
  "secret:5/5:match:split:split:ok:fail",
  "clean:4/4:match:match:match:ok:ok"
];
const EXPECTED_CRITICAL_SHAPE = [
  "RFC 5869 HKDF test vector:1/1"
];

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

(async () => {
  const audit = await lab.auditGrid();
  const failedRows = audit.rows.filter(
    (row) => !row.passed || row.passedChecks !== row.totalChecks
  );
  const failedCriticalChecks = audit.criticalChecks.filter(
    (row) => !row.passed || row.passedChecks !== row.totalChecks
  );
  console.table(audit.byScenario);
  console.table(audit.criticalChecks);
  const auditShape = {
    totals: {
      criticalChecks: audit.criticalTotal,
      rows: audit.rows.length,
      passed: audit.passed,
      total: audit.total,
      passedChecks: audit.passedChecks,
      totalChecks: audit.totalChecks,
      hkdfVectorOk: audit.hkdfVectorOk
    },
    byScenario: audit.byScenario.map(
      (row) => `${row.scenario}:${row.passedChecks}/${row.totalChecks}:${row.passed}`
    ),
    rows: audit.rows.map((row) => [
      row.params.scenario,
      `${row.passedChecks}/${row.totalChecks}`,
      row.helloHashMatch ? "match" : "split",
      row.trafficSecretMatch ? "match" : "split",
      row.secretOnlyDemoMatch ? "match" : "split",
      row.certificateVerifyOk ? "ok" : "fail",
      row.finishedOk ? "ok" : "fail"
    ].join(":")),
    criticalChecks: audit.criticalChecks.map(
      (row) => `${row.check}:${row.passedChecks}/${row.totalChecks}`
    )
  };
  const shapeErrors = [
    sameJson(auditShape.totals, EXPECTED_TOTALS) ? null : "totals",
    sameJson(auditShape.byScenario, EXPECTED_SCENARIO_SHAPE) ? null : "byScenario",
    sameJson(auditShape.rows, EXPECTED_ROW_SHAPE) ? null : "rows",
    sameJson(auditShape.criticalChecks, EXPECTED_CRITICAL_SHAPE)
      ? null
      : "criticalChecks"
  ].filter(Boolean);
  if (shapeErrors.length) {
    throw new Error(
      `audit grid drifted in ${shapeErrors.join(", ")}:\n` +
      JSON.stringify(auditShape, null, 2)
    );
  }
  if (
    failedRows.length ||
    failedCriticalChecks.length ||
    !audit.ok ||
    audit.passed !== audit.total ||
    audit.passedChecks !== audit.totalChecks
  ) {
    throw new Error(JSON.stringify({
      failedRows,
      failedCriticalChecks,
      shapeErrors,
      auditShape,
      hkdfVectorOk: audit.hkdfVectorOk,
      passed: audit.passed,
      passedChecks: audit.passedChecks,
      totalChecks: audit.totalChecks,
      total: audit.total
    }, null, 2));
  }

  console.table(audit.rows.map((row) => ({
    scenario: row.params.scenario,
    helloHash: row.helloHashMatch ? "match" : "split",
    trafficSecret: row.trafficSecretMatch ? "match" : "split",
    secretOnly: row.secretOnlyDemoMatch ? "match" : "split",
    certificateVerify: row.certificateVerifyOk ? "ok" : "fail",
    finished: row.finishedOk ? "ok" : "fail"
  })));
  console.log(`${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`);
})();
```

The audit runs six scenario rows and one named RFC 5869 HKDF vector. Inside
those rows it checks 29 transcript-binding obligations, plus the HKDF vector,
for 30 checks total. The vector is not about TLS transcript binding directly;
it keeps the small cryptographic plumbing honest.

## Why Not Just Sign The Certificate?

A certificate says a public key is associated with a name under some validation
policy. A handshake needs more.

The client does not merely want to know that `example.com` has a key. It wants
to know that the holder of that key participated in this negotiation:

```text
this ClientHello
this ServerHello
this selected cipher suite
this selected ALPN
this certificate
this transcript prefix
```

That is why `CertificateVerify` signs a context-separated transcript hash rather
than signing only a certificate. The signature's job is not to make the
certificate true. The certificate chain already has its own verification rules.
The signature's job is to bind the authenticated key to the live handshake.

`Finished` then makes the symmetric side accountable. It proves possession of
the derived traffic secret under the transcript seen so far.

## The Engineering Smell

The smell is any API or internal abstraction that passes around "the TLS key" as
if it were just bytes.

A better mental type is:

```text
TrafficSecret {
  secret_material
  transcript_hash
  label
  cipher_suite_hash
}
```

The actual implementation will not look like that struct, but the review should.
If an exporter, channel binding, resumption ticket, or application binding does
not say which transcript it belongs to, it is asking future code to remember a
security invariant informally.

That is fragile. Protocol invariants should be ingredients, not comments.

## The Boundary Of This Lab

This is not a TLS implementation. It does not parse wire-format extensions, run
X25519, validate certificates, implement AEAD records, handle PSK binders, model
HelloRetryRequest, or cover 0-RTT replay. It also uses a toy HMAC stand-in for
`CertificateVerify`; real TLS uses a digital signature verified with the public
key in the certificate.

The part it does implement is real enough to be falsifiable:

- SHA-256 transcript hashes over typed and length-prefixed handshake messages;
- RFC 5869 HKDF Extract and Expand;
- TLS-style `HKDF-Expand-Label`;
- `Finished` as HMAC over the authentication transcript;
- an audit grid over transcript splits and secret mismatches;
- the first RFC 5869 HKDF test vector.

That scope is narrow, but it is the point. The key schedule is a receipt
machine. Once the transcript is an input, a negotiation rewrite has to survive
the hash ledger, the authentication signature, and the Finished MAC.

## Sources

[^rfc8446-key-schedule]: Eric Rescorla, ["RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3"](https://datatracker.ietf.org/doc/html/rfc8446), Section 7.1. It states that key derivation incorporates input secrets and the handshake transcript, then defines `Derive-Secret` with `Transcript-Hash(Messages)`.

[^rfc8446-messages]: RFC 8446, Section 7.1. The `Messages` argument is the concatenation of indicated handshake messages including handshake type and length fields, excluding record-layer headers.

[^rfc8446-cv]: RFC 8446, Section 4.4.3. `CertificateVerify` covers the transcript hash with a context string and the receiver must verify the signature or terminate the handshake.

[^rfc8446-finished]: RFC 8446, Section 4.4.4. `Finished` derives `finished_key` using `HKDF-Expand-Label` and computes `verify_data` as HMAC over the transcript hash.

[^rfc5869]: Hugo Krawczyk and Pasi Eronen, ["RFC 5869: HMAC-based Extract-and-Expand Key Derivation Function"](https://datatracker.ietf.org/doc/html/rfc5869), Sections 2.2 and 2.3. HKDF-Extract computes `PRK = HMAC-Hash(salt, IKM)`, while HKDF-Expand iterates HMAC blocks over `info` and a counter.

[^rfc7627]: Karthikeyan Bhargavan et al., ["RFC 7627: Transport Layer Security (TLS) Session Hash and Extended Master Secret Extension"](https://datatracker.ietf.org/doc/html/rfc7627). The abstract says the TLS master secret was not bound to parameters such as the server certificate and defines a full-handshake log binding; Sections 3 and 4 define `session_hash` and the extended master secret computation.
