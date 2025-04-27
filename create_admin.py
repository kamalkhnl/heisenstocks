from werkzeug.security import generate_password_hash
import argparse
from pymongo import MongoClient
import os
from dotenv import load_dotenv

def create_admin_user(username, password):
    """
    Create an admin user in the database.
    
    Args:
        username: The admin username
        password: The admin password (will be hashed)
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Load environment variables
        load_dotenv()
        
        # Get MongoDB connection string - using the admin credentials with write access
        mongodb_uri = os.getenv('MONGODB_URI_ADMIN')  # Using the ADMIN credentials for write access
        database_name = os.getenv('DATABASE_NAME', 'heisenstocks')  # Using the main database
        users_collection = os.getenv('USERS_COLLECTION', 'users')  # Get the users collection name
        
        if not mongodb_uri:
            print("Error: MONGODB_URI_ADMIN not found in environment variables.")
            return False
            
        # Connect to MongoDB
        client = MongoClient(mongodb_uri)
        
        # Use the main database as specified in the environment variable
        db = client[database_name]
        
        # Check if user already exists in the users collection
        existing_user = db[users_collection].find_one({"username": username})
        if existing_user:
            print(f"User '{username}' already exists!")
            return False
        
        # Create new admin user
        admin_user = {
            "username": username,
            "password": generate_password_hash(password),
            "is_admin": True
        }
        
        # Insert into the users collection
        result = db[users_collection].insert_one(admin_user)
        
        if result.inserted_id:
            print(f"Admin user '{username}' created successfully in {database_name}.{users_collection} collection!")
            return True
        else:
            print("Failed to create admin user.")
            return False
            
    except Exception as e:
        print(f"An error occurred: {e}")
        return False

if __name__ == "__main__":
    # Create argument parser
    parser = argparse.ArgumentParser(description="Create an admin user")
    parser.add_argument("username", help="Admin username")
    parser.add_argument("password", help="Admin password")
    
    args = parser.parse_args()
    
    # Create the admin user
    create_admin_user(args.username, args.password)