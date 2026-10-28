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

export interface SampleFixture {
  id: string;
  dishName: string;
  transcriptText: string;
  recipe: SampleRecipe;
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

const STEAMED_EGG_TEXT = [
  "Today I am steaming eggs with minced pork, soft like the ones at home.",
  "Beat four eggs in a bowl with a little warm water.",
  "Stir in the minced pork and a splash of light soya sauce.",
  "Steam it gently until the top just sets and still wobbles a bit.",
  "My auntie always said low fire makes the egg smooth like beancurd.",
].join("\n");

const STEAMED_EGG_RECIPE: SampleRecipe = {
  dish_name: "Steamed Egg with Minced Pork (Sample)",
  ingredients: [
    { name: "eggs", quantity_text: "four", original_words: "four eggs", source_segment_ids: ["seg-02"], needs_confirmation: false },
    { name: "warm water", quantity_text: null, original_words: "a little warm water", source_segment_ids: ["seg-02"], needs_confirmation: true },
    { name: "minced pork", quantity_text: null, original_words: "the minced pork", source_segment_ids: ["seg-03"], needs_confirmation: true },
    { name: "light soya sauce", quantity_text: null, original_words: "a splash of light soya sauce", source_segment_ids: ["seg-03"], needs_confirmation: true },
  ],
  steps: [
    { instruction: "Beat the eggs with warm water.", source_segment_ids: ["seg-02"], needs_confirmation: true },
    { instruction: "Stir in minced pork and light soya sauce.", source_segment_ids: ["seg-03"], needs_confirmation: true },
    { instruction: "Steam gently until the top just sets and still wobbles a bit.", source_segment_ids: ["seg-04"], needs_confirmation: true },
  ],
  story: {
    paraphrase: "A family retelling: this steamed egg with minced pork is kept soft and smooth over a gentle fire, the way the cook's auntie taught.",
    source_segment_ids: ["seg-01", "seg-05"],
    quotes: [
      { text: "Today I am steaming eggs with minced pork, soft like the ones at home.", source_segment_id: "seg-01" },
      { text: "My auntie always said low fire makes the egg smooth like beancurd.", source_segment_id: "seg-05" },
    ],
  },
  clarifications: [
    { question: "How much warm water do you add to the eggs?", related_field: "ingredients[warm water]", source_segment_ids: ["seg-02"] },
    { question: "How much minced pork do you usually use?", related_field: "ingredients[minced pork]", source_segment_ids: ["seg-03"] },
    { question: "How long do you steam it until it just sets?", related_field: "steps[steaming]", source_segment_ids: ["seg-04"] },
  ],
};

const GINGER_CHICKEN_TEXT = [
  "Today I am cooking ginger chicken with spring onion, the confinement way.",
  "Heat the wok and fry plenty of old ginger until it smells fragrant.",
  "Add the chicken pieces and stir until the skin turns golden.",
  "Pour in a little sesame oil and toss the spring onion through at the end.",
  "My mother always said ginger warms the body after hard work.",
].join("\n");

const GINGER_CHICKEN_RECIPE: SampleRecipe = {
  dish_name: "Ginger Chicken with Spring Onion (Sample)",
  ingredients: [
    { name: "old ginger", quantity_text: null, original_words: "plenty of old ginger", source_segment_ids: ["seg-02"], needs_confirmation: true },
    { name: "chicken", quantity_text: null, original_words: "the chicken pieces", source_segment_ids: ["seg-03"], needs_confirmation: true },
    { name: "sesame oil", quantity_text: null, original_words: "a little sesame oil", source_segment_ids: ["seg-04"], needs_confirmation: true },
    { name: "spring onion", quantity_text: null, original_words: "the spring onion", source_segment_ids: ["seg-04"], needs_confirmation: true },
  ],
  steps: [
    { instruction: "Fry the old ginger until fragrant.", source_segment_ids: ["seg-02"], needs_confirmation: true },
    { instruction: "Add chicken and stir until the skin turns golden.", source_segment_ids: ["seg-03"], needs_confirmation: true },
    { instruction: "Add sesame oil and toss spring onion through at the end.", source_segment_ids: ["seg-04"], needs_confirmation: true },
  ],
  story: {
    paraphrase: "A family retelling: this ginger chicken follows the cook's mother's confinement way, with ginger to warm the body.",
    source_segment_ids: ["seg-01", "seg-05"],
    quotes: [
      { text: "Today I am cooking ginger chicken with spring onion, the confinement way.", source_segment_id: "seg-01" },
      { text: "My mother always said ginger warms the body after hard work.", source_segment_id: "seg-05" },
    ],
  },
  clarifications: [
    { question: "How much old ginger is plenty for this dish?", related_field: "ingredients[old ginger]", source_segment_ids: ["seg-02"] },
    { question: "How much chicken do you cook at one time?", related_field: "ingredients[chicken]", source_segment_ids: ["seg-03"] },
    { question: "How much sesame oil do you add at the end?", related_field: "ingredients[sesame oil]", source_segment_ids: ["seg-04"] },
  ],
};

// Three fictional samples pre-loaded into the recipe box so a first-time
// visitor sees finished cards at a glance. All fictional; delete freely.
export const SAMPLE_FIXTURES: SampleFixture[] = [
  { id: "tomato-egg", dishName: SAMPLE_DISH_NAME, transcriptText: SAMPLE_TRANSCRIPT_TEXT, recipe: SAMPLE_RECIPE },
  { id: "steamed-egg", dishName: STEAMED_EGG_RECIPE.dish_name as string, transcriptText: STEAMED_EGG_TEXT, recipe: STEAMED_EGG_RECIPE },
  { id: "ginger-chicken", dishName: GINGER_CHICKEN_RECIPE.dish_name as string, transcriptText: GINGER_CHICKEN_TEXT, recipe: GINGER_CHICKEN_RECIPE },
];

export function sampleFixtureById(id: string | undefined): SampleFixture {
  return SAMPLE_FIXTURES.find((f) => f.id === id) ?? SAMPLE_FIXTURES[0];
}
