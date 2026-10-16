# Hosted lab

[quakes.steph4n.dev](https://quakes.steph4n.dev/) hosts the public lab through Sites. The independent GitHub publication repository and Site opened together on October 16, 2026, following qualification and the maintainer's explicit instruction. The original development repository and full archive remain private. See the [release checklist](../RELEASE_CHECKLIST.md).

## Hosting identity and access

The tracked [hosting manifest](../.openai/hosting.json) identifies the existing Site. Reuse that ID; do not create another Site when updating this application.

| Resource | Value |
| --- | --- |
| Sites project | `appgprj_6ad18eeb76088191ad8fbb1a156f6a60` |
| Custom hostname | `quakes.steph4n.dev` |
| Generated fallback | `earthquake-lab.steph4n1.chatgpt.site` |
| Static directory | `dist` |
| Audience | Public viewing; no sign-in required |
| External visitors at setup | Zero |

The Site was initially deployed owner-private and the anonymous sign-in gate was verified. The coordinated launch changed its viewing audience to public while retaining its project identity, deployment provenance and editor restrictions. The custom hostname and TLS certificate remain active. Anonymous delivery must be verified independently of any Site service credential.

The host serves static assets. Calculations remain local in the browser's module Worker and WebAssembly. Hosting does not move earthquake calculations to a Cloudflare server or add a database, account system inside the application, or network data acquisition.

## Update the existing Site

Use the installed Sites skill and native Sites tools for the current supported workflow. Read and preserve the current Site audience unless the maintainer explicitly requests a change. The hosting manifest contains configuration, never credentials.

Keep the GitHub checkout and Sites source checkout separate. They have different Git histories. Do not run the Sites source helper from the GitHub checkout or push one repository's history over the other. Open the existing Sites source in an empty, dedicated directory and retain the helper's returned checkout path.

Apply the qualified application source to that checkout while preserving its `.git` directory and `.openai/hosting.json` identity. Exclude `.audit`, credentials, environment files, generated dependency trees and local build caches. Build with the [documented toolchain](development.md), check the complete [verification procedures](verification.md), and compare the actual output identities.

The source helper owns preparation, commit, push and packaging for the Sites repository. Pass its write credential through hidden stdin, never command arguments, source files, browser code or logs. For the public audience, use its returned full source commit and unchanged archive with native `save_site_version`, then `deploy_site_version` for that saved version. The owner-private save-and-deploy operation is only appropriate for a confirmed owner-private audience. Retain returned version and deployment IDs. A pending deployment needs its existing deployment status; a successful one does not need another publication.

The initial hosted application came from GitHub revision `b5351f239c550e5146d92a55df2fefd5fac95d72`. Its independent Sites source commit is `e7b5d76d4f1fc3b9dc0c4480b3c98156055a2c0a`. Matching application and distribution byte checks connect these two source histories. Later verification-only changes do not imply a new hosted application build.

## DNS and qualification

Cloudflare hosts the active `steph4n.dev` zone. The new DNS-only CNAME points `quakes.steph4n.dev` to the exact target returned by Sites, currently `custom-domains.chatgpt.site`. Sites also returned TXT ownership and certificate-validation records. Keep those records for ongoing ownership and renewal. Reconcile returned values before editing DNS; do not overwrite unrelated records or change the parent zone's routing.

After a domain change, require active hostname status, active TLS status and the expected DNS target. Verify the selected audience on both custom and native domains: public visitors must receive the application and assets without credentials; an owner-private Site must require sign-in. A generic Cloudflare bot rejection does not prove owner-only authorization. Service access, if supplied by native Sites for private qualification, belongs only in its documented authorization header to this Site and does not represent an interactive owner login or anonymous public access.

Before a future visibility change or release, preserve the data-distribution review, matching corresponding source and notices, and exact-candidate qualification. Change Site or repository visibility only on explicit maintainer instruction. A public DNS hostname alone does not establish that the application content is public.
