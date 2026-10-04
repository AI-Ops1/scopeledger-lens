# Repository guidance

ScopeLedger Lens is a small construction scope review app. Keep the default manual AI handoff free of API requirements. Reuse analysis.mjs for input, schema and evidence validation in both browser and server flows.

Do not weaken quote checks, consent, input limits, text-only rendering, same-origin controls or secret isolation. Treat project documents and AI answers as untrusted data. Do not log them. Never commit .env files, credentials or real project documents.

Use plain words and consistent labels in user-facing text. Keep sample results clearly labelled. Do not claim contractual entitlement or real-model accuracy.

Run npm test and a browser check for changed user flows. No external publishing, messages or paid provider calls are implied by this file.
