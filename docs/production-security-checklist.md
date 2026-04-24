# Production Security Checklist

- Enforce HTTPS at the edge and redirect all HTTP traffic to HTTPS.
- Keep `.env` only in the deployment platform or server environment; never expose it through static hosting.
- Serve uploaded files through explicit application routes only; do not enable directory listing.
- Use a database account with least privilege.
- Restrict file permissions on private upload storage to the application user only.
- Set `DATA_ENCRYPTION_KEY`, `JWT_SECRET`, and third-party secrets from the deployment platform.
- Rotate session state after login, logout, password change, or suspected compromise.
- Configure `TWILIO_*` secrets only if parent SMS notifications are required in production.
- Review CORS allowlists and disable preview-origin exceptions unless they are intentionally needed.
- Run `npm test` in `saas-backend`, `node scripts/check-security-regressions.cjs`, and `node scripts/validate-production-security.cjs` before release.
