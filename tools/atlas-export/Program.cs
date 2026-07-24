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

if (args.Length > 1 && args[1] == "--textures")
{
    // Decode each terrain's biome heatmap texture to PNG (issue #15).
    var texOut = args.Length > 2 ? args[2] : Path.Combine(AppContext.BaseDirectory, "maps");
    Directory.CreateDirectory(texOut);
    foreach (var (row, display, dir) in terrains)
    {
        var num = row.Split('_')[1];
        var path = $"Icarus/Content/Heatmaps/{dir.Split('/')[1]}/T_Terrain{num}_Biome";
        var pkg = provider.LoadPackage(path + ".uasset");
        var tex = pkg.GetExports().OfType<CUE4Parse.UE4.Assets.Exports.Texture.UTexture2D>().First();
        var ctex = CUE4Parse_Conversion.Textures.TextureDecoder.Decode(tex);
        if (ctex == null) { Console.WriteLine($"{display}: decode failed"); continue; }
        var info = new SkiaSharp.SKImageInfo(ctex.Width, ctex.Height,
            SkiaSharp.SKColorType.Bgra8888, SkiaSharp.SKAlphaType.Unpremul);
        var bmp = new SkiaSharp.SKBitmap(info);
        System.Runtime.InteropServices.Marshal.Copy(ctex.Data, 0, bmp.GetPixels(), ctex.Data.Length);
        var target = 1024;
        var resized = bmp.Resize(new SkiaSharp.SKImageInfo(target, target), SkiaSharp.SKFilterQuality.High);
        var file = Path.Combine(texOut, $"{row}.png");
        using var fs = File.OpenWrite(file);
        resized.Encode(SkiaSharp.SKEncodedImageFormat.Png, 90).SaveTo(fs);
        Console.WriteLine($"{display}: {bmp.Width}x{bmp.Height} -> {file}");
    }
    return;
}

if (args.Length > 1 && args[1] == "--terrain")
{
    // Detailed terrain renders: stitch landscape heightmaps, hillshade, tint
    // with the biome mask, write site/maps/<terrain>.png for every map.
    var texOut2 = args.Length > 2 ? args[2] : Path.Combine(AppContext.BaseDirectory, "maps");
    Directory.CreateDirectory(texOut2);
    foreach (var (row, display, dir) in terrains)
        RenderTerrain(row, display, dir, texOut2);
    return;
}

