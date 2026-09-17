import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import net.minecraft.SharedConstants;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.RegistryDataLoader;
import net.minecraft.server.Bootstrap;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.repository.ServerPacksSource;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.tags.TagLoader;
import net.minecraft.world.flag.FeatureFlags;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.ItemStack;

/** Calls the pinned vanilla runtime; no game implementation is copied into this exporter. */
public final class CreativeDump {
    public static void main(String[] args) throws Exception {
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
        try (var resources = new MultiPackResourceManager(
                PackType.SERVER_DATA,
                List.of(ServerPacksSource.createVanillaPackSource().fullResources()))) {
            var builtin = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
            TagLoader.loadTagsForExistingRegistries(resources, builtin)
                .forEach(entry -> entry.apply());
            var world = RegistryDataLoader.load(
                resources, builtin.listRegistries().toList(),
                RegistryDataLoader.WORLD_REGISTRIES, Runnable::run).join();
            var lookup = HolderLookup.Provider.create(
                Stream.concat(builtin.listRegistries(), world.listRegistries()));
            BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup)
                .forEach(entry -> entry.apply());
            CreativeModeTabs.tryRebuildTabContents(FeatureFlags.VANILLA_SET, false, lookup);

            var out = new JsonObject();
            out.addProperty("version", SharedConstants.getCurrentVersion().id());
            var tabs = new JsonArray();
            for (var tab : CreativeModeTabs.allTabs()) {
                var entry = new JsonObject();
                entry.addProperty("id", BuiltInRegistries.CREATIVE_MODE_TAB.getKey(tab).toString());
                entry.addProperty("label", tab.getDisplayName().getString());
                entry.addProperty("icon", BuiltInRegistries.ITEM.getKey(tab.getIconItem().getItem()).toString());
                entry.addProperty("row", tab.row().toString());
                entry.addProperty("column", tab.column());
                entry.addProperty("type", tab.getType().toString());
                entry.addProperty("visible", tab.shouldDisplay());
                var items = new JsonArray();
                for (var stack : tab.getDisplayItems()) items.add(stack(stack));
                entry.add("items", items);
                var search = new JsonArray();
                for (var stack : tab.getSearchTabDisplayItems()) search.add(stack(stack));
                entry.add("search", search);
                tabs.add(entry);
            }
            out.add("tabs", tabs);
            Files.writeString(Path.of(args[0]), new GsonBuilder().setPrettyPrinting().create().toJson(out));
        }
        // Registry loading starts vanilla executor threads; the one-shot exporter is now complete.
        System.exit(0);
    }

    private static JsonObject stack(ItemStack stack) {
        var entry = new JsonObject();
        entry.addProperty("id", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
        entry.addProperty("components", !stack.getComponentsPatch().isEmpty());
        return entry;
    }
}
