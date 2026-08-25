# Run with:
# gltest tests/integration/ -v -s --network studionet
#
# This file is intentionally small. Real web/LLM consensus should be tested
# against Studio/Testnet after the contract is lint-clean.


def test_contract_can_be_deployed(integration_deploy):
    contract = integration_deploy("contracts/terms_guard.py")
    assert contract is not None
