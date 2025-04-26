from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import check_password_hash
from app import get_db
from app.models.user import User
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField
from wtforms.validators import DataRequired

auth = Blueprint('auth', __name__)

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    submit = SubmitField('Log In')

@auth.route('/login', methods=['GET', 'POST'])
def login():
    # If user is already logged in, redirect to home
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    
    form = LoginForm()
    if form.validate_on_submit():
        db = get_db()
        user_data = db.admin.users.find_one({'username': form.username.data})
        
        if user_data and check_password_hash(user_data['password'], form.password.data):
            user = User(user_data)
            login_user(user)
            
            # Redirect to the page user was trying to access or home
            next_page = request.args.get('next')
            return redirect(next_page or url_for('main.index'))
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