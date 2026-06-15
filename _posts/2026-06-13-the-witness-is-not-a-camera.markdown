---
layout: post
title: "Witnesses Are Not Cameras"
description: "A memory report is not raw footage. It is reconstructed from noisy traces, gist, priors, cues, and a decision threshold."
date: 2026-06-13 07:26:00 -0400
categories: psychology
tags: [memory, psychology, statistics, misinformation, signal-detection, bayesian-inference, cognition]
excerpt: "A witness can be sincere, confident, and wrong when a weak trace is rebuilt through gist, suggestion, and a permissive reporting threshold."
---

The metaphor is too good, so it keeps surviving.

Memory is a photograph. Memory is a recording. Memory is a hard drive. An event
is written somewhere inside the head, and recall is the act of playing it back.

The metaphor fails in exactly the place where memory matters most. A witness can
be sincere and wrong. A student can recognize a word that never appeared. A
family story can gain details as it is retold. A question can change the answer
it seems only to request.

This does not mean memory is useless. It means memory is statistical.

The remembered event is not copied out of storage. It is reconstructed from a
trace, a context, a prior, and a decision to report.

## Recall Is a Reconstruction

Write the original event as $$s$$ and the internal trace as $$x$$. If memory
were a camera, recall would be approximately:

$$
\hat{s} = x.
$$

But a trace is incomplete, noisy, and queried after delay. A more useful sketch
is:

$$
p(s \mid x, c)
\propto
p(x \mid s)\,p(s)\,p(c \mid s).
$$

Here $$c$$ is context: the wording of a question, a later story, a photograph,
or a cue from another person. The prior $$p(s)$$ contains schema and gist: what
would normally make sense in this kind of event. The report is not the posterior
itself. It is an action taken from the posterior:

$$
\mathrm{report}(s)
=
\mathbf{1}\{\mathrm{evidence}(s) > \tau\}.
$$

The threshold $$\tau$$ matters. A cautious witness may omit many true details.
A liberal witness may report more true details and more false ones. Accuracy is
not a single property of the trace. It is a property of trace quality, prior
strength, cues, and the reporting policy.

Frederic Bartlett's *Remembering* made the reconstructive view central in
psychology: people did not simply reproduce unfamiliar material; they made it
cohere with prior knowledge and meaning.[^bartlett] Loftus and Palmer later
showed how the wording of a question about a car accident could shift speed
estimates and later reports about broken glass.[^loftus-palmer] Roediger and
McDermott revived Deese's word-list paradigm and showed that people could
confidently remember a thematically related word that was never presented.[^drm]

Different literatures, same warning:

```text
confidence is not a checksum
```

Confidence is part of the reporting system. It often carries information, but
it is not immune to the same reconstruction that produced the memory report.

## A Toy Witness on the Bench

The lab below is not a model of any particular experiment. It is a toy
recognition system with three candidate reports:

1. a **target** detail that was actually present;
2. a **gist lure** that was not present but fits the meaning of the event;
3. an **unrelated lure** that neither appeared nor fits the event.

The target receives verbatim evidence that decays with delay. The gist lure
receives schema evidence and can be shifted by suggestion. All candidates are
corrupted by encoding noise. A report is made only if the candidate's evidence
exceeds a threshold.

