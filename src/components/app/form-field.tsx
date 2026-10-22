import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  label: ReactNode;
  /** id of the control; links the <label> and the help/error text. */
  htmlFor?: string;
  description?: ReactNode;
  /** Error text; also marks the control `aria-invalid`. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

type A11yProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * Label + control + help/error text. When `htmlFor` is set and the child is a
 * single element, it receives `aria-describedby` / `aria-invalid` automatically.
 */
export function FormField({
  label,
  htmlFor,
  description,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const descriptionId =
    htmlFor && description ? `${htmlFor}-description` : undefined;
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;

  let control = children;
  if (htmlFor && isValidElement(children)) {
    const child = children as ReactElement<A11yProps>;
    const describedBy = [
      child.props["aria-describedby"],
      descriptionId,
      errorId,
    ]
      .filter(Boolean)
      .join(" ");
    control = cloneElement(child, {
      "aria-describedby": describedBy || undefined,
      "aria-invalid": error ? true : child.props["aria-invalid"],
    });
  }

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-invalid={error ? "" : undefined}
    >
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-sm leading-none font-medium text-foreground"
      >
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {control}
      {description && !error ? (
        <p
          id={descriptionId}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-xs leading-relaxed font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
