{
  description = "Redraft: select text, get three AI rewrites grounded in your notes";

  inputs = {
    # see docs at https://flake.parts/
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:nixos/nixpkgs/nixos-26.05";
    nixpkgs-unstable.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-root.url = "github:srid/flake-root"; # needed by treefmt-nix
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      flake = { };
      imports = [
        inputs.flake-root.flakeModule
        inputs.treefmt-nix.flakeModule
        ./nix/flake-modules/pkgs.nix
        ./nix/flake-modules/devshell.nix
      ];
      systems = [ "x86_64-linux" ];
    };
}
