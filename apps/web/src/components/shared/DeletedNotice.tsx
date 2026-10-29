import { DELETED_ACCOUNT_NOTICE } from '@campusconnect/shared';
import { cn } from '@/lib/utils';

/**
 * Shown wherever a historical record points at an account that has since been
 * deleted. The API sends a `null` name plus a `*Deleted` flag, so this renders
 * the same sentence everywhere instead of an empty cell.
 */
export const DeletedNotice = ({
  kind,
  className,
}: {
  kind: keyof typeof DELETED_ACCOUNT_NOTICE;
  className?: string;
}) => (
  <span className={cn('text-sm italic text-muted-foreground', className)}>{DELETED_ACCOUNT_NOTICE[kind]}</span>
);
