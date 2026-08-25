# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


@allow_storage
@dataclass
class Project:
    name: str
    url: str
    category: str
    baseline: str
    status: str
    score: u8
    summary: str


@allow_storage
@dataclass
class Commitment:
    project_id: u32
    statement: str
    deadline: str
    status: str
    score: u8
    evidence: str


@allow_storage
@dataclass
class Verification:
    project_id: u32
    kind: str
    item_id: u32
    status: str
    score: u8
    summary: str
    evidence: str


class TermsGuard(gl.Contract):
    """Semantic commitment and policy verification registry.

    The contract stores bounded snapshots and consensus-backed verdicts.
    Large raw pages are intentionally truncated; the purpose is to preserve
    an auditable decision trail rather than archive entire websites.
    """

    projects: DynArray[Project]
    commitments: DynArray[Commitment]
    verifications: DynArray[Verification]

    def __init__(self):
        self.projects = DynArray()
        self.commitments = DynArray()
        self.verifications = DynArray()

    @gl.public.view
    def get_project_count(self) -> u32:
        return u32(len(self.projects))

    @gl.public.view
    def get_project(self, project_id: u32):
        if project_id >= len(self.projects):
            return Project("", "", "", "", "UNKNOWN", u8(0), "")
        return self.projects[project_id]

    @gl.public.view
    def get_commitment_count(self) -> u32:
        return u32(len(self.commitments))

    @gl.public.view
    def get_commitment(self, commitment_id: u32):
        if commitment_id >= len(self.commitments):
            return Commitment(u32(0), "", "", "UNKNOWN", u8(0), "")
        return self.commitments[commitment_id]

    @gl.public.view
    def get_verification_count(self) -> u32:
        return u32(len(self.verifications))

    @gl.public.view
    def get_verification(self, verification_id: u32):
        if verification_id >= len(self.verifications):
            return Verification(u32(0), "", u32(0), "UNKNOWN", u8(0), "", "")
        return self.verifications[verification_id]

    @gl.public.write
    def create_project(self, name: str, url: str, category: str) -> u32:
        if len(name.strip()) == 0:
            raise gl.UserError("Project name is required")
        if not (url.startswith("http://") or url.startswith("https://")):
            raise gl.UserError("URL must start with http:// or https://")

        self.projects.append(
            Project(
                name=name[:80],
                url=url[:300],
                category=category[:40],
                baseline="",
                status="PENDING",
                score=u8(0),
                summary="Baseline not captured yet.",
            )
        )
        return u32(len(self.projects) - 1)

    @gl.public.write
    def capture_baseline(self, project_id: u32) -> str:
        if project_id >= len(self.projects):
            raise gl.UserError("Project not found")

        url = self.projects[project_id].url

        def fetch_page() -> str:
            response = gl.nondet.web.get(url)
            return response.body.decode("utf-8")[:18000]

        baseline = gl.eq_principle.strict_eq(fetch_page)
        self.projects[project_id].baseline = baseline
        self.projects[project_id].status = "BASELINED"
        self.projects[project_id].score = u8(100)
        self.projects[project_id].summary = "Consensus-checked baseline captured."
        return "BASELINE_CAPTURED"

    @gl.public.write
    def add_commitment(self, project_id: u32, statement: str, deadline: str) -> u32:
        if project_id >= len(self.projects):
            raise gl.UserError("Project not found")
        if len(statement.strip()) == 0:
            raise gl.UserError("Commitment statement is required")

        self.commitments.append(
            Commitment(
                project_id=project_id,
                statement=statement[:600],
                deadline=deadline[:40],
                status="OPEN",
                score=u8(0),
                evidence="",
            )
        )
        return u32(len(self.commitments) - 1)

    def _save_verification(
        self,
        project_id: u32,
        kind: str,
        item_id: u32,
        status: str,
        score: int,
        summary: str,
        evidence: str,
    ) -> None:
        self.verifications.append(
            Verification(
                project_id=project_id,
                kind=kind,
                item_id=item_id,
                status=status,
                score=u8(max(0, min(100, score))),
                summary=summary[:500],
                evidence=evidence[:1200],
            )
        )

    @gl.public.write
    def verify_project(self, project_id: u32) -> str:
        if project_id >= len(self.projects):
            raise gl.UserError("Project not found")

        project = self.projects[project_id]
        if len(project.baseline) == 0:
            raise gl.UserError("Capture a baseline first")

        url = project.url
        baseline = project.baseline
        task = """
You are TermsGuard, a semantic policy and public-commitment auditor.
Compare the ORIGINAL BASELINE with the CURRENT PAGE.

Detect material changes to:
- fees/pricing
- eligibility or access
- withdrawal/redemption conditions
- user rights
- privacy/data collection
- governance rights
- token supply/tokenomics
- deadlines and public commitments
- security requirements
- legal obligations

Ignore cosmetic changes, navigation, spelling and timestamps unless they change a rule.
Return ONLY JSON with:
{
  "status": "NO_CHANGE" | "LOW" | "HIGH" | "CRITICAL",
  "score": 0-100,
  "summary": "one concise sentence",
  "evidence": ["up to 4 factual changes"]
}
Score: 95-100 equivalent, 80-94 minor, 60-79 material, 0-59 critical.
Never invent evidence; use only the supplied source text.
"""

        def analyze():
            current = gl.nondet.web.get(url).body.decode("utf-8")[:18000]
            response = gl.nondet.exec_prompt(
                task + "\nORIGINAL BASELINE:\n" + baseline + "\nCURRENT PAGE:\n" + current,
                response_format="json",
            )
            if not isinstance(response, dict):
                raise gl.UserError("LLM returned an invalid object")
            return response

        result = gl.eq_principle.prompt_comparative(
            analyze,
            principle=(
                "status and score bucket must agree semantically; evidence must be grounded; "
                "minor wording differences cannot become HIGH or CRITICAL"
            ),
        )

        status = result.get("status", "LOW")
        if status not in ("NO_CHANGE", "LOW", "HIGH", "CRITICAL"):
            status = "LOW"
        try:
            score = int(result.get("score", 50))
        except Exception:
            score = 50
        score = max(0, min(100, score))
        summary = str(result.get("summary", "Verification completed"))
        evidence = result.get("evidence", [])
        if not isinstance(evidence, list):
            evidence = []
        evidence_text = " | ".join(str(item)[:300] for item in evidence[:4])

        self.projects[project_id].status = status
        self.projects[project_id].score = u8(score)
        self.projects[project_id].summary = summary[:500]
        self._save_verification(
            project_id, "POLICY", project_id, status, score, summary, evidence_text
        )

        return json.dumps(
            {
                "status": status,
                "score": score,
                "summary": summary[:500],
                "evidence": evidence[:4],
            },
            sort_keys=True,
        )

    @gl.public.write
    def verify_commitment(self, commitment_id: u32) -> str:
        if commitment_id >= len(self.commitments):
            raise gl.UserError("Commitment not found")

        commitment = self.commitments[commitment_id]
        project = self.projects[commitment.project_id]
        url = project.url

        task = """
You are an evidence adjudicator. Decide whether the public page currently
supports the supplied project commitment. Do not assume the commitment is true.
Use only the current page text as evidence.
Return JSON:
{
  "status": "FULFILLED" | "PARTIAL" | "OPEN" | "BROKEN" | "UNVERIFIABLE",
  "score": 0-100,
  "summary": "one concise sentence",
  "evidence": ["up to 3 factual evidence points"]
}
FULFILLED means the page clearly supports completion. PARTIAL means some
requirements are met. BROKEN means the page contradicts the commitment.
OPEN means the commitment remains promised but not yet demonstrated.
UNVERIFIABLE means the source lacks enough evidence.
"""

        def adjudicate():
            current = gl.nondet.web.get(url).body.decode("utf-8")[:18000]
            prompt = (
                task
                + "\nCOMMITMENT:\n"
                + commitment.statement
                + "\nDEADLINE:\n"
                + commitment.deadline
                + "\nCURRENT PAGE:\n"
                + current
            )
            response = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(response, dict):
                raise gl.UserError("LLM returned an invalid object")
            return response

        result = gl.eq_principle.prompt_comparative(
            adjudicate,
            principle=(
                "The final status must reflect the actual evidence on the current page. "
                "Do not upgrade OPEN or UNVERIFIABLE without explicit evidence."
            ),
        )

        status = result.get("status", "UNVERIFIABLE")
        allowed = ("FULFILLED", "PARTIAL", "OPEN", "BROKEN", "UNVERIFIABLE")
        if status not in allowed:
            status = "UNVERIFIABLE"
        try:
            score = int(result.get("score", 0))
        except Exception:
            score = 0
        score = max(0, min(100, score))
        summary = str(result.get("summary", "Commitment verification completed"))
        evidence = result.get("evidence", [])
        if not isinstance(evidence, list):
            evidence = []
        evidence_text = " | ".join(str(item)[:300] for item in evidence[:3])

        self.commitments[commitment_id].status = status
        self.commitments[commitment_id].score = u8(score)
        self.commitments[commitment_id].evidence = evidence_text
        self._save_verification(
            commitment.project_id,
            "COMMITMENT",
            commitment_id,
            status,
            score,
            summary,
            evidence_text,
        )

        return json.dumps(
            {
                "status": status,
                "score": score,
                "summary": summary[:500],
                "evidence": evidence[:3],
            },
            sort_keys=True,
        )
