export default function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  return <span className={`badge badge-${normalized.toLowerCase().replace(/_/g, "-")}`}>{normalized.replace(/_/g, " ")}</span>;
}
