from datetime import datetime, timezone
from config import requests_collection, rules_collection, VALID_ACTIONS, NN_REGEX
import re

def get_next_rule_id():
    highest_rule = rules_collection.find_one(sort=[("rule_id", -1)])
    if highest_rule:
        return highest_rule["rule_id"] + 1
    return 1

def apply_rules(parsed_data):
    rules = list(rules_collection.find().sort('rule_id', 1))
    for rule in rules:
        result = apply_single_rule(rule, parsed_data)
        if result:
            return [result]  # Return only the first matching rule
    return []  # Return an empty list if no rules match

def apply_single_rule(rule, parsed_data):
    conditions = rule.get('conditions', [])
    operators = rule.get('operators', [])
    if not conditions:
        return None

    condition_results = [evaluate_condition(cond, parsed_data) for cond in conditions]
    
    if evaluate_complex_operator(condition_results, operators):
        return {
            'rule_id': rule['rule_id'],
            'rule_name': rule['name'],
            'action_type': rule['action_type'],
            'action': rule['action'],
            'custom_text': rule.get('custom_text')
        }
    return None

def evaluate_condition(condition, parsed_data):
    key = condition['key']
    condition_type = condition['condition']
    value = condition['value']
    
    if key not in parsed_data:
        return False
    
    data_value = parsed_data[key]
    
    if condition_type == 'regex':
        return bool(re.match(value, data_value))
    elif condition_type == 'exact':
        return data_value == value
    elif condition_type == 'wildcard':
        return bool(re.match(value.replace('*', '.*'), data_value))
    return False

def evaluate_operator(results, operator):
    if operator == 'AND':
        return all(results)
    elif operator == 'OR':
        return any(results)
    elif operator == 'NAND':
        return not all(results)
    elif operator == 'NOR':
        return not any(results)
    return False  # Default to False if operator is unknown

def evaluate_complex_operator(results, operators):
    if not results:
        return False
    if len(results) == 1:
        return results[0]
    
    current_result = results[0]
    for i, operator in enumerate(operators):
        next_result = results[i + 1]
        current_result = evaluate_operator([current_result, next_result], operator)
    
    return current_result

def store_in_mongodb(parsed_data):
    parsed_data['timestamp'] = datetime.now(timezone.utc)
    rule_results = apply_rules(parsed_data)
    parsed_data['rule_results'] = rule_results
    
    # Determine the final action based on the first (and only) matching rule
    final_action = determine_final_action(rule_results)
    parsed_data['final_action'] = final_action
    
    result = requests_collection.insert_one(parsed_data)
    parsed_data['_id'] = str(result.inserted_id)
    
    # bugfix json serializable error
    parsed_data['timestamp'] = parsed_data['timestamp'].isoformat()

    return final_action

def determine_final_action(rule_results):
    if rule_results:
        result = rule_results[0]  # There will only be one result
        return f"{result['action']} {result['custom_text']}".strip()
    return None  # Return None if no rules match

def create_new_rule(rule_data):
    rule_data['rule_id'] = get_next_rule_id()
    rules_collection.insert_one(rule_data)
    return rule_data

def update_rule_order(rule_id, new_position):
    try:
        rule = rules_collection.find_one({'rule_id': rule_id})
        if not rule:
            print(f"Rule with id {rule_id} not found")
            return

        current_position = rule['rule_id']
        if new_position == current_position:
            print(f"Rule {rule_id} is already at position {new_position}")
            return

        if new_position < current_position:
            # Moving up
            print(f"Moving rule {rule_id} up from {current_position} to {new_position}")
            rules_collection.update_many(
                {'rule_id': {'$gte': new_position, '$lt': current_position}},
                {'$inc': {'rule_id': 1}}
            )
        else:
            # Moving down
            print(f"Moving rule {rule_id} down from {current_position} to {new_position}")
            rules_collection.update_many(
                {'rule_id': {'$gt': current_position, '$lte': new_position}},
                {'$inc': {'rule_id': -1}}
            )

        result = rules_collection.update_one({'_id': rule['_id']}, {'$set': {'rule_id': new_position}})
        print(f"Update result: {result.modified_count} document(s) modified")
    except Exception as e:
        print(f"Error in update_rule_order: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

def get_rules():
    return list(rules_collection.find({}, {'_id': 0}).sort('rule_id', 1))

def update_rule(rule_id, updated_data):
    rules_collection.update_one({'rule_id': rule_id}, {'$set': updated_data})

def delete_rule(rule_id):
    rule = rules_collection.find_one({'rule_id': rule_id})
    if not rule:
        return

    # Delete the rule
    rules_collection.delete_one({'rule_id': rule_id})

    # Update the rule_id of all rules with higher rule_id
    rules_collection.update_many(
        {'rule_id': {'$gt': rule_id}},
        {'$inc': {'rule_id': -1}}
    )

def validate_rule(rule):
    required_fields = ['name', 'conditions', 'operators', 'action_type', 'action']
    if not all(field in rule for field in required_fields):
        return False
    
    if not isinstance(rule['conditions'], list) or len(rule['conditions']) == 0:
        return False
    
    if not isinstance(rule['operators'], list) or len(rule['operators']) != len(rule['conditions']) - 1:
        return False
    
    for condition in rule['conditions']:
        if not all(field in condition for field in ['key', 'condition', 'value']):
            return False
        if condition['condition'] not in ['regex', 'exact', 'wildcard']:
            return False
    
    for operator in rule['operators']:
        if operator not in ['AND', 'OR', 'NAND', 'NOR']:
            return False
    
    if rule['action_type'] not in VALID_ACTIONS:
        return False
    
    if rule['action'] in VALID_ACTIONS[rule['action_type']]:
        return True
    
    # Check if the action is a valid 4NN or 5NN replacement
    if rule['action_type'] == 'REJECT' and NN_REGEX.match(rule['action']):
        return True
    
    if rule['action'] not in VALID_ACTIONS[rule['action_type']]:
        return False
    
    # Validate the optional multi-line text field
    if 'custom_text' in rule:
        if not isinstance(rule['custom_text'], str):
            return False
        if rule['custom_text'].strip() and rule['custom_text'][0].isspace():
            return False
    
    return True

# Function to ensure all rules have a rule_id
def ensure_rule_ids():
    rules = list(rules_collection.find(sort=[('rule_id', 1)]))
    for i, rule in enumerate(rules, start=1):
        if 'rule_id' not in rule or rule['rule_id'] != i:
            rules_collection.update_one({'_id': rule['_id']}, {'$set': {'rule_id': i}})