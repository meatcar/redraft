{ inputs, ... }:
{
  imports = [
    inputs.flake-root.flakeModule
    inputs.treefmt-nix.flakeModule
  ];
  perSystem =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      treefmt.config = {
        inherit (config.flake-root) projectRootFile;
        package = pkgs.treefmt;
        settings.formatter.oxfmt.command = lib.mkForce "./node_modules/.bin/oxfmt";
        # treefmt walks git when the tree is a repo, and the whole directory when it
        # is not -- which a freshly `nix flake init`ed project is. Without these it
        # reformats node_modules on the first `check`.
        settings.global.excludes = [
          "node_modules/**"
          "coverage/**"
          "dist/**"
          ".direnv/**"
          "*.lock"
          "*.lockb"
          "flake.lock"
          "CHANGELOG.md"
        ];
      };
      formatter = config.treefmt.build.wrapper;
      # NOTE: npm dependencies are unavailable in Nix builds; bun run check validates oxfmt.
      checks.treefmt = lib.mkForce (
        (config.treefmt.build.check config.treefmt.projectRoot).overrideAttrs {
          TREEFMT_FORMATTERS = "nixfmt,deadnix,statix";
        }
      );
      treefmt.config.programs = {
        ## Nix
        # format nix files
        nixfmt.enable = true;
        # remove unused nix variables (skip with `# deadnix: skip`)
        deadnix.enable = true;
        # highlight antipaterns in nix code
        statix.enable = true;
        ## Everything else
        oxfmt.enable = true;
      };
    };
}
