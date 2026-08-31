export type Mode = "simple" | "advanced" | "audit";

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

export type TxStage =
  | "UNINITIALIZED"
  | "PENDING"
  | "PROPOSING"
  | "COMMITTING"
  | "REVEALING"
  | "LEADER_REVEALING"
  | "ACCEPTED"
  | "UNDETERMINED"
  | "FINALIZED"
  | "CANCELED"
  | "APPEAL_REVEALING"
  | "APPEAL_COMMITTING"
  | "READY_TO_FINALIZE"
  | "VALIDATORS_TIMEOUT"
  | "LEADER_TIMEOUT"
  | "UNKNOWN";

export type TxProgress = {
  hash: string;
  status: TxStage;
  execution?: string;
};
