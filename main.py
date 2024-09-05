import socket
import threading
import time
import traceback
import json
import pymongo
import logging

from flask import Flask, jsonify, request
from flask_socketio import SocketIO, join_room, leave_room
from flask_cors import CORS

from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from bson import ObjectId

from rules import validate_rule, ensure_rule_ids, apply_rules, determine_final_action
from ratelimiter import rate_limiter
from config import JSONEncoder, requests_collection, rules_collection, KEY_OPTIONS
from config import CORS_DOMAIN, FLASK_SOCKET_LISTEN_PORT, FLASK_SOCKET_LISTEN_HOST, POLICY_SERVER_PORT, POLICY_SERVER_HOST
from utils import determine_version, parse_data, find_free_port


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": CORS_DOMAIN}})
socketio = SocketIO(app, cors_allowed_origins=CORS_DOMAIN, async_mode='eventlet')

# Add a global variable to track server readiness
server_ready = False

# Shared data storage
class TimedOrderedDict(OrderedDict):
    def __init__(self, max_age_seconds):
        self.max_age_seconds = max_age_seconds
        super().__init__()

    def __setitem__(self, key, value):
        self.cleanup()
        super().__setitem__(key, (value, time.time()))

    def cleanup(self):
        now = time.time()
        for key, (value, timestamp) in list(self.items()):
            if now - timestamp > self.max_age_seconds:
                del self[key]

    def to_dict(self):
        return {k: v for k, (v, _) in self.items()}

data_storage = TimedOrderedDict(max_age_seconds=3600)  # Keep data for 1 hour
current_version = "Unknown"

def cleanup_mongodb():
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)
    requests_collection.delete_many({"timestamp": {"$lt": cutoff_time}})

def periodic_mongodb_cleanup():
    with app.app_context():
        while True:
            cleanup_mongodb()
            time.sleep(7200)

def store_in_mongodb(parsed_data):
    parsed_data['timestamp'] = datetime.now(timezone.utc)
    rule_results = apply_rules(parsed_data)
    parsed_data['rule_results'] = rule_results
    
    # Determine the final action based on the first (and only) matching rule
    final_action = determine_final_action(rule_results)
    parsed_data['final_action'] = final_action
    
    # Remove _id if it exists to let MongoDB generate a new one
    parsed_data.pop('_id', None)
    
    try:
        result = requests_collection.insert_one(parsed_data)
        parsed_data['_id'] = str(result.inserted_id)
    except pymongo.errors.DuplicateKeyError:
        # If a duplicate key error occurs, update the existing document
        existing_doc = requests_collection.find_one({'_id': parsed_data.get('_id')})
        if existing_doc:
            requests_collection.replace_one({'_id': existing_doc['_id']}, parsed_data)
            parsed_data['_id'] = str(existing_doc['_id'])
        else:
            # If we can't find the existing document, generate a new _id
            parsed_data['_id'] = str(ObjectId())
            requests_collection.insert_one(parsed_data)
    
    # bugfix json serializable error
    parsed_data['timestamp'] = parsed_data['timestamp'].isoformat()

    return final_action

