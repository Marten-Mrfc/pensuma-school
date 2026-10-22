"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/app/states";

export default function LeerlingError({
  error,
  retry,
  reset,
}: {
  error: unknown;
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="Deze pagina kon niet worden geladen"
      error={error}
      onRetry={retry ?? reset}
      className="my-6"
    />
  );
}
