# Build verification and security limits

Redraft's release is one immutable HTML file. Documents, keys, and indexes are not saved into
that file. It has no Redraft API backend: the model endpoint receives your selection,
steering, and any document or context content the model retrieves through tools.

## Reproduce a release

Supported reproduction target: **x86_64-linux with Nix flakes enabled**. Other operating
systems, architectures, and arbitrary Bun versions are not claimed to produce the same bytes.
An x86_64 Linux VM is suitable. You also need Git, Bash, GNU tar/coreutils/findutils, and
network access to the Nix caches and npm registry. GitHub CLI is used only for downloading
and provenance verification.

In a clone of `https://github.com/meatcar/redraft`:

```sh
tag=vX.Y.Z # substitute the release you intend to trust
git fetch origin tag "$tag"
commit=$(git rev-parse "$tag^{commit}")
gh release download "$tag" --repo meatcar/redraft --pattern redraft.html --dir release
gh attestation verify release/redraft.html --repo meatcar/redraft \
  --signer-workflow meatcar/redraft/.github/workflows/release.yml \
  --source-ref "refs/tags/$tag" --source-digest "$commit" --deny-self-hosted-runners
bash scripts/reproduce.sh "$tag" release/redraft.html
```

The script prints SHA-256 hashes and exits nonzero on any byte difference. It leaves the
matching local build at `dist/reproduced.html`. Without the second argument it compares two
fresh builds of the supplied revision (default `HEAD`). It builds the **committed tree**,
not uncommitted changes. Review the script and source of the chosen tag before running them.
These instructions apply to releases containing this script; earlier releases did not have
the independent-rebuild publication gate.

### Inputs and isolation

- `flake.lock` pins nixpkgs and the Bun toolchain (currently Bun 1.3.13). Nix refuses to update
  the flake lock during reproduction. `bun.lock` pins resolved packages and integrity hashes;
  installs use `--frozen-lockfile --ignore-scripts` and fresh, separate caches.
- Each build starts from `git archive` in a different absolute path, without the working
  tree, `node_modules`, `.env`, or build output. The Nix development environment drops the
  caller's environment; Bun gets a fresh home. Source mtimes and timezones differ deliberately.
- `SOURCE_DATE_EPOCH` is the source commit timestamp in both builds. The artifact contains no
  build date, random nonce, hostname, or absolute build path. Script CSP hashes and bundled
  license notices are derived from content; package and license file ordering is sorted.
- The bundler fixes `NODE_ENV` to production, regardless of the caller's environment.
  Tailwind's filesystem scan is bounded to `src/web`, rather than picking up classes from
  unrelated files or a cache elsewhere in the checkout. A regression test changes both
  `NODE_ENV` and unrelated HTML between builds and compares the resulting bytes.
- CI runs the same script and uploads the candidate HTML. Tagged releases first build and
  test, then compare two clean rebuilds against that candidate **on a separate GitHub-hosted
  runner**. Only a successful comparison permits the final job to attest and publish the
  original candidate. Pages copies that release asset without rebuilding it.

This is a controlled, networked Nix **devshell** build, not a hermetic Nix derivation. Nix
store downloads, npm tarballs, Bun, and the host kernel remain trusted inputs. Separate
GitHub runners are not independent build operators. Reproducibility catches differences; it
does not make a compromised compiler or dependency safe.

## Runtime policy

The release build inserts a CSP meta element before executable content:

