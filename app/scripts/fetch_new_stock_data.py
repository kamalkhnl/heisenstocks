import requests
import json
import os
import datetime
import concurrent.futures
import time
from urllib.parse import unquote
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# MongoDB connection setup
def connect_to_mongodb():
    mongo_uri = os.getenv('MONGODB_URI')
    database_name = os.getenv('DATABASE_NAME')
    stocks_collection = os.getenv('NEPSE_STOCKS')
    
    client = MongoClient(mongo_uri)
    db = client[database_name]
    
    # Connect to the stocks collection using the name from .env
    collection = db[stocks_collection]
    
    return collection, client

# Function to get the latest date for a company in the database
def get_latest_date_for_company(collection, company_id):
    try:
        # Find the document with the latest published_date for this company
        latest_record = collection.find(
            {"company_id": company_id},
            {"published_date": 1}
        ).sort("published_date", -1).limit(1)
        
        latest_record = list(latest_record)
        if latest_record:
            return latest_record[0].get("published_date")
        else:
            print(f"No records found in database for company_id: {company_id}")
        
    except Exception as e:
        print(f"Error querying latest date for company_id {company_id}: {e}")
    
    return None

# Function to fetch company price history data and insert into MongoDB
def fetch_new_company_data(company_id, company_symbol, start_date=None, stocks_collection=None):
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0',
        'Referer': f'https://www.sharesansar.com/company/{company_symbol}'
    })
    
    # Step 1: load the company page to get cookies
    try:
        session.get(f'https://www.sharesansar.com/company/{company_symbol}')

        # Decode XSRF-TOKEN
        xsrf_cookie = session.cookies.get('XSRF-TOKEN')
        xsrf_token = unquote(xsrf_cookie) if xsrf_cookie else None
        session.headers.update({'X-XSRF-TOKEN': xsrf_token})

        # Step 2: prepare DataTables parameters
        payload = {
            'columns[0][data]': 'DT_Row_Index',    'columns[0][searchable]': 'false', 'columns[0][orderable]': 'false',
            'columns[1][data]': 'published_date',  'columns[1][searchable]': 'true',  'columns[1][orderable]': 'false',
            'columns[2][data]': 'open',            'columns[2][searchable]': 'false', 'columns[2][orderable]': 'false',
            'columns[3][data]': 'high',            'columns[3][searchable]': 'false', 'columns[3][orderable]': 'false',
            'columns[4][data]': 'low',             'columns[4][searchable]': 'false', 'columns[4][orderable]': 'false',
            'columns[5][data]': 'close',           'columns[5][searchable]': 'false', 'columns[5][orderable]': 'false',
            'columns[6][data]': 'per_change',      'columns[6][searchable]': 'false', 'columns[6][orderable]': 'false',
            'columns[7][data]': 'traded_quantity', 'columns[7][searchable]': 'false', 'columns[7][orderable]': 'false',
            'columns[8][data]': 'traded_amount',   'columns[8][searchable]': 'false', 'columns[8][orderable]': 'false',
            'company': str(company_id),
            'draw': '1',
            'length': '50',
            'start': '0',
            'search[regex]': 'false'
        }

        headers = {
            'X-Requested-With': 'XMLHttpRequest'
        }

        # Step 3: fetch all price history data
        all_data = []
        start = 0
        length = 50
        total_records = None
        
        new_data_found = False

        # Today's date for debugging
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        
        if start_date:
            print(f"Looking for data newer than: {start_date} for {company_symbol}")

        while total_records is None or start < total_records:
            # Update start position in payload
            payload['start'] = str(start)
            
            # Make the request
            response = session.post('https://www.sharesansar.com/company-price-history', params=payload, headers=headers)
            page_data = response.json()
            
            # Get total records count (first time only)
            if total_records is None:
                total_records = page_data['recordsTotal']
                print(f"Company {company_symbol} (ID: {company_id}): Total records available: {total_records}")
            
            # Process the data and check if it's newer than what we already have
            current_page_data = []
            filtered_count = 0
            
            for record in page_data['data']:
                # If we have a start date and this record is older or equal, skip it
                if start_date and record['published_date'] <= start_date:
                    filtered_count += 1
                    continue
                
                new_data_found = True
                record['company_id'] = company_id
                record['company_symbol'] = company_symbol
                current_page_data.append(record)
            
            # Report filtering
            if filtered_count > 0:
                print(f"Filtered out {filtered_count} records that are not newer than {start_date} for {company_symbol}")
            
            # Add new data to our collection
            all_data.extend(current_page_data)
            
            # Move to next page
            start += length
            print(f"Company {company_symbol}: Processed records {start-length+1} to {min(start, total_records)} of {total_records}")
            
            # If we got less new data than requested and filtered some out, we might have reached existing data
            if len(current_page_data) < length and filtered_count > 0:
                print(f"Found fewer new records than expected for {company_symbol}, likely reached existing data.")
                break
            
            # If we found no new data in this batch, and we've already found some new data before,
            # we can stop as we've likely reached older data than what we're interested in
            if len(current_page_data) == 0 and new_data_found:
                print(f"No new data in this batch for {company_symbol}, stopping as we've reached existing data.")
                break

        print(f"Company {company_symbol}: Total new records fetched: {len(all_data)}")

        # Insert new data into MongoDB
        if all_data and stocks_collection is not None:  # Fixed condition check
            try:
                # Insert many records at once for better performance
                result = stocks_collection.insert_many(all_data, ordered=False)
                print(f"Successfully inserted {len(result.inserted_ids)} records for {company_symbol} into database")
                return len(result.inserted_ids), True
            except Exception as e:
                print(f"Error inserting data for {company_symbol}: {e}")
                return 0, False
        elif not all_data:
            print(f"No new data to insert for {company_symbol}")
            return 0, True  # No data, but technically successful (no error)
        else:
            print(f"Cannot insert data: MongoDB collection not provided for {company_symbol}")
            return 0, False
            
    except Exception as e:
        print(f"Error processing company {company_symbol}: {e}")
        return 0, False

