"""Pinned SDK validation; HTTP, model and consensus are mocked in contract_cases.py."""
import argparse
import json
import sys
from pathlib import Path
import numpy  # required before loading the pinned runtime

sys.dont_write_bytecode = True
parser = argparse.ArgumentParser()
parser.add_argument("--linter-src", required=True)
parser.add_argument("--runtime-cache", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(args.linter_src).resolve()))
from genvm_linter.lint.linter import lint_contract
from genvm_linter.validate.sdk_loader import setup_wasi_mocks, load_contract_module, find_contract_class, _import_get_schema
contract_path = root / "contracts/terms_guard_social.py"
lint = lint_contract(contract_path)
assert lint.ok, lint.to_dict()
cache = Path(args.runtime_cache)
runner = json.loads((cache / "py-genlayer/1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6/runner.json").read_text())
std = next(x["Depends"].split(":")[1] for x in runner["Seq"] if "Depends" in x and x["Depends"].startswith("py-lib-genlayer-std:"))
sys.path.insert(0, str(cache / "py-lib-genlayer-std" / std))
for directory in (cache / "py-lib-protobuf").iterdir():
    sys.path.insert(0, str(directory))
setup_wasi_mocks()
get_schema = _import_get_schema()
module = load_contract_module(contract_path)
schema = get_schema(find_contract_class(module))
print(json.dumps({"linter":lint.to_dict(),"schema_methods":list(schema["methods"])}))
exec((root / "tests/contract_cases.py").read_text(encoding="utf-8-sig"))
