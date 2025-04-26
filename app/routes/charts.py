from flask import Blueprint, render_template, request, jsonify
from app import get_db
from datetime import datetime, timedelta
from bson import ObjectId
import re
import json

charts = Blueprint('charts', __name__)

@charts.route('/')
def index():
    """Display the charts page with company/index selector"""
    db = get_db()
    
    # Get list of companies for the selector
    companies = list(db.companies.find({}).sort('symbol', 1))
    
    # Get list of indices for the selector
    indices = list(db['nepse-indices'].distinct('index_name'))
    
    return render_template(
        'charts/index.html',
        companies=companies,
        indices=indices
    )

@charts.route('/api/data')
def chart_data():
    """API endpoint for chart data based on parameters"""
    chart_type = request.args.get('type', 'company')
    identifier = request.args.get('id')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')
    
    if not identifier:
        return jsonify({"error": "Missing id parameter"}), 400
    
    db = get_db()
    
    # Parse dates if provided, otherwise use all available data
    query = {}
    if from_date:
        try:
            from_date = datetime.strptime(from_date, '%Y-%m-%d')
            query['published_date'] = {'$gte': from_date}
        except ValueError:
            query['published_date'] = {'$gte': from_date}
    
    if to_date:
        try:
            to_date = datetime.strptime(to_date, '%Y-%m-%d')
            if 'published_date' in query:
                query['published_date']['$lte'] = to_date
            else:
                query['published_date'] = {'$lte': to_date}
        except ValueError:
            if 'published_date' in query:
                query['published_date']['$lte'] = to_date
            else:
                query['published_date'] = {'$lte': to_date}
    
    if chart_type == 'company':
        try:
            company = db.companies.find_one({'_id': ObjectId(identifier)})
            
            if company:
                if 'company_id' in company:
                    query['company_id'] = company['company_id']
                elif 'symbol' in company:
                    query['company_symbol'] = company['symbol']
                else:
                    query['company_symbol'] = company.get('_id', identifier)
            else:
                try:
                    query['company_id'] = int(identifier)
                except ValueError:
                    query['company_symbol'] = identifier
        except Exception as e:
            return jsonify({"error": f"Invalid company identifier: {str(e)}"}), 400
        
        data = list(db['nepse-stocks'].find(query).sort('published_date', 1))
        
        if not data:
            if 'published_date' in query:
                tmp_query = query.copy()
                del tmp_query['published_date']
                data = list(db['nepse-stocks'].find(tmp_query).sort('published_date', 1))
                
                if not data:
                    return jsonify({"error": "No stock data available for this company"}), 404
        
        result = []
        for item in data:
            date_obj = item.get('published_date')
            date_str = None

            if isinstance(date_obj, datetime):
                date_str = date_obj.strftime('%Y-%m-%d')
            elif isinstance(date_obj, str):
                # Try parsing known string formats
                if re.match(r'^\d{4}-\d{1,2}-\d{1,2}$', date_obj):
                    parts = date_obj.split('-')
                    date_str = f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"
                elif re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', date_obj):
                    parts = date_obj.split('/')
                    date_str = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
                elif re.match(r'^\d{1,2}-\d{1,2}-\d{4}$', date_obj):
                    parts = date_obj.split('-')
                    date_str = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
                else:
                    # Attempt direct parsing if format is unknown but might be valid
                    try:
                        parsed_date = datetime.fromisoformat(date_obj.split('T')[0]) # Handle ISO strings like '2023-10-26T00:00:00Z'
                        date_str = parsed_date.strftime('%Y-%m-%d')
                    except ValueError:
                        print(f"Warning: Could not parse date string: {date_obj}")
                        continue # Skip this data point if date is unparseable
            elif isinstance(date_obj, dict) and 'year' in date_obj and 'month' in date_obj and 'day' in date_obj:
                # Handle the object format {day: d, month: m, year: y}
                try:
                    year = int(date_obj['year'])
                    month = int(date_obj['month'])
                    day = int(date_obj['day'])
                    date_str = f"{year:04d}-{month:02d}-{day:02d}"
                except (ValueError, TypeError):
                    print(f"Warning: Could not parse date object: {date_obj}")
                    continue # Skip if object parts are invalid
            else:
                print(f"Warning: Unknown date format for item: {item.get('_id', 'N/A')}, date: {date_obj}")
                continue # Skip if date format is completely unknown

            if not date_str:
                continue # Skip if date couldn't be determined

            try:
                open_price = float(item.get('open', 0))
                high_price = float(item.get('high', 0))
                low_price = float(item.get('low', 0))
                close_price = float(item.get('close', 0))

                # Ensure prices are finite numbers
                if not all(map(lambda x: isinstance(x, (int, float)) and x is not None and x == x, [open_price, high_price, low_price, close_price])):
                     print(f"Warning: Non-finite price found for date {date_str}, skipping.")
                     continue

                # Skip if all prices are zero (might indicate bad data)
                if open_price == 0 and high_price == 0 and low_price == 0 and close_price == 0:
                    print(f"Warning: All prices are zero for date {date_str}, skipping.")
                    continue

            except (ValueError, TypeError) as e:
                print(f"Warning: Error processing prices for date {date_str}: {e}, skipping.")
                continue

            volume = 0
            if 'traded_quantity' in item:
                try:
                    volume = float(item['traded_quantity'])
                except (ValueError, TypeError):
                    volume = 0
            
            result.append({
                'time': date_str, # Ensure this is always YYYY-MM-DD string
                'open': open_price,
                'high': high_price,
                'low': low_price,
                'close': close_price,
                'volume': int(volume)
            })
        
        if not result:
            return jsonify({"error": "No valid data points found for this company"}), 404
        
    elif chart_type == 'index':
        query['index_name'] = identifier
        
        data = list(db['nepse-indices'].find(query).sort('published_date', 1))
        
        if not data:
            if 'published_date' in query:
                del query['published_date']
            data = list(db['nepse-indices'].find({'index_name': identifier}).sort('published_date', 1))
        
        result = []
        for item in data:
            date_obj = item.get('published_date')
            date_str = None

            if isinstance(date_obj, datetime):
                date_str = date_obj.strftime('%Y-%m-%d')
            elif isinstance(date_obj, str):
                 # Try parsing known string formats (similar to company logic)
                if re.match(r'^\d{4}-\d{1,2}-\d{1,2}$', date_obj):
                    parts = date_obj.split('-')
                    date_str = f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"
                elif re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', date_obj):
                    parts = date_obj.split('/')
                    date_str = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
                elif re.match(r'^\d{1,2}-\d{1,2}-\d{4}$', date_obj):
                    parts = date_obj.split('-')
                    date_str = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
                else:
                    try:
                        parsed_date = datetime.fromisoformat(date_obj.split('T')[0])
                        date_str = parsed_date.strftime('%Y-%m-%d')
                    except ValueError:
                        print(f"Warning: Could not parse index date string: {date_obj}")
                        continue
            elif isinstance(date_obj, dict) and 'year' in date_obj and 'month' in date_obj and 'day' in date_obj:
                 # Handle the object format {day: d, month: m, year: y}
                try:
                    year = int(date_obj['year'])
                    month = int(date_obj['month'])
                    day = int(date_obj['day'])
                    date_str = f"{year:04d}-{month:02d}-{day:02d}"
                except (ValueError, TypeError):
                    print(f"Warning: Could not parse index date object: {date_obj}")
                    continue
            else:
                print(f"Warning: Unknown index date format for item: {item.get('_id', 'N/A')}, date: {date_obj}")
                continue

            if not date_str:
                continue

            try:
                current_value = float(item.get('current', 0))
                # Use current_value as default for OHLC if they are missing/invalid
                open_value = float(item.get('open', current_value)) if item.get('open') is not None else current_value
                high_value = float(item.get('high', current_value)) if item.get('high') is not None else current_value
                low_value = float(item.get('low', current_value)) if item.get('low') is not None else current_value

                # Ensure prices are finite numbers
                if not all(map(lambda x: isinstance(x, (int, float)) and x is not None and x == x, [open_value, high_value, low_value, current_value])):
                     print(f"Warning: Non-finite index value found for date {date_str}, skipping.")
                     continue

            except (ValueError, TypeError) as e:
                print(f"Warning: Error processing index values for date {date_str}: {e}, skipping.")
                continue

            result.append({
                'time': date_str, # Ensure this is always YYYY-MM-DD string
                'value': current_value, # Keep original 'value' if needed by line chart
                'open': open_value,
                'high': high_value,
                'low': low_value,
                'close': current_value # Candlestick uses 'close'
            })
    
    else:
        return jsonify({"error": "Invalid chart type"}), 400
    
    return jsonify(result)

