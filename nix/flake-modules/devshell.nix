{
  imports = [
    ./treefmt.nix
  ];
  perSystem =
    {
      pkgs,
      config,
      ...
    }:
    {
      legacyPackages = pkgs;
      devShells.default = pkgs.mkShell {
        name = "redraft";
        inputsFrom = [
          config.flake-root.devShell
          config.treefmt.build.devShell
        ];
        buildInputs =
          with pkgs;
          (builtins.attrValues config.treefmt.build.programs)
          ++ [
            nil # nix lsp
          ]
          ++ [
            bun
            git-cliff
          ];
      };
      checks.devshell = config.devShells.default.overrideAttrs (old: {
        name = "devshell-check";
        nativeBuildInputs = old.nativeBuildInputs ++ [ pkgs.python3Packages.pytest ];
        buildPhase = ''
          cp -r ${../..} project
          chmod -R u+w project
          cd project
          export HOME="$TMPDIR/home"
          mkdir -p "$HOME"
          eval "$shellHook"
          pytest -q tests/test_devshell.py
          touch "$out"
        '';
      });
    };
}
