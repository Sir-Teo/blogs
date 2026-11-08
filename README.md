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
- `assets/css/main.css`: every colour token (light and dark), typography,
  figures and the shared figure controls (`.tabs`, `.btn`, `.check`, range
  inputs).
- `assets/js/site.js`: theme toggle, heading anchors, the contents rail on wide
  screens, home index micro-figure interactions, and copy buttons on code blocks.

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

The home page filters posts by title, summary, and full article text. Use the
header's search icon from any page, or press `/` outside a form field. Search
ignores case and accents, accepts punctuation between keywords, and matches
every keyword in a query, including post tags and categories. Matching words
are highlighted; matches in the article body show a short passage for context.
Clear the field or press Escape to show all posts again. Queries are saved in
`?q=` so results can be bookmarked or shared.

Jekyll generates `search.json` from published posts at build time; the browser
loads it only when someone searches. If it cannot load, title and summary
search still works. No search service, API key, or extra dependency is needed.
