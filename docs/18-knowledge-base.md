# 18 — Knowledge Base (separate repository)

[← Back to PLAN.md](../PLAN.md)

---

## 18.1 Decision

The portfolio **will not** contain a knowledge base. It lives in a separate GitHub repository.

Reasons:

- Different content type — reference material, not narrative
- Different audience — future me, not recruiters
- Different lifecycle — edited constantly, never "published"
- Different format — plain Markdown in Git, no CMS, no review, no polish
- Keeping it out preserves the portfolio's content-first, minimal character

The portfolio simply links to the repository.

---

## 18.2 Structure

```
knowledge-base/
├── frontend/
├── backend/
├── database/
├── ai/
├── system-design/
├── security/
├── networking/
└── devops/
```

All content is structured Markdown. Purpose: reference material, notes, cheat sheets and
architecture documentation.

---

## 18.3 Relationship to TIE

They are easy to confuse, so the boundary is explicit:

| | TIE (portfolio) | Knowledge base (repo) |
| --- | --- | --- |
| Form | A short entry about something explored | A reference page on a topic |
| Voice | First person, dated, narrative | Neutral, timeless, factual |
| Lifecycle | Written once, rarely edited | Edited continuously |
| Audience | Visitors and recruiters | Me |
| Home | Payload CMS → katbose.dev | Markdown in GitHub |

Rule of thumb: *"Today I learned X while doing Y"* is TIE. *"How X works"* is knowledge base.

---

## 18.4 Future: indexing it into Ask AI

Optional, after Phase 3 is stable.

```
knowledge-base repo
   └─ scheduled job walks *.md
        └─ push documents to Cloudflare AI Search with source: "knowledge-base"
             └─ same nightly reconciliation sweep keeps it in step
```

Requirements before enabling this:

- Citations must clearly distinguish knowledge-base notes from published articles — a rough note
  must never be presented as a considered position
- The same stale-document purge applies when files are deleted
- The global daily query cap already covers the extra corpus; no separate budget is needed

Until then, Ask AI indexes portfolio content only, and the portfolio links out to the repository.
