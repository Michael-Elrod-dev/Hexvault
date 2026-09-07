# Security Policy

## Supported versions

Only the most recent release gets fixes. Earlier versions are not patched.

## Reporting a vulnerability

Use the **Report a vulnerability** button on the [Security tab](https://github.com/Michael-Elrod-dev/Hexvault/security/advisories/new). The report stays private and only the maintainer can read it. Do not open a public issue for a security problem.

One person maintains this project, but expect a reply within 48 hours. A valid report is fixed in the next release, and you are credited in the advisory unless you ask not to be. An invalid one gets an explanation of why.

## Known behavior

These are documented design choices. Reports about them will be closed.

- **Credentials decrypt for the signed in Windows user.** Storage uses DPAPI in user scope, so any program running under the same Windows account can decrypt `config.json` by calling the same API. The protection covers other Windows accounts, backups, disk images, and copies moved to another machine.
- **Copied values land on the Windows clipboard.** Any running program can read it. Hexvault marks its copies to stay out of clipboard history and cloud sync, and clears them after 30 seconds.
- **The installer is not code-signed.** SmartScreen shows an unknown publisher. Each release publishes a SHA-256 to check the download against.
- **The Riot API key sits in a plaintext `.env`.** The key is rate limited, reads public rank data, and grants no access to a Riot account.

## Scope

The app, the installer, and everything in this repository are in scope. Riot's API, the Data Dragon CDN, WebView2, and Windows itself are not.