void RenderTerrain(string row, string display, string terrainDir, string outDir)
{
    var num = row.Split('_')[1];
    // JPEG: relief detail costs ~4 MB as PNG, ~400 KB as JPEG
    var outPng = Path.Combine(outDir, $"{row}.jpg");
    var tiles = provider.Files.Keys
        .Where(k => k.Contains(terrainDir + "/HeightMap/", StringComparison.OrdinalIgnoreCase)
                 && !k.Contains("LOD", StringComparison.OrdinalIgnoreCase)
                 && k.EndsWith(".umap", StringComparison.OrdinalIgnoreCase))
        .ToList();
    Console.WriteLine($"{display}: height tiles: {tiles.Count}");

    var comps = new List<(int BaseX, int BaseY, int SubQuads, int NumSubs, int U, int V, string TexPath)>();
    var texCache = new Dictionary<string, CUE4Parse_Conversion.Textures.CTexture?>();
    int texFail = 0;
    foreach (var path in tiles)
    {
        var pkg = provider.LoadPackage(path);
        foreach (var exp in pkg.GetExports())
        {
            if (exp.ExportType != "LandscapeComponent") continue;
            var bx = exp.GetOrDefault<int>("SectionBaseX");
            var by = exp.GetOrDefault<int>("SectionBaseY");
            var subQuads = exp.GetOrDefault<int>("SubsectionSizeQuads", 63);
            var numSubs = exp.GetOrDefault<int>("NumSubsections", 1);
            var sb = exp.GetOrDefault<CUE4Parse.UE4.Objects.Core.Math.FVector4>("HeightmapScaleBias");
            var tex = exp.GetOrDefault<CUE4Parse.UE4.Assets.Exports.Texture.UTexture2D?>("HeightmapTexture");
            if (tex == null) { texFail++; continue; }
            var key = tex.Owner?.Name + "/" + tex.Name;
            if (!texCache.ContainsKey(key))
                texCache[key] = CUE4Parse_Conversion.Textures.TextureDecoder.Decode(tex);
            var dec = texCache[key];
            if (dec == null) { texFail++; continue; }
            comps.Add((bx, by, subQuads, numSubs,
                (int)Math.Round(sb.Z * dec.Width), (int)Math.Round(sb.W * dec.Height), key));
        }
    }
    Console.WriteLine($"  components: {comps.Count}  unique heightmap textures: {texCache.Count}  failures: {texFail}");
    if (comps.Count == 0) return;

    int compQuads(int subQuads, int numSubs) => subQuads * numSubs;
    var minBX = comps.Min(c => c.BaseX); var minBY = comps.Min(c => c.BaseY);
    var maxBX = comps.Max(c => c.BaseX + compQuads(c.SubQuads, c.NumSubs));
    var maxBY = comps.Max(c => c.BaseY + compQuads(c.SubQuads, c.NumSubs));
    int W = maxBX - minBX + 1, H = maxBY - minBY + 1;
    Console.WriteLine($"vertex grid: {W} x {H} (base {minBX},{minBY})");
    var heights = new ushort[W * H];

    foreach (var c in comps)
    {
        var dec = texCache[c.TexPath]!;
        for (int sy = 0; sy < c.NumSubs; sy++)
        for (int sx = 0; sx < c.NumSubs; sx++)
        for (int j = 0; j <= c.SubQuads; j++)
        for (int i = 0; i <= c.SubQuads; i++)
        {
            int tx = c.U + sx * (c.SubQuads + 1) + i;
            int ty = c.V + sy * (c.SubQuads + 1) + j;
            if (tx >= dec.Width || ty >= dec.Height) continue;
            int o = (ty * dec.Width + tx) * 4;
            // BGRA byte order: height = (R << 8) | G
            ushort h = (ushort)((dec.Data[o + 2] << 8) | dec.Data[o + 1]);
            int gx = c.BaseX - minBX + sx * c.SubQuads + i;
            int gy = c.BaseY - minBY + sy * c.SubQuads + j;
            heights[gy * W + gx] = h;
        }
    }

    // dual-light hillshade + water detection at full vertex res
    var shadeInfo = new SkiaSharp.SKImageInfo(W, H, SkiaSharp.SKColorType.Gray8, SkiaSharp.SKAlphaType.Opaque);
    var shade = new SkiaSharp.SKBitmap(shadeInfo);
    var water = new byte[W * H];
    unsafe
    {
        var px = (byte*)shade.GetPixels();
        double az1 = Math.PI * 1.25, az2 = Math.PI * 0.75, alt = Math.PI / 4;
        double zf = 0.02;
        for (int y = 0; y < H; y++)
        for (int x = 0; x < W; x++)
        {
            int xm = Math.Max(x - 1, 0), xp = Math.Min(x + 1, W - 1);
            int ym = Math.Max(y - 1, 0), yp = Math.Min(y + 1, H - 1);
            double rx = heights[y * W + xp] - heights[y * W + xm];
            double ry = heights[yp * W + x] - heights[ym * W + x];
            double dzdx = rx * zf / 2, dzdy = ry * zf / 2;
            double slope = Math.Atan(Math.Sqrt(dzdx * dzdx + dzdy * dzdy));
            double aspect = Math.Atan2(dzdy, -dzdx);
            double S(double az) => Math.Sin(alt) * Math.Cos(slope) +
                Math.Cos(alt) * Math.Sin(slope) * Math.Cos(az - aspect);
            double s = 0.7 * S(az1) + 0.3 * S(az2);
            px[y * W + x] = (byte)Math.Clamp(128 + s * 127, 0, 255);
            // rivers and lakes are carved perfectly flat into the heightmap
            if (Math.Abs(rx) + Math.Abs(ry) < 3 && heights[y * W + x] > 0)
                water[y * W + x] = 1;
        }
    }
    // erode lone flat pixels so plains do not speckle blue: keep only flat
    // pixels whose 5x5 neighborhood is mostly flat
    var water2 = new byte[W * H];
    for (int y = 2; y < H - 2; y++)
    for (int x = 2; x < W - 2; x++)
    {
        if (water[y * W + x] == 0) continue;
        int n = 0;
        for (int dy = -2; dy <= 2; dy++)
        for (int dx = -2; dx <= 2; dx++)
            n += water[(y + dy) * W + x + dx];
        if (n >= 20) water2[y * W + x] = 1;
    }

    // height normalization for hypsometric tinting
    ushort hmin = ushort.MaxValue, hmax = 0;
    foreach (var h in heights) { if (h > 0 && h < hmin) hmin = h; if (h > hmax) hmax = h; }
    double hspan = Math.Max(1, hmax - hmin);

    const int SIZE = 4096;
    var shadeHi = shade.Resize(new SkiaSharp.SKImageInfo(SIZE, SIZE, SkiaSharp.SKColorType.Gray8,
        SkiaSharp.SKAlphaType.Opaque), SkiaSharp.SKFilterQuality.High);
    var bpkg = provider.LoadPackage($"Icarus/Content/Heatmaps/{terrainDir.Split('/')[1]}/T_Terrain{num}_Biome.uasset");
    var btex = bpkg.GetExports().OfType<CUE4Parse.UE4.Assets.Exports.Texture.UTexture2D>().First();
    var bdec = CUE4Parse_Conversion.Textures.TextureDecoder.Decode(btex)!;

    // natural tones for known biome-mask colors; anything unknown gets the
    // generic soften so new maps degrade gracefully. Distinct colors logged.
    var palette = new Dictionary<(byte r, byte g, byte b), (byte r, byte g, byte b)>
    {
        [(50, 150, 0)] = (74, 112, 62),      // forest
        [(0, 255, 111)] = (116, 152, 88),    // riverlands / grassland
        [(255, 234, 0)] = (202, 178, 112),   // desert
        [(200, 150, 50)] = (178, 134, 92),   // desert canyons
        [(0, 255, 255)] = (172, 205, 214),   // arctic
        [(200, 255, 255)] = (222, 230, 236), // glacier
        [(150, 0, 255)] = (128, 108, 142),   // swamp (Styx)
        [(255, 0, 0)] = (154, 84, 62),       // volcanic / lava
        [(255, 145, 0)] = (188, 140, 90),    // badlands
        [(0, 56, 255)] = (96, 122, 158),     // ocean / bay
        [(38, 255, 0)] = (98, 140, 74),      // lush grass
        [(0, 184, 163)] = (98, 128, 114),    // swamp teal
    };
    var unknown = new HashSet<(byte, byte, byte)>();
    var resolved = new Dictionary<(byte, byte, byte), (double r, double g, double b)>();

    var outInfo = new SkiaSharp.SKImageInfo(SIZE, SIZE, SkiaSharp.SKColorType.Bgra8888, SkiaSharp.SKAlphaType.Opaque);
    var composite = new SkiaSharp.SKBitmap(outInfo);
    unsafe
    {
        var op = (byte*)composite.GetPixels();
        var sp = (byte*)shadeHi.GetPixels();
        for (int y = 0; y < SIZE; y++)
        for (int x = 0; x < SIZE; x++)
        {
            int bx2 = x * bdec.Width / SIZE, by2 = y * bdec.Height / SIZE;
            int bo = (by2 * bdec.Width + bx2) * 4;
            var key = ((byte)bdec.Data[bo + 2], (byte)bdec.Data[bo + 1], (byte)bdec.Data[bo]);
            if (!resolved.TryGetValue(key, out var tone))
            {
                // nearest palette anchor within a tolerance: mask colors vary
                // by a few counts (antialiasing, per-map biome variants)
                (byte r, byte g, byte b)? best = null;
                double bestD = 100 * 100;
                foreach (var (k, nat2) in palette)
                {
                    double d = (k.r - key.Item1) * (k.r - key.Item1)
                             + (k.g - key.Item2) * (k.g - key.Item2)
                             + (k.b - key.Item3) * (k.b - key.Item3);
                    if (d < bestD) { bestD = d; best = nat2; }
                }
                if (best != null) tone = (best.Value.r, best.Value.g, best.Value.b);
                else
                {
                    unknown.Add(key);
                    double gray = (key.Item1 + key.Item2 + key.Item3) / 3.0;
                    tone = (key.Item1 * 0.45 + gray * 0.3 + 60,
                            key.Item2 * 0.45 + gray * 0.3 + 60,
                            key.Item3 * 0.45 + gray * 0.3 + 60);
                }
                resolved[key] = tone;
            }
            double r = tone.r, g = tone.g, b = tone.b;
            int hx = x * W / SIZE, hy = y * H / SIZE;
            double hn = Math.Clamp((heights[hy * W + hx] - hmin) / hspan, 0, 1);
            if (water2[hy * W + hx] == 1)
            {
                // water: cool blue, deeper = darker, faint shading for banks
                r = 62 + hn * 40; g = 96 + hn * 40; b = 138 + hn * 40;
                double wl = 0.85 + 0.15 * (sp[y * SIZE + x] / 255.0);
                r *= wl; g *= wl; b *= wl;
            }
            else
            {
                double light = 0.38 + 0.72 * (sp[y * SIZE + x] / 255.0);
                double alt2 = 1 + (hn - 0.45) * 0.35; // higher = lighter, valleys sink
                r *= light * alt2; g *= light * alt2; b *= light * alt2;
                // rocky lightening on the highest quarter
                if (hn > 0.75)
                {
                    double t = (hn - 0.75) * 2.2;
                    r += (215 - r) * t * 0.4; g += (215 - g) * t * 0.4; b += (218 - b) * t * 0.4;
                }
            }
            int o = (y * SIZE + x) * 4;
            op[o] = (byte)Math.Clamp(b, 0, 255);
            op[o + 1] = (byte)Math.Clamp(g, 0, 255);
            op[o + 2] = (byte)Math.Clamp(r, 0, 255);
            op[o + 3] = 255;
        }
    }
    if (unknown.Count > 0)
        Console.WriteLine($"  unknown biome colors: {string.Join(" ", unknown.Select(u => $"({u.Item1},{u.Item2},{u.Item3})"))}");
    using (var fs2 = File.OpenWrite(outPng)) { fs2.SetLength(0);
        composite.Encode(SkiaSharp.SKEncodedImageFormat.Jpeg, 82).SaveTo(fs2); }
    Console.WriteLine($"  wrote {outPng} ({new FileInfo(outPng).Length / 1024} KB)");
}

