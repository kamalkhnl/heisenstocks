from flask_login import UserMixin

class User(UserMixin):
    def __init__(self, user_data):
        self.id = str(user_data['_id'])
        self.username = user_data['username']
        self.is_admin = user_data.get('is_admin', False)
    
    def get_id(self):
        return self.id