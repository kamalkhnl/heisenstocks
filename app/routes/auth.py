from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import check_password_hash
from app import get_db
from app.models.user import User
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, TextAreaField, IntegerField
from wtforms.validators import DataRequired, Optional
import os
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId
from datetime import datetime

auth = Blueprint('auth', __name__)

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    submit = SubmitField('Log In')

class CompanyForm(FlaskForm):
    symbol = StringField('Symbol', validators=[DataRequired()])
    companyname = StringField('Company Name', validators=[DataRequired()])
    sector = StringField('Sector', validators=[Optional()])
    listed_shares = IntegerField('Listed Shares', validators=[Optional()])
    description = TextAreaField('Description', validators=[Optional()])
    submit = SubmitField('Save Company')

def get_users_collection():
    """Get the users collection from the database"""
    # Get the main database
    db = get_db()
    # Get the users collection name from environment variable
    users_collection = os.getenv('USERS_COLLECTION', 'users')
    # Return the users collection
    return db[users_collection]

@auth.route('/login', methods=['GET', 'POST'])
def login():
    # If user is already logged in, redirect to home
    if current_user.is_authenticated:
        if current_user.is_admin:
            return redirect(url_for('auth.admin'))
        return redirect(url_for('main.index'))
    
    form = LoginForm()
    if form.validate_on_submit():
        # Get the users collection
        users = get_users_collection()
        user_data = users.find_one({'username': form.username.data})
        
        if user_data and check_password_hash(user_data['password'], form.password.data):
            # Create a user object
            from flask import session
            user = User(user_data)
            
            # Log the user in and set remember=True for persistent session
            login_success = login_user(user, remember=True)
            
            if login_success:
                # Store additional session data
                session.permanent = True
                session['user_id'] = str(user_data['_id'])
                session['username'] = user_data['username']
                session['is_admin'] = user_data.get('is_admin', False)
                
                # Log success
                print(f"Login successful for user: {user_data['username']}")
                
                # If user is admin, redirect to admin dashboard
                if user.is_admin:
                    flash('Welcome to the admin panel!', 'success')
                    return redirect(url_for('auth.admin'))
                
                # Otherwise redirect to the page user was trying to access or home
                next_page = request.args.get('next')
                if next_page and next_page.startswith('/'):  # Ensure next_page is relative
                    return redirect(next_page)
                return redirect(url_for('main.index'))
            else:
                flash('Login failed. Please try again.', 'danger')
        else:
            flash('Invalid username or password', 'danger')
    
    return render_template('auth/login.html', form=form)

@auth.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('main.index'))

# Admin panel route (protected)
@auth.route('/admin')
@login_required
def admin():
    # Check if user is admin
    if not current_user.is_admin:
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.index'))
    
    db = get_db()
    
    # Get counts for dashboard
    company_count = db.companies.count_documents({})
    stock_count = db['nepse-stocks'].count_documents({})
    indices_count = db['nepse-indices'].count_documents({})
    
    # Get latest date data was updated
    latest_update = db['nepse-stocks'].find_one({}, sort=[('published_date', -1)])
    
    return render_template(
        'auth/admin.html',
        company_count=company_count,
        stock_count=stock_count,
        indices_count=indices_count,
        latest_update=latest_update['published_date'] if latest_update else None
    )

