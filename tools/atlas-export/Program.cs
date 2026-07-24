// Atlas exporter: sweep ICARUS terrain umaps and emit raw marker actors as
// JSON for scripts/build_atlas_data.py to shape into site/data/atlas.json.
// Offline pipeline step; run per game update (issue #14, spike in #12):
//   dotnet run -c Release -- <PaksDir> <outDir>
//   dotnet run -c Release -- <PaksDir> --probe <packagePath>   (dump asset props)
using System.Text.Json;
using System.Text.RegularExpressions;
using CUE4Parse.Compression;
using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Assets.Exports;
using CUE4Parse.UE4.Objects.Core.Math;
using CUE4Parse.UE4.Versions;

var paksDir = args.Length > 0 ? args[0] : @"E:\SteamLibrary\steamapps\common\Icarus\Icarus\Content\Paks";

// Open-world terrains (row name -> content dir), per D_Terrains.json.
var terrains = new (string Row, string Display, string Dir)[]
{
    ("Terrain_016", "Olympus", "Maps/Terrain_016_OLY"),
    ("Terrain_017", "Styx", "Maps/Terrain_017_STYX"),
    ("Terrain_019", "Prometheus", "Maps/Terrain_019_DLC"),
    ("Terrain_021", "Elysium", "Maps/Terrain_021_DLC2"),
};

// Marker classes -> layer keys. Cave prefabs are the cave-system anchors
// (one per cave, matches the community one-cave-per-grid-square rule);
// BP_CaveInstance_C duplicates them and typed entrances are a subset, so
// neither is exported. Deep vein spawns are the possible-location pool; the
// ore type is rolled at runtime, so there is no type to export.
var layerOf = new Dictionary<string, string>
{
    ["BP_CavePrefab_C"] = "caves",
    ["BP_DeepOreDepositSpawn_C"] = "veins",
    ["BP_OilGeyser_C"] = "oil",
    ["BP_EnzymeGeyser_C"] = "enzyme",
    ["BP_SandWormEmergePoint_C"] = "worms",
};

var oodle = Path.Combine(AppContext.BaseDirectory, OodleHelper.OodleFileName);
if (!File.Exists(oodle)) OodleHelper.DownloadOodleDll(ref oodle);
OodleHelper.Initialize(oodle);
try
{
    var zlib = Path.Combine(AppContext.BaseDirectory, ZlibHelper.DllName);
    if (!File.Exists(zlib)) await ZlibHelper.DownloadDllAsync(zlib, ZlibHelper.DOWNLOAD_URL);
    ZlibHelper.Initialize(zlib);
}
catch (Exception e) { Console.WriteLine($"zlib helper skipped: {e.Message}"); }

var provider = new DefaultFileProvider(paksDir, SearchOption.TopDirectoryOnly,
    new VersionContainer(EGame.GAME_UE4_27));
provider.Initialize();
provider.Mount();
Console.WriteLine($"mounted: {provider.Files.Count} files");

if (args.Length > 2 && args[1] == "--probe")
{
    var pkg = provider.LoadPackage(args[2]);
    foreach (var exp in pkg.GetExports())
    {
        Console.WriteLine($"== {exp.ExportType} {exp.Name}");
        foreach (var p in exp.Properties)
            Console.WriteLine($"   {p.Name.Text} = {p.Tag?.GenericValue ?? p.Tag}");
    }
    return;
}

var outDir = args.Length > 1 ? args[1] : Path.Combine(AppContext.BaseDirectory, "out");
Directory.CreateDirectory(outDir);

foreach (var (row, display, dir) in terrains)
{
    var umaps = provider.Files.Keys
        .Where(k => k.Contains(dir + "/", StringComparison.OrdinalIgnoreCase)
                 && k.EndsWith(".umap", StringComparison.OrdinalIgnoreCase))
        .OrderBy(k => k.Length)
        .ToList();
    Console.WriteLine($"{display}: {umaps.Count} umaps");

    var markers = new List<object>();
    double minX = double.MaxValue, maxX = double.MinValue;
    double minY = double.MaxValue, maxY = double.MinValue;
    int done = 0, failed = 0;

    foreach (var path in umaps)
    {
        try
        {
            var pkg = provider.LoadPackage(path);
            foreach (var exp in pkg.GetExports())
            {
                FVector? loc = null;
                try
                {
                    var root = exp.GetOrDefault<UObject?>("RootComponent");
                    if (root != null) loc = root.GetOrDefault<FVector>("RelativeLocation");
                }
                catch { }
                if (loc == null) continue;
                // Terrain extent from every placed actor, not just markers, so
                // sparse layers cannot shrink the fitted bounds.
                if (loc.Value.X != 0 || loc.Value.Y != 0)
                {
                    minX = Math.Min(minX, loc.Value.X); maxX = Math.Max(maxX, loc.Value.X);
                    minY = Math.Min(minY, loc.Value.Y); maxY = Math.Max(maxY, loc.Value.Y);
                }
                if (layerOf.TryGetValue(exp.ExportType, out var layer))
                    markers.Add(new { layer, name = exp.Name, x = loc.Value.X, y = loc.Value.Y, z = loc.Value.Z });
            }
        }
        catch (Exception e)
        {
            failed++;
            if (failed <= 3) Console.WriteLine($"  FAILED {path}: {e.Message}");
        }
        if (++done % 100 == 0) Console.WriteLine($"  {done}/{umaps.Count}");
    }

    var outPath = Path.Combine(outDir, $"{row}.json");
    File.WriteAllText(outPath, JsonSerializer.Serialize(new
    {
        terrain = row,
        display,
        umaps = umaps.Count,
        failed,
        actorBounds = new { minX, maxX, minY, maxY },
        markers,
    }, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine($"  {markers.Count} markers ({failed} failed umaps) -> {outPath}");
}
