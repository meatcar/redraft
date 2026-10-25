import subprocess


def test_bun_is_available():
    subprocess.run(["bun", "--version"], check=True, capture_output=True)


def test_bun_rejects_brotli_block_switch_fixture():
    subprocess.run(
        [
            "bun", "--eval",
            "import { strict as assert } from 'node:assert';"
            "import { brotliDecompressSync } from 'node:zlib';"
            "const stream = Buffer.from('200010414141fcffff07002228f00b60f7f41f000000', 'hex');"
            "assert.throws(() => brotliDecompressSync(stream), { errno: -17 });",
        ],
        check=True,
        capture_output=True,
    )


def test_treefmt_formats_nix(tmp_path):
    source = tmp_path / "flake.nix"
    source.write_text("{answer=42;}")
    command = ["treefmt", "--formatters", "nixfmt,deadnix,statix"]
    subprocess.run(command, cwd=tmp_path, check=True)
    assert source.read_text() == "{ answer = 42; }\n"
    subprocess.run([*command, "--ci"], cwd=tmp_path, check=True)
