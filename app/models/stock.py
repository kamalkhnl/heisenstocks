class Stock:
    def __init__(self, data=None):
        if data:
            self.company_id = data.get('company_id')
            self.open = data.get('open')
            self.high = data.get('high')
            self.low = data.get('low')
            self.close = data.get('close')
            self.per_change = data.get('per_change')
            self.traded_quantity = data.get('traded_quantity')
            self.turnover = data.get('traded_amount')  # Changed to match DB field
            self.published_date = data.get('published_date')
            self.company_symbol = data.get('company_symbol')  # Added new field from DB
            self.status = data.get('status')  # Added new field from DB
        else:
            self.company_id = None
            self.open = None
            self.high = None
            self.low = None
            self.close = None
            self.per_change = None
            self.traded_quantity = None
            self.turnover = None
            self.published_date = None
            self.company_symbol = None
            self.status = None
    
    @staticmethod
    def from_dict(data):
        return Stock(data)