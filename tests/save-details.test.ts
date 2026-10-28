import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSaveDetails } from "../src/lib/save-details.ts";

test("blank details fall back so recording can be saved first, named later", () => {
  assert.deepEqual(resolveSaveDetails({ cookName: "", dishName: "", languageHint: "" }), {
    cookName: "Grandma", dishName: "Untitled dish", languageHint: "",
  });
  assert.deepEqual(resolveSaveDetails({ cookName: "  ", dishName: " ", languageHint: " " }), {
    cookName: "Grandma", dishName: "Untitled dish", languageHint: "",
  });
});

test("filled details are kept, trimmed", () => {
  assert.deepEqual(resolveSaveDetails({ cookName: " Ah Ma ", dishName: " Steamed fish ", languageHint: " Hokkien " }), {
    cookName: "Ah Ma", dishName: "Steamed fish", languageHint: "Hokkien",
  });
});
