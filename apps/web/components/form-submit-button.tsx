'use client';

import { useFormStatus } from 'react-dom';

interface FormSubmitButtonProps {
  readonly className: string;
  readonly label: string;
  readonly pendingLabel: string;
}

export function FormSubmitButton({
  className,
  label,
  pendingLabel,
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
