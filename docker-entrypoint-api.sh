#!/bin/bash
set -e

echo "Starting API Handler on port 8080..."

# Create a simple WSGI wrapper if it doesn't exist
if [ ! -f "api_handler/wsgi.py" ]; then
    cat > api_handler/wsgi.py << 'EOF'
import os
import sys
import logging
from api_handler import main as function_main

# Setup logging
logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))
logger = logging.getLogger(__name__)

class APIWrapper:
    def __init__(self):
        self.function_module = function_main
    
    def __call__(self, environ, start_response):
        """WSGI application interface"""
        try:
            # Extract path and method from WSGI environ
            path = environ.get('PATH_INFO', '/')
            method = environ.get('REQUEST_METHOD', 'GET')
            
            # Read body for POST/PUT requests
            content_length = int(environ.get('CONTENT_LENGTH', 0) or 0)
            body = environ['wsgi.input'].read(content_length) if content_length > 0 else b''
            
            # Create a mock request object
            class Request:
                def __init__(self, method, path, body):
                    self.method = method
                    self.path = path
                    self.body = body
                    self.headers = {k: v for k, v in environ.items() if k.startswith('HTTP_')}
                
                def get_json(self):
                    import json
                    try:
                        return json.loads(self.body.decode('utf-8'))
                    except:
                        return {}
            
            req = Request(method, path, body)
            
            # Call the function's main handler
            response = self.function_main(req, None)
            
            status = f"{response.get('status', 200)} OK"
            headers = [('Content-Type', 'application/json')]
            start_response(status, headers)
            
            import json
            return [json.dumps(response).encode('utf-8')]
        
        except Exception as e:
            logger.error(f"Error handling request: {e}", exc_info=True)
            start_response('500 Internal Server Error', [('Content-Type', 'application/json')])
            import json
            return [json.dumps({'error': str(e)}).encode('utf-8')]

app = APIWrapper()
EOF
fi

exec "$@"