def handle_client(client_socket, address):
    print(f"Connection from {address} has been established.")
    buffer = ""
    while True:
        try:
            chunk = client_socket.recv(1024)
            if not chunk:
                print(f"Connection closed by client {address}")
                break
            buffer += chunk.decode('utf-8')
            if buffer.endswith('\n\n'):
                # Check if the request is valid
                if "request=smtpd_access_policy" not in buffer:
                    print("Invalid request: missing 'request=smtpd_access_policy'")
                    response = "REJECT Invalid request\n\n"
                    client_socket.sendall(response.encode('utf-8'))
                    buffer = ""
                    continue

                parsed_data = parse_data(buffer)
                instance_data = parsed_data.copy()

                current_version = determine_version(instance_data)

                # Apply rules first
                final_action = store_in_mongodb(instance_data)
                
                # If no rule was applied (final_action is None), check rate limit
                if final_action is None:
                    if not rate_limiter.check_rate_limit(instance_data):
                        custom_text = rate_limiter.get_custom_text(instance_data)
                        if custom_text:
                            final_action = f"REJECT {custom_text}"
                        else:
                            final_action = "REJECT 400: Rate limit exceeded"
                        print("Rate limit exceeded")
                
                # Always update the final_action in instance_data
                instance_data['final_action'] = final_action if final_action else "DUNNO"
                
                # Extract custom text if present
                custom_text = instance_data.get('custom_text', '')
                
                data_storage.update(instance_data)
                
                # Always emit the SocketIO event, regardless of the action
                with app.app_context():
                    socketio.emit('new_data', {
                        'data': instance_data,
                        'version': current_version,
                        'action': instance_data['final_action']
                    }, room='updates')
                    logging.info(f"Emitted new_data event to 'updates' room: {instance_data}")

                # Send response back to the socket client
                response = f"{instance_data['final_action']} {custom_text}\n\n".strip() + "\n\n"
                client_socket.sendall(response.encode('utf-8'))
                
                buffer = ""
        except Exception as e:
            print(f"Error processing data from {address}: {str(e)}")
            print(traceback.format_exc())
            break
    client_socket.close()

def socket_listener():
    with app.app_context():
        global current_version

        
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        while True:
            try:
                server_socket.bind((POLICY_SERVER_HOST, POLICY_SERVER_PORT))
                server_socket.listen(5)  # Allow up to 5 queued connections
                print(f"Socket listener starting on port {POLICY_SERVER_PORT}")
                break
            except OSError as e:
                print(f"Failed to bind to port {POLICY_SERVER_PORT}: {e}")
                #port = find_free_port(port + 1)
                #print(f"Trying new port: {port}")
                break
                #time.sleep(1)

        print(f"Socket listener successfully bound to port {POLICY_SERVER_PORT}")

        while True:
            try:
                client_socket, address = server_socket.accept()
                client_thread = threading.Thread(target=handle_client, args=(client_socket, address))
                client_thread.start()
            except Exception as e:
                print(f"An error occurred in socket_listener: {str(e)}")
                print(traceback.format_exc())
                time.sleep(1)

def initialize_server():
    global server_ready
    # Perform any necessary initialization here
    time.sleep(2)  # Give the server a moment to fully initialize
    server_ready = True
    print("Server is now ready to accept requests")

@app.route('/api/server_status')
def server_status():
    return jsonify({"status": "ready" if server_ready else "initializing"})

# Modify other routes to check server readiness
def check_server_ready():
    if not server_ready:
        return jsonify({"error": "Server is still initializing"}), 503
    return None

@app.route('/api/data', methods=['GET', 'POST'])
def get_data():
    status = check_server_ready()
    if status:
        return status
    try:
        if request.method == 'POST':
            data = request.json
            start_time = data.get('start_time')
            end_time = data.get('end_time')
        else:
            start_time = request.args.get('start_time')
            end_time = request.args.get('end_time')

        print(f"Received start_time: {start_time}, end_time: {end_time}")  # Debug print

        # Parse timestamps or use defaults
        try:
            if start_time:
                start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            else:
                start_time = datetime.now(timezone.utc) - timedelta(hours=1)

            if end_time:
                end_time = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            else:
                end_time = datetime.now(timezone.utc)

        except ValueError as e:
            print(f"ValueError: {str(e)}")  # Debug print
            return jsonify({'error': 'Invalid datetime format. Use ISO format (YYYY-MM-DDTHH:MM:SS)'}), 400

        # Ensure start_time is before end_time
        if start_time >= end_time:
            return jsonify({'error': 'start_time must be before end_time'}), 400

        # Get recent data from TimedOrderedDict
        recent_data = {}
        now = time.time()
        for key, (value, timestamp) in data_storage.items():
            if start_time.timestamp() <= timestamp <= end_time.timestamp():
                recent_data[key] = value

        # Fetch data from MongoDB
        mongo_data = list(requests_collection.find(
            {
                "timestamp": {
                    "$gte": start_time,
                    "$lte": end_time
                }
            }
        ).sort("timestamp", -1))

        # Format timestamps and convert ObjectId to string
        for item in mongo_data:
            if 'timestamp' in item:
                item['timestamp'] = item['timestamp'].isoformat()
            else:
                print(f"Warning: timestamp missing for item {item.get('_id', 'unknown')}")
            item['_id'] = str(item['_id']) 

        return json.dumps({
            'recent_data': recent_data,
            'historical_data': mongo_data,
            'version': current_version,
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat()
        }, cls=JSONEncoder), 200, {'Content-Type': 'application/json'}

    except Exception as e:
        print(f"Error in get_data: {str(e)}")
        return jsonify(error=str(e)), 500

