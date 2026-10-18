import { useId, type ReactNode, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("input", className)} {...props} />;
}
export function Field({
  label,
  name,
  hint,
  error,
  children,
  optional,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div className={`field ${error ? "field-invalid" : ""}`}>
      <label htmlFor={name}>
        {label}
        {optional && <span className="optional">Optional</span>}
      </label>
      {children}
      {error ? (
        <p className="field-error" id={`${name}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${name}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
export function useFieldId() {
  return useId();
}
