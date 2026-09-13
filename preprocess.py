"""
LILA BLACK - Player Journey Data Preprocessor
------------------------------------------------
Flattens all the raw .nakama-0 parquet files (one per player per match)
into a single compact JSON file, with:
  - event bytes decoded to strings
  - human/bot tagged from user_id format
  - world (x, z) coordinates converted to minimap pixel (px, py) per-map

Run locally (needs `pip install pandas pyarrow`):
    python preprocess.py --input ./player_data --output ./web/data.json

Output shape:
{
  "maps": ["AmbroseValley", "GrandRift", "Lockdown"],
  "matches": [
    {
      "match_id": "...",
      "map_id": "AmbroseValley",
      "date": "February_10",
      "players": [
        {
          "user_id": "...",
          "is_bot": false,
          "events": [
            {"ts": 12345, "x": -301.4, "z": -355.5, "px": 78, "py": 890, "event": "Position"},
            ...
          ]
        }
      ]
    }
  ]
}
"""

import argparse
import os
import re
import sys
from collections import defaultdict

try:
    import pandas as pd
    import pyarrow.parquet as pq
except ImportError:
    sys.exit(
        "Missing dependencies. Run: pip install pandas pyarrow"
    )

import json

# --- Map coordinate configs, from README.md ---
MAP_CONFIG = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473},
    "GrandRift":     {"scale": 581, "origin_x": -290, "origin_z": -290},
    "Lockdown":      {"scale": 1000, "origin_x": -500, "origin_z": -500},
}
IMG_SIZE = 1024

UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def is_human(user_id: str) -> bool:
    """Humans have UUID user_ids, bots have short numeric ids (per README)."""
    return bool(UUID_RE.match(str(user_id)))


def world_to_pixel(x: float, z: float, map_id: str):
    cfg = MAP_CONFIG.get(map_id)
    if cfg is None:
        return None, None
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    px = u * IMG_SIZE
    py = (1 - v) * IMG_SIZE
    return px, py


def load_file(filepath: str):
    """Read one .nakama-0 parquet file into a decoded DataFrame."""
    table = pq.read_table(filepath)
    df = table.to_pandas()
    if "event" in df.columns:
        df["event"] = df["event"].apply(
            lambda v: v.decode("utf-8") if isinstance(v, (bytes, bytearray)) else v
        )
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to player_data/ folder")
    parser.add_argument("--output", required=True, help="Path to write data.json")
    args = parser.parse_args()

    day_folders = sorted(
        d for d in os.listdir(args.input)
        if os.path.isdir(os.path.join(args.input, d)) and d.lower().startswith("february")
    )

    # match_id -> match record
    matches = {}
    maps_seen = set()
    skipped = []

    for day in day_folders:
        day_path = os.path.join(args.input, day)
        for fname in os.listdir(day_path):
            fpath = os.path.join(day_path, fname)
            if not os.path.isfile(fpath):
                continue
            try:
                df = load_file(fpath)
            except Exception as e:
                skipped.append((fname, str(e)))
                continue

            if df.empty:
                continue

            user_id = str(df["user_id"].iloc[0])
            match_id = str(df["match_id"].iloc[0])
            map_id = str(df["map_id"].iloc[0])
            maps_seen.add(map_id)

            human = is_human(user_id)

            df = df.sort_values("ts")
            events = []
            for row in df.itertuples(index=False):
                px, py = world_to_pixel(row.x, row.z, map_id)
                if px is None:
                    continue
                events.append({
                    "ts": int(row.ts.value // 1_000_000) if hasattr(row.ts, "value") else int(row.ts),
                    "x": round(float(row.x), 2),
                    "z": round(float(row.z), 2),
                    "px": round(px, 1),
                    "py": round(py, 1),
                    "event": row.event,
                })

            if match_id not in matches:
                matches[match_id] = {
                    "match_id": match_id,
                    "map_id": map_id,
                    "date": day,
                    "players": [],
                }
            matches[match_id]["players"].append({
                "user_id": user_id,
                "is_bot": not human,
                "events": events,
            })

    output = {
        "maps": sorted(maps_seen),
        "matches": list(matches.values()),
    }

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(output, f)

    print(f"Wrote {len(output['matches'])} matches to {args.output}")
    print(f"Maps found: {output['maps']}")
    if skipped:
        print(f"Skipped {len(skipped)} unreadable files (first 5): {skipped[:5]}")


if __name__ == "__main__":
    main()