@app.route('/api/rules', methods=['GET', 'POST', 'PUT', 'DELETE'])
def manage_rules():
    status = check_server_ready()
    if status:
        return status
    try:
        if request.method == 'GET':
            rules = list(rules_collection.find())
            return jsonify([{**rule, '_id': str(rule['_id'])} for rule in rules])
        
        elif request.method == 'POST':
            new_rule = request.json
            
            if not validate_rule(new_rule):
                return jsonify({'error': 'Invalid rule format'}), 400
            result = rules_collection.insert_one(new_rule)
            return jsonify({'message': 'Rule created', 'id': str(result.inserted_id)}), 201
        
        elif request.method == 'PUT':
            rule_id = request.json.get('_id')
            if not rule_id:
                return jsonify({'error': 'No rule ID provided'}), 400
            
            updated_rule = request.json
            if not validate_rule(updated_rule):
                return jsonify({'error': 'Invalid rule format'}), 400
            
            del updated_rule['_id']
            result = rules_collection.update_one({'_id': ObjectId(rule_id)}, {'$set': updated_rule})
            
            if result.modified_count:
                return jsonify({'message': 'Rule updated'})
            else:
                return jsonify({'error': 'Rule not found'}), 404
        
        elif request.method == 'DELETE':
            rule_id = request.json.get('_id')
            if not rule_id:
                return jsonify({'error': 'No rule ID provided'}), 400
            
            result = rules_collection.delete_one({'_id': ObjectId(rule_id)})
            
            if result.deleted_count:
                return jsonify({'message': 'Rule deleted'})
            else:
                return jsonify({'error': 'Rule not found'}), 404
    except Exception as e:
        print(f"Error in get_rules: {str(e)}")
        return jsonify(error=str(e)), 500


