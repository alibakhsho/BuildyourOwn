# Blender — and Claude driving Blender

BuildYourOwn exports the 3D model as **`.glb`** (glTF 2.0 binary). Blender opens it
directly, and with the community **Blender MCP** connector, Claude can drive Blender
for you: import the house, light it, place cameras and render.

## 1. Export from the app

Either:

- **3D model** page → toolbar → **⬇ Blender (.glb)**, or
- **3D model** page → **Services & BIM** tab → *Blender — .glb model*, which also has
  **Copy the prompt for Claude**.

What's in the file:

| In Blender | What it is |
|---|---|
| `My build` (or your project name) | The building: every layer that is visible in the viewport. Turn layers off first to leave them out. |
| Objects named `frame`, `roofing`, `cladding`, `openings`, `landscape`, … | Each piece named after its building system, so it's easy to select "the roof". |
| `Site — satellite` → `Satellite ground` | The satellite photo of your block at true scale (if you set an address in **Your land**). |
| `Lot boundary` | The title boundary from the land register, as a line. |

Units are metres. glTF is Y-up; Blender's importer converts to Z-up, so the house
arrives the right way up and the right size.

**Without Claude:** Blender → *File → Import → glTF 2.0 (.glb/.gltf)* and pick the file.

## 2. Connect Claude to Blender (Blender MCP)

[Blender MCP](https://github.com/ahujasid/blender-mcp) is an open-source connector
(not made by Anthropic or by us). It has two parts: an add-on that runs inside
Blender and opens a local socket, and an MCP server that Claude talks to.

1. **Install `uv`** (it runs the MCP server):
   - macOS: `brew install uv`
   - Windows: `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`
2. **Install the Blender add-on:** download `addon.py` from the repository, then in
   Blender go to *Edit → Preferences → Add-ons → Install…*, pick `addon.py`, and tick
   *Interface: Blender MCP*.
3. **Start it in Blender:** press `N` in the 3D viewport → **BlenderMCP** tab →
   **Connect to Claude**.
4. **Add the server to Claude:**
   - **Claude Desktop:** *Settings → Developer → Edit Config* and add:
     ```json
     {
       "mcpServers": {
         "blender": { "command": "uvx", "args": ["blender-mcp"] }
       }
     }
     ```
     Restart Claude Desktop; a hammer/tools icon shows the Blender tools.
   - **Claude Code:** `claude mcp add blender -- uvx blender-mcp`

Check the project's README for the current steps: the add-on and server move faster
than this page.

> The connector lets Claude run Python inside Blender. Save your work first, and keep
> Blender's own undo in mind.

## 3. Ask Claude

Paste the prompt from **Copy the prompt for Claude**. It names your file and
asks Claude to:

1. import the `.glb` from your Downloads folder and check the scale,
2. make the materials read as real (brick, sheeting, glass) while keeping their colours,
3. add an Australian mid-afternoon sun and a sky,
4. set an eye-level street camera and a high back-corner camera,
5. render both at 1920×1080 with Cycles and save them next to the file.

Good follow-ups:

- "Animate the street camera walking up the path to the front door, 10 seconds, and render it as an MP4."
- "Swap the roof to a dark charcoal and the cladding to white render, then re-render."
- "Add a few Poly Haven trees along the back fence" (Blender MCP can pull Poly Haven assets if you enable that in its panel).
- "Make a dusk version with the interior lights on."

## Why a file and not a live link?

The estimate, the 3D model and the price come from one spec in the app, so the
app stays the source of truth. Blender is the place for presentation: renders,
films and materials. Re-export after a design change; Claude can re-run the same
steps on the new file.
