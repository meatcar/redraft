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
