import asyncio
import aiohttp
import json
import os
import sys
import warnings
import datetime
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# URL for fetching index data
url = "https://www.sharesansar.com/index-history-data"

# Mapping between index_id and index_name
index_mapping = {
    "1": "Banking Subindex",
    "2": "Development Bank Index",
    "3": "Finance Index",
    "4": "Float Index",
    "5": "Hotels And Tourism",
    "6": "HydroPower Index",
    "8": "Life Insurance",
    "9": "Manufacturing And Processing",
    "10": "Microfinance Index",
    "11": "Mutual Fund",
    "12": "NEPSE Index",
    "13": "Non Life Insurance",
    "14": "Others Index",
    "15": "Sensitive Float Index",
    "16": "Sensitive Index",
    "17": "Trading Index",
    "18": "Investment"
}

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Referer": "https://www.sharesansar.com/index-history"
}

# MongoDB connection setup
def connect_to_mongodb():
    mongo_uri = os.getenv('MONGODB_URI_ADMIN')
    database_name = os.getenv('DATABASE_NAME')
    indices_collection = os.getenv('NEPSE_INDICES')
    
    client = MongoClient(mongo_uri)
    db = client[database_name]
    
    # Connect to the indices collection using the name from .env
    collection = db[indices_collection]
    
    return collection

# Function to get the latest date for an index in the database
def get_latest_date_for_index(collection, index_id):
    try:
        # Convert index_id to integer for query
        index_id_int = int(index_id)
        
        # Find the document with the latest published_date for this index
        latest_record = collection.find(
            {"index_id": index_id_int},  # Use integer value
            {"published_date": 1}
        ).sort("published_date", -1).limit(1)
        
        latest_record = list(latest_record)
        if latest_record:
            latest_date = latest_record[0].get("published_date")
            print(f"Retrieved latest date from DB: {latest_date}")
            return latest_date
        else:
            print(f"No records found in database for index_id: {index_id}")
        
    except Exception as e:
        print(f"Error querying latest date for index_id {index_id}: {e}")
    
    return None

# Fetch new index data and directly insert into MongoDB
async def fetch_and_insert_new_index_data(index_id, collection, latest_date=None):
    # Reset all_data for each index
    all_data = []
    
    # Get today's date and yesterday's date
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Debug output
    print(f"Current date: {today}")
    if latest_date:
        print(f"Latest data in database: {latest_date}")
    
    # Set up session with headers
    async with aiohttp.ClientSession() as session:
        # First fetch just 5 most recent records to see if there's any new data
        # We'll check just the current week (7 days) to get the newest data first
        recent_params = {
            "draw": "1",
            "index_id": index_id,
            "from": yesterday,  # Start from yesterday to make sure we get today's data
            "to": today,
            "length": "50",
            "start": "0"
        }
        
        # Check if there's any new data in the current week
        print("Checking for most recent data...")
        async with session.get(url, headers=headers, params=recent_params) as response:
            data = await response.json()
            total_recent = int(data.get("recordsTotal", 0))
            print(f"Found {total_recent} recent records for {index_mapping[index_id]}")
            
            if total_recent > 0:
                rows = data.get("data", [])
                print("Recent data found! Sample of the newest records:")
                for i, record in enumerate(rows[:5]):
                    print(f"Record {i+1}: {record['published_date']}")
                
                # Check if any records are newer than what we have in DB
                new_data_found = False
                new_rows = []
                
                for row in rows:
                    row_date = row["published_date"]
                    # Compare with latest date in DB
                    if not latest_date or row_date > latest_date:
                        print(f"New data found: {row_date} > latest_date: {latest_date if latest_date else 'None'}")
                        new_data_found = True
                        row["index_name"] = index_mapping.get(str(row["index_id"]), f"Unknown Index ({row['index_id']})")
                        new_rows.append(row)
                
                if new_data_found:
                    print(f"Found {len(new_rows)} new records newer than {latest_date}")
                    all_data.extend(new_rows)
                else:
                    print("No new data found that's newer than what's in the database.")
            else:
                print("No recent data found for the last few days.")
        
        # If we haven't found new data in the current week, try a broader search
        if not all_data and latest_date:
            # Calculate a date range starting from the latest date in the DB
            # We'll look for data between the latest date and today
            from_date = latest_date
            
            # Now fetch any data from the latest date in DB until today
            range_params = {
                "draw": "1",
                "index_id": index_id,
                "from": from_date,  # Start from the latest date in DB
                "to": today,
                "length": "50",
                "start": "0"
            }
            
            print(f"Checking for any data between {from_date} and {today}...")
            async with session.get(url, headers=headers, params=range_params) as response:
                data = await response.json()
                total_range = int(data.get("recordsTotal", 0))
                print(f"Found {total_range} records in date range for {index_mapping[index_id]}")
                
                if total_range > 0:
                    rows = data.get("data", [])
                    print("Sample of records in the range:")
                    for i, record in enumerate(rows[:5]):
                        print(f"Record {i+1}: {record['published_date']}")
                    
                    # Check for records newer than what we have
                    for row in rows:
                        row_date = row["published_date"]
                        # Skip records with the same date as latest_date (they're already in our DB)
                        if row_date > latest_date:
                            print(f"New data found: {row_date} > latest_date: {latest_date}")
                            row["index_name"] = index_mapping.get(str(row["index_id"]), f"Unknown Index ({row['index_id']})")
                            all_data.append(row)
                    
                    if all_data:
                        print(f"Found {len(all_data)} new records newer than {latest_date}")
                    else:
                        print("No new data found in the date range search.")
                else:
                    print("No data found in the specified date range.")

    # Insert new data into MongoDB
    if all_data:
        # Prepare bulk operations for MongoDB
        operations = []
        for document in all_data:
            # Create a filter to find any existing matching document
            # We consider a record unique if it has the same index_id and published_date
            filter_query = {
                "index_id": document["index_id"],
                "published_date": document["published_date"]
            }
            
            # Create an update operation with upsert=True
            # This will update if a matching document exists, or insert if it doesn't
            operations.append(
                UpdateOne(
                    filter_query,
                    {"$set": document},
                    upsert=True
                )
            )
        
        # Execute the bulk write if there are operations
        if operations:
            try:
                result = collection.bulk_write(operations)
                updated = result.modified_count
                inserted = result.upserted_count
                print(f"Successfully inserted {inserted} new records and updated {updated} existing records in MongoDB")
                return len(all_data)
            except Exception as e:
                print(f"Error inserting data into MongoDB: {e}")
                return 0
    else:
        print(f"No new data was fetched for {index_mapping[index_id]}.")
        return 0

