interface StatusBadgeProps {
  status: string | null | undefined;
}

const styles: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  valid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  anchor_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  not_submitted: 'bg-gray-50 text-gray-700 border-gray-200',
  not_generated: 'bg-gray-50 text-gray-700 border-gray-200',
  not_verified: 'bg-gray-50 text-gray-700 border-gray-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  hash_mismatch: 'bg-red-50 text-red-700 border-red-200',
  anchor_not_found: 'bg-red-50 text-red-700 border-red-200',
  invalid_bundle: 'bg-red-50 text-red-700 border-red-200',
  unsupported_file: 'bg-red-50 text-red-700 border-red-200',
};

function formatStatus(status: string) {
  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status ?? 'unknown';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[normalized] ?? 'bg-gray-50 text-gray-700 border-gray-200'}`}>
      {formatStatus(normalized)}
    </span>
  );
}
