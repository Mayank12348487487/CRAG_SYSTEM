from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI") or os.getenv("MONGO_URI")
DB_NAME = "crag"

# Add a timeout so it doesn't hang the entire app if the database is down
client = AsyncIOMotorClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000
)
db = client[DB_NAME]

# Collections
users_col = db["users"]
messages_col = db["messages"]
long_term_col = db["long_term_memory"]


async def init_db():
    """Create indexes on startup with retry logic."""
    import asyncio
    max_retries = 5
    for i in range(max_retries):
        try:
            print(f"Connecting to MongoDB at: {MONGODB_URI} (Attempt {i+1}/{max_retries})")
            # Unique email index
            await users_col.create_index("email", unique=True)
            await users_col.create_index("username", unique=True)

            # Message indexes
            await messages_col.create_index("user_id")
            await messages_col.create_index([("created_at", 1)])

            # Long-term memory index
            await long_term_col.create_index("user_id")

            print("MongoDB indexes initialized successfully")
            return
        except Exception as e:
            print(f"Error initializing MongoDB (Attempt {i+1}/{max_retries}): {e}")
            if i < max_retries - 1:
                await asyncio.sleep(2)
            else:
                print("Failed to initialize MongoDB after multiple attempts.")
                raise e
