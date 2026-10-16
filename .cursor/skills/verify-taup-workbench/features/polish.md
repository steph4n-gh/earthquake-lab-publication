# Selected recording and release polish

Run `npm run verify:polish` after a production build. The helper owns port 5198 and writes `.audit/open-source-readiness/polish/` unless `TAUP_PORT` or `TAUP_EVIDENCE` overrides it.

Select Tohoku and TATO. Check every P and S branch in both recording windows at desktop, the narrow desktop pane, and a 390-pixel touch layout. The one top caption must identify the selected phase and one-based branch. Its text stays inside the SVG. Check PKIKP at LVC, an unsupported phase, and pending calculation text.

Every in-window `line[data-kind="prediction"]` retains its exact phase, phase-local `data-branch`, and catalog-relative `data-time-s`. Its SVG title identifies modeled time. Selection changes emphasis and the caption, not numerical arrival time. Compare against independently executed native roots. Keep the archived pick, original recording projection, and playhead checks. The current branch control remains the accessible way to inspect every root.

Require a PASS report, zero captured errors, and retained desktop and mobile captures. Check the actual narrow-layout image. A 390-pixel desktop context is not a physical-phone result.

For release preparation, run `npm run check:project`, `npm test`, and `npm run verify:distribution`. The project check rejects missing, absolute, outside, and ignored local Markdown targets. The distribution check reads the post-build notices and fails if any required file is absent or changed. It must not repair output. Source archives require `git init` before the Git-based documentation check.

Read [the verification guide](../../../../docs/verification.md) for all investigation and scientific gates. Preserve historical negative results and separate data-rights questions in the [release checklist](../../../../RELEASE_CHECKLIST.md).