if (args.Length > 3 && args[1] == "--probeclass")
{
    // Dump full properties for the first few exports matching a class regex
    // in every umap under a terrain dir. Spelunking aid.
    var dirFilter = args[2];
    var clsRe = new Regex(args[3], RegexOptions.IgnoreCase);
    int perClass = 3;
    var seen = new Dictionary<string, int>();
    var umapsP = provider.Files.Keys
        .Where(k => k.Contains(dirFilter, StringComparison.OrdinalIgnoreCase)
                 && k.EndsWith(".umap", StringComparison.OrdinalIgnoreCase))
        .OrderBy(k => k.Length).ToList();
    foreach (var path in umapsP)
    {
        foreach (var exp in provider.LoadPackage(path).GetExports())
        {
            if (!clsRe.IsMatch(exp.ExportType)) continue;
            if (seen.GetValueOrDefault(exp.ExportType) >= perClass) continue;
            seen[exp.ExportType] = seen.GetValueOrDefault(exp.ExportType) + 1;
            Console.WriteLine($"== {exp.ExportType} {exp.Name} ({Path.GetFileNameWithoutExtension(path)})");
            foreach (var p in exp.Properties)
            {
                var v = p.Tag?.GenericValue ?? p.Tag;
                var s = v?.ToString() ?? "null";
                if (v is CUE4Parse.UE4.Assets.Objects.FStructFallback sf)
                    s = string.Join(", ", sf.Properties.Select(q => $"{q.Name.Text}={q.Tag?.GenericValue ?? q.Tag}"));
                if (v is CUE4Parse.UE4.Assets.Objects.UScriptArray arr)
                    s = "[" + string.Join(", ", arr.Properties.Select(q => q.GenericValue?.ToString() ?? q.ToString())) + "]";
                Console.WriteLine($"   {p.Name.Text} = {(s.Length > 200 ? s[..200] : s)}");
            }
            // follow the Mesh component to its StaticMesh asset (ore type lives there)
            try
            {
                var mesh = exp.GetOrDefault<UObject?>("Mesh");
                var sm = mesh?.GetOrDefault<CUE4Parse.UE4.Assets.Exports.UObject?>("StaticMesh");
                if (sm != null) Console.WriteLine($"   -> Mesh.StaticMesh = {sm.GetPathName()}");
                var mats = mesh?.GetOrDefault<CUE4Parse.UE4.Objects.UObject.FPackageIndex[]?>("OverrideMaterials");
                if (mats != null)
                    foreach (var mi in mats.Take(2))
                        Console.WriteLine($"   -> Mesh.OverrideMaterial = {mi.ResolvedObject?.GetPathName()}");
            }
            catch (Exception e) { Console.WriteLine($"   -> mesh follow failed: {e.Message}"); }
        }
    }
    return;
}

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
                {
                    string? prefab = null;
                    if (exp.ExportType == "BP_CavePrefab_C")
                        try { prefab = exp.GetOrDefault<UObject?>("PrefabAsset")?.Name; } catch { }
                    markers.Add(new { layer, name = exp.Name, x = loc.Value.X, y = loc.Value.Y, z = loc.Value.Z, prefab });
                }
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

