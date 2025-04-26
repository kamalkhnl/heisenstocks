from flask import current_app
from app import get_db
from datetime import datetime, timedelta
import csv
import io
import json
import locale

# Set locale for number formatting
try:
    locale.setlocale(locale.LC_ALL, 'en_US.UTF-8')
except:
    try:
        locale.setlocale(locale.LC_ALL, 'en_US')
    except:
        pass  # Fallback to default locale if en_US is not available

def format_number(value):
    """Format a number with thousand separators"""
    try:
        if isinstance(value, int) or (isinstance(value, float) and value.is_integer()):
            # Format as integer
            return f"{int(value):,}"
        else:
            # Format as float with 2 decimal places
            return f"{float(value):,.2f}"
    except:
        return value

def get_latest_index_data(index_name=None):
    """Get the latest index data from MongoDB"""
    db = get_db()
    query = {}
    if index_name:
        query['index_name'] = index_name  # Changed from 'name' to 'index_name'
    
    return db['nepse-indices'].find_one(
        query, 
        sort=[('published_date', -1)]
    )

def get_latest_trading_date():
    """Get the latest trading date from stock data"""
    db = get_db()
    latest_stock = db['nepse-stocks'].find_one(
        {}, 
        sort=[('published_date', -1)]
    )
    
    return latest_stock['published_date'] if latest_stock else None

def get_date_range_data(collection, start_date=None, end_date=None, **query):
    """Get data within a date range from MongoDB"""
    db = get_db()
    
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query['$gte'] = start_date
        if end_date:
            date_query['$lte'] = end_date
        
        query['published_date'] = date_query
    
    return list(db[collection].find(
        query, 
        sort=[('published_date', 1)]
    ))

def get_company_by_id(company_id):
    """Get company data by ID"""
    db = get_db()
    # Convert company_id to integer if it's a string
    if isinstance(company_id, str):
        try:
            company_id = int(company_id)
        except ValueError:
            return None
    return db.companies.find_one({'company_id': company_id})

def get_company_stock_data(company_id, limit=30, start_date=None, end_date=None):
    """Get stock data for a specific company"""
    db = get_db()
    
    # Convert company_id to integer if it's a string
    if isinstance(company_id, str):
        try:
            company_id = int(company_id)
        except ValueError:
            return []
            
    query = {'company_id': company_id}
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query['$gte'] = start_date
        if end_date:
            date_query['$lte'] = end_date
        
        query['published_date'] = date_query
    
    return list(db['nepse-stocks'].find(
        query,
        sort=[('published_date', -1)]
    ).limit(limit if not (start_date or end_date) else 0))

def export_to_csv(data, fields):
    """Export data to CSV format"""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    
    for row in data:
        # Convert any non-serializable objects (like ObjectId) to string
        clean_row = {}
        for key, value in row.items():
            if key not in fields:
                continue
                
            if isinstance(value, datetime):
                clean_row[key] = value.strftime('%Y-%m-%d')
            else:
                clean_row[key] = value
        
        writer.writerow(clean_row)
    
    return output.getvalue()

def get_autocomplete_suggestions(query, max_results=10):
    """Get autocomplete suggestions for the search bar"""
    db = get_db()
    
    # Search in companies by symbol or name (case-insensitive)
    companies = list(db.companies.find({
        '$or': [
            {'symbol': {'$regex': query, '$options': 'i'}},
            {'companyname': {'$regex': query, '$options': 'i'}}  # Changed from company_name to companyname
        ]
    }).limit(max_results))
    
    # Search in indices by name
    indices = list(db['nepse-indices'].find({
        'index_name': {'$regex': query, '$options': 'i'}  # Changed from name to index_name
    }).distinct('index_name'))
    
    results = []
    
    # Format companies for the suggestions
    for company in companies:
        results.append({
            'id': company.get('company_id'),
            'text': f"{company.get('symbol')} - {company.get('companyname')}",  # Changed to companyname
            'type': 'company',
            'url': f"/companies/{company.get('company_id')}"
        })
    
    # Format indices for the suggestions
    for index_name in indices:
        results.append({
            'id': index_name,
            'text': index_name,
            'type': 'index',
            'url': f"/charts?type=index&id={index_name}"
        })
    
    return results