<div class="memory-lab" data-memory-lab>
  <div class="memory-lab__controls">
    <label>
      Encoding noise: <output data-value="encodingNoise">42%</output>
      <input type="range" min="0" max="100" step="1" value="42" data-param="encodingNoise">
    </label>
    <label>
      Gist strength: <output data-value="gistStrength">55%</output>
      <input type="range" min="0" max="100" step="1" value="55" data-param="gistStrength">
    </label>
    <label>
      Suggestion cue: <output data-value="suggestion">25%</output>
      <input type="range" min="0" max="100" step="1" value="25" data-param="suggestion">
    </label>
    <label>
      Delay: <output data-value="delay">45m</output>
      <input type="range" min="0" max="360" step="15" value="45" data-param="delay">
    </label>
    <label>
      Report threshold: <output data-value="criterion">48%</output>
      <input type="range" min="5" max="95" step="1" value="48" data-param="criterion">
    </label>
    <label>
      Trials: <output data-value="trials">900</output>
      <input type="range" min="200" max="2000" step="100" value="900" data-param="trials">
    </label>
  </div>
  <div class="memory-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="620" aria-label="Memory reconstruction simulator showing recognition evidence, false alarms, delay effects, and reconstruction components"></canvas>
  <div class="memory-lab__legend">
    <span><i style="background:#0f766e"></i> True target</span>
    <span><i style="background:#be123c"></i> Gist-consistent lure</span>
    <span><i style="background:#64748b"></i> Unrelated lure</span>
    <span><i style="background:#d97706"></i> Omission</span>
    <span><i style="background:#7c3aed"></i> Schema prior</span>
  </div>
  <p class="memory-lab__note">
    Deterministic toy model. It is a statistical microscope for trace noise,
    gist, suggestion, delay, and reporting thresholds. It is not a diagnostic
    model for real witnesses, trauma, therapy, or legal decision-making.
  </p>
</div>
<script src="{{ '/assets/js/memory-prior-lab.js?v=20260613a' | relative_url }}"></script>

Start with the default. The true target is usually reported, but the
gist-consistent lure is reported at a nontrivial rate. The unrelated lure is
much lower. That is the signature of a prior doing useful and dangerous work at
the same time. The prior helps fill gaps with meaning. It also gives familiar
but absent details a head start.

Raise **encoding noise**. The target and lure distributions overlap. The report
threshold now becomes a policy choice. Lower it and hit rate rises, but false
alarms rise too. Raise it and precision improves, but omissions grow. This is
the signal-detection shape hiding beneath everyday phrases like "I remember" or
"I am not sure."

Raise **suggestion cue**. The gist lure moves right. This is the Loftus-Palmer
lesson in miniature: post-event information can become part of the evidence
used at report time. The model does not need dishonesty. It only needs a weak
trace and a plausible cue.

Increase **delay**. The target loses verbatim support faster than gist loses
meaning. This is why memory can become more schematic over time without
becoming random. The report may still sound coherent. In fact, coherence is
part of the danger.

## Gist Is Compression, Not a Bug

It is tempting to read false-memory research as an indictment of memory. That is
too easy.

If memory stored every perceptual detail with equal priority, it would be
expensive and often useless. We remember in order to act. Gist is compression:
what mattered, what usually follows, what kind of situation this was. A person
who remembers the meaning of a conversation but not the exact wording has not
necessarily failed. They may have retained the part most useful for future
behavior.

Fuzzy-trace theory makes this distinction explicit. It separates verbatim
traces, which preserve surface detail, from gist traces, which preserve meaning.
The theory explains why true and false memories can move in different
directions: a gist-consistent lure can feel familiar precisely because it fits
the meaning that was encoded.[^fuzzy] The Deese-Roediger-McDermott paradigm is
the cleanest classroom version. Study words like `bed`, `rest`, `awake`, and
`dream`; later, `sleep` can feel old even if it was never shown.[^drm]

The failure is not that the mind uses gist. The failure is assuming gist and
verbatim detail are the same thing.

## Reporting Has a Threshold

Koriat, Goldsmith, and Pansky argued for a psychology of memory accuracy that
distinguishes memory correspondence from memory quantity.[^koriat] That
distinction matters. Asking "how much did someone recall?" is not the same as
asking "how accurate was what they chose to report?"

In the lab, the report threshold controls this tradeoff. A high threshold makes
the system conservative. It says less, but what it says is more likely to be
true. A low threshold makes the system informative. It says more, but admits
more false detail.

Real remembering has versions of this control knob:

1. free recall versus forced choice;
2. "tell me everything" versus "only tell me what you are sure about";
3. repeated questioning versus a single report;
4. social pressure to be helpful;
5. incentives for accuracy versus incentives for completeness.

The trace is not the whole system. The elicitation procedure is part of the
system.