// ---- cave prefab templates: contents joined to cave markers at build time ----
var prefabFiles = provider.Files.Keys
    .Where(k => k.Contains("Prefabs/Cave/", StringComparison.OrdinalIgnoreCase)
             && k.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase))
    .ToList();
var cavePrefabs = new Dictionary<string, object>();
foreach (var pf in prefabFiles)
{
    try
    {
        var asset = provider.LoadPackage(pf).GetExports()
            .FirstOrDefault(e => e.ExportType == "CavePrefabAsset");
        if (asset == null) continue;
        int Len(string prop)
        {
            var p = asset.Properties.FirstOrDefault(q => q.Name.Text == prop);
            return (p?.Tag?.GenericValue as CUE4Parse.UE4.Assets.Objects.UScriptArray)?.Properties.Count ?? 0;
        }
        var spawns = new List<string>();
        try
        {
            var p = asset.Properties.FirstOrDefault(q => q.Name.Text == "CaveActorSpawnMap");
            if (p?.Tag?.GenericValue is CUE4Parse.UE4.Assets.Objects.UScriptMap map)
                foreach (var kv in map.Properties)
                {
                    var k = kv.Key?.GenericValue?.ToString();
                    if (!string.IsNullOrEmpty(k)) spawns.Add(k);
                }
        }
        catch { }
        cavePrefabs[asset.Name] = new
        {
            entrances = Len("Entrances"),
            veins = Len("DeepMiningOreDeposit"),
            exotics = Len("ExoticVoxels"),
            lakes = Len("Lakes"),
            spawns,
        };
    }
    catch (Exception e) { Console.WriteLine($"prefab parse failed {pf}: {e.Message}"); }
}
File.WriteAllText(Path.Combine(outDir, "cave_prefabs.json"),
    JsonSerializer.Serialize(cavePrefabs, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"cave prefab templates: {cavePrefabs.Count} -> cave_prefabs.json");
