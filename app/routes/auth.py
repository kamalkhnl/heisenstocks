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
import subprocess
import threading
import queue
import json
import sys
from flask import Response, stream_with_context

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

# Helper function to run a script and capture output in real-time
def run_script_with_live_output(script_path, output_queue):
    """
    Runs a Python script and captures its output in real-time,
    sending it to a queue for streaming to the client.
    """
    try:
        # Log the script path being executed
        output_queue.put({
            'progress': 5,
            'log': f"Attempting to run script: {script_path}"
        })

        # Create a copy of the current environment variables
        env = os.environ.copy()
        
        # Ensure the PYTHONPATH includes the app directory
        python_path = env.get('PYTHONPATH', '')
        app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if app_dir not in python_path:
            if python_path:
                env['PYTHONPATH'] = f"{python_path}{os.pathsep}{app_dir}"
            else:
                env['PYTHONPATH'] = app_dir
        
        # Log the environment setup
        output_queue.put({
            'log': f"Setting up environment with PYTHONPATH: {env.get('PYTHONPATH')}"
        })
        
        # Start the process with the enhanced environment
        process = subprocess.Popen(
            [sys.executable, script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env
        )
        
        # Send initial progress
        output_queue.put({
            'progress': 10,
            'log': f"Starting process: {os.path.basename(script_path)}"
        })
        
        # Track completed percentage
        line_count = 0
        progress = 10
        
        # Read output line by line as it becomes available
        for line in iter(process.stdout.readline, ''):
            line_count += 1
            # Update progress estimation (maxes out at 95%)
            if line_count % 10 == 0 and progress < 95:
                progress += 1
                output_queue.put({'progress': progress})
            
            # Forward the output line to the queue
            output_queue.put({'log': line.rstrip()})
        
        # Wait for process to complete
        process.stdout.close()
        return_code = process.wait()
        
        if return_code == 0:
            output_queue.put({
                'status': 'complete',
                'progress': 100,
                'log': f"Process completed successfully"
            })
        else:
            output_queue.put({
                'status': 'error',
                'progress': 100,
                'log': f"Process exited with code {return_code}"
            })
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        output_queue.put({
            'status': 'error',
            'progress': 0,
            'log': f"Error running script: {str(e)}\n{error_details}"
        })

# Routes for streaming updates using Server-Sent Events (SSE)
@auth.route('/admin/update-indices')
@login_required
def update_indices_stream():
    """Stream the indices update process to the client using SSE"""
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'error': 'Access denied. Admin privileges required.'}), 403
    
    # Get the path to the fetch_new_indices_data.py script
    script_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        'scripts', 
        'fetch_new_indices_data.py'
    )
    
    # Debug the script path to make sure it exists
    print(f"Looking for script at path: {script_path}")
    if not os.path.isfile(script_path):
        print(f"WARNING: Script file not found at {script_path}")
        # Try alternative path relative to current working directory
        alt_script_path = os.path.join('app', 'scripts', 'fetch_new_indices_data.py')
        if os.path.isfile(alt_script_path):
            script_path = alt_script_path
            print(f"Found script at alternative path: {script_path}")
        else:
            print(f"ERROR: Script not found at alternative path either: {alt_script_path}")
            return jsonify({"error": "Script file not found"}), 404
    
    # Function to generate SSE events
    def generate():
        output_queue = queue.Queue()
        
        # Start the script in a separate thread
        thread = threading.Thread(
            target=run_script_with_live_output,
            args=(script_path, output_queue)
        )
        thread.daemon = True
        thread.start()
        
        # Stream events from the queue to the client
        try:
            while True:
                try:
                    # Get data from the queue with a timeout
                    data = output_queue.get(timeout=90)
                    
                    # Yield the data as an SSE event
                    yield f"data: {json.dumps(data)}\n\n"
                    
                    # Check if the process is complete or had an error
                    if data.get('status') in ['complete', 'error']:
                        break
                    
                except queue.Empty:
                    # If no output for 90 seconds, send a keepalive event
                    yield f"data: {json.dumps({'log': 'Still processing...'})}\n\n"
                    
        except GeneratorExit:
            # Client disconnected
            pass
    
    # Return the streaming response
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'  # Disable proxy buffering
        }
    )