@app.route('/api/rules/<rule_id>', methods=['PUT', 'DELETE'])
def manage_rule(rule_id):
    status = check_server_ready()
    if status:
        return status
    if request.method == 'PUT':
        try:
            updated_rule = request.json
            # Remove _id from the update data if it exists
            if '_id' in updated_rule:
                del updated_rule['_id']
            
            result = rules_collection.update_one(
                {'_id': ObjectId(rule_id)},
                {'$set': updated_rule}
            )
            
            if result.modified_count == 0:
                return jsonify({"error": "Rule not found or no changes made"}), 404
            
            return jsonify({"message": "Rule updated successfully"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    elif request.method == 'DELETE':
        try:
            print(f"Deleting rule with ID: {rule_id}")
            result = rules_collection.delete_one({'rule_id': int(rule_id)})
            
            if result.deleted_count == 0:
                return jsonify({"error": f"Rule with ID {rule_id} not found"}), 404
            
            return jsonify({"message": f"Rule with ID {rule_id} deleted successfully"}), 200
        except Exception as e:
            print(f"Error deleting rule: {str(e)}")
            return jsonify({"error": str(e)}), 500



@app.route('/api/key_options', methods=['GET'])
def get_key_options():
    status = check_server_ready()
    if status:
        return status
    return jsonify(KEY_OPTIONS)

from rules import update_rule_order, get_rules

@app.route('/api/rules/<int:rule_id>/move', methods=['PUT'])
def move_rule(rule_id):
    status = check_server_ready()
    if status:
        return status
    try:
        new_position = request.json.get('new_position')
        if new_position is None:
            return jsonify({"error": "New position not provided"}), 400
        
        new_position = int(new_position)
        
        # Validate that rule_id exists
        rule = rules_collection.find_one({'rule_id': rule_id})
        if not rule:
            return jsonify({"error": f"Rule with id {rule_id} not found"}), 404
        
        # Validate that new_position is valid
        max_position = rules_collection.count_documents({})
        if new_position < 1 or new_position > max_position:
            return jsonify({"error": f"Invalid new position. Must be between 1 and {max_position}"}), 400
        
        update_rule_order(rule_id, new_position)
        
        # Fetch updated rules after moving
        updated_rules = get_rules()
        
        return jsonify({"message": "Rule moved successfully", "rules": updated_rules}), 200
    except Exception as e:
        print(f"Error moving rule: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/rules', methods=['GET'])
def get_all_rules():
    status = check_server_ready()
    if status:
        return status
    try:
        rules = get_rules()
        return jsonify(rules), 200
    except Exception as e:
        print(f"Error fetching rules: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/rate_limiters', methods=['GET', 'POST'])
def manage_rate_limiters():
    status = check_server_ready()
    if status:
        return status
    if request.method == 'GET':
        return jsonify(rate_limiter.get_rate_limiters())
    elif request.method == 'POST':
        data = request.json
        limiter_id = rate_limiter.create_rate_limiter(
            data['key'], data['value'], data['condition'], 
            int(data['limit']), int(data['duration']), data['customText']
        )
        return jsonify({'id': limiter_id}), 201

@app.route('/api/rate_limiters/<limiter_id>', methods=['PUT', 'DELETE'])
def update_delete_rate_limiter(limiter_id):
    status = check_server_ready()
    if status:
        return status
    if request.method == 'PUT':
        data = request.json
        rate_limiter.update_rate_limiter(
            limiter_id, data['value'], data['condition'], 
            int(data['limit']), int(data['duration']), data['customText']
        )
        return jsonify({'message': 'Rate limiter updated successfully'})
    elif request.method == 'DELETE':
        rate_limiter.delete_rate_limiter(limiter_id)
        return jsonify({'message': 'Rate limiter deleted successfully'})
    
@app.route('/api/top_rate_limit_counters')
def get_top_rate_limit_counters():
    status = check_server_ready()
    if status:
        return status
    limit = request.args.get('limit', default=10, type=int)
    max_limit = 50  # Maximum allowed limit
    limit = min(limit, max_limit)  # Ensure limit doesn't exceed max_limit
    return jsonify(rate_limiter.get_top_rate_limit_counters(limit))

@app.route('/health')
def health_check():
    return jsonify(status='healthy'), 200

@socketio.on('connect')
def on_connect():
    print('Client connected')

@socketio.on('disconnect')
def on_disconnect():
    print('Client disconnected')

@socketio.on('join')
def on_join(data):
    room = data['room']
    join_room(room)
    print(f'Client {request.sid} joined room: {room}')

@socketio.on('leave')
def on_leave(data):
    room = data['room']
    leave_room(room)
    print(f'Client {request.sid} left room: {room}')

def create_app():
    # Start socket listener in a separate thread
    socket_thread = threading.Thread(target=socket_listener)
    socket_thread.start()

    # Start MongoDB cleanup in a separate thread
    cleanup_thread = threading.Thread(target=periodic_mongodb_cleanup)
    cleanup_thread.start()

    # Initialize the server
    initialize_server()

    ensure_rule_ids()

    return app

app = create_app()

if __name__ == '__main__':
    socketio.run(app, debug=True, host=FLASK_SOCKET_LISTEN_HOST, port=FLASK_SOCKET_LISTEN_PORT)
