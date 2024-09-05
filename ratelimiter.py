from datetime import datetime, timedelta
from bson import ObjectId
import re
from config import rate_limiters_collection, rate_limit_counters_collection
import uuid

class RateLimiter:
    def __init__(self):
        self.rate_limiters = self.load_rate_limiters()

    def load_rate_limiters(self):
        return list(rate_limiters_collection.find())

    def check_rate_limit(self, parsed_data):
        now = datetime.utcnow()
        self.clean_expired_counters(now)  # Clean expired counters
        for limiter in self.rate_limiters:
            key = limiter['key']
            value = limiter['value']
            condition = limiter['condition']
            
            if key not in parsed_data:
                continue
            
            data_value = parsed_data[key]
            
            if self.match_condition(data_value, value, condition):
                counter = rate_limit_counters_collection.find_one({
                    'limiter_id': limiter['_id'],
                    'key': key,
                    'value': data_value,
                    'timestamp': {'$gte': now - timedelta(minutes=limiter['duration'])}
                })

                if counter:
                    if counter['count'] >= limiter['limit']:
                        return False
                    rate_limit_counters_collection.update_one(
                        {'_id': counter['_id']},
                        {'$inc': {'count': 1}}
                    )
                else:
                    rate_limit_counters_collection.insert_one({
                        'limiter_id': limiter['_id'],
                        'key': key,
                        'value': data_value,
                        'count': 1,
                        'timestamp': now
                    })
        return True

    def match_condition(self, data_value, limiter_value, condition):
        if condition == 'exact':
            return data_value == limiter_value
        elif condition == 'regex':
            return re.match(limiter_value, data_value) is not None
        elif condition == 'wildcard':
            pattern = re.escape(limiter_value).replace('\\*', '.*')
            return re.match(f'^{pattern}$', data_value) is not None
        return False

    def create_rate_limiter(self, key, value, condition, limit, duration, custom_text=''):
        limiter_id = str(uuid.uuid4())
        self.rate_limiters.append({
            'id': limiter_id,
            'key': key,
            'value': value,
            'condition': condition,
            'limit': limit,
            'duration': duration,
            'customText': custom_text or ''  # Ensure customText is always a string
        })
        return limiter_id

    def update_rate_limiter(self, limiter_id, value, condition, limit, duration, custom_text=''):
        for limiter in self.rate_limiters:
            if limiter['id'] == limiter_id:
                limiter.update({
                    'value': value,
                    'condition': condition,
                    'limit': limit,
                    'duration': duration,
                    'customText': custom_text or ''  # Ensure customText is always a string
                })
                break

    def delete_rate_limiter(self, limiter_id):
        rate_limiters_collection.delete_one({'_id': ObjectId(limiter_id)})
        self.rate_limiters = [limiter for limiter in self.rate_limiters if str(limiter['_id']) != limiter_id]

    def get_rate_limiters(self):
        return [{**limiter, '_id': str(limiter['_id'])} for limiter in self.rate_limiters]

    def get_top_rate_limit_counters(self, limit=10):
        pipeline = [
            {"$sort": {"count": -1}},
            {"$limit": limit},
            {"$lookup": {
                "from": "rate_limiters",
                "localField": "limiter_id",
                "foreignField": "_id",
                "as": "limiter"
            }},
            {"$unwind": "$limiter"},
            {"$project": {
                "_id": {"$toString": "$_id"},
                "key": 1,
                "value": 1,
                "count": 1,
                "timestamp": 1,
                "limiter_key": "$limiter.key",
                "limiter_value": "$limiter.value",
                "limiter_condition": "$limiter.condition",
                "limiter_limit": "$limiter.limit",
                "limiter_duration": "$limiter.duration"
            }}
        ]
        return list(rate_limit_counters_collection.aggregate(pipeline))

    def get_custom_text(self, parsed_data):
        for limiter in self.rate_limiters:
            key = limiter['key']
            value = limiter['value']
            condition = limiter['condition']
            
            if key not in parsed_data:
                continue
            
            data_value = parsed_data[key]

            if self.match_condition(data_value, value, condition):
                return limiter.get('customText', '')  # Return empty string if customText is not present
        return ''

    def clean_expired_counters(self, now):
        for limiter in self.rate_limiters:
            expiration_time = now - timedelta(minutes=limiter['duration'])
            rate_limit_counters_collection.delete_many({
                'limiter_id': limiter['_id'],
                'timestamp': {'$lt': expiration_time}
            })

rate_limiter = RateLimiter()