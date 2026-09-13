"""
Quick analysis pass over web/data.json to surface real, numbers-backed
findings for INSIGHTS.md. Run with: python analyze_insights.py
"""
import json
import sys
from collections import defaultdict

with open("web/data.json") as f:
    DATA = json.load(f)

matches = DATA["matches"]
print(f"Total matches: {len(matches)}\n")

MOVE = {"Position", "BotPosition"}
DEATH_CAUSES = {"Killed", "BotKilled", "KilledByStorm"}

# --- 1. Death cause breakdown, per map ---
print("=" * 60)
print("1. WHAT KILLS HUMANS, BY MAP")
print("=" * 60)
per_map_causes = defaultdict(lambda: defaultdict(int))
for m in matches:
    for p in m["players"]:
        for e in p["events"]:
            if e["event"] in DEATH_CAUSES:
                per_map_causes[m["map_id"]][e["event"]] += 1

for map_id, causes in per_map_causes.items():
    total = sum(causes.values())
    if total == 0:
        continue
    print(f"\n{map_id} ({total} human deaths):")
    for cause in ["Killed", "BotKilled", "KilledByStorm"]:
        n = causes.get(cause, 0)
        pct = round(100 * n / total, 1)
        label = {"Killed": "by another human", "BotKilled": "by a bot", "KilledByStorm": "by the storm"}[cause]
        print(f"  {label:20s}: {n:4d}  ({pct}%)")

# --- 2. Loot pickup rate: human vs bot ---
print("\n" + "=" * 60)
print("2. LOOT PICKUP RATE: HUMAN VS BOT")
print("=" * 60)
human_loot, human_players = 0, 0
bot_loot, bot_players = 0, 0
for m in matches:
    for p in m["players"]:
        loot_count = sum(1 for e in p["events"] if e["event"] == "Loot")
        if p["is_bot"]:
            bot_loot += loot_count
            bot_players += 1
        else:
            human_loot += loot_count
            human_players += 1

print(f"Humans: {human_players} player-instances, avg {human_loot/human_players:.2f} loot pickups each")
print(f"Bots:   {bot_players} player-instances, avg {bot_loot/bot_players:.2f} loot pickups each")

# --- 3. Storm death rate per map (as % of all deaths) ---
print("\n" + "=" * 60)
print("3. STORM DEATH SHARE PER MAP (ALL PLAYERS, NOT JUST HUMANS)")
print("=" * 60)
per_map_all_deaths = defaultdict(lambda: defaultdict(int))
for m in matches:
    for p in m["players"]:
        for e in p["events"]:
            if e["event"] in ("Killed", "BotKilled", "KilledByStorm"):
                per_map_all_deaths[m["map_id"]][e["event"]] += 1

for map_id, causes in per_map_all_deaths.items():
    total = sum(causes.values())
    storm = causes.get("KilledByStorm", 0)
    if total == 0:
        continue
    print(f"{map_id}: {storm}/{total} deaths from storm ({round(100*storm/total,1)}%)")

# --- 4. Kill hotspots per map (top 3 grid cells) ---
print("\n" + "=" * 60)
print("4. TOP KILL HOTSPOTS PER MAP (grid cell -> kill count)")
print("=" * 60)
BINS = 20
per_map_grid = defaultdict(lambda: defaultdict(int))
for m in matches:
    for p in m["players"]:
        for e in p["events"]:
            if e["event"] in ("Kill", "BotKill"):
                bx = min(BINS - 1, int(e["px"] / 1024 * BINS))
                by = min(BINS - 1, int(e["py"] / 1024 * BINS))
                per_map_grid[m["map_id"]][(bx, by)] += 1

for map_id, grid in per_map_grid.items():
    top = sorted(grid.items(), key=lambda kv: -kv[1])[:3]
    print(f"\n{map_id}:")
    for (bx, by), count in top:
        px_center = round((bx + 0.5) / BINS * 1024)
        py_center = round((by + 0.5) / BINS * 1024)
        print(f"  Cell ({bx},{by}) ~ pixel ({px_center},{py_center}): {count} kills")

# --- 5. Average distance traveled: human vs bot (rough, sum of segment lengths) ---
print("\n" + "=" * 60)
print("5. AVG MOVEMENT DISTANCE PER PLAYER (pixel units, rough proxy)")
print("=" * 60)
def path_length(events):
    pts = sorted([e for e in events if e["event"] in MOVE], key=lambda e: e["ts"])
    dist = 0
    for i in range(1, len(pts)):
        dist += ((pts[i]["px"] - pts[i-1]["px"])**2 + (pts[i]["py"] - pts[i-1]["py"])**2) ** 0.5
    return dist

human_dist, bot_dist = [], []
for m in matches:
    for p in m["players"]:
        d = path_length(p["events"])
        (bot_dist if p["is_bot"] else human_dist).append(d)

if human_dist:
    print(f"Humans: avg {sum(human_dist)/len(human_dist):.1f} px traveled per player-match")
if bot_dist:
    print(f"Bots:   avg {sum(bot_dist)/len(bot_dist):.1f} px traveled per player-match")

print("\nDone.")
