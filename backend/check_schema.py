import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.database import get_supabase_client

async def check_schema():
    supabase = get_supabase_client()
    try:
        # A simple query limit 1 to see the columns returned
        res = supabase.table("users").select("*").limit(1).execute()
        if res.data:
            print("Columns available:", list(res.data[0].keys()))
        else:
            # If empty, let's insert a dummy and see what fails, or just print empty
            print("Table empty, but query succeeded.")
    except Exception as e:
        print(f"Error checking users table: {e}")

if __name__ == "__main__":
    asyncio.run(check_schema())
