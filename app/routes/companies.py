from flask import Blueprint, render_template, request, jsonify, abort
from app import get_db
from app.models.company import Company
from app.models.stock import Stock
from bson.objectid import ObjectId
import math

companies = Blueprint('companies', __name__)

@companies.route('/')
def index():
    """Display list of all companies with pagination"""
    page = request.args.get('page', 1, type=int)
    per_page = 20
    db = get_db()
    
    # Count total companies for pagination
    total_companies = db.companies.count_documents({})
    total_pages = math.ceil(total_companies / per_page)
    
    # Get companies for current page
    skip = (page - 1) * per_page
    company_list = list(db.companies.find({})
                        .sort('symbol', 1)
                        .skip(skip)
                        .limit(per_page))
    
    # Get latest stock data for these companies
    try:
        latest_date = db['nepse-stocks'].find_one(
            {}, sort=[('published_date', -1)]
        )['published_date']
        
        for company in company_list:
            latest_stock = db['nepse-stocks'].find_one({
                'company_id': company['company_id'],
                'published_date': latest_date
            })
            
            if latest_stock:
                # Ensure numeric values are converted from strings if needed
                for key in ['close', 'per_change']:
                    if key in latest_stock and isinstance(latest_stock[key], str):
                        try:
                            latest_stock[key] = float(latest_stock[key])
                        except (ValueError, TypeError):
                            latest_stock[key] = 0
                
                company['latest_price'] = latest_stock.get('close')
                company['per_change'] = latest_stock.get('per_change')
            else:
                company['latest_price'] = None
                company['per_change'] = None
    except (KeyError, TypeError):
        # Handle case where there's no stock data
        for company in company_list:
            company['latest_price'] = None
            company['per_change'] = None
    
    return render_template(
        'companies/index.html',
        companies=company_list,
        current_page=page,
        total_pages=total_pages
    )

@companies.route('/<company_id>')
def company_detail(company_id):
    """Display detailed information for a specific company"""
    db = get_db()
    
    # Get company info - convert company_id to integer since it's stored that way in MongoDB
    try:
        company_id_int = int(company_id)
    except ValueError:
        abort(404)
        
    company_data = db.companies.find_one({'company_id': company_id_int})
    if not company_data:
        abort(404)
    
    company = Company.from_dict(company_data)
    
    # Get historical stock data
    limit = request.args.get('limit', 30, type=int)
    stock_data = list(db['nepse-stocks'].find(
        {'company_id': company_id_int}
    ).sort('published_date', -1).limit(limit))
    
    # Ensure numeric values are converted from strings if needed
    for stock in stock_data:
        for key in ['open', 'high', 'low', 'close', 'per_change', 'traded_quantity', 'traded_amount']:
            if key in stock and isinstance(stock[key], str):
                try:
                    stock[key] = float(stock[key])
                except (ValueError, TypeError):
                    stock[key] = 0
    
    # Reverse for chronological order (for charts)
    stock_data.reverse()
    
    return render_template(
        'companies/detail.html',
        company=company,
        stock_data=stock_data
    )

@companies.route('/api/<company_id>/data')
def company_data_api(company_id):
    """API endpoint to get company stock data for charts"""
    db = get_db()
    
    # Verify company exists
    try:
        company_id_int = int(company_id)
    except ValueError:
        return jsonify({"error": "Invalid company ID"}), 400
        
    company = db.companies.find_one({'company_id': company_id_int})
    if not company:
        return jsonify({"error": "Company not found"}), 404
    
    # Get date range parameters
    from_date = request.args.get('from')
    to_date = request.args.get('to')
    
    # Build query
    query = {'company_id': company_id_int}
    if from_date or to_date:
        query['published_date'] = {}
        if from_date:
            query['published_date']['$gte'] = from_date
        if to_date:
            query['published_date']['$lte'] = to_date
    
    # Get stock data
    stock_data = list(db['nepse-stocks'].find(
        query
    ).sort('published_date', 1))
    
    # Format for the chart
    chart_data = []
    for stock in stock_data:
        # Convert string values to numbers if needed
        for key in ['open', 'high', 'low', 'close', 'traded_quantity']:
            if key in stock and isinstance(stock[key], str):
                try:
                    stock[key] = float(stock[key]) if key != 'traded_quantity' else int(float(stock[key]))
                except (ValueError, TypeError):
                    stock[key] = 0
                    
        chart_data.append({
            'time': stock['published_date'].strftime('%Y-%m-%d'),
            'open': float(stock['open']),
            'high': float(stock['high']),
            'low': float(stock['low']),
            'close': float(stock['close']),
            'volume': int(float(stock['traded_quantity']))
        })
    
    return jsonify(chart_data)