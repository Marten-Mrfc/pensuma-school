import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder while the account menu streams in. */
export function UserMenuSkeleton({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "header";
}) {
  if (variant === "header") {
    return <Skeleton className="size-9 rounded-full" />;
  }
  return (
    <div className="flex items-center gap-2.5 p-2 group-data-[collapsible=icon]:p-0">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}
