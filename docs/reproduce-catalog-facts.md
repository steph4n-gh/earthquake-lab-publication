# Compare catalog facts with their archived source

Use this procedure to audit the compact catalog inputs. Normal offline builds and [observation reproduction](verification.md#reproduce-observations-and-reference-calculations) do not require full source responses.

1. Install the [optional scientific environment](development.md#prepare-optional-scientific-tools).
2. Obtain the original private captures. Keep their original `fixtures/investigation/` and `fixtures/events/<case>/` directory layout below `.cache/source-archives/`.
3. Compare all three inputs with those archived captures.

```sh
.venv/bin/python scripts/catalog_facts.py --source-root .cache/source-archives
```

Expect one `Verified` line per event. The command checks original source sizes and fingerprints, fixed station selection, event-to-phase membership, source counts and selected facts. It compares with the frozen compact input. It does not replace that input.

To check only Tohoku, pass `--case`.

```sh
.venv/bin/python scripts/catalog_facts.py --case tohoku-2011 --source-root .cache/source-archives
```

To request current upstream responses, use the separate reacquisition mode.

```sh
.venv/bin/python scripts/catalog_facts.py --reacquire
```

The command stores full responses and fresh receipts only below an ignored, timestamped `.cache/source-archives/` directory. It never replaces the qualified factual inputs. A source-size or fingerprint change exits with failure and preserves the new capture for inspection. Mutable event endpoints may no longer supply the historical bytes. That failure does not invalidate offline reproduction from the retained facts.

Before accepting new facts, review the captured differences and their source rights. Treat a changed origin, pick, sensor identity or uncertainty as a scientific change. Keep failures and prior qualification evidence. Requalify the resulting source and intended publication history.

Run the distribution gate before committing.

```sh
npm run verify:publication
```

The gate must pass. Never add full responses with `git add -f`. See [the factual-data rationale and history boundary](publication-data.md).
