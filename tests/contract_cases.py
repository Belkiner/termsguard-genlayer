"""Run after loading `module` and the pinned SDK (see validation instructions).
Uses real SDK storage, with web, model and consensus mocked. Not a network test.
"""
import inspect
import json
from types import SimpleNamespace
import genlayer.gl as gl

source = {"id": "123", "author_id": "99", "username": "builder",
    "text": "We will publish the audit by 2026-10-01.", "created_at": "2026-09-13T12:00:00Z"}
page = "Our audit was published today. Download the final audit report."
answers = []
calls = 0
gl.message = SimpleNamespace(sender_address="0x1111111111111111111111111111111111111111")
gl.message_raw = {"datetime": "2026-09-13T12:00:00Z"}
def web_get(url):
    assert url == "https://termsguard.example/api/social/posts/123"
    return SimpleNamespace(status=200, body=json.dumps(source).encode())
def render(url, *, mode, wait_after_loaded):
    assert mode == "text" and wait_after_loaded == "3s"
    return page
def model(prompt, *, response_format):
    assert response_format == "json"
    return answers.pop(0)
def consensus(callback, principle):
    global calls
    assert "self" not in inspect.getclosurevars(callback).nonlocals
    calls += 1
    return callback()
gl.nondet.web.get = web_get
gl.nondet.web.render = render
gl.nondet.exec_prompt = model
gl.eq_principle.prompt_comparative = consensus
c = gl.storage.inmem_allocate(module.TermsGuardSocial, "https://termsguard.example/api/social/posts")
count = 0
def rejects(fn):
    global count
    try:
        fn()
    except Exception:
        count += 1
    else:
        raise AssertionError("Expected rejection")
def records(): return json.loads(c.get_records(0, 20))["items"]
rejects(lambda: c.capture_promise("bad", 0, len(source["text"]), ""))
rejects(lambda: c.capture_promise("123", 0, len(source["text"]), "2026-02-30"))
rejects(lambda: c.capture_promise("123", 9999, 20, ""))
answers.append({"supported": False})
rejects(lambda: c.capture_promise("123", 0, len(source["text"]), "2027-01-01"))
assert len(records()) == 0
answers.append({"supported": True})
assert c.capture_promise("123", 0, len(source["text"]), "2026-10-01") == 0
before_calls = calls
assert c.capture_promise("123", 0, len(source["text"]), "2026-10-01") == 0
assert calls == before_calls and len(records()) == 1
baseline = records()[0]
gl.message.sender_address = "0x2222222222222222222222222222222222222222"
rejects(lambda: c.verify_promise(0, "https://project.example/audit"))
gl.message.sender_address = baseline["owner"]
rejects(lambda: c.verify_promise(0, "https://x.com/builder/status/123"))
rejects(lambda: c.verify_promise(0, "https://127.0.0.1/audit"))
answers.append({"status":"FULFILLED", "summary":"Audit published.", "quotes":["Our audit was published today."]})
c.verify_promise(0, "https://project.example/audit")
assert records()[0]["status"] == "FULFILLED"
answers.append({"status":"FULFILLED", "summary":"Unsupported output.", "quotes":["A made-up quote"]})
c.verify_promise(0, "https://project.example/audit")
assert records()[0]["status"] == "UNVERIFIABLE"
page = ""
c.verify_promise(0, "https://project.example/audit")
assert records()[0]["status"] == "UNVERIFIABLE"
after = records()[0]
for key in ("quote_sha256", "deadline", "post_id", "owner", "snapshot_sha256"):
    assert after[key] == baseline[key]
assert json.loads(c.get_history(0,20))["total"] == 3
assert json.loads(c.get_history(2,1))["items"][0]["id"] == 2
source["text"] = "We changed the promise."
c.verify_promise(0, "https://project.example/audit")
assert records()[0]["status"] == "UNVERIFIABLE"
assert "changed" in records()[0]["latest"]["summary"]
gl.nondet.web.get = lambda url: SimpleNamespace(status=404, body=b"{}")
c.verify_promise(0, "https://project.example/audit")
assert "unavailable" in records()[0]["latest"]["summary"]
assert "quote" not in records()[0] and "username" not in records()[0]
rejects(lambda: c.get_records(-1, 20))
rejects(lambda: c.get_history(0, 21))
assert not answers
print(json.dumps({"storage_and_validation":"passed", "negative_cases":count,
    "consensus_callbacks_without_storage_self":calls, "mocked_external_services":True}))

