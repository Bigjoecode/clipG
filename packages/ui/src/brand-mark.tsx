export interface BrandMarkProps {
  readonly className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span className={className} aria-label="ClipGenius">
      ClipGenius
    </span>
  );
}
