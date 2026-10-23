import { describe, expect, test } from "bun:test";
import {
  ATTEMPT_BACKUP_PREFIX,
  LOCAL_DATA_OWNER_KEY,
  practiceCodeKey,
} from "@/lib/local-data";
import { STORAGE_ITEMS } from "./cookies";

/** The disclosed name covering `key` ("pensuma:poging:…" covers a prefix). */
function disclosureFor(key: string) {
  return STORAGE_ITEMS.find((item) =>
    item.name.endsWith("…")
      ? key.startsWith(item.name.slice(0, -1))
      : key === item.name,
  );
}

const SOMEONE_ELSE = "iemand anders op deze computer inlogt";

describe("local storage disclosure matches src/lib/local-data.ts", () => {
  test("the owner marker is listed as necessary", () => {
    const owner = disclosureFor(LOCAL_DATA_OWNER_KEY);
    expect(owner).toMatchObject({
      name: "pensuma:owner",
      kind: "lokale opslag",
      category: "noodzakelijk",
      retention: "tot uitloggen",
    });
    expect(owner?.purpose).toContain("gewist als iemand anders inlogt");
  });

  test("practice code is keyed per user and cleared for the next user", () => {
    const item = disclosureFor(practiceCodeKey("user-1"));
    expect(item?.name).toBe("pensuma:oefenen:…");
    expect(item?.retention).toBe(
      `tot je de code wist, uitlogt of ${SOMEONE_ELSE}`,
    );
    expect(STORAGE_ITEMS.some((i) => i.name === "pensuma:oefenen:code")).toBe(
      false,
    );
  });

  test("answer backups are cleared for the next user too", () => {
    const item = disclosureFor(`${ATTEMPT_BACKUP_PREFIX}abc:answers`);
    expect(item?.name).toBe("pensuma:poging:…");
    expect(item?.retention).toBe(
      `tot inleveren, uitloggen of tot ${SOMEONE_ELSE}`,
    );
  });

  test("unkeyed pensuma: settings say they go at sign-out as well", () => {
    for (const name of ["pensuma:shortcuts", "pensuma:toetsen:filter"]) {
      expect(disclosureFor(name)?.retention).toContain("uitlogt");
    }
  });
});
