{
  description = "MCP server for Japanese technical book bibliographic search";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages.default = pkgs.buildNpmPackage {
          pname = "techbook-mcp";
          version = "0.1.0";
          src = ./.;
          # After running `npm install` to generate package-lock.json,
          # run `nix build 2>&1 | grep "got:"` and paste the hash here.
          npmDepsHash = pkgs.lib.fakeHash;
          buildPhase = ''
            npm run build
          '';
          installPhase = ''
            mkdir -p $out/lib
            cp -r dist $out/lib/dist
            cp package.json $out/lib/
            makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/techbook-mcp \
              --add-flags "$out/lib/dist/main.js"
          '';
          nativeBuildInputs = [ pkgs.makeWrapper ];
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.nodejs_22
            pkgs.bun
            pkgs.deno
          ];
          shellHook = ''
            echo "techbook-mcp dev shell"
            echo "  Node.js $(node --version)"
            echo "  Bun     $(bun --version)"
            echo "  Deno    $(deno --version | head -1)"
          '';
        };
      }
    );
}
