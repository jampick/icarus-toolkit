# atlas-export

Offline exporter for the Atlas tool (issues #12, #14). Sweeps the four
open-world terrain umaps with CUE4Parse and emits raw marker JSON that
`scripts/build_atlas_data.py` shapes into `site/data/atlas.json`.

Run per game update, from this directory (needs .NET 10; the Steam install
path is the default first argument):

    dotnet run -c Release -- "E:\SteamLibrary\steamapps\common\Icarus\Icarus\Content\Paks" ..\..\data\atlas-raw

Then rebuild the site data:

    python ..\..\scripts\build_atlas_data.py

Notes:
- Deep vein spawns (BP_DeepOreDepositSpawn_C) are the possible-location
  pool; ore type is rolled at runtime and cannot be exported.
- Exotics are runtime-spawned from D_ExoticSpawn (grid names, no world
  coords); they come from data.pak, not this tool.
- `--probe <packagePath>` dumps an asset's properties for spelunking.
