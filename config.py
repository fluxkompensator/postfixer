from pymongo import MongoClient
import json
from bson import ObjectId
import re
import os

# listening settings
FLASK_SOCKET_LISTEN_PORT = int(os.environ.get('FLASK_SOCKET_LISTEN_PORT', 8000))
FLASK_SOCKET_LISTEN_HOST = os.environ.get('FLASK_SOCKET_LISTEN_HOST', 'localhost')
POLICY_SERVER_PORT = int(os.environ.get('POLICY_SERVER_PORT', 5002))
POLICY_SERVER_HOST = os.environ.get('POLICY_SERVER_HOST', '0.0.0.0')
CORS_DOMAIN = os.environ.get('CORS_DOMAIN', 'http://localhost:3000')

# MongoDB setup
MONGO_URI = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/')
client = MongoClient(MONGO_URI)
db = client['postfix_data']
requests_collection = db['requests']
rules_collection = db['rules']
rate_limiters_collection = db['rate_limiters']
rate_limit_counters_collection = db['rate_limit_counters']

# Define valid action types
VALID_ACTIONS = {
    'ACCEPT': ['OK'],
    'REJECT': ['4NN', '5NN', 'REJECT', 'DEFER', 'DEFER_IF_REJECT', 'DEFER_IF_PERMIT'],
    'OTHER': ['BCC', 'DISCARD', 'DUNNO', 'FILTER', 'HOLD', 'WARN']
}

# Regular expression to match 4NN and 5NN with numbers from 00-99
NN_REGEX = re.compile(r'^[45][0-9]{2}$')

# Define the key options
KEY_OPTIONS = [
    'client_ip', 'helo_name', 'sender', 'recipient', 'sasl_username',
    'client_name', 'client_address', 'client_port', 'server_address',
    'server_port', 'encryption_protocol', 'encryption_cipher',
    'encryption_keysize', 'ccert_subject', 'ccert_issuer',
    'ccert_fingerprint', 'ccert_pubkey_fingerprint', 'protocol_state',
    'protocol_name', 'queue_id', 'instance', 'size', 'etrn_domain',
    'stress', 'sasl_method', 'sasl_sender', 'policy_context', 'request',
    'recipient_count', 'reverse_client_name', 'mail_version',
    'compatibility_level'
]

class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        return json.JSONEncoder.default(self, o)