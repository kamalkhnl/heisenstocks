class Company:
    def __init__(self, data=None):
        if data:
            self.company_id = data.get('company_id')
            self.symbol = data.get('symbol')
            self.company_name = data.get('companyname', '')  # Changed to match DB structure
            self.sector = data.get('sector', '')
        else:
            self.company_id = None
            self.symbol = None
            self.company_name = None
            self.sector = None
    
    @staticmethod
    def from_dict(data):
        return Company(data)