"""
MongoDB connection and database utilities
Based on the TypeScript MongoDB connection pattern
"""

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection
import os
from typing import Optional, Union

# Global MongoDB client and database instances
client: Optional[MongoClient] = None
db: Optional[Database] = None


def connect_db() -> Optional[Database]:
    """
    Connects to MongoDB Atlas
    Returns the database instance or None if connection fails
    """
    global client, db
    
    if db is not None:
        try:
            # Test if existing connection is still alive
            client.admin.command('ping')
            return db
        except Exception:
            # Connection is dead, reset and reconnect
            client = None
            db = None
    
    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("[DB] Warning: MONGODB_URI environment variable is not set")
        print("[DB] App will continue but database operations will be skipped")
        return None
    
    db_name = os.getenv("MONGODB_DB", "w24h")
    
    try:
        client = MongoClient(
            uri,
            serverSelectionTimeoutMS=10000,  # Reduced timeout
            connectTimeoutMS=10000,
            socketTimeoutMS=10000,
            retryWrites=True,
            retryReads=True,
        )
        
        # Test connection with shorter timeout
        client.admin.command('ping', maxTimeMS=5000)
        
        db = client[db_name]
        print(f"[DB] ✓ Connected to MongoDB: {db_name}")
        
        # Create indexes if they don't exist (don't fail if this fails)
        try:
            ensure_indexes(db)
        except Exception as idx_error:
            print(f"[DB] Warning: Could not create indexes: {idx_error}")
        
        return db
    except Exception as error:
        error_msg = str(error) if isinstance(error, Exception) else "Unknown error"
        print(f"[DB] ✗ Failed to connect to MongoDB: {error_msg}")
        print("[DB] App will continue but database operations will be skipped")
        print("[DB] Common issues:")
        print("[DB]   1. MongoDB Atlas cluster is paused (check Atlas dashboard)")
        print("[DB]   2. IP address not whitelisted in Network Access")
        print("[DB]   3. Incorrect connection string or credentials")
        print("[DB]   4. Network/firewall issues")
        
        # Don't raise exception - allow app to continue without DB
        client = None
        db = None
        return None


def ensure_indexes(database: Optional[Database]) -> None:
    """
    Ensures indexes exist for frames and episodes collections
    """
    if database is None:
        return
    
    try:
        # Frames collection indexes
        frames_collection = database["frames"]
        frames_collection.create_index("episode_id")
        frames_collection.create_index([("ts", -1)])
        frames_collection.create_index("app_name")
        print("[DB] ✓ Frames indexes created/verified")
        
        # Episodes collection indexes
        episodes_collection = database["episodes"]
        episodes_collection.create_index("episode_id", unique=True)
        episodes_collection.create_index("app_name")
        episodes_collection.create_index([("start_ts", -1)])
        episodes_collection.create_index("end_ts")
        print("[DB] ✓ Episodes indexes created/verified")
    except Exception as error:
        print(f"[DB] Warning: Could not create indexes: {error}")


def get_frames_collection() -> Optional[Collection]:
    """
    Gets the frames collection
    Returns None if database is not available
    """
    database = connect_db()
    if database is None:
        return None
    return database["frames"]


def get_episodes_collection() -> Optional[Collection]:
    """
    Gets the episodes collection
    Returns None if database is not available
    """
    database = connect_db()
    if database is None:
        return None
    return database["episodes"]


def close_db() -> None:
    """
    Closes the MongoDB connection
    """
    global client, db
    if client is not None:
        client.close()
        client = None
        db = None
        print("[DB] MongoDB connection closed")

