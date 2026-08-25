def test_create_project_and_commitment(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/terms_guard.py")
    direct_vm.sender = direct_alice

    project_id = contract.create_project(
        "Example Protocol",
        "https://example.com/terms",
        "Terms",
    )
    assert project_id == 0
    project = contract.get_project(0)
    assert project.name == "Example Protocol"
    assert project.status == "PENDING"

    commitment_id = contract.add_commitment(
        0,
        "Publish the API documentation before the next major release.",
        "2026-10-01",
    )
    assert commitment_id == 0
    commitment = contract.get_commitment(0)
    assert commitment.project_id == 0
    assert commitment.status == "OPEN"
