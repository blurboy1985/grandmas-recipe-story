// Recording comes first; naming the card is optional and can happen later.
// Blank fields fall back at save time so a take is never blocked by the form.
export function resolveSaveDetails(input: { cookName: string; dishName: string; languageHint?: string }): { cookName: string; dishName: string; languageHint: string } {
  return {
    cookName: input.cookName.trim() || "Grandma",
    dishName: input.dishName.trim() || "Untitled dish",
    languageHint: input.languageHint?.trim() ?? "",
  };
}
