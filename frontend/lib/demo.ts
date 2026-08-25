import type { Commitment, Project, Verification } from "./types";

export const demoProjects: Project[] = [
  {
    id: 0,
    name: "Northstar Protocol",
    url: "https://example.com/terms",
    category: "Terms",
    baseline: "",
    status: "NO_CHANGE",
    score: 96,
    summary: "No material policy or economic change detected in the latest verification.",
  },
  {
    id: 1,
    name: "Atlas Network",
    url: "https://example.com/docs",
    category: "Roadmap",
    baseline: "",
    status: "HIGH",
    score: 71,
    summary: "A material roadmap condition appears to have changed.",
  },
];

export const demoCommitments: Commitment[] = [
  {
    id: 0,
    projectId: 0,
    statement: "Publish the public API documentation before the next major release.",
    deadline: "2026-10-01",
    status: "FULFILLED",
    score: 94,
    evidence: "Public documentation page is available and references the API release.",
  },
  {
    id: 1,
    projectId: 1,
    statement: "Launch the new developer portal in Q4 2026.",
    deadline: "2026-12-31",
    status: "OPEN",
    score: 58,
    evidence: "Roadmap still lists the milestone, but completion is not demonstrated.",
  },
];

export const demoHistory: Verification[] = [
  {
    id: 0,
    projectId: 0,
    kind: "POLICY",
    itemId: 0,
    status: "NO_CHANGE",
    score: 96,
    summary: "No material change detected.",
    evidence: "Fees, eligibility and governance language remain materially equivalent.",
  },
  {
    id: 1,
    projectId: 1,
    kind: "COMMITMENT",
    itemId: 1,
    status: "OPEN",
    score: 58,
    summary: "The commitment remains publicly stated but is not yet demonstrated.",
    evidence: "Current roadmap contains the target milestone without completion evidence.",
  },
];
