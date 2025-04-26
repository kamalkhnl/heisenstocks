from flask import Blueprint, render_template, request, jsonify, current_app
from app import get_db
from app.models.index import Index
from datetime import datetime

main = Blueprint('main', __name__)

@main.route('/')
def index():
    """Render the homepage with NEPSE index data and summary"""
    # Skip caching for now until we fix the issue
    # If no cached data, fetch from database
    db = get_db()
    from datetime import datetime
    
    # Define the mapping of all expected indices
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
    
    # Use MongoDB aggregation pipeline for more efficient querying
    # Get the latest date first to minimize queries
    latest_date_doc = db['nepse-indices'].find_one({}, sort=[('published_date', -1)])
    latest_date = latest_date_doc['published_date'] if latest_date_doc else datetime.now()
    
    # Get the latest NEPSE index data
    latest_index = db['nepse-indices'].find_one(
        {'index_name': 'NEPSE Index', 'published_date': latest_date}
    )
    
    # Get all indices from the latest date in a single query
    all_indices = list(db['nepse-indices'].find({'published_date': latest_date}))
    
    # Get market turnover directly from NEPSE Index data
    indices_total_turnover = 0
    if latest_index and 'turnover' in latest_index:
        try:
            # Convert to float if it's a string
            indices_total_turnover = float(latest_index['turnover']) if isinstance(latest_index['turnover'], str) else latest_index['turnover']
            print(f"Using NEPSE Index turnover: {indices_total_turnover} for date {latest_date}")
        except (ValueError, TypeError) as e:
            print(f"Error parsing NEPSE Index turnover: {e}")
            indices_total_turnover = 0
    
    # Get latest stock date
    latest_date_stocks = db['nepse-stocks'].find_one(
        {}, 
        sort=[('published_date', -1)]
    )
    latest_stock_date = latest_date_stocks['published_date'] if latest_date_stocks else None
    
    # Calculate total turnover and get most active stocks in a single query
    if latest_stock_date:
        # Get most active stocks and total turnover in a single aggregation
        pipeline = [
            {'$match': {'published_date': latest_stock_date}},
            {'$facet': {
                'most_active': [
                    {'$sort': {'traded_amount': -1}},
                    {'$limit': 8}
                ],
                'total_turnover': [
                    {'$group': {'_id': None, 'total': {'$sum': '$traded_amount'}}}
                ]
            }}
        ]
        
        agg_result = list(db['nepse-stocks'].aggregate(pipeline))
        
        if agg_result and agg_result[0]['total_turnover']:
            total_turnover = agg_result[0]['total_turnover'][0]['total']
            stocks = agg_result[0]['most_active']
        else:
            total_turnover = 0
            stocks = []
    else:
        total_turnover = 0
        stocks = []
    
    # Create a lookup map of found indices by ID
    found_indices = {}
    for idx in all_indices:
        if 'index_id' in idx:
            # Ensure index_id is treated as string for consistency
            str_id = str(idx['index_id'])
            found_indices[str_id] = idx
    
    # Create a complete list with all indices (including placeholders for missing ones)
    indices = []
    
    # Iterate through the expected indices (1-18)
    for idx_num in range(1, 19):
        str_idx = str(idx_num)
        
        # Skip indices that don't exist in our mapping
        if str_idx not in index_mapping:
            continue
            
        # If this index exists in our found indices, use that data
        if str_idx in found_indices:
            index_data = found_indices[str_idx]
            # Make sure there's no placeholder flag
            if 'is_placeholder' in index_data:
                del index_data['is_placeholder']
            indices.append(index_data)
        else:
            # Create a placeholder for the missing index
            placeholder = {
                'index_id': str_idx,
                'index_name': index_mapping[str_idx],
                'published_date': latest_date,
                'current': 0,
                'change_': 0,
                'per_change': 0,
                'is_placeholder': True  # Mark as placeholder for template
            }
            indices.append(placeholder)
    
    # Convert string values to proper types
    for index in indices:
        # Convert numeric values
        for key in ['current', 'change_', 'per_change', 'high', 'low', 'open', 'turnover']:
            if key in index and isinstance(index[key], str):
                try:
                    index[key] = float(index[key])
                except (ValueError, TypeError):
                    index[key] = 0
    
    # Convert published_date string to datetime object if needed
    if latest_index and 'published_date' in latest_index and isinstance(latest_index['published_date'], str):
        try:
            latest_index['published_date'] = datetime.strptime(latest_index['published_date'], '%Y-%m-%d')
        except (ValueError, TypeError):
            latest_index['published_date'] = datetime.now()
    
    # Convert string values to numeric for stocks
    for stock in stocks:
        for key in ['open', 'high', 'low', 'close', 'per_change', 'traded_quantity', 'traded_amount']:
            if key in stock and isinstance(stock[key], str):
                try:
                    stock[key] = float(stock[key])
                except (ValueError, TypeError):
                    stock[key] = 0
    
        # Convert published_date for stocks if needed
        if 'published_date' in stock and isinstance(stock['published_date'], str):
            try:
                stock['published_date'] = datetime.strptime(stock['published_date'], '%Y-%m-%d')
            except (ValueError, TypeError):
                stock['published_date'] = datetime.now()
    
    # Prepare data for template
    template_data = {
        'nepse': latest_index, 
        'indices': indices, 
        'total_turnover': total_turnover,
        'indices_total_turnover': indices_total_turnover,
        'stocks': stocks,
        'now': datetime.now()
    }
    
    # Skip caching for now until we fix the issue
    # if cache:
    #     cache.set('homepage_data', template_data, timeout=300)
    
    return render_template('home.html', **template_data)

@main.route('/search')
def search():
    """AJAX endpoint for search autosuggestions"""
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify([])
    
    # Skip caching for now
    db = get_db()
    
    # Use text index for more efficient search
    companies = list(db.companies.find({
        '$or': [
            {'symbol': {'$regex': query, '$options': 'i'}},
            {'companyname': {'$regex': query, '$options': 'i'}} # Changed from company_name to companyname
        ]
    }).limit(10))
    
    # Use index for faster index name search
    indices = list(db['nepse-indices'].find({
        'index_name': {'$regex': query, '$options': 'i'} # Changed from name to index_name
    }).distinct('index_name'))
    
    results = []
    
    # Format companies for the suggestions
    for company in companies:
        results.append({
            'id': company.get('company_id'),
            'text': f"{company.get('symbol')} - {company.get('companyname')}", # Changed to companyname
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
    
    # Skip caching for now
    return jsonify(results)