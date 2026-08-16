
from flask import Flask, jsonify, request

app = Flask(__name__)

USERS = [
    { "id": "user-001", "username": "gebril",     "password": "admin123", "role": "admin"    },
    { "id": "user-002", "username": "player_one", "password": "pass456",  "role": "user" }
]

@app.route("/login", methods=["POST"])
def login():
    body = request.get_json(force=True, silent=True)

    if not body:
        return jsonify({ "success": False, "message": "Could not parse body" }), 400

    username = body.get("username")
    password = body.get("password")

    if not username or not password:
        return jsonify({ "success": False, "message": "Username and password are required" }), 400

    user = next((u for u in USERS if u["username"].lower() == username.lower()), None)

    if not user:
        return jsonify({ "success": False, "message": "User not found" }), 404

    if user["password"] != password:
        return jsonify({ "success": False, "message": "Wrong password" }), 401

    return jsonify({
        "success":  True,
        "message":  "Login successful",
        "id":       user["id"],
        "username": user["username"],
        "role":     user["role"]
    }), 200

if __name__ == "__main__":
    print("\n Mock login server running on http://localhost:3000")
    print("   POST /login")
    print("   Body: {\"username\": \"...\", \"password\": \"...\"}\n")
    app.run(port=3000, debug=True)
