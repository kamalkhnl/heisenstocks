from flask import Flask, g
from flask_login import LoginManager
from flask_caching import Cache
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError
import os
from dotenv import load_dotenv
import time
import socket

# Load environment variables
load_dotenv()

# Initialize login manager
login_manager = LoginManager()
login_manager.login_view = 'auth.login'

# Initialize Flask-Caching
cache = Cache()

# Database connection cache
_db_client = None
_db_instance = None

# MongoDB connection with connection pooling and error handling
def get_mongo_client():
    global _db_client
    if _db_client is None:
        start = time.time()
        uri = os.getenv('MONGODB_URI')
        
        # Check if we're using an SRV connection string (starts with mongodb+srv://)
        # If so, we need to handle DNS resolution issues
        if uri and uri.startswith('mongodb+srv://'):
            print("Using MongoDB SRV connection string. Configuring with direct connection fallback...")
            
            # Extract credentials and host from SRV URI
            try:
                # Parse the URI for direct connection fallback
                # Format is typically: mongodb+srv://username:password@cluster.mongodb.net/
                parts = uri.replace('mongodb+srv://', '').split('@')
                credentials = parts[0]  # username:password
                domain = parts[1].split('/')[0]  # cluster.mongodb.net
                
                # Create a direct connection URI as fallback
                # Format: mongodb://username:password@cluster-shard-00-00.mongodb.net:27017,cluster-shard-00-01.mongodb.net:27017,cluster-shard-00-02.mongodb.net:27017/?ssl=true&replicaSet=atlas-abcdef&authSource=admin
                fallback_uri = f"mongodb://{credentials}@{domain.replace('.', '-shard-00-00.')}:27017,{domain.replace('.', '-shard-00-01.')}:27017,{domain.replace('.', '-shard-00-02.')}:27017/?ssl=true&authSource=admin"
                
                # Set shorter timeouts for DNS resolution
                socket.setdefaulttimeout(5.0)  # 5 second timeout for socket operations
                
                try:
                    # Try with the SRV URI first
                    _db_client = MongoClient(
                        uri,
                        serverSelectionTimeoutMS=5000,  # 5 second timeout for server selection
                        connectTimeoutMS=5000,         # 5 second connection timeout
                        socketTimeoutMS=5000,          # 5 second socket timeout
                        maxPoolSize=10,               # Adjust based on expected concurrent users
                        minPoolSize=1,                # Maintain at least one connection
                        maxIdleTimeMS=30000,          # Close idle connections after 30 seconds
                        retryWrites=True,             # Retry write operations
                        connect=False                 # Don't connect immediately
                    )
                    # Test connection
                    _db_client.admin.command('ping')
                    print("Successfully connected to MongoDB using SRV URI")
                except (ConnectionFailure, ConfigurationError) as e:
                    print(f"SRV connection failed: {e}. Trying direct connection fallback...")
                    # If SRV fails, try direct connection
                    _db_client = MongoClient(
                        fallback_uri,
                        serverSelectionTimeoutMS=5000,
                        connectTimeoutMS=5000,
                        socketTimeoutMS=5000,
                        maxPoolSize=10,
                        minPoolSize=1,
                        maxIdleTimeMS=30000,
                        retryWrites=True
                    )
                    # Test connection
                    _db_client.admin.command('ping')
                    print("Successfully connected to MongoDB using direct connection fallback")
            except Exception as e:
                print(f"Error setting up MongoDB connection: {e}")
                # Use a local fallback for development/testing
                print("Using local MongoDB fallback")
                _db_client = MongoClient('mongodb://localhost:27017/')
        else:
            # Regular MongoDB URI (non-SRV)
            try:
                _db_client = MongoClient(
                    uri or 'mongodb://localhost:27017/',
                    serverSelectionTimeoutMS=5000,
                    connectTimeoutMS=5000,
                    socketTimeoutMS=5000,
                    maxPoolSize=10,
                    minPoolSize=1,
                    maxIdleTimeMS=30000,
                    retryWrites=True
                )
                # Test connection
                _db_client.admin.command('ping')
                print("Successfully connected to MongoDB")
            except Exception as e:
                print(f"Error connecting to MongoDB: {e}")
                # Use a local fallback
                print("Using local MongoDB fallback")
                _db_client = MongoClient('mongodb://localhost:27017/')
                
        print(f"MongoDB connection established in {time.time() - start:.2f} seconds")
    return _db_client

