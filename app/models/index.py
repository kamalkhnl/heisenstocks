class Index:
    def __init__(self, data=None):
        if data:
            self.index_id = data.get('index_id')
            self.name = data.get('index_name')  # Changed from 'name' to 'index_name'
            self.current_value = data.get('current')  # Changed from 'current_value' to 'current'
            self.change = data.get('change_')  # Changed from 'change' to 'change_'
            self.per_change = data.get('per_change')
            self.published_date = data.get('published_date')
            self.open = data.get('open')
            self.high = data.get('high')
            self.low = data.get('low')
            self.turnover = data.get('turnover')
        else:
            self.index_id = None
            self.name = None
            self.current_value = None
            self.change = None
            self.per_change = None
            self.published_date = None
            self.open = None
            self.high = None
            self.low = None
            self.turnover = None
    
    @staticmethod
    def from_dict(data):
        return Index(data)