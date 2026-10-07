# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (<https://github.com/Pixerate/critical-path/security/advisories/new>).

Include:
- the affected package(s) and version(s)
- a description of the issue and its impact
- steps to reproduce, or a proof of concept
- any suggested fix

We will acknowledge your report, keep you updated while we investigate, and credit you in the advisory unless you prefer otherwise. Please give us a reasonable amount of time to release a fix before disclosing the issue publicly.

## Supported versions

Critical Path is pre-1.0. Security fixes are released for the **latest published version** of each `@critical-path/*` package and `create-critical-path`. Upgrade to the latest version to receive fixes.

## Scope

In scope:
- the packages in this repository (`packages/*`)
- the example apps and the project scaffolder's generated code

Examples of in-scope issues:
- authorization or tenant-isolation bypasses
- identity spoofing
- injection
- SSRF through webhooks or attachments
- unsafe file storage keys
- leaking secrets

Out of scope: vulnerabilities in your own deployment configuration. For example, an API exposed without `getContext` / `requireAuth`, or without an `authorize` policy, is unauthenticated by design. See the authorization guide in the documentation.

## Security features

Read these when deploying Critical Path:
- [Authentication and request context](./packages/server/README.md) (`getContext`, `requireAuth`, CORS)
- [Authorization and multi-tenancy](./apps/docs/src/content/docs/core/authorization.md) (`authorize`, `createRolePolicy`, `tenantId`)
- [Webhooks](./apps/docs/src/content/docs/core/webhooks.md) (signature verification, private-URL blocking)