async def download_new_index_data():
    """
    Download new data for all indices in the index_mapping dictionary.
    Only fetches data newer than what's already in the database.
    Now directly inserts new data into MongoDB.
    """
    print(f"Starting fetch and insert of new data for all {len(index_mapping)} indices...")
    print(f"Today's date: {datetime.datetime.now().strftime('%Y-%m-%d')}")
    
    # Connect to MongoDB
    collection = connect_to_mongodb()
    print(f"Connected to MongoDB collection: {os.getenv('NEPSE_INDICES')}")
    
    # Track success and failures
    results = {}
    indices_with_new_data = 0
    indices_without_new_data = 0
    indices_with_errors = 0
    
    # Process each index sequentially
    total_indices = len(index_mapping)
    for i, (index_id, index_name) in enumerate(index_mapping.items()):
        print(f"\n{'='*80}")
        print(f"Processing index {index_id}: {index_name}")
        print(f"{'='*80}")
        print(f"PROGRESS: {int((i/total_indices)*100)}")
        
        try:
            # Get the latest date we have for this index
            latest_date = get_latest_date_for_index(collection, index_id)
            
            if latest_date:
                print(f"Latest data available for index {index_name}: {latest_date}")
                
                # Fetch only newer data for this index and insert directly to MongoDB
                record_count = await fetch_and_insert_new_index_data(index_id, collection, latest_date)
            else:
                print(f"No existing data found for index {index_name}. Will fetch all data.")
                # Fetch all data for this index and insert directly to MongoDB
                record_count = await fetch_and_insert_new_index_data(index_id, collection)
            
            # Update results
            if record_count > 0:
                results[index_name] = {
                    "status": "success",
                    "records": record_count
                }
                indices_with_new_data += 1
                print(f"Successfully processed {record_count} new records for {index_name}")
            else:
                results[index_name] = {
                    "status": "no_new_data",
                    "records": 0
                }
                indices_without_new_data += 1
                print(f"No new data available for {index_name}")
                
        except Exception as e:
            print(f"Error processing data for {index_name}: {e}")
            results[index_name] = {
                "status": "failed",
                "error": str(e)
            }
            indices_with_errors += 1
        
        print(f"PROGRESS: {int(((i+1)/total_indices)*100)}")
    
    # Print summary
    print("\n\nFetch and Insert Summary:")
    print("-"*50)
    for index_name, result in results.items():
        status = result["status"]
        if status == "success":
            print(f"{index_name}: SUCCESS - {result['records']} new records")
        elif status == "no_new_data":
            print(f"{index_name}: WARNING - No new data available")
        else:
            print(f"{index_name}: FAILED - {result['error']}")
    
    print(f"\nIndices with new data: {indices_with_new_data}")
    print(f"Indices with no new data: {indices_without_new_data}")
    print(f"Indices with errors: {indices_with_errors}")
    print(f"Total indices processed: {len(index_mapping)}")

# Run the asyncio event loop
if __name__ == "__main__":
    # Get today's date as a string (for logging)
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    print(f"Starting update for NEPSE indices data on {today}")
    
    # Fix for Windows asyncio issues
    if sys.platform.startswith('win'):
        # Use selector event loop policy on Windows to avoid ProactorEventLoop issues
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    # Suppress the RuntimeError warnings during shutdown
    warnings.filterwarnings("ignore", message="Exception ignored in.*_ProactorBasePipeTransport.__del__")
    
    try:
        # Get and configure the event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Run the main coroutine to download all indices
        loop.run_until_complete(download_new_index_data())
        
        # Clean up properly
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()
        
        # Run until all tasks are properly cancelled
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        
        # Close the loop properly
        loop.close()
    except Exception as e:
        print(f"Error: {e}")