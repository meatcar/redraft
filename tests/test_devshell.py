import subprocess


def test_bun_runs_the_project():
    result = subprocess.run(
        ["bun", "run", "src/index.ts"],
        check=True,
        capture_output=True,
        text=True,
    )
    assert result.stdout == "Hello, Bun!\n"


def test_bun_test_suite_passes():
    subprocess.run(["bun", "test"], check=True)


def test_treefmt_formats_nix(tmp_path):
    source = tmp_path / "flake.nix"
    source.write_text("{answer=42;}")
    subprocess.run(["treefmt"], cwd=tmp_path, check=True)
    assert source.read_text() == "{ answer = 42; }\n"
    subprocess.run(["treefmt", "--ci"], cwd=tmp_path, check=True)
