# Teo's Research Notebook

Personal essays and experiments on AI, machine learning, computer science,
statistics, mathematics, and adjacent psychology.

The site is built with Jekyll and published under the `/blogs` path on GitHub
Pages.

The previous blog posts have been removed. The homepage and Topics page display
an empty state until new posts are added.

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

Use `--quiet` for compact per-post pass/fail output and a final total. To run
every embedded audit for a publishing day:

```sh
node scripts/run-post-audit.js --quiet --date 2026-06-18
```

To run every discovered embedded audit:

```sh
node scripts/run-post-audit.js --quiet --all
```

To inspect the discovered audit set without running it:

```sh
node scripts/run-post-audit.js --list --all
```

To find posts that reference a JavaScript lab but do not expose a runnable
embedded audit:

```sh
node scripts/run-post-audit.js --missing --all
```

To focus on posts currently changed in the worktree:

```sh
node scripts/run-post-audit.js --list --changed
node scripts/run-post-audit.js --missing --changed
```
