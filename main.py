from app import create_app, cache
from datetime import datetime
import time
import os
from dotenv import load_dotenv

# Measure app startup time
start_time = time.time()

# Make sure environment variables are loaded
load_dotenv()

# Create the Flask application with optimizations
app = create_app()

# Add context processor to make current year available in all templates
@app.context_processor
def inject_now():
    return {'now': datetime.now()}

# Log startup time
print(f"Application initialized in {time.time() - start_time:.2f} seconds")

if __name__ == '__main__':
    import sys
    debug_mode = '--debug' in sys.argv or '-d' in sys.argv
    app.run(debug=debug_mode)
