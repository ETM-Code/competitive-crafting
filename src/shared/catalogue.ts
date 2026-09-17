import data from '../data/catalogue.json' with { type: 'json' };
import targetData from '../data/targets.json' with { type: 'json' };
import type { Catalogue, Item, Recipe, Target } from './types';
export const catalogue = data as Catalogue;
export const VERSION = catalogue.version;
export const items = catalogue.items;
export const recipes = catalogue.recipes;
export const targets = targetData as Target[];
export const itemById = Object.fromEntries(items.map((item) => [item.id, item])) as Record<
  string,
  Item
>;
export const recipesByOutput: Record<string, Recipe[]> = {};
for (const recipe of recipes) (recipesByOutput[recipe.output] ??= []).push(recipe);
