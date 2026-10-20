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

One column, system fonts, greys plus one accent that only appears inside
figures. The design lives in three places:

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