This is why leading questions are so dangerous. A question can change both the
cue and the threshold. It can provide content, imply expectation, and make an
uncertain person feel that a particular detail belongs in the report.

## Confidence Is Not a Receipt

Confidence is not meaningless. In many settings it is correlated with accuracy.
But confidence is a judgment about the strength and fluency of evidence, not a
direct readout of historical truth.

Roediger and McDermott's participants did not merely guess unrelated words.
They often gave high-confidence recognition to critical lures that fit the
studied list.[^drm] Schacter's taxonomy of memory errors includes
misattribution, suggestibility, bias, and persistence, among others; the point is
not that memory is broken, but that the same adaptive machinery that supports
memory can produce characteristic errors.[^schacter]

In statistical terms, confidence can be calibrated within a distribution and
still fail out of distribution. If a lure is generated by the same gist signal
that supports true memories, it can inherit the phenomenology of remembering.
It feels fluent because it is fluent.

## What This Toy Refuses to Decide

The lab is intentionally small. It does not model emotion, attention, repeated
retrieval, source monitoring, social contagion, trauma, developmental
differences, or the legal standards for evaluating testimony. It should not be
used as a generic argument that a particular memory is false.

It shows a narrower point:

```text
a sincere report can be produced by inference from incomplete evidence
```

That point is enough to change how we ask questions. Preserve the first report.
Avoid feeding details. Separate free recall from recognition. Record the exact
wording of prompts. Treat confidence as data, not proof. Expect omissions when
criteria are strict and intrusions when criteria are loose.

The camera metaphor asks whether memory developed correctly.

The inference metaphor asks a better question:

```text
what evidence, prior, cue, and reporting threshold produced this report?
```

That is less comforting. It is also closer to how remembering works.

## Reading Trail

[^bartlett]: Frederic C. Bartlett, [*Remembering: A Study in Experimental and Social Psychology*](https://www.mpi.nl/publications/item2273030/remembering-study-experimental-and-social-psychology), Cambridge University Press, 1932. The book is also available through [Internet Archive](https://archive.org/details/rememberingstudy00bart).

[^loftus-palmer]: Elizabeth F. Loftus and John C. Palmer, ["Reconstruction of Automobile Destruction: An Example of the Interaction Between Language and Memory"](https://www.semanticscholar.org/paper/Reconstruction-of-automobile-destruction%3A-An-of-the-Loftus-Palmer/6cba61868b7cc3689aca04c9541cb884ac02f7ee), *Journal of Verbal Learning and Verbal Behavior*, 1974. A PDF copy is available from the [University of Texas psychology course archive](https://labs.la.utexas.edu/gilden/files/2016/04/Loftus_Palmer.pdf).

[^drm]: Henry L. Roediger III and Kathleen B. McDermott, ["Creating False Memories: Remembering Words Not Presented in Lists"](https://psych.hanover.edu/classes/cognition/Papers/RoedigerMcDermott%201996%20DRM%20False.pdf), *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 1995. The paper explicitly builds on James Deese's 1959 word-intrusion work.

[^fuzzy]: C. J. Brainerd and V. F. Reyna, ["Fuzzy-Trace Theory and False Memory"](https://journals.sagepub.com/doi/10.1111/1467-8721.00192), *Current Directions in Psychological Science*, 2002. See also ["How Fuzzy-Trace Theory Predicts True and False Memories for Words, Sentences, and Narratives"](https://www.psychologicalscience.org/journals/current-directions/1467-8721.00192/) and related work on verbatim and gist traces.

[^koriat]: Asher Koriat, Morris Goldsmith, and Ainat Pansky, ["Toward a Psychology of Memory Accuracy"](https://www.annualreviews.org/doi/pdf/10.1146/annurev.psych.51.1.481), *Annual Review of Psychology*, 2000.

[^schacter]: Daniel L. Schacter, ["The Seven Sins of Memory: Insights From Psychology and Cognitive Neuroscience"](https://jasonmitchell.fas.harvard.edu/files/2022/05/2003_Schacter_SevenSinsSelf.pdf), *American Psychologist*, 1999.