@auth.route('/admin/update-stocks')
@login_required
def update_stocks_stream():
    """Stream the stocks update process to the client using SSE"""
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'error': 'Access denied. Admin privileges required.'}), 403
    
    # Get the path to the fetch_new_stock_data.py script
    script_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        'scripts', 
        'fetch_new_stock_data.py'
    )
    
    # Debug the script path to make sure it exists
    print(f"Looking for script at path: {script_path}")
    if not os.path.isfile(script_path):
        print(f"WARNING: Script file not found at {script_path}")
        # Try alternative path relative to current working directory
        alt_script_path = os.path.join('app', 'scripts', 'fetch_new_stock_data.py')
        if os.path.isfile(alt_script_path):
            script_path = alt_script_path
            print(f"Found script at alternative path: {script_path}")
        else:
            print(f"ERROR: Script not found at alternative path either: {alt_script_path}")
            return jsonify({"error": "Script file not found"}), 404
    
    # Function to generate SSE events
    def generate():
        output_queue = queue.Queue()
        
        # Start the script in a separate thread
        thread = threading.Thread(
            target=run_script_with_live_output,
            args=(script_path, output_queue)
        )
        thread.daemon = True
        thread.start()
        
        # Stream events from the queue to the client
        try:
            while True:
                try:
                    # Get data from the queue with a timeout
                    data = output_queue.get(timeout=90)
                    
                    # Yield the data as an SSE event
                    yield f"data: {json.dumps(data)}\n\n"
                    
                    # Check if the process is complete or had an error
                    if data.get('status') in ['complete', 'error']:
                        break
                    
                except queue.Empty:
                    # If no output for 90 seconds, send a keepalive event
                    yield f"data: {json.dumps({'log': 'Still processing...'})}\n\n"
                    
        except GeneratorExit:
            # Client disconnected
            pass
    
    # Return the streaming response
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'  # Disable proxy buffering
        }
    )

@auth.route('/admin/test-script')
@login_required
def test_script_stream():
    """A test route to verify script execution works"""
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'error': 'Access denied. Admin privileges required.'}), 403
    
    # Get the path to the test script
    script_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        'scripts', 
        'test_script.py'
    )
    
    # Debug the script path to make sure it exists
    print(f"Looking for test script at path: {script_path}")
    if not os.path.isfile(script_path):
        print(f"WARNING: Test script file not found at {script_path}")
        # Try alternative path relative to current working directory
        alt_script_path = os.path.join('app', 'scripts', 'test_script.py')
        if os.path.isfile(alt_script_path):
            script_path = alt_script_path
            print(f"Found test script at alternative path: {script_path}")
        else:
            print(f"ERROR: Test script not found at alternative path either: {alt_script_path}")
            return jsonify({"error": "Test script file not found"}), 404
    
    # Function to generate SSE events
    def generate():
        output_queue = queue.Queue()
        
        # Start the script in a separate thread
        thread = threading.Thread(
            target=run_script_with_live_output,
            args=(script_path, output_queue)
        )
        thread.daemon = True
        thread.start()
        
        # Stream events from the queue to the client
        try:
            while True:
                try:
                    # Get data from the queue with a timeout
                    data = output_queue.get(timeout=90)
                    
                    # Yield the data as an SSE event
                    yield f"data: {json.dumps(data)}\n\n"
                    
                    # Check if the process is complete or had an error
                    if data.get('status') in ['complete', 'error']:
                        break
                    
                except queue.Empty:
                    # If no output for 90 seconds, send a keepalive event
                    yield f"data: {json.dumps({'log': 'Still processing...'})}\n\n"
                    
        except GeneratorExit:
            # Client disconnected
            pass
    
    # Return the streaming response
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'  # Disable proxy buffering
        }
    )

