// Intentionally public FICTIONAL sample. Never family data.
// Source of truth for the sample flow; mirrored in samples/ and checked by tests.
export const SAMPLE_DISH_NAME = "Tomato Egg Stir-Fry (Sample)";

export const SAMPLE_TRANSCRIPT_TEXT = [
  "Today I am making tomato egg stir-fry, the way my mother taught me.",
  "Heat the wok, add a bit of oil, enough to coat the bottom.",
  "Beat three eggs with a pinch of salt, pour them in and scramble softly.",
  "Add two tomatoes cut in wedges, a bit of dark soya sauce, enough for the colour, and stir until just soft.",
  "My mother always said a hot wok and a quick hand make it taste like home.",
].join("\n");

export interface SampleIngredient {
  name: string;
  quantity_text: string | null;
  original_words: string;
  source_segment_ids: string[];
  needs_confirmation: boolean;
}
export interface SampleStep { instruction: string; source_segment_ids: string[]; needs_confirmation: boolean; }
export interface SampleRecipe {
  dish_name: string | null;
  ingredients: SampleIngredient[];
  steps: SampleStep[];
  story: { paraphrase: string; source_segment_ids: string[]; quotes: { text: string; source_segment_id: string }[] };
  clarifications: { question: string; related_field: string; source_segment_ids: string[] }[];
}

export const SAMPLE_RECIPE: SampleRecipe = {
  dish_name: SAMPLE_DISH_NAME,
  ingredients: [
    { name: "eggs", quantity_text: "three", original_words: "three eggs", source_segment_ids: ["seg-03"], needs_confirmation: false },
    { name: "salt", quantity_text: null, original_words: "a pinch of salt", source_segment_ids: ["seg-03"], needs_confirmation: true },
    { name: "cooking oil", quantity_text: null, original_words: "a bit of oil", source_segment_ids: ["seg-02"], needs_confirmation: true },
    { name: "tomatoes", quantity_text: "two", original_words: "two tomatoes", source_segment_ids: ["seg-04"], needs_confirmation: false },
    { name: "dark soya sauce", quantity_text: null, original_words: "a bit of dark soya sauce, enough for the colour", source_segment_ids: ["seg-04"], needs_confirmation: true },
  ],
  steps: [
    { instruction: "Heat the wok and add oil to coat the bottom.", source_segment_ids: ["seg-02"], needs_confirmation: true },
    { instruction: "Beat the eggs with salt, pour in and scramble softly.", source_segment_ids: ["seg-03"], needs_confirmation: true },
    { instruction: "Add tomato wedges and soya sauce; stir until just soft.", source_segment_ids: ["seg-04"], needs_confirmation: true },
  ],
  story: {
    paraphrase: "A family retelling: this tomato egg stir-fry follows the cook's mother's way, finished with a hot wok and a quick hand.",
    source_segment_ids: ["seg-01", "seg-05"],
    quotes: [
      { text: "Today I am making tomato egg stir-fry, the way my mother taught me.", source_segment_id: "seg-01" },
      { text: "My mother always said a hot wok and a quick hand make it taste like home.", source_segment_id: "seg-05" },
    ],
  },
  clarifications: [
    { question: "How much salt do you usually add for this dish?", related_field: "ingredients[salt]", source_segment_ids: ["seg-03"] },
    { question: "How much oil do you use to coat the wok?", related_field: "ingredients[cooking oil]", source_segment_ids: ["seg-02"] },
    { question: "How much dark soya sauce gives the colour you like?", related_field: "ingredients[dark soya sauce]", source_segment_ids: ["seg-04"] },
  ],
};
