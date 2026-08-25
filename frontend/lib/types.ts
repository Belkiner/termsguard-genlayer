export type Project = {
  id: number;
  name: string;
  url: string;
  category: string;
  baseline: string;
  status: string;
  score: number;
  summary: string;
};

export type Commitment = {
  id: number;
  projectId: number;
  statement: string;
  deadline: string;
  status: string;
  score: number;
  evidence: string;
};

export type Verification = {
  id: number;
  projectId: number;
  kind: string;
  itemId: number;
  status: string;
  score: number;
  summary: string;
  evidence: string;
};
