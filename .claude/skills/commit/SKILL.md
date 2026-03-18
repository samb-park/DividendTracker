---
name: commit
description: Create well-structured git commit messages following DividendTracker's commit style. Activates when the user asks to commit changes or requests a commit message.
---

# Commit Skill

Create commit messages that follow DividendTracker's established style.

## When This Skill Activates

- User says: "commit", "create a commit", "write a commit message"
- After completing a feature, fix, or refactor

## DividendTracker Commit Style

Based on the project's git history, commits follow **Conventional Commits** with descriptive summaries:

```
<type>: <short imperative description>
```

### Types

| Type | When to Use |
|------|------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `perf` | Performance improvement |
| `style` | Formatting, CSS, UI tweaks |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Build, deps, config (no production code) |

### Examples from This Project

```
feat: round 3 — auth hardening, route groups, new features
feat: API auth, cron, CAGR/MDD chart, skeleton loading, accessibility, income prediction
feat: auth, snapshots, error boundaries, cash UI, div growth, contrib room
fix: suppress next-auth debug logs, fix hydration mismatch in dividend chart
update code based on review
```

### Guidelines

- Use imperative mood: "add", "fix", "remove" — not "added", "fixes", "removing"
- Keep subject line ≤ 72 characters
- For multi-part commits, use em dash separator: `feat: X — Y, Z`
- Group related changes in one commit rather than splitting into many tiny commits
- No period at the end of the subject line

### Commit Command

```bash
git commit -m "$(cat <<'EOF'
<type>: <description>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

## Process

1. Run `git diff --staged` to review all staged changes
2. Identify the primary change type (feat/fix/refactor/etc.)
3. Write a concise subject capturing the essence of the change
4. For large changesets, list key items after an em dash
5. Always include the Co-Authored-By trailer
