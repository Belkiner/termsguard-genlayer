# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
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
    """
    TermsGuard turns public project statements into a persistent,
    consensus-checked verification history.

    The contract deliberately stores compact semantic facts instead of
    raw web pages. Web/LLM operations are executed only inside
    non-deterministic blocks and are validated through GenLayer's
    comparative equivalence principle.
    """

    projects: DynArray[Project]
    commitments: DynArray[Commitment]
    verifications: DynArray[Verification]

    def __init__(self):
        pass

    # ------------------------------------------------------------------
    # READ METHODS
    # ------------------------------------------------------------------

    @gl.public.view
    def get_project_count(self) -> u32:
        return u32(len(self.projects))

    @gl.public.view
    def get_project(self, project_id: u32) -> Project:
        if project_id >= len(self.projects):
            return Project(
                name="",
                url="",
                category="",
                baseline="",
                status="UNKNOWN",
                score=u8(0),
                summary="",
            )
        return self.projects[project_id]

    @gl.public.view
    def get_commitment_count(self) -> u32:
        return u32(len(self.commitments))

    @gl.public.view
    def get_commitment(self, commitment_id: u32) -> Commitment:
        if commitment_id >= len(self.commitments):
            return Commitment(
                project_id=u32(0),
                statement="",
                deadline="",
                status="UNKNOWN",
                score=u8(0),
                evidence="",
            )
        return self.commitments[commitment_id]

    @gl.public.view
    def get_verification_count(self) -> u32:
        return u32(len(self.verifications))

    @gl.public.view
    def get_verification(self, verification_id: u32) -> Verification:
        if verification_id >= len(self.verifications):
            return Verification(
                project_id=u32(0),
                kind="",
                item_id=u32(0),
                status="UNKNOWN",
                score=u8(0),
                summary="",
                evidence="",
            )
        return self.verifications[verification_id]

    # ------------------------------------------------------------------
    # PROJECT REGISTRY
    # ------------------------------------------------------------------

    @gl.public.write
    def create_project(self, name: str, url: str, category: str) -> u32:
        if len(name.strip()) == 0:
            raise gl.vm.UserError("Project name is required")

        if not (
            url.startswith("http://")
            or url.startswith("https://")
        ):
            raise gl.vm.UserError("URL must start with http:// or https://")

        project = Project(
            name=name[:80],
            url=url[:300],
            category=category[:40],
            baseline="",
            status="PENDING",
            score=u8(0),
            summary="Baseline not captured yet.",
        )

        self.projects.append(project)
        return u32(len(self.projects) - 1)

    # ------------------------------------------------------------------
    # BASELINE
    # ------------------------------------------------------------------

    @gl.public.write
    def capture_baseline(self, project_id: u32) -> str:
        if project_id >= len(self.projects):
            raise gl.vm.UserError("Project not found")

        url = self.projects[project_id].url

        def extract_baseline():
            response = gl.nondet.web.get(url)
            page = response.body.decode("utf-8")[:12000]

            prompt = """
You are extracting a compact audit baseline from a public project page.

Ignore navigation, cookie banners, timestamps, styling and unrelated
marketing language.

Extract only facts that could materially affect a user or project
commitment, including:
- fees and pricing
- eligibility and access requirements
- withdrawal/redemption conditions
- privacy and data collection
- governance rights
- token supply/tokenomics
- roadmap dates
- public deadlines
- security requirements
- important legal or usage conditions

Return ONLY valid JSON in this exact shape:
{
  "facts": [
    {
      "topic": "short topic",
      "fact": "short factual statement"
    }
  ]
}

Maximum 20 facts. Never invent information. If a fact is not present,
do not include it.
"""

            raw = gl.nondet.exec_prompt(
                prompt
                + "\nSOURCE URL:\n"
                + url
                + "\nPAGE:\n"
                + page
            )

            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = {"facts": []}

            if not isinstance(parsed, dict):
                parsed = {"facts": []}

            facts = parsed.get("facts", [])
            if not isinstance(facts, list):
                facts = []

            clean = []
            for item in facts[:20]:
                if not isinstance(item, dict):
                    continue

                topic = str(item.get("topic", "")).strip()[:80]
                fact = str(item.get("fact", "")).strip()[:400]

                if topic and fact:
                    clean.append({
                        "topic": topic,
                        "fact": fact,
                    })

            return json.dumps(
                {"facts": clean},
                sort_keys=True,
            )

        baseline = gl.eq_principle.prompt_comparative(
            extract_baseline,
            principle=(
                "The extracted facts must be grounded in the supplied page. "
                "Ignore cosmetic differences. The important topics and factual "
                "meaning should agree; wording may differ."
            ),
        )

        self.projects[project_id].baseline = str(baseline)[:10000]
        self.projects[project_id].status = "BASELINED"
        self.projects[project_id].score = u8(100)
        self.projects[project_id].summary = (
            "Consensus-checked semantic baseline captured."
        )

        return "BASELINE_CAPTURED"

    # ------------------------------------------------------------------
    # COMMITMENTS
    # ------------------------------------------------------------------

    @gl.public.write
    def add_commitment(
        self,
        project_id: u32,
        statement: str,
        deadline: str,
    ) -> u32:
        if project_id >= len(self.projects):
            raise gl.vm.UserError("Project not found")

        if len(statement.strip()) == 0:
            raise gl.vm.UserError("Commitment statement is required")

        commitment = Commitment(
            project_id=project_id,
            statement=statement[:600],
            deadline=deadline[:40],
            status="OPEN",
            score=u8(0),
            evidence="",
        )

        self.commitments.append(commitment)
        return u32(len(self.commitments) - 1)

    # ------------------------------------------------------------------
    # VERIFICATION HISTORY
    # ------------------------------------------------------------------

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
        safe_score = max(0, min(100, score))

        self.verifications.append(
            Verification(
                project_id=project_id,
                kind=kind[:30],
                item_id=item_id,
                status=status[:30],
                score=u8(safe_score),
                summary=summary[:500],
                evidence=evidence[:1200],
            )
        )

    # ------------------------------------------------------------------
    # POLICY VERIFICATION
    # ------------------------------------------------------------------

    @gl.public.write
    def verify_project(self, project_id: u32) -> str:
        if project_id >= len(self.projects):
            raise gl.vm.UserError("Project not found")

        project = self.projects[project_id]

        if len(project.baseline) == 0:
            raise gl.vm.UserError("Capture a baseline first")

        url = project.url
        baseline = project.baseline

        def analyze():
            response = gl.nondet.web.get(url)
            current_page = response.body.decode("utf-8")[:12000]

            task = """
You are a semantic policy auditor.

Compare the ORIGINAL BASELINE FACTS with the CURRENT PUBLIC PAGE.

Look for material changes involving:
- fees/pricing
- eligibility/access
- withdrawal/redemption conditions
- user rights
- privacy/data collection
- governance rights
- token supply/tokenomics
- deadlines/roadmap commitments
- security requirements
- legal/usage obligations

Ignore cosmetic changes, navigation, spelling and timestamps unless
they change a material rule.

Return ONLY valid JSON:
{
  "status": "NO_CHANGE" | "LOW" | "HIGH" | "CRITICAL",
  "score": 0,
  "summary": "one concise sentence",
  "evidence": ["up to 4 factual changes"]
}

Scoring:
95-100 = no material change
80-94 = minor change
60-79 = material change
0-59 = critical change

Never invent evidence. Every evidence item must be supported by the
current page and/or the supplied baseline.
"""

            raw = gl.nondet.exec_prompt(
                task
                + "\nORIGINAL BASELINE:\n"
                + baseline
                + "\nCURRENT PAGE:\n"
                + current_page
            )

            try:
                result = json.loads(raw)
            except Exception:
                result = {
                    "status": "UNVERIFIABLE",
                    "score": 0,
                    "summary": "The model returned invalid JSON.",
                    "evidence": [],
                }

            if not isinstance(result, dict):
                result = {
                    "status": "UNVERIFIABLE",
                    "score": 0,
                    "summary": "Invalid verification result.",
                    "evidence": [],
                }

            status = str(result.get("status", "UNVERIFIABLE"))
            if status not in (
                "NO_CHANGE",
                "LOW",
                "HIGH",
                "CRITICAL",
                "UNVERIFIABLE",
            ):
                status = "UNVERIFIABLE"

            try:
                score = int(result.get("score", 0))
            except Exception:
                score = 0

            score = max(0, min(100, score))

            summary = str(
                result.get(
                    "summary",
                    "Verification completed.",
                )
            )[:500]

            evidence = result.get("evidence", [])
            if not isinstance(evidence, list):
                evidence = []

            clean_evidence = [
                str(item)[:300]
                for item in evidence[:4]
            ]

            return json.dumps(
                {
                    "status": status,
                    "score": score,
                    "summary": summary,
                    "evidence": clean_evidence,
                },
                sort_keys=True,
            )

        result_raw = gl.eq_principle.prompt_comparative(
            analyze,
            principle=(
                "The status and score category must reflect the same material "
                "semantic conclusion. Evidence must be grounded in the supplied "
                "baseline and current page. Cosmetic wording differences must "
                "not become HIGH or CRITICAL."
            ),
        )

        try:
            result = json.loads(str(result_raw))
        except Exception:
            result = {
                "status": "UNVERIFIABLE",
                "score": 0,
                "summary": "Consensus result could not be parsed.",
                "evidence": [],
            }

        status = str(result.get("status", "UNVERIFIABLE"))

        if status not in (
            "NO_CHANGE",
            "LOW",
            "HIGH",
            "CRITICAL",
            "UNVERIFIABLE",
        ):
            status = "UNVERIFIABLE"

        try:
            score = int(result.get("score", 0))
        except Exception:
            score = 0

        score = max(0, min(100, score))

        summary = str(
            result.get(
                "summary",
                "Verification completed.",
            )
        )

        evidence = result.get("evidence", [])
        if not isinstance(evidence, list):
            evidence = []

        evidence_text = " | ".join(
            str(item)[:300]
            for item in evidence[:4]
        )

        self.projects[project_id].status = status
        self.projects[project_id].score = u8(score)
        self.projects[project_id].summary = summary[:500]

        self._save_verification(
            project_id=project_id,
            kind="POLICY",
            item_id=project_id,
            status=status,
            score=score,
            summary=summary,
            evidence=evidence_text,
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

    # ------------------------------------------------------------------
    # COMMITMENT VERIFICATION
    # ------------------------------------------------------------------

    @gl.public.write
    def verify_commitment(self, commitment_id: u32) -> str:
        if commitment_id >= len(self.commitments):
            raise gl.vm.UserError("Commitment not found")

        commitment = self.commitments[commitment_id]
        project = self.projects[commitment.project_id]
        url = project.url

        def adjudicate():
            response = gl.nondet.web.get(url)
            current_page = response.body.decode("utf-8")[:12000]

            task = """
You are an evidence adjudicator.

Determine whether the CURRENT PUBLIC PAGE provides evidence for the
supplied project commitment.

Allowed statuses:
FULFILLED
PARTIAL
OPEN
BROKEN
UNVERIFIABLE

Definitions:
FULFILLED = the page clearly demonstrates completion.
PARTIAL = some parts are demonstrated but not all.
OPEN = the commitment is still presented as a future/pending promise.
BROKEN = the page contradicts the commitment or shows a failed deadline.
UNVERIFIABLE = the page does not contain enough evidence.

Do not assume a commitment is true.
Do not use outside knowledge.
Do not invent evidence.

Return ONLY valid JSON:
{
  "status": "FULFILLED",
  "score": 0,
  "summary": "one concise sentence",
  "evidence": ["up to 3 factual evidence points"]
}

Use:
90-100 for clearly fulfilled,
60-89 for partial,
30-59 for open,
0-29 for broken or unverifiable depending on evidence.
"""

            raw = gl.nondet.exec_prompt(
                task
                + "\nCOMMITMENT:\n"
                + commitment.statement
                + "\nDEADLINE:\n"
                + commitment.deadline
                + "\nCURRENT PAGE:\n"
                + current_page
            )

            try:
                result = json.loads(raw)
            except Exception:
                result = {
                    "status": "UNVERIFIABLE",
                    "score": 0,
                    "summary": "The model returned invalid JSON.",
                    "evidence": [],
                }

            if not isinstance(result, dict):
                result = {
                    "status": "UNVERIFIABLE",
                    "score": 0,
                    "summary": "Invalid adjudication result.",
                    "evidence": [],
                }

            status = str(result.get("status", "UNVERIFIABLE"))

            if status not in (
                "FULFILLED",
                "PARTIAL",
                "OPEN",
                "BROKEN",
                "UNVERIFIABLE",
            ):
                status = "UNVERIFIABLE"

            try:
                score = int(result.get("score", 0))
            except Exception:
                score = 0

            score = max(0, min(100, score))

            summary = str(
                result.get(
                    "summary",
                    "Commitment verification completed.",
                )
            )[:500]

            evidence = result.get("evidence", [])
            if not isinstance(evidence, list):
                evidence = []

            clean_evidence = [
                str(item)[:300]
                for item in evidence[:3]
            ]

            return json.dumps(
                {
                    "status": status,
                    "score": score,
                    "summary": summary,
                    "evidence": clean_evidence,
                },
                sort_keys=True,
            )

        result_raw = gl.eq_principle.prompt_comparative(
            adjudicate,
            principle=(
                "The final status must be supported by the current page. "
                "FULFILLED requires explicit evidence of completion. "
                "Do not upgrade OPEN or UNVERIFIABLE without evidence. "
                "The score must be consistent with the status."
            ),
        )

        try:
            result = json.loads(str(result_raw))
        except Exception:
            result = {
                "status": "UNVERIFIABLE",
                "score": 0,
                "summary": "Consensus result could not be parsed.",
                "evidence": [],
            }

        status = str(result.get("status", "UNVERIFIABLE"))

        if status not in (
            "FULFILLED",
            "PARTIAL",
            "OPEN",
            "BROKEN",
            "UNVERIFIABLE",
        ):
            status = "UNVERIFIABLE"

        try:
            score = int(result.get("score", 0))
        except Exception:
            score = 0

        score = max(0, min(100, score))

        summary = str(
            result.get(
                "summary",
                "Commitment verification completed.",
            )
        )

        evidence = result.get("evidence", [])
        if not isinstance(evidence, list):
            evidence = []

        evidence_text = " | ".join(
            str(item)[:300]
            for item in evidence[:3]
        )

        self.commitments[commitment_id].status = status
        self.commitments[commitment_id].score = u8(score)
        self.commitments[commitment_id].evidence = evidence_text

        self._save_verification(
            project_id=commitment.project_id,
            kind="COMMITMENT",
            item_id=commitment_id,
            status=status,
            score=score,
            summary=summary,
            evidence=evidence_text,
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
