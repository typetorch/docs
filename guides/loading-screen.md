# Loading screens

A joining player waits while the kernel loads your build. Kernel 0.3.6+ covers that wait with its own small screen
("Starting...", "Loading...", "Reconnecting..."). Kernel 0.3.8 lets your game show **its own loading screen** instead
and tells it when the game is ready.

Your loading screen lives in the place (`ReplicatedFirst`), not in the payload: the payload's client code isn't running
yet while the player waits.

## What the kernel tells you

The kernel's client script, `ReplicatedFirst.TypeTorchKernelClient`, sets these attributes on itself:

| Attribute | Value |
|---|---|
| `ClientReady` | `true` once this player's first client generation runs (your client code started). It stays `true`. |
| `ClientGeneration` | the running client generation's name; `nil` while none runs (during a swap) |
| `Holding` | why the player waits: `"start"` (the server is starting), `"load"` (a build is loading), `"move"` (the player is being moved to another server); `nil` when nothing holds |

The game is ready when `ClientReady` is `true` and `Holding` is `nil`.

## Option 1: a picture (no script)

Put a `ScreenGui` in `ReplicatedFirst` (say `LoadingScreen`) and set an attribute on `ReplicatedFirst`:

| Attribute (on `ReplicatedFirst`) | Type | Value |
|---|---|---|
| `TypeTorchBootScreen` | string | `LoadingScreen` |

The kernel shows a copy of it at once, instead of its "Starting..." screen, and removes it when the game is ready (at
most after 60 s). Keep it simple: a background, a logo, a few words. Publish the place.

## Option 2: your own loading screen script

Set this attribute on `ReplicatedFirst`:

| Attribute (on `ReplicatedFirst`) | Type | Value |
|---|---|---|
| `TypeTorchKernelScreen` | boolean | `false` |

The kernel then never draws "Starting..." or "Loading..." before the game is ready. Your `LocalScript` in
`ReplicatedFirst` shows the screen and hides it when the game is ready:

```lua
-- ReplicatedFirst/LoadingScreen (a LocalScript, with a ScreenGui named LoadingGui inside it)
local Players = game:GetService("Players")
local ReplicatedFirst = game:GetService("ReplicatedFirst")

ReplicatedFirst:RemoveDefaultLoadingScreen()
local gui = script:WaitForChild("LoadingGui"):Clone()
gui.ResetOnSpawn = false
gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")

local kernel = ReplicatedFirst:WaitForChild("TypeTorchKernelClient")
local function ready()
	return kernel:GetAttribute("ClientReady") == true and kernel:GetAttribute("Holding") == nil
end
local function show()
	local holding = kernel:GetAttribute("Holding")
	gui.Status.Text = if holding == "load" then "Loading..." elseif holding == "move" then "Reconnecting..." else "Starting..."
end

show()
while not ready() do
	kernel.AttributeChanged:Wait()
	show()
end
gui:Destroy()
```

- With TypeScript, write it in Luau anyway: it is a place script, not part of the payload.
- Both options can be combined: the boot screen shows at once, your script takes over when it runs.

## After the first load

- **Swaps** (a deploy while the player plays) show no loading screen: the game keeps running.
- **Moves** ("Reconnecting...") always show the kernel's screen, with or without your settings.
- A later hold (rare: a build that failed to load) shows the kernel's screen too.

## Notes

- The server copies `TypeTorchBootScreen` and `TypeTorchKernelScreen` onto `TypeTorchKernelClient` when it starts,
  before anyone joins. Attributes `BootScreen` and `KernelScreen` on `ServerScriptService.TypeTorchKernel` win over
  them.
- On kernels before 0.3.8 the attributes do nothing: the kernel shows its own screen, and `ClientReady` never appears.
  A script that must also run there can wait for `ClientReady` with a timeout.
- Studio playtests run the same code.
