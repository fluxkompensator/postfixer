#!/bin/bash

# Read the original input file
input_file="example_input.raw"
original_content=$(<"$input_file")

# Function to generate a random string
random_string() {
    cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w ${1:-10} | head -n 1
}

# Function to generate a random IP address
random_ip() {
    echo "$((RANDOM % 256)).$((RANDOM % 256)).$((RANDOM % 256)).$((RANDOM % 256))"
}

# Function to send data to socket and get response
send_to_socket() {
    local input_data="$1"
    echo -e "${input_data}\n\n" | nc -w 1 localhost 5002
}

# Generate and test 100 cases
for i in {1..100}
do
    # Start with the original content
    content="$original_content"
    
    # Randomly modify some fields
    content=$(echo "$content" | sed "s/some\.domain\.tld/domain$i.tld/")
    content=$(echo "$content" | sed "s/8045F2AB23/$(random_string 10)/")
    content=$(echo "$content" | sed "s/foo@bar\.tld/sender$i@example.com/")
    content=$(echo "$content" | sed "s/test@test\.com/recipient$i@example.com/")
    content=$(echo "$content" | sed "s/10\.0\.0\.1/$(random_ip)/")
    content=$(echo "$content" | sed "s/another\.domain\.tld/client$i.example.com/")
    content=$(echo "$content" | sed "s/123\.456\.7/$i.$(random_string 5)/")
    content=$(echo "$content" | sed "s/you/user$i/")
    content=$(echo "$content" | sed "s/test/$i.$(random_string)/")
    content=$(echo "$content" | sed "s/12345/$((RANDOM % 100000 + 1000))/")
    
    # Send to socket and get response
    response=$(send_to_socket "$content")
    
    # Print test case number, modified content, and response
    echo "Test case $i:"
    echo "Input:"
    echo "$content"
    echo "Response: $response"
    echo "----------------------------------------"
done

echo "Completed 100 test cases."
