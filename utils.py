import socket

def determine_version(parsed_data):
    if 'mail_version' in parsed_data:
        return "3.7 or later"
    elif 'server_address' in parsed_data:
        return "3.2"
    elif 'policy_context' in parsed_data:
        return "3.1"
    elif 'client_port' in parsed_data:
        return "3.0"
    elif 'ccert_pubkey_fingerprint' in parsed_data:
        return "2.9"
    elif 'stress' in parsed_data:
        return "2.5"
    elif 'encryption_protocol' in parsed_data:
        return "2.3"
    elif 'sasl_method' in parsed_data:
        return "2.2"
    else:
        return "2.1 or earlier"

def parse_data(data):
    lines = data.strip().split('\n')
    parsed_data = {}
    for line in lines:
        if '=' in line:
            key, value = line.split('=', 1)
            parsed_data[key.strip()] = value.strip()
    return parsed_data


def find_free_port(start_port=5001, max_port=5003):
    for port in range(start_port, max_port):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.bind(('localhost', port))
            s.close()
            return port
        except OSError:
            continue
    raise OSError("No free ports found in the specified range")