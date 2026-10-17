import subprocess


def test_bun_is_available():
    subprocess.run(["bun", "--version"], check=True, capture_output=True)


def test_treefmt_formats_nix(tmp_path):
    source = tmp_path / "flake.nix"
    source.write_text("{answer=42;}")
    command = ["treefmt", "--formatters", "nixfmt,deadnix,statix"]
    subprocess.run(command, cwd=tmp_path, check=True)
    assert source.read_text() == "{ answer = 42; }\n"
    subprocess.run([*command, "--ci"], cwd=tmp_path, check=True)
