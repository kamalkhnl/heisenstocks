# Stonks

A modern web application for tracking and analyzing stocks and market indices from the Nepal Stock Exchange (NEPSE).

![NEPSE Dashboard](https://img.shields.io/badge/NEPSE-Dashboard-brightgreen)
![Flask](https://img.shields.io/badge/Built%20with-Flask-blue)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-green)

## ✨ Features

- **Real-time Market Data**: View current stock prices, indices, and market trends
- **Interactive Charts**: Analyze price movements with TradingView-like charts
- **Technical Indicators**: Apply SMA indicators with visibility toggles directly on charts
- **Company Information**: Detailed profiles for listed companies
- **Responsive Design**: Works on desktop and mobile devices
- **Performance Optimized**: Caching system for fast data access

## 🚀 Getting Started

### Prerequisites

- Python 3.10 or higher
- MongoDB (local installation or Atlas cloud account)
- Modern web browser

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/stonks.git
   cd stonks
   ```

2. Set up a virtual environment
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file with the following variables:
   ```
   MONGODB_URI=your_mongodb_connection_string
   DATABASE_NAME=heisenstocks
   SECRET_KEY=your_secret_key
   FLASK_DEBUG=0  # Set to 1 for development
   ```

5. Run the application
   ```bash
   python main.py
   ```

6. Open your browser and navigate to `http://localhost:5000`

## 📊 Usage

### Market Overview
The home page displays an overview of the market including top gainers, losers, and market indices.

### Company Details
View detailed information about companies including financials, stock price history, and performance metrics.

### Charts
Interactive charts allow for technical analysis with:
- Candlestick/line chart toggle
- SMA indicator with eye icon for toggling visibility
- Remove button (X) for indicators
- Symbol search functionality

## 🛠️ Project Structure

```
stonks/
├── app/                  # Main application package
│   ├── models/           # Data models
│   ├── routes/           # Route definitions
│   ├── static/           # Static assets (CSS, JS)
│   │   ├── css/          # Stylesheets
│   │   └── js/           # JavaScript files
│   │       └── charts/   # Chart functionality
│   └── templates/        # HTML templates
├── main.py               # Application entry point
├── pyproject.toml        # Project metadata and dependencies
└── README.md             # Project documentation
```

## 🔒 Security

- Flask-Login for authentication
- Environment variables for sensitive configurations
- CSRF protection on forms

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📧 Contact

Your Name - [your.email@example.com](mailto:your.email@example.com)

Project Link: [https://github.com/yourusername/stonks](https://github.com/yourusername/stonks)