# Function to process a batch of companies with one worker
def process_company_batch(company_batch, stocks_collection):
    result = {
        "companies_updated": 0,
        "companies_no_updates": 0,
        "companies_with_errors": 0,
        "total_records_processed": 0
    }
    
    for company_info in company_batch:
        company_id = company_info["id"]
        company_symbol = company_info["symbol"]
        latest_date = company_info["latest_date"]
        
        print(f"\nProcessing company: {company_symbol}, ID: {company_id}")
        
        try:
            if latest_date:
                print(f"Latest data available for {company_symbol}: {latest_date}")
                # Fetch only newer price history data and insert into MongoDB
                records_processed, success = fetch_new_company_data(company_id, company_symbol, latest_date, stocks_collection)
            else:
                print(f"No existing data found for {company_symbol}. Will fetch all data.")
                # Fetch all price history data and insert into MongoDB
                records_processed, success = fetch_new_company_data(company_id, company_symbol, None, stocks_collection)
            
            # Update results
            if success:
                if records_processed > 0:
                    result["companies_updated"] += 1
                    result["total_records_processed"] += records_processed
                else:
                    result["companies_no_updates"] += 1
            else:
                result["companies_with_errors"] += 1
                
        except Exception as e:
            print(f"Error processing company {company_symbol}: {str(e)}")
            result["companies_with_errors"] += 1
            
    return result

