# Teo's blog

Things I build, explained with figures you can play with.

The site is built with Jekyll using its own small layouts (no theme) and is
published under the `/blogs` path on GitHub Pages.

## Local development

```sh
bundle install
bundle exec jekyll serve
```

Posts go in `_posts/` as `YYYY-MM-DD-title.markdown`. The generated `_site/`
directory is ignored.

## Design

One column, editorial serif prose paired with crisp system UI fonts, warm greys
plus one accent reserved for data, interactive affordances, and figures. The
design lives in three places:

- `_layouts/` (`default`, `home`, `post`, `page`) and `_includes/post-thumb.html`:
  page structure and the inline SVG schematic thumbnails on the index. Post
  headers and index rows show date, reading time, figure count, and any `links:`
  from front matter.
- `assets/css/main.css`: every colour token (light and dark, including
  `--accent`, `--amber`, `--good`, `--bad`), typography, figures, unified
  methods disclosures, and the shared figure controls (`.fig-controls`,
  `.tabs`, `.btn`, `.check`, range inputs).
- `assets/js/site.js`: theme toggle, heading anchors, reading progress hairline,
  contents rail on wide screens and collapsible contents on narrow screens, home
  index micro-figure interactions, and copy buttons on code blocks.

### Figures

Write a figure as `<figure class="fig">` with a `<figcaption>`; captions are
numbered automatically ("Figure 1."). Add `wide` to let it extend 80px past
the text column on large screens. Interactive figures mount their content
above the caption from a post-specific script:

```yaml
links:
  - title: Live app
    url: https://example.com
styles:
  - /assets/css/my-post.css
scripts:
  - /assets/js/my-post.js
```

Data a figure needs goes in `assets/data/`.

### Mathematics

Every post uses the same locally bundled KaTeX runtime, fonts, and
`assets/css/math.css`. The mathematical atlas uses that runtime too; it does
not load a second version from a CDN. See the official
[auto-render](https://katex.org/docs/autorender) and
[rendering options](https://katex.org/docs/options) documentation.

Write inline math with paired double dollars in a paragraph:

```text
The fitted total is $$\widehat M = N/F(\hat\theta)$$.
```

For a display equation, put `$$` on separate lines with blank lines around
the block. Use `aligned` for long derivations so they read well on a phone.
Do not simulate equations with Unicode hats or nested HTML superscripts.
Use `\operatorname{Var}`, `\log`, `\mathrm{...}` and ordinary TeX subscripts
consistently. Plain currency is left untouched: single dollar signs are
not treated as math delimiters.

For dynamic HTML or text inside an HTML link, use
`<span class="math-inline" data-tex="...">readable fallback</span>` or
`<div class="math-display" data-tex="...">readable fallback</div>`.
`BlogMath.render(element)` is available for explicit rendering; inserted
math is also detected automatically. Code blocks and SVG chart labels
are left alone. Rendered math includes a MathML representation for assistive
technology, inherits the current theme, and scrolls within its own block
when a long expression cannot fit.

Destination icons use the local SVG sprite in `assets/icons.svg`, rendered by
`_includes/link-icon.html` for navigation and post links. GitHub, YouTube,
Bilibili, websites, and RSS each have a small icon that follows the current text colour.
`site.js` also adds these icons to external links in article and page prose.

### Search

The home page filters posts by series, title, summary, and full article text.
Use the header's search icon from any other page, or press `/` outside a form
field. Search ignores case and accents, accepts punctuation between keywords,
and matches every keyword in a query, including post tags and categories.
Matching words are highlighted; matches in the article body show a short passage
for context. Clear the field or press Escape to show all posts again. Queries
and series filters are saved in `?q=` and `?series=` so results can be
bookmarked or shared.

Jekyll generates `search.json` from published posts at build time; the browser
loads it only when someone searches. If it cannot load, title and summary
search still works. No search service, API key, or extra dependency is needed.

## Writing

The house style, distilled from the technical blogs that do this best: Bartosz
Ciechanowski and Red Blob Games for interactive explanation, Julia Evans and
Sam Rose for plain language, Phil Eaton on what makes a technical blog worth
trusting, Bret Victor and Nicky Case on explorable explanations, and Distill on
interactive articles. `Reading my own Duolingo export` is the reference post.

1. **Open with the problem, a question, or the surprising result.** Not a
   definition, and never a legal disclaimer: those go in a closing
   `<p class="credit">`.
2. **Write as yourself.** "I" for what you built and decided, "you" for the
   reader, "we" only when walking the reader through a build together.
3. **Tell what broke.** Symptom, how you noticed, cause, fix, the number.
   Talking about the problems with something you built is what earns trust.
   Don't tease a story you won't finish.
4. **One number per claim.** Pick the number that proves the point; put the rest
   in captions or the methods box. Plain numbers are not code: no backticks.
5. **Every figure gets a sentence that says what to try and what to look for.**
   Interactivity should carry the argument, not decorate it. One or two
   `class="act"` links per paragraph, each tied to a claim; if a sentence has
   more links than verbs, split it.
6. **Define a term the first time it appears, or cut it.** Methods vocabulary
   (estimators, projections, test statistics) belongs in a `<details>` methods
   box at the end.
7. **Short sentences, few em-dashes, no intensifiers.** Cut "exact same",
   "silently", "quietly", "directly", "straight out of". If a word isn't pulling
   its weight, delete it.
8. **End the post.** A closing paragraph on what it adds up to, what surprised
   you, or what is still unsolved. No takeaway lists.
9. **Link the neighbours.** Add `series: <key>` (see `_data/series.yml`) and
   link related posts in the prose where a reader would want them.
10. **Check every claim against data before publishing,** including the ones
    that make the argument stronger. A threshold chosen so only one point can
    clear it proves nothing.

### Series

A post joins a series with `series: <key>` in its front matter, using a key
from `_data/series.yml`. The post header then shows the series name (unless the
post sets its own `kicker`), and the end of the post lists every part, oldest
first.

### Social cards

Each post has a 1200×630 preview image in `assets/social/`, used by link
previews on social sites and chat apps. Regenerate them after adding a post or
changing a title or thumbnail:

```sh
bundle exec jekyll build
node _tools/social-cards/render.cjs
```