# Admin companies management route
@auth.route('/admin/companies')
@login_required
def admin_companies():
    # Check if user is admin
    if not current_user.is_admin:
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.index'))
    
    db = get_db()
    
    # Get all companies with pagination
    page = request.args.get('page', 1, type=int)
    per_page = 20
    skip = (page - 1) * per_page
    
    companies = list(db.companies.find().sort('symbol', 1).skip(skip).limit(per_page))
    total_companies = db.companies.count_documents({})
    
    return render_template(
        'auth/companies.html',
        companies=companies,
        page=page,
        per_page=per_page,
        total_companies=total_companies,
        total_pages=(total_companies // per_page) + (1 if total_companies % per_page > 0 else 0)
    )

# Admin add company route
@auth.route('/admin/company/add', methods=['POST'])
@login_required
def add_company():
    # Check if user is admin
    if not current_user.is_admin:
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.index'))
    
    db = get_db()
    
    # Get form data
    symbol = request.form.get('symbol').upper()
    companyname = request.form.get('companyname')
    sector = request.form.get('sector')
    listed_shares = request.form.get('listed_shares')
    description = request.form.get('description')
    
    # Validate required fields
    if not symbol or not companyname:
        flash('Symbol and Company Name are required', 'danger')
        return redirect(url_for('auth.admin_companies'))
    
    # Check if company already exists
    existing_company = db.companies.find_one({'symbol': symbol})
    if existing_company:
        flash(f'Company with symbol {symbol} already exists', 'danger')
        return redirect(url_for('auth.admin_companies'))
    
    # Create company document
    company = {
        'symbol': symbol,
        'companyname': companyname,
        'sector': sector if sector else None,
        'listed_shares': int(listed_shares) if listed_shares else None,
        'description': description if description else None,
        'created_at': datetime.now(),
        'updated_at': datetime.now()
    }
    
    # Insert into database
    result = db.companies.insert_one(company)
    
    if result.inserted_id:
        flash(f'Company {symbol} added successfully', 'success')
    else:
        flash('Failed to add company', 'danger')
    
    return redirect(url_for('auth.admin_companies'))

# Admin delete company route
@auth.route('/auth/company/<company_id>/delete', methods=['POST'])
@login_required
def delete_company(company_id):
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'success': False, 'message': 'Access denied'})
    
    try:
        db = get_db()
        result = db.companies.delete_one({'_id': ObjectId(company_id)})
        
        if result.deleted_count > 0:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'message': 'Company not found'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

# Admin data update route
@auth.route('/admin/data')
@login_required
def admin_data():
    # Check if user is admin
    if not current_user.is_admin:
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.index'))
    
    db = get_db()
    
    # Get the latest update info for different data types
    latest_stocks = db['nepse-stocks'].find_one({}, sort=[('published_date', -1)])
    latest_indices = db['nepse-indices'].find_one({}, sort=[('published_date', -1)])
    
    return render_template(
        'auth/data.html',
        latest_stocks=latest_stocks['published_date'] if latest_stocks else None,
        latest_indices=latest_indices['published_date'] if latest_indices else None
    )

# Update stocks data route
@auth.route('/admin/update/stocks', methods=['POST'])
@login_required
def update_stocks():
    # Check if user is admin
    if not current_user.is_admin:
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.index'))
    
    # Get the date from the form
    date_str = request.form.get('date')
    
    # TODO: Implement actual data fetching from NEPSE API
    # For now, just show a success message
    flash(f'Stock data update for {date_str} initiated. This will be processed in the background.', 'info')
    
    return redirect(url_for('auth.admin_data'))

# Update indices data route
@auth.route('/admin/update/indices', methods=['POST'])
@login_required
def update_indices():
    # Check if user is admin
    if not current_user.is_admin:
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.index'))
    
    # Get the date from the form
    date_str = request.form.get('date')
    
    # TODO: Implement actual data fetching from NEPSE API
    # For now, just show a success message
    flash(f'Index data update for {date_str} initiated. This will be processed in the background.', 'info')
    
    return redirect(url_for('auth.admin_data'))

# Bulk update route
@auth.route('/admin/update/bulk', methods=['POST'])
@login_required
def bulk_update():
    # Check if user is admin
    if not current_user.is_admin:
        flash('Access denied. Admin privileges required.', 'danger')
        return redirect(url_for('main.index'))
    
    # Get form data
    start_date = request.form.get('start_date')
    end_date = request.form.get('end_date')
    data_type = request.form.get('data_type')
    
    # TODO: Implement actual bulk data fetching from NEPSE API
    # For now, just show a success message
    flash(f'Bulk update initiated for {data_type} from {start_date} to {end_date}. This will be processed in the background.', 'info')
    
    return redirect(url_for('auth.admin_data'))