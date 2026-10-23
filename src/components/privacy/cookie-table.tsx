import { ScrollRegion } from "@/components/a11y/scroll-region";
import { STORAGE_CATEGORY_LABELS, STORAGE_ITEMS } from "@/lib/privacy/cookies";

const caption = "Cookies en lokale opslag van Pensuma";

/** Cookies and local storage (from STORAGE_ITEMS). Server component. */
export function CookieTable() {
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <ScrollRegion label={caption}>
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Naam
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Soort
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Doel
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Bewaartermijn
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {STORAGE_ITEMS.map((item) => (
                <tr key={item.name} className="align-top">
                  <th
                    scope="row"
                    className="px-4 py-3 font-mono text-xs font-medium break-all text-foreground"
                  >
                    {item.name}
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.kind === "cookie" ? "Cookie" : "Lokale opslag"} (
                    {STORAGE_CATEGORY_LABELS[item.category].toLowerCase()}
                    {item.audience ? `, ${item.audience}` : ""})
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.purpose}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {item.retention}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {STORAGE_ITEMS.map((item) => (
          <li key={item.name} className="rounded-xl border bg-card p-4">
            <p className="font-mono text-xs font-medium break-all">
              {item.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.kind === "cookie" ? "Cookie" : "Lokale opslag"} ·{" "}
              {STORAGE_CATEGORY_LABELS[item.category]}
              {item.audience ? ` · ${item.audience}` : ""}
            </p>
            <p className="mt-2 text-sm">{item.purpose}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Bewaartermijn: {item.retention}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