| Directive                                  | Purpose / exception                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src 'none'`                       | Deny unspecified resources, including frames, objects, fonts, and workers.                                                                                                   |
| `script-src 'sha256-…' 'wasm-unsafe-eval'` | Only the exact bundled inline script; no remote scripts, inline handlers, JavaScript eval, or Function constructors. SQLite requires WebAssembly compilation.                |
| `script-src-attr 'none'`                   | Explicitly reject inline event handlers.                                                                                                                                     |
| `style-src 'unsafe-inline'`                | Tailwind and CodeMirror/Base UI inject styles and inline positions. Remote styles remain blocked.                                                                            |
| `img-src data:`                            | Embedded images only. Inline SVG icons need no resource fetch.                                                                                                               |
| `connect-src https: http: data:`           | Arbitrary user-selected model endpoints, including local HTTP servers; SQLite fetches its embedded data-URL Wasm. No remote executable code is authorized by this directive. |
| `base-uri 'none'; form-action 'none'`      | Block base URL overrides and form submissions.                                                                                                                               |

Zod is configured before app imports, without its optional JIT, so it does not probe JavaScript eval. The generated HTML
test independently recomputes the script hash and checks the single inline-script contract.
This policy is for the **release HTML**, not Bun's development/HMR server.

A static immutable file cannot know the endpoint the user will choose later. Updating a
meta policy cannot loosen an already enforced policy. A restrictive per-endpoint policy
would need a separate isolated execution context or a different distribution design; it is
not implemented. HTTP endpoints can expose prompts and keys on the network. HTTPS is preferred.

**This is not an exfiltration firewall.** Compromised authorized code can send data to other
HTTP(S) hosts, navigate the page, or misuse model tools. `data:` in `connect-src` allows data
fetches, not data scripts. Meta CSP cannot enforce `frame-ancestors`, sandboxing, or reporting;
those need HTTP headers. A host that replaces the HTML can also remove its meta CSP. SRI
cannot authenticate a top-level HTML document. Verify the downloaded bytes before opening
them; ordinary browser visits do not verify GitHub attestations.

## Dependencies and provenance

CI and release workflows audit the complete lockfile with `bun audit --audit-level high`.
Audit requires the advisory service and fails closed if it errors; it cannot detect unknown
vulnerabilities or malicious packages without advisories. Lifecycle scripts are disabled.
An override pins `tinypool` to 2.2.0 to fix GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr in
oxfmt's development dependency. It is not bundled in Redraft. Direct dependency ranges are
retained for Renovate; the frozen lockfile, not those ranges, determines release inputs.
All directly invoked workflow actions are pinned to commit digests.

[GitHub's documented guarantee](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
for artifact attestations on hosted runners is **SLSA v1 Build Level 2**. This workflow does
not claim Level 3: moving attestation to a separate job is not a vetted, isolated reusable
builder with independently enforced build instructions. A trusted reusable builder is a
later step, not needed to enforce byte reproducibility. Attestation proves provenance and
integrity, never benign behavior. The verification command constrains repository, signer
workflow, source tag, source commit, and runner type.

## Browser validation

The hardened artifact was exercised in Chromium, both served over local HTTP and opened
directly via `file:`. Both loaded the editor, indexed a fixture folder using the real
SQLite/Wasm code, discovered a model, and displayed three rewrites from a local
OpenAI-compatible test endpoint, without CSP violations. The file-origin request used
`Origin: null`. Deliberate inline-script injection, remote-script loading, and JavaScript
Function construction were blocked. Desktop, open settings, and narrow-viewport rendering
were inspected. The folder handle and model responses were fixtures; this is not a real
provider or native directory-permission compatibility test. These browser probes were local
validation, not a cross-browser CI suite.

## Remaining risks, in priority order

1. **Shared-origin persistence.** Every `https://meatcar.github.io/*` project shares the same
   origin. Any script running there can read saved documents, steering, and endpoint API keys,
   or modify saved endpoints. Paths, localStorage prefixes, and IndexedDB do not isolate them.
   CSP in Redraft cannot constrain another page. A dedicated origin is the proper hosted fix;
   it requires a domain/deployment decision and is not changed here. Use a verified local file
   or a dedicated trusted origin meanwhile. Neither protects against malicious code in the app
   itself. Browser storage for `file:` URLs varies; do not assume per-file isolation.
2. **Persisted secrets and broad network access.** Session-only keys and opt-in document
   persistence would reduce exposure at rest, but need a product/storage migration and do not
   solve active same-origin compromise. Existing persistence behavior is unchanged. Clear old
   `redraft:` browser storage and rotate exposed keys when changing origins; moving does not
   erase old copies. Custom endpoints must support CORS (often `Origin: null` for local files).
3. **Supply-chain and host trust.** Frozen inputs, audits, CSP, and reproducibility are layered
   checks, not a dependency security review, formal SLSA certification, or a browser trust root.
   Stronger isolation, a trusted Level 3 builder, and independent third-party rebuilds remain.
4. **Hosted enforcement and browser coverage.** No WEBCAT enrollment, custom security headers,
   COOP/COEP, or verified-browser integration is added. GitHub Pages does not provide the header
   controls for that deployment. Local-file behavior, directory permissions, and CORS need
   browser-specific testing. The in-memory SQLite index does not need cross-origin isolation.