# Get MongoDB database with caching
def get_db():
    # Check if we already have a connection in the current request context
    if hasattr(g, 'db'):
        return g.db
    
    try:
        client = get_mongo_client()
        db_name = os.getenv('DATABASE_NAME', 'heisenstocks')
        g.db = client[db_name]
        
        # Create indexes if they don't exist (only in development/debug mode)
        if os.environ.get('FLASK_ENV') == 'development' or os.environ.get('FLASK_DEBUG') == '1':
            ensure_indexes(g.db)
        
        return g.db
    except Exception as e:
        print(f"Error getting database: {e}")
        # Return a dummy DB object for development that won't break the app
        from unittest.mock import MagicMock
        mock_db = MagicMock()
        # Make collections return empty lists
        mock_db.__getitem__ = lambda self, x: MagicMock(find=lambda *args, **kwargs: [], 
                                                       find_one=lambda *args, **kwargs: {}, 
                                                       aggregate=lambda *args, **kwargs: [],
                                                       count_documents=lambda *args, **kwargs: 0,
                                                       distinct=lambda *args, **kwargs: [])
        g.db = mock_db
        return mock_db

# Create necessary indexes for faster queries
def ensure_indexes(db):
    try:
        # Add indexes for frequently queried collections
        db['nepse-indices'].create_index([('published_date', -1)])
        db['nepse-indices'].create_index([('index_name', 1)])
        db['nepse-indices'].create_index([('index_id', 1)])
        
        db['nepse-stocks'].create_index([('published_date', -1)])
        db['nepse-stocks'].create_index([('company_id', 1)])
        db['nepse-stocks'].create_index([('company_id', 1), ('published_date', -1)])
        db['nepse-stocks'].create_index([('traded_amount', -1)])
        
        db.companies.create_index([('company_id', 1)])
        db.companies.create_index([('symbol', 1)])
        db.companies.create_index([('companyname', 'text')])
        print("Database indexes created/verified")
    except Exception as e:
        print(f"Warning: Could not create indexes: {e}")

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'heisenstocks-uncertainty-principle')
    
    # Configure session to use filesystem
    app.config['SESSION_TYPE'] = 'filesystem'
    app.config['SESSION_PERMANENT'] = True
    app.config['PERMANENT_SESSION_LIFETIME'] = 60 * 60 * 24 * 7  # 7 days
    app.config['SESSION_USE_SIGNER'] = True
    
    # Enable debug mode if set in environment
    if os.environ.get('FLASK_DEBUG') == '1':
        app.debug = True
    
    # Initialize login manager
    login_manager.init_app(app)
    
    # Initialize Flask-Caching with the app
    cache.init_app(app, config={
        'CACHE_TYPE': 'SimpleCache',  # Use memory caching for simplicity
        'CACHE_DEFAULT_TIMEOUT': 300,  # Cache timeout in seconds (5 minutes)
    })
    
    # Register custom Jinja2 filters
    from app.utils import format_number
    app.jinja_env.filters['format_number'] = format_number
    
    # Register blueprints
    from app.routes.main import main as main_blueprint
    app.register_blueprint(main_blueprint)
    
    from app.routes.companies import companies as companies_blueprint
    app.register_blueprint(companies_blueprint, url_prefix='/companies')
    
    from app.routes.charts import charts as charts_blueprint
    app.register_blueprint(charts_blueprint, url_prefix='/charts')
    
    from app.routes.auth import auth as auth_blueprint
    app.register_blueprint(auth_blueprint, url_prefix='/auth')
    
    # Import the User model for the login manager
    from app.models.user import User
    
    @login_manager.user_loader
    def load_user(user_id):
        try:
            db = get_db()
            # Get the users collection name from environment variable
            users_collection = os.getenv('USERS_COLLECTION', 'users')
            
            # Try to convert the user_id to ObjectId if it's in the right format
            from bson import ObjectId
            try:
                if ObjectId.is_valid(user_id):
                    object_id = ObjectId(user_id)
                    user_data = db[users_collection].find_one({'_id': object_id})
                else:
                    # Fallback: try looking up by string ID
                    user_data = db[users_collection].find_one({'_id': user_id})
            except:
                # If conversion fails, try as string
                user_data = db[users_collection].find_one({'_id': user_id})
                
            if user_data:
                print(f"Successfully loaded user: {user_data['username']}")
                return User(user_data)
            else:
                print(f"Failed to load user with ID: {user_id}")
                return None
        except Exception as e:
            print(f"Error in user loader: {e}")
            return None
    
    # Close database connection when application context ends
    @app.teardown_appcontext
    def close_db(error):
        # No need to close MongoDB connections as they're handled by the connection pool
        pass
    
    return app