@charts.route('/api/turnover')
def turnover_data():
    date_str = request.args.get('date')
    
    if not date_str:
        return jsonify({"error": "Missing date parameter"}), 400
    
    db = get_db()
    
    try:
        query = {}
        try:
            date = datetime.strptime(date_str, '%Y-%m-%d')
            query['published_date'] = date
        except ValueError:
            query['published_date'] = date_str
        
        index_data = db['nepse-indices'].find_one({
            'index_name': 'NEPSE Index',
            'published_date': query['published_date']
        })
        
        if index_data and 'turnover' in index_data:
            try:
                total_turnover = float(index_data['turnover'])
                return jsonify({
                    'date': date_str,
                    'totalTurnover': total_turnover
                })
            except (ValueError, TypeError):
                pass
        
        stocks = list(db['nepse-stocks'].find(query))
        
        total_turnover = 0
        for stock in stocks:
            if 'traded_amount' in stock:
                value = stock['traded_amount']
            elif 'turnover' in stock:
                value = stock['turnover']
            elif 'traded_value' in stock:
                value = stock['traded_value']
            else:
                price = float(stock.get('close', 0))
                quantity = 0
                if 'traded_quantity' in stock:
                    quantity = float(stock['traded_quantity'])
                elif 'traded_shares' in stock:
                    quantity = float(stock['traded_shares'])
                value = price * quantity
            
            if isinstance(value, str):
                try:
                    value = float(value)
                except ValueError:
                    value = 0
            
            total_turnover += value
        
        return jsonify({
            'date': date_str,
            'totalTurnover': total_turnover
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@charts.route('/api/companies')
def companies_list():
    """API endpoint for getting company data for search functionality"""
    db = get_db()
    
    # Get list of companies with their full names
    companies = list(db.companies.find({}, {'symbol': 1, 'companyname': 1}).sort('symbol', 1))
    
    # Format for frontend search
    result = []
    for company in companies:
        result.append({
            'id': str(company['_id']),
            'symbol': company['symbol'],
            'name': company.get('companyname', '') # Include company name
        })
    
    # Also add indices
    indices = list(db['nepse-indices'].distinct('index_name'))
    for index in indices:
        result.append({
            'id': index,
            'symbol': index,
            'name': 'Index',
            'isIndex': True
        })
    
    return jsonify(result)