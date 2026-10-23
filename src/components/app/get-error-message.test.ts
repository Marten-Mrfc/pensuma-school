import { describe, expect, test } from "bun:test";
import { getErrorMessage } from "./get-error-message";

describe("getErrorMessage", () => {
  test("keeps the Foutcode of a masked internal error", () => {
    const message =
      "Er ging iets mis aan onze kant. Probeer het opnieuw. (Foutcode: ab12cd34)";
    expect(
      getErrorMessage({
        message,
        data: { code: "INTERNAL_SERVER_ERROR", errorId: "ab12cd34" },
      }),
    ).toBe(message);
  });

  test("adds the error id to an internal error without one in the text", () => {
    expect(
      getErrorMessage({
        message: "Nakijken lukte niet.",
        data: { code: "INTERNAL_SERVER_ERROR", errorId: "ab12cd34" },
      }),
    ).toBe("Nakijken lukte niet. (Foutcode: ab12cd34)");
  });

  test("an internal error without an id gets the generic message", () => {
    expect(
      getErrorMessage({
        message: "Failed query: select 1",
        data: { code: "INTERNAL_SERVER_ERROR" },
      }),
    ).toBe("Er ging iets mis. Probeer het opnieuw.");
  });

  test("shows the first zod message", () => {
    expect(
      getErrorMessage({
        message: "[]",
        data: {
          code: "BAD_REQUEST",
          zodError: {
            formErrors: [],
            fieldErrors: { name: ["Vul je naam in."] },
          },
        },
      }),
    ).toBe("Vul je naam in.");
  });

  test("network failures get a Dutch explanation", () => {
    expect(getErrorMessage(new TypeError("Failed to fetch"))).toContain(
      "internetverbinding",
    );
  });
});
