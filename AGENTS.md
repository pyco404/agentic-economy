# Agentic Economy development workflow

- Use `main` for all new frontend and backend development. Do not create routine development branches or pull requests.
- Preserve existing published history, backup branches, and unfinished working trees. Never force-push, squash existing history, or reset away work.
- Inspect each changed file, run relevant tests, and use one-file-per-commit Conventional Commits wherever feasible. A normal merge preserving an existing branch's commits is an integration exception.
- Routine tested commits and normal pushes to `origin main` are authorized. Before pushing, verify production has no deployment trigger for this repository; do not modify production to satisfy this check.
- Railway staging frontend and backend should deploy compatible versions from `main`. Verify actual deployed commit SHAs, HTTPS/API/WebSocket behavior, and demo-mode restrictions after deployments.
- Do not apply any Railway database migration without separate explicit approval. Inspect pending migrations before changing staging source or deployment settings; an automatic pre-deploy migration command is also a migration.
- Keep production, real launches, payments, treasury signing, and financial routing disabled unless separately authorized.
- If a release prerequisite is missing, complete independent integration and testing, preserve the running staging deployment, and report the precise blocker.
- The original `codex/frontend` workspace contains preserved unfinished city/navigation/terrain work. It is not a source of new development; inspect and port only reviewed completed changes into `main` without overwriting unrelated files.
