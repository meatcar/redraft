# Sandbox lifecycle

Upstream: github.com:meatcar/nix-templates

Prepares this project in a disposable Linux sandbox. The sandbox provider
runs `.agents/setup` once while provisioning and `.agents/resume` on each wake.

`run.sh` runs each lifecycle in this order. Tasks come from `../Taskfile.yml`.

1. `before_nix`, with only host tools and Task.
2. `provision-nix.sh`, setup only: installs Nix and direnv.
3. `provision-shell.sh`: keeps the devshell active in login shells, after
   environment loaders that providers append.
4. `setup_auth` or `resume_auth` task, in the devshell.
5. `work` task, in a reloaded devshell that sees fetched credentials.
6. `setup_cleanup` task, setup only: runs on success or failure, outside the
   devshell.

Put project behavior in `../Taskfile.yml`. Treat this directory as vendored:
update it by replacing it from `github:meatcar/nix-templates#sandbox`. Report
breakage upstream; a local patch is a stopgap until the fix lands upstream.

Setup output may be shared between users. Fetch per-user credentials in
`resume_auth`; remove setup credentials in `setup_cleanup`.

## Install

The sandbox needs Linux (x86_64 or aarch64), Bash, curl, CA certificates, tar,
gzip, coreutils, and permission to create `/nix`.

1. Run `chmod +x .agents/setup .agents/resume` as `nix flake init` drops
   executable bits.
2. Remove any `.agents/` VCS ignore rule.
3. Fill in the TODO tasks in `.agents/Taskfile.yml`.
4. Add `local>OWNER/REPO//.agents/sandbox/renovate.jsonc` to `extends` in the
   project's Renovate config, with this repository's path, so Renovate updates
   `task.sha256`.
5. Configure the provider to run `.agents/setup` during provisioning and
   `.agents/resume` on wake.
6. Delete this Install section, then commit `.agents/`.