def main():
    # Get today's date as a string (for logging)
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    print(f"Starting update for NEPSE company data on {today}")
    
    # Number of worker threads to use (adjust based on your system)
    num_workers = 8
    print(f"Using {num_workers} worker threads to process companies")
    
    # Connect to MongoDB
    stocks_collection, mongo_client = connect_to_mongodb()
    print(f"Connected to MongoDB collection: {os.getenv('NEPSE_STOCKS')}")
    
    try:
        # Get a unique list of companies from the stocks collection
        unique_companies = stocks_collection.distinct("company_id", {})
        print(f"Found {len(unique_companies)} unique company IDs in the database")
        
        # Get company details and latest dates for all companies
        company_info_list = []
        skipped_companies = []
        
        print("Building company list and checking latest dates...")
        for company_id in unique_companies:
            # Find symbol for this company_id
            company_data = stocks_collection.find_one({"company_id": company_id}, {"company_symbol": 1})
            
            if company_data and "company_symbol" in company_data:
                company_symbol = company_data["company_symbol"]
                
                # Get the latest date for this company
                latest_date = get_latest_date_for_company(stocks_collection, company_id)
                
                company_info_list.append({
                    "id": company_id,
                    "symbol": company_symbol,
                    "latest_date": latest_date
                })
            else:
                skipped_companies.append({
                    "id": company_id,
                    "reason": "Missing company_symbol in database"
                })
                print(f"Skipping company ID {company_id}: Missing company_symbol in database")
        
        print(f"Found {len(company_info_list)} companies with valid symbols")
        print(f"Skipped {len(skipped_companies)} companies due to missing information")
        
        # Log skipped companies to a file for later analysis
        if skipped_companies:
            # Create data directory if it doesn't exist
            data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
            os.makedirs(data_dir, exist_ok=True)
            
            # Save skipped companies to JSON
            skipped_file = os.path.join(data_dir, 'skipped_companies.json')
            with open(skipped_file, 'w', encoding='utf-8') as f:
                json.dump(skipped_companies, f, indent=4)
            
            print(f"Saved information about skipped companies to {skipped_file}")
        
        # Divide companies among workers
        companies_per_worker = len(company_info_list) // num_workers
        if len(company_info_list) % num_workers > 0:
            companies_per_worker += 1
        
        company_batches = []
        for i in range(0, len(company_info_list), companies_per_worker):
            batch = company_info_list[i:i + companies_per_worker]
            company_batches.append(batch)
        
        print(f"Divided companies into {len(company_batches)} batches")
        
        # Process batches in parallel using ThreadPoolExecutor
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
            # Submit tasks
            future_to_batch = {
                executor.submit(process_company_batch, batch, stocks_collection): i 
                for i, batch in enumerate(company_batches)
            }
            
            # Track overall results
            total_companies_updated = 0
            total_companies_no_updates = 0
            total_companies_with_errors = 0
            total_records_processed = 0
            
            # Process results as they complete
            for future in concurrent.futures.as_completed(future_to_batch):
                batch_index = future_to_batch[future]
                try:
                    result = future.result()
                    
                    # Aggregate results
                    total_companies_updated += result["companies_updated"]
                    total_companies_no_updates += result["companies_no_updates"]
                    total_companies_with_errors += result["companies_with_errors"]
                    total_records_processed += result["total_records_processed"]
                    
                    print(f"Batch {batch_index+1} completed: {result['companies_updated']} updated, " 
                          f"{result['companies_no_updates']} no updates, {result['companies_with_errors']} errors, "
                          f"{result['total_records_processed']} records processed")
                          
                except Exception as e:
                    print(f"Batch {batch_index+1} generated an exception: {e}")
        
        # Print final summary
        print("\n" + "="*50)
        print("UPDATE SUMMARY")
        print("="*50)
        print(f"Companies with new data: {total_companies_updated}")
        print(f"Companies with no updates needed: {total_companies_no_updates}")
        print(f"Companies with errors during update: {total_companies_with_errors}")
        print(f"Skipped companies (missing information): {len(skipped_companies)}")
        print(f"Total records processed: {total_records_processed}")
        print(f"Total companies processed: {total_companies_updated + total_companies_no_updates + total_companies_with_errors}")
        print(f"Total companies in database: {len(unique_companies)}")
        
    finally:
        # Close MongoDB connection when done
        mongo_client.close()
        print("MongoDB connection closed")
    
if __name__ == "__main__":
    main()