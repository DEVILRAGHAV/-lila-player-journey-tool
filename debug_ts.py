"""Quick diagnostic: inspect raw ts values in one parquet file."""
import sys
import os
import pandas as pd
import pyarrow.parquet as pq

folder = sys.argv[1] if len(sys.argv) > 1 else "player_data/player_data/February_10"
files = [f for f in os.listdir(folder) if os.path.isfile(os.path.join(folder, f))]
files.sort(key=lambda f: -os.path.getsize(os.path.join(folder, f)))  # biggest file first

fname = files[0]
fpath = os.path.join(folder, fname)
print(f"Inspecting: {fpath}\n")

table = pq.read_table(fpath)
print("Arrow schema:")
print(table.schema)
print()

df = table.to_pandas()
print("Pandas dtypes:")
print(df.dtypes)
print()

print("First 5 rows of ts column (raw):")
print(df["ts"].head())
print()

print("ts column min/max:")
print("min:", df["ts"].min())
print("max:", df["ts"].max())
print("span (as-is subtraction):", df["ts"].max() - df["ts"].min())
print()

sample_ts = df["ts"].iloc[0]
print("Type of a single ts value:", type(sample_ts))
if hasattr(sample_ts, "value"):
    print("sample_ts.value (raw int):", sample_ts.value)
    print("sample_ts.value // 1_000_000 (assumed ms):", sample_ts.value // 1_000_000)
