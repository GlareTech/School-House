# Security review

This review covers authentication, cross-origin access, module controls, file delivery, uploads, role permissions, Firebase deployment, and the email/SMS delivery path. It is a source review and automated dependency check; production network, provider-account, and penetration testing still belong in deployment acceptance.

## Applied controls

- Session identifiers remain in opaque, HTTP-only cookies. State-changing requests require a CSRF token.
- Session cookies now request high browser priority. SameSite and Secure behavior remain deployment-controlled and invalid `SameSite=None` combinations fail at startup.
- Cross-origin responses echo only the deployment-owned `APP_ORIGINS` allowlist and handle browser preflight requests.
- `COOKIE_SAME_SITE` is configurable. `none` is rejected unless secure cookies are also enabled.
- Environment feature switches are server-side gates. Disabled modules disappear from navigation and dashboards, and their API endpoints return 404.
- `config/features.json` is the single readable feature-control file. Environment values can lock an override without exposing secrets in that file.
- Staff access continues to use permission checks plus assigned class and course scope. Library queries and file authorization preserve exact class/subject pairs, preventing a subject assignment in one class from exposing same-subject resources targeted to another class.
- Uploaded PDFs, PNGs, and JPEGs are checked by their actual file signatures rather than trusting the file name or browser MIME type.
- Upload authentication, origin and CSRF checks now run before Express buffers a file body. The gateway and API both enforce the same 10 MB limit.
- Principal signatures require authentication through `/api/files`; only the logo and watermark are public assets.
- Library PDFs are sent inline through an authenticated viewer with browser download controls hidden. Assignment attachments and submission files obey the assignment feature switch.
- Login throttling, Helmet security headers, Content Security Policy, audit logging, and SQL-backed sessions remain enabled.
- Communication creation requires a dedicated permission. Whole-school sends are administrator-only; staff remain class-scoped. Recipient contacts are masked in delivery history and replaced by availability flags in the picker.
- Communication messages have bounded subjects/bodies, validated one-line sender fields, destination validation, per-sender campaign throttling, audience limits, idempotency keys, delivery timeouts and bounded retries. Console delivery is blocked in production. Generic SMS and cloud sync require HTTPS outside tests.
- Communication tables add foreign keys, uniqueness rules, positive counts, non-negative attempts, and allowlists for audience, recipient, channel and state values.
- The package vulnerability audit reports no known vulnerabilities at packaging time. `nodemailer` was upgraded to the current fixed major used by this source package.

## Findings corrected in this release

| Severity | Finding | Correction |
|---|---|---|
| High | An unauthenticated request could reach the raw upload body parser before access checks, allowing unnecessary memory use. | Authentication, trusted-origin and CSRF checks now precede raw-body buffering. |
| High | A principal signature file could be fetched too broadly by authenticated accounts. | Students require a published personal report and staff require report permission. |
| Medium | The gateway body limit was smaller than the application upload limit. | Both now use 10 MB, preventing unexplained gateway rejection. |
| Medium | A recipient search response could expose raw student and guardian contact destinations. | The response now contains availability booleans only; delivery history remains masked. |
| Medium | Mail/SMS provider inputs lacked complete header/sender validation. | Sender values reject line breaks and unsupported characters; Twilio numbers are validated. |
| Medium | Communication state strings were enforced only in application code. | Both PostgreSQL and SQL Server migrations include database check constraints. |

## SaaS deployment boundary

Use HTTPS through the supplied gateway or another trusted reverse proxy. Set the exact public application origin in `APP_ORIGINS` and keep that value under deployment control. A separate cross-site HTTPS frontend may require `COOKIE_SAME_SITE=none` together with `COOKIE_SECURE=true`. Keep database and Redis ports private; publish only the web gateway.

The local preview script intentionally binds to `127.0.0.1`. It is for validation on the server computer and is not a remote-access deployment.

## PDF viewing limitation

The application removes the normal download action, disables range delivery, and sends library PDFs inline. Any user who can view document pixels can still take screenshots, photograph the screen, or use advanced browser tools to retain content. Use visible watermarks, access logs, and policy controls when the material is sensitive.

## Operational checks

Rotate production secrets, back up the SQL database and upload volume, test restores, terminate HTTPS at the gateway, and review access logs regularly. Never place `.env`, database backups, or uploaded school records in source archives.

Restrict provider accounts to send-only access, set provider-side spending/rate limits, protect sender reputation, and review failed deliveries. Guardian consent and local messaging rules remain the school's operational responsibility; the application provides per-student and per-guardian channel preferences for enforcement.
