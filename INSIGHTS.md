# INSIGHTS.md — LILA BLACK Player Journey Data

Findings below are computed directly from the extracted dataset (796 matches
across 3 maps) using `analyze_insights.py`, included in this repo.

---

## 1. Combat is overwhelmingly Human-vs-Bot, not Human-vs-Human

**What caught my eye:** Across every map, the vast majority of human deaths
are caused by bots, not other human players.

**Evidence:**
| Map | Killed by human | Killed by bot | Killed by storm |
|---|---|---|---|
| AmbroseValley | 0.4% | **96.2%** | 3.4% |
| GrandRift | 1.9% | **88.5%** | 9.6% |
| Lockdown | 0.0% | **90.8%** | 9.2% |

Human-vs-human kills happened in only 3 recorded incidents out of 742 total
human deaths across all three maps combined.

**Actionable:** If PvP tension between real players is meant to be a core
part of the LILA BLACK experience, this data suggests it's barely occurring
in practice — players are dying to bot encounters almost exclusively. Two
concrete levers a level designer controls here: (1) bot spawn density and
placement per POI, and (2) how far apart human drop/spawn zones are placed
relative to each other. Reducing bot density in a few high-traffic POIs, or
pulling human spawn zones closer together on the map, would directly
increase the odds of human-vs-human encounters. Metrics to watch after any
change: the human-killed-by-human % (currently under 2% everywhere) and
average time-to-first-human-encounter.

**Why a level designer should care:** Spawn and bot-placement layout is a
level design decision. If the intent is a tense multiplayer extraction
experience, this metric is a direct, measurable signal of whether the map
layout is delivering that experience or accidentally turning matches into
solo bot-clearing missions.

---

## 2. Kills cluster overwhelmingly at one hotspot on AmbroseValley

**What caught my eye:** On AmbroseValley, one small map area accounts for
far more kills than anywhere else on the map — more than the next two
hotspots on that map combined.

**Evidence:** Top 3 kill hotspots (20x20 grid, per map):
| Map | Hotspot 1 | Hotspot 2 | Hotspot 3 |
|---|---|---|---|
| AmbroseValley | **102 kills** | 82 kills | 80 kills |
| Lockdown | 42 kills | 19 kills | 16 kills |
| GrandRift | 13 kills | 12 kills | 12 kills |

AmbroseValley's top hotspot alone accounts for ~20% of all 505 recorded
human deaths on that map.

**Actionable:** A single dominant chokepoint this pronounced usually means
either a loot magnet with too little surrounding cover, or a POI sitting
directly on the main traffic path between spawn and the storm's safe zone.
Concrete fixes: add an additional cover structure or alternate route through
that cell, or thin out the loot table there to reduce its pull. Metric to
track post-change: kill count in that specific grid cell relative to total
map kills — the goal is a flatter distribution across 4-5 zones rather than
one dominant one.

**Why a level designer should care:** This is the most direct, unambiguous
signal this tool can give — an actual coordinate-level hotspot on the map,
not an inference. It's the kind of thing that's very hard to notice from
raw telemetry tables but immediately visible once plotted spatially.

---

## 3. Storm death rate is 2-3x higher on GrandRift and Lockdown than AmbroseValley

**What caught my eye:** The share of deaths caused by the storm (rather than
combat) varies a lot by map.

**Evidence:**
| Map | Storm death share |
|---|---|
| AmbroseValley | 3.4% |
| GrandRift | **9.6%** |
| Lockdown | **9.2%** |

**Actionable:** Storm deaths are a proxy for how well players are able to
predict and outrun the safe-zone shrink on a given map. AmbroseValley's much
lower storm death rate suggests its layout (road network, sightlines to the
next zone) makes rotation easier, while GrandRift and Lockdown's layouts
may be trapping players in dead-ends or forcing longer rotation paths.
Actionable next step: overlay storm-death locations (already supported by
the Death Heatmap view in the tool) against each map's terrain to identify
specific dead-ends or missing shortcut paths, and consider adding rotation
routes near those spots. Metric to track: storm death % per map after any
path/shortcut additions — target bringing GrandRift and Lockdown closer to
AmbroseValley's rate.

**Why a level designer should care:** Storm timing itself is usually owned
by systems/design, but the *paths available to outrun it* are a pure level
layout question — this metric isolates map geometry as a likely contributor
independent of storm tuning.
