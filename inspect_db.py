
import psycopg2
import json

db_url = "postgresql://postgres.ejholgyffguoxlflvoqx:SupaBeacon-2026@aws-0-us-west-2.pooler.supabase.com:6543/postgres"

def main():
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        # Check if the entities table exists and get its columns
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'entities'
        """)
        columns = cur.fetchall()
        
        if columns:
            print("Table 'entities' found. Columns:")
            for col in columns:
                print(f"- {col[0]} ({col[1]})")
        else:
            print("Table 'entities' not found in the database.")
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
