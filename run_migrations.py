import subprocess
import os

migrations_dir = r"D:\PROJECTS\Study Space\supabase\migrations"
container = "supabase_db_ufhbfoevcdgaiakhfbir"

for f in sorted(os.listdir(migrations_dir)):
    if f.endswith(".sql"):
        path = os.path.join(migrations_dir, f)
        print(f"Running {f}...")
        with open(path, 'r') as sql_file:
            sql = sql_file.read()
        result = subprocess.run(
            ["docker", "exec", "-i", "supabase_db_ufhbfoevcdgaiakhfbir", "psql", "-U", "postgres", "-d", "postgres"],
            input=sql,
            text=True,
            capture_output=True
        )
        if result.returncode != 0:
            print(f"Error running {f}:")
            print(result.stderr)
        else:
            print(f"  OK")

print("Done!")