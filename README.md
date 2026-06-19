# Teo's Research Notebook

Personal essays and experiments on AI, machine learning, computer science,
statistics, mathematics, and adjacent psychology.

The site is built with Jekyll and published under the `/blogs` path on GitHub
Pages.

## Local development

```sh
bundle install
bundle exec jekyll serve
```

The generated `_site/` directory is intentionally ignored; source content lives
in `_posts/`, `_drafts/`, and top-level pages.

Many technical posts include a runnable Node audit block. To run the embedded
audit for one or more posts from the repository root:

```sh
node scripts/run-post-audit.js _posts/2026-06-18-the-best-candidate-waits-for-a-record.markdown
```

Use `--quiet` for compact pass/fail output across several posts.
