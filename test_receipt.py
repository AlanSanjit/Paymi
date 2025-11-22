import requests
import json

# Replace with the URL of your running FastAPI server
API_URL = "http://127.0.0.1:8000/upload_receipt"

# Path to the receipt image you want to test
RECEIPT_PATH = "Receipt_image.png"  # Replace with your file path

# Open the file in binary mode and send POST request
with open(RECEIPT_PATH, "rb") as f:
    files = {"file": (RECEIPT_PATH, f, "image/png")}
    response = requests.post(API_URL, files=files)

# Check the response
if response.status_code == 200:
    receipt_json = response.json()
    print("Parsed Receipt JSON:")
    print(json.dumps(receipt_json, indent=2))
    print("\nReceipt has been saved to a JSON file by the backend.")
else:
    print(f"Error {response.status_code}: {response.text}")
