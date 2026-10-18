import type { ChangeEvent, ClipboardEvent } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

export function numberInputProps(
  field: UseFormRegisterReturn,
  maxLength: number,
  normalize: (value: string) => string = (value) => value,
) {
  const sanitize = (value: string) =>
    normalize(value).replace(/\D/g, "").slice(0, maxLength);
  return {
    ...field,
    maxLength,
    inputMode: "numeric" as const,
    onChange(event: ChangeEvent<HTMLInputElement>) {
      const input = event.currentTarget;
      const raw = input.value;
      const caret = input.selectionStart ?? raw.length;
      const value = sanitize(raw);
      if (raw !== value) {
        input.value = value;
        const nextCaret = Math.min(
          sanitize(raw.slice(0, caret)).length,
          value.length,
        );
        input.setSelectionRange(nextCaret, nextCaret);
      }
      void field.onChange(event);
    },
    onPaste(event: ClipboardEvent<HTMLInputElement>) {
      // Normalize the complete pasted number before the browser's maxlength
      // can truncate a +91 prefix or formatted national number.
      event.preventDefault();
      const input = event.currentTarget;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const room = maxLength - (input.value.length - (end - start));
      const inserted = sanitize(
        event.clipboardData.getData("text/plain"),
      ).slice(0, Math.max(0, room));
      input.value =
        input.value.slice(0, start) + inserted + input.value.slice(end);
      input.setSelectionRange(start + inserted.length, start + inserted.length);
      void field.onChange({ target: input, type: "change" });
    },
  };
}