# Direct script execution routes (non-streaming version)
@auth.route('/admin/run-indices-update', methods=['POST'])
@login_required
def run_indices_update():
    """Run the indices update script directly"""
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'error': 'Access denied. Admin privileges required.'}), 403
    
    # Get the path to the script
    script_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        'scripts', 
        'fetch_new_indices_data.py'
    )
    
    # Check if script exists
    if not os.path.isfile(script_path):
        alt_script_path = os.path.join('app', 'scripts', 'fetch_new_indices_data.py')
        if os.path.isfile(alt_script_path):
            script_path = alt_script_path
        else:
            return jsonify({"error": "Script file not found"}), 404
    
    try:
        # Run the script and capture output
        result = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            check=False
        )
        
        # Return the output as JSON
        return jsonify({
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
    
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@auth.route('/admin/run-stocks-update', methods=['POST'])
@login_required
def run_stocks_update():
    """Run the stocks update script directly"""
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'error': 'Access denied. Admin privileges required.'}), 403
    
    # Get the path to the script
    script_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
        'scripts', 
        'fetch_new_stock_data.py'
    )
    
    # Check if script exists
    if not os.path.isfile(script_path):
        alt_script_path = os.path.join('app', 'scripts', 'fetch_new_stock_data.py')
        if os.path.isfile(alt_script_path):
            script_path = alt_script_path
        else:
            return jsonify({"error": "Script file not found"}), 404
    
    try:
        # Run the script and capture output
        result = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            check=False
        )
        
        # Return the output as JSON
        return jsonify({
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
    
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@auth.route('/admin/run-test-script', methods=['POST'])
@login_required
def run_test_script():
    """Run the test script directly"""
    try:
        # Check if user is admin
        if not current_user.is_admin:
            return jsonify({'error': 'Access denied. Admin privileges required.'}), 403
        
        # Get the path to the script
        script_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
            'scripts', 
            'test_script.py'
        )
        
        # Check if script exists
        if not os.path.isfile(script_path):
            alt_script_path = os.path.join('app', 'scripts', 'test_script.py')
            if os.path.isfile(alt_script_path):
                script_path = alt_script_path
            else:
                return jsonify({"success": False, "error": "Script file not found"}), 404
        
        print(f"Running test script at: {script_path}")
        
        # Run the script and capture output
        result = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            check=False
        )
        
        # Return the output as JSON
        return jsonify({
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error running test script: {str(e)}\n{error_traceback}")
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': error_traceback
        }), 500

@auth.route('/admin/run-indices', methods=['POST'])
@login_required
def run_indices():
    """Run the indices update script directly"""
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'success': False, 'error': 'Access denied. Admin privileges required.'}), 403
    
    try:
        # Get the path to the script
        script_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
            'scripts', 
            'fetch_new_indices_data.py'
        )
        
        # Check if script exists
        if not os.path.isfile(script_path):
            alt_script_path = os.path.join('app', 'scripts', 'fetch_new_indices_data.py')
            if os.path.isfile(alt_script_path):
                script_path = alt_script_path
            else:
                return jsonify({"success": False, "error": "Script file not found"}), 404
        
        print(f"Running indices update script at: {script_path}")
        
        # Create a temporary file to capture output
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w+', delete=False) as temp:
            temp_path = temp.name
        
        # Run the script and redirect output to the temporary file
        command = f"{sys.executable} {script_path} > {temp_path} 2>&1"
        process = subprocess.run(command, shell=True)
        
        # Read the output from the temporary file
        with open(temp_path, 'r') as f:
            output = f.read()
        
        # Clean up the temporary file
        os.unlink(temp_path)
        
        # Return the output as JSON
        return jsonify({
            'success': process.returncode == 0,
            'stdout': output,
            'stderr': "",
            'returncode': process.returncode
        })
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error running indices update script: {str(e)}\n{error_traceback}")
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': error_traceback
        }), 500

@auth.route('/admin/run-stocks', methods=['POST'])
@login_required
def run_stocks():
    """Run the stocks update script directly"""
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'success': False, 'error': 'Access denied. Admin privileges required.'}), 403
    
    try:
        # Get the path to the script
        script_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
            'scripts', 
            'fetch_new_stock_data.py'
        )
        
        # Check if script exists
        if not os.path.isfile(script_path):
            alt_script_path = os.path.join('app', 'scripts', 'fetch_new_stock_data.py')
            if os.path.isfile(alt_script_path):
                script_path = alt_script_path
            else:
                return jsonify({"success": False, "error": "Script file not found"}), 404
        
        print(f"Running stocks update script at: {script_path}")
        
        # Create a temporary file to capture output
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w+', delete=False) as temp:
            temp_path = temp.name
        
        # Run the script and redirect output to the temporary file
        command = f"{sys.executable} {script_path} > {temp_path} 2>&1"
        process = subprocess.run(command, shell=True)
        
        # Read the output from the temporary file
        with open(temp_path, 'r') as f:
            output = f.read()
        
        # Clean up the temporary file
        os.unlink(temp_path)
        
        # Return the output as JSON
        return jsonify({
            'success': process.returncode == 0,
            'stdout': output,
            'stderr': "",
            'returncode': process.returncode
        })
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error running stocks update script: {str(e)}\n{error_traceback}")
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': error_traceback
        }), 500

