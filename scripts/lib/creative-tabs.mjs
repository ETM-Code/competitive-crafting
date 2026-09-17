const strip = (id) => id.replace(/^minecraft:/, '');

export function normalizeCreativeTabs(native, catalogue) {
  if (native.version !== catalogue.version) throw new Error('Creative/catalogue version mismatch');
  const itemIds = new Set(catalogue.items.map((item) => item.id));
  const searchTab = native.tabs.find((tab) => tab.type === 'SEARCH');
  if (!searchTab) throw new Error('Native search tab missing');
  const categories = native.tabs.filter((tab) => tab.type === 'CATEGORY' && tab.visible);
  const missing = new Set();
  function plain(stacks) {
    const ids = stacks.filter((stack) => !stack.components).map((stack) => strip(stack.id));
    for (const id of ids) if (!itemIds.has(id)) missing.add(id);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate native plain item');
    return ids;
  }
  const tabs = categories.map((tab) => ({
    id: strip(tab.id),
    label: tab.label,
    icon: strip(tab.icon),
    items: plain(tab.items),
  }));
  const search = plain(searchTab.items);
  if (missing.size) throw new Error(`Missing native creative renders: ${[...missing].join(', ')}`);
  for (const tab of tabs) {
    if (!itemIds.has(tab.icon)) throw new Error(`Missing tab icon: ${tab.icon}`);
  }
  const searchIds = new Set(search);
  const recipeIds = new Set(
    catalogue.recipes.flatMap((recipe) => [
      recipe.output,
      ...(recipe.kind === 'shaped'
        ? recipe.pattern.flat().flatMap((cell) => cell ?? [])
        : recipe.ingredients.flat()),
    ]),
  );
  const missingRecipeItems = [...recipeIds].filter((id) => !searchIds.has(id));
  if (missingRecipeItems.length)
    throw new Error(
      `Recipe items absent from native creative inventory: ${missingRecipeItems.join(', ')}`,
    );
  const componentVariants = {};
  for (const stack of searchTab.items.filter((stack) => stack.components)) {
    const id = strip(stack.id);
    componentVariants[id] = (componentVariants[id] ?? 0) + 1;
  }
  const audit = {
    version: native.version,
    featureFlags: 'VANILLA_SET',
    operatorPermissions: false,
    nativeSearchStacks: searchTab.items.length,
    supportedSearchItems: search.length,
    excludedComponentStacks: searchTab.items.length - search.length,
    excludedComponentVariants: componentVariants,
    excludedTabs: native.tabs
      .filter((tab) => !categories.includes(tab) && tab.type !== 'SEARCH')
      .map((tab) => strip(tab.id)),
    catalogueItemsOutsideSupportedSearch: catalogue.items
      .filter((item) => !searchIds.has(item.id))
      .map((item) => item.id),
    missingRecipeItems,
    missingNativeRenders: [...missing],
    overlappingItems: search.filter((id) => tabs.filter((tab) => tab.items.includes(id)).length > 1)
      .length,
    tabs: categories.map((tab, index) => ({
      id: strip(tab.id),
      row: tab.row,
      column: tab.column,
      nativeDisplayStacks: tab.items.length,
      supportedItems: tabs[index].items.length,
      excludedComponentStacks: tab.items.length - tabs[index].items.length,
      nativeSearchStacks: tab.search.length,
    })),
  };
  return { data: { version: native.version, tabs, search }, audit };
}
