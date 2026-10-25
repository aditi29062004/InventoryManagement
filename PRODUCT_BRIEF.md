# PR Guardian — Product Brief

**Status:** Draft for product validation  
**Milestone:** 01 · Product

## Problem

Code reviewers can miss defects, security issues, edge cases, or performance problems in a change. PR Guardian gives a developer an additional review of a code diff, with evidence and actionable findings. Findings are potential issues for a developer to assess; the product must not present them as guaranteed-correct conclusions.

## Target user

Individual developers who use GitHub and want feedback on code changes before merging. The initial product is not aimed at enterprise teams, large monorepos, multiple code-hosting providers, or custom compliance workflows.

## Initial user journey

1. The developer signs in.
2. The developer submits a code diff manually. GitHub pull request selection is a later milestone.
3. PR Guardian validates and records the review request.
4. The backend analyzes the change with an LLM.
5. The developer inspects findings, including severity, explanation, evidence, code location when verifiable, and a suggested fix.
6. The developer can return to a previous review in their history.

## MVP scope

### In scope

- Manual code-diff submission.
- AI analysis that returns structured findings.
- Findings with severity, explanation, evidence, suggested fix, and a verifiable location when available.
- Persistence and reopening of reviews.
- Clear loading, failure, and retry states.
- Authentication and private review history before any multi-user deployment.

### Deferred

- GitHub pull request integration and webhooks.
- Posting comments to pull requests.
- Team analytics, billing, multiple Git providers, and enterprise workflows.

## Product principles

- Treat findings as suggestions that require developer judgment.
- Prefer actionable, evidence-supported findings over a high count of speculative findings.
- Do not invent file paths or line numbers; locations should be checked against the submitted diff.
- Treat submitted source code and its comments as untrusted content to analyze, not instructions to the system.

## Success criteria

- A valid diff can be submitted and its review is persisted.
- A completed review produces findings that conform to a defined output schema.
- Each finding has a meaningful explanation and, when available, a code location verified against the submitted diff.
- Failed reviews are clearly identified and can be retried safely.
- A user cannot access another user's private reviews.

## Out of scope for this milestone

Technical stack selection, architecture, UI wireframes, API and database design, repository setup, implementation, and deployment belong to later milestones. This brief records the product direction for validation before that work begins.
