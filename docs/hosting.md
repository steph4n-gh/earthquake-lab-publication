# Private hosted preview

[quakes.steph4n.dev](https://quakes.steph4n.dev/) hosts the lab through Sites. The GitHub repository and Site remain private. Public opening is a coordinated maintainer decision after the [release checklist](../RELEASE_CHECKLIST.md).

## Hosting identity and access

The tracked [hosting manifest](../.openai/hosting.json) identifies the existing Site. Reuse that ID; do not create another Site when updating this application.

| Resource | Value |
| --- | --- |
| Sites project | `appgprj_6ad18eeb76088191ad8fbb1a156f6a60` |
| Custom hostname | `quakes.steph4n.dev` |
| Generated fallback | `earthquake-lab.steph4n1.chatgpt.site` |
| Static directory | `dist` |
| Audience | Owner only, through ChatGPT sign-in |
| External visitors at setup | Zero |

Sites reported a successful private deployment. The custom hostname and TLS certificate both reached active status. An anonymous browser displayed the platform's sign-in screen. Completing interactive owner sign-in requires the owner's browser session; local application qualification and the platform deployment result are separate evidence.

The host serves static assets and the platform access gate. Calculations remain local in the browser's module Worker and WebAssembly. Hosting does not move earthquake calculations to a Cloudflare server or add a database, account system inside the application, or network data acquisition.

## Update the existing Site

Use the installed Sites skill and native Sites tools for the current supported workflow. Read the current Site audience and preserve owner-only access. The hosting manifest contains configuration, never credentials.

Keep the GitHub checkout and Sites source checkout separate. They have different Git histories. Do not run the Sites source helper from the GitHub checkout or push one repository's history over the other. Open the existing Sites source in an empty, dedicated directory and retain the helper's returned checkout path.

Apply the qualified application source to that checkout while preserving its `.git` directory and `.openai/hosting.json` identity. Exclude `.audit`, credentials, environment files, generated dependency trees and local build caches. Build with the [documented toolchain](development.md), check the complete [verification procedures](verification.md), and compare the actual output identities.

The source helper owns preparation, commit, push and packaging for the Sites repository. Pass its write credential through hidden stdin, never command arguments, source files, browser code or logs. Use its returned full source commit and unchanged archive with the native private save-and-deploy operation. Retain returned version and deployment IDs. A pending deployment needs its existing deployment status; a successful one does not need another publication.

The initial hosted application came from GitHub revision `b5351f239c550e5146d92a55df2fefd5fac95d72`. Its independent Sites source commit is `e7b5d76d4f1fc3b9dc0c4480b3c98156055a2c0a`. Matching application and distribution byte checks connect these two source histories. Later verification-only changes do not imply a new hosted application build.

## DNS and qualification

Cloudflare hosts the active `steph4n.dev` zone. The new DNS-only CNAME points `quakes.steph4n.dev` to the exact target returned by Sites, currently `custom-domains.chatgpt.site`. Sites also returned TXT ownership and certificate-validation records. Keep those records for ongoing ownership and renewal. Reconcile returned values before editing DNS; do not overwrite unrelated records or change the parent zone's routing.

After a domain change, require active hostname status, active TLS status and the expected DNS target. Test the anonymous sign-in gate separately from authenticated application delivery. A generic Cloudflare bot rejection does not prove owner-only authorization. Service access, if supplied by native Sites, belongs only in its documented authorization header to this Site and does not represent an interactive owner login.

Before making access public, resolve the data-distribution review, provide matching corresponding source and notices, requalify the exact candidate, and change both Site and repository visibility only on explicit maintainer instruction. A public DNS hostname does not make the Site's application content public.