@auth.route('/admin/run-test', methods=['POST'])
@login_required
def run_test():
    """Run the test script directly"""
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'success': False, 'error': 'Access denied. Admin privileges required.'}), 403
    
    try:
        # Get the path to the script
        script_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
            'scripts', 
            'test_script.py'
        )
        
        # Check if script exists
        if not os.path.isfile(script_path):
            alt_script_path = os.path.join('app', 'scripts', 'test_script.py')
            if os.path.isfile(alt_script_path):
                script_path = alt_script_path
            else:
                return jsonify({"success": False, "error": "Script file not found"}), 404
        
        print(f"Running test script at: {script_path}")
        
        # Run the Python script and capture its output
        # Use a different approach to ensure output is captured
        try:
            # Show both stdout and stderr
            output = subprocess.check_output(
                [sys.executable, script_path], 
                stderr=subprocess.STDOUT,
                universal_newlines=True
            )
            return_code = 0
        except subprocess.CalledProcessError as e:
            output = e.output
            return_code = e.returncode
        
        # Print the output to the terminal as well
        print(f"Script output:\n{output}")
        
        # Return the output as JSON
        return jsonify({
            'success': return_code == 0,
            'stdout': output,
            'returncode': return_code
        })
    
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error running test script: {str(e)}\n{error_traceback}")
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': error_traceback
        }), 500

@auth.route('/start-indices', methods=['POST'])
@login_required
def start_indices():
    """Start the indices update script in a completely separate process"""
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'success': False, 'error': 'Access denied. Admin privileges required.'}), 403
    
    try:
        # Get the path to the script
        script_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
            'scripts', 
            'fetch_new_indices_data.py'
        )
        
        # Check if script exists
        if not os.path.isfile(script_path):
            alt_script_path = os.path.join('app', 'scripts', 'fetch_new_indices_data.py')
            if os.path.isfile(alt_script_path):
                script_path = alt_script_path
            else:
                return jsonify({"success": False, "error": "Script file not found"}), 404
        
        print(f"Starting indices update script in a detached process: {script_path}")
        
        # Use a different approach - a completely detached process
        # This ensures it won't cause timeouts on the web server
        if os.name == 'nt':  # Windows
            # Use subprocess.Popen with DETACHED_PROCESS flag
            import subprocess
            subprocess.Popen(
                f'start /B cmd /c "python {script_path} > indices_update.log 2>&1"',
                shell=True,
                close_fds=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                creationflags=0x08000000  # DETACHED_PROCESS
            )
        else:  # Unix/Linux
            # Use nohup and redirect output to a log file
            subprocess.Popen(
                f'nohup python {script_path} > indices_update.log 2>&1 &',
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                preexec_fn=os.setsid
            )
        
        # Return success immediately - the process is now running in the background
        return jsonify({'success': True})
        
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error starting indices update script: {str(e)}\n{error_traceback}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@auth.route('/start-stocks', methods=['POST'])
@login_required
def start_stocks():
    """Start the stocks update script in a completely separate process"""
    # Check if user is admin
    if not current_user.is_admin:
        return jsonify({'success': False, 'error': 'Access denied. Admin privileges required.'}), 403
    
    try:
        # Get the path to the script
        script_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
            'scripts', 
            'fetch_new_stock_data.py'
        )
        
        # Check if script exists
        if not os.path.isfile(script_path):
            alt_script_path = os.path.join('app', 'scripts', 'fetch_new_stock_data.py')
            if os.path.isfile(alt_script_path):
                script_path = alt_script_path
            else:
                return jsonify({"success": False, "error": "Script file not found"}), 404
        
        print(f"Starting stocks update script in a detached process: {script_path}")
        
        # Use a different approach - a completely detached process
        # This ensures it won't cause timeouts on the web server
        if os.name == 'nt':  # Windows
            # Use subprocess.Popen with DETACHED_PROCESS flag
            import subprocess
            subprocess.Popen(
                f'start /B cmd /c "python {script_path} > stocks_update.log 2>&1"',
                shell=True,
                close_fds=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                creationflags=0x08000000  # DETACHED_PROCESS
            )
        else:  # Unix/Linux
            # Use nohup and redirect output to a log file
            subprocess.Popen(
                f'nohup python {script_path} > stocks_update.log 2>&1 &',
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                preexec_fn=os.setsid
            )
        
        # Return success immediately - the process is now running in the background
        return jsonify({'success': True})
        
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error starting stocks update script: {str(e)}\n{error_traceback}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500