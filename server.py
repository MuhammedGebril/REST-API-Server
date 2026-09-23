# ═══════════════════════════════════════════════════════════════
# IMPORTS
# ═══════════════════════════════════════════════════════════════


import json          # built-in: read/write JSON files
import os            # built-in: file paths
import secrets       # built-in: generate secure random tokens
from datetime import datetime, timezone  # built-in: timestamps
from functools import wraps              # built-in: needed for decorators


from flask import Flask, request, jsonify
# Flask   → the app class
# request → gives you access to incoming request data (body, headers, etc.)
# jsonify → converts a Python dict to a proper JSON HTTP response




# ═══════════════════════════════════════════════════════════════
# APP SETUP
# ═══════════════════════════════════════════════════════════════


app = Flask(__name__)
# __name__ tells Flask where your app lives so it can find files
# Think of it like the Node.js equivalent of:  const app = express()




# ═══════════════════════════════════════════════════════════════
# DATABASE HELPERS
# Read and write to db.json
# ═══════════════════════════════════════════════════════════════


# Build the full path to db.json
# os.path.dirname(__file__)  → folder where server.py lives
# os.path.join(...)          → combines folder + filename safely
DB_PATH = os.path.join(os.path.dirname(__file__), "db.json")




def read_db():
    """Load db.json and return it as a Python dictionary."""
    # "r" = open for reading
    # encoding="utf-8" = handle text correctly
    with open(DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)
        # json.load() reads the file and converts JSON → Python dict
        # { "users": [...] } becomes a real Python dict you can work with




def write_db(data):
    """Save a Python dictionary back to db.json."""
    # "w" = open for writing (overwrites the file)
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        # json.dump() converts Python dict → JSON and writes it
        # indent=2 keeps the file human-readable (2-space indentation)




def find_user_by_username(username):
    """Find and return a single user dict by username, or None."""
    db = read_db()
    for user in db["users"]:
        # .lower() makes the comparison case-insensitive
        if user["username"].lower() == username.lower():
            return user
    return None  # not found




def find_user_by_id(user_id):
    """Find and return a single user dict by ID, or None."""
    db = read_db()
    for user in db["users"]:
        if user["id"] == user_id:
            return user
    return None




def safe_user(user):
    """Return a copy of the user dict with the password removed.
    You never want to send passwords back in API responses."""
    # dict.copy() makes a shallow copy so we don't modify the original
    result = user.copy()
    result.pop("password", None)
    # pop("password", None) removes the key if it exists,
    # the None means 'don't crash if it's missing'
    return result




# ═══════════════════════════════════════════════════════════════
# TOKEN / SESSION STORE
# A simple in-memory dictionary: token string → user info
# Created on login, deleted on logout
# ═══════════════════════════════════════════════════════════════


active_sessions = {}
# Example of what it looks like at runtime:
# {
#   "a3f9kzbc12": { "user_id": "user-001", "role": "admin" },
#   "x7m2qp9yz4": { "user_id": "user-002", "role": "user" }
# }




def generate_token():
    """Generate a secure random token string."""
    # secrets.token_hex(16) generates 16 random bytes as a hex string
    # Result looks like: "a3f9kzbc12d4e5f6a7b8c9d0e1f2a3b4"
    return secrets.token_hex(16)




# ═══════════════════════════════════════════════════════════════
# MIDDLEWARE / DECORATORS
#
# In Flask, middleware is written as "decorator functions".
# A decorator wraps around a route function to add behaviour.
#
# How decorators work:
#   @require_auth          ← this line applies the decorator
#   def my_route():        ← to this function
#       ...
#
# When someone calls /my-route, require_auth runs FIRST.
# If it passes, it calls the real route function.
# If it fails, it returns an error response immediately.
# ═══════════════════════════════════════════════════════════════


def require_auth(f):
    """Decorator: checks that the request has a valid Bearer token."""
    @wraps(f)
    # @wraps(f) preserves the original function's name and docstring.
    # Without it Flask gets confused when multiple routes use the decorator.
    def decorated(*args, **kwargs):
        # *args and **kwargs pass through any arguments the route expects
        # (like user_id from the URL)


        auth_header = request.headers.get("Authorization")
        # request.headers.get("Authorization") reads the Authorization header
        # Returns None if the header isn't present


        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "No token provided"}), 401


        # Split "Bearer a3f9kz..." → ["Bearer", "a3f9kz..."]
        # [1] gets the token part
        token = auth_header.split(" ")[1]


        if token not in active_sessions:
            return jsonify({"error": "Invalid or expired token"}), 401


        # Store session data so the route function can access it
        # We attach it to Flask's special 'g' object (request-scoped storage)
        from flask import g
        g.session = active_sessions[token]
        # g.session is now { "user_id": "user-001", "role": "admin" }


        return f(*args, **kwargs)
        # Call the actual route function


    return decorated




def require_admin(f):
    """Decorator: checks that the authenticated user is an admin.
    Always use AFTER @require_auth."""
    @wraps(f)
    def decorated(*args, **kwargs):
        from flask import g
        if g.session["role"] != "admin":
            return jsonify({"error": "Admin role required"}), 403
        return f(*args, **kwargs)
    return decorated




# ═══════════════════════════════════════════════════════════════
# REQUEST LOGGER
# Runs before every request and prints it to the terminal
# ═══════════════════════════════════════════════════════════════


@app.before_request
# @app.before_request is a Flask hook that runs a function
# before every single incoming request
def log_request():
    now = datetime.now().strftime("%H:%M:%S")
    print(f"\n{'─' * 50}")
    print(f"[{now}]  {request.method}  {request.path}")


    if request.headers.get("Authorization"):
        print(f"Token   : {request.headers.get('Authorization')}")


    # request.is_json checks if the Content-Type is application/json
    # silent=True tells Flask to return None instead of raising a 400
    # if the body is empty or isn't valid JSON — e.g. a GET request
    # that still sends a "Content-Type: application/json" header
    if request.is_json:
        body = request.get_json(silent=True)
        if body:
            body = body.copy()
            if "password" in body:
                body["password"] = "****"  # mask password in logs
            print(f"Body    : {json.dumps(body, indent=2)}")




@app.after_request
# Runs after every request — lets us log the response status
def log_response(response):
    print(f"Response: [{response.status_code}]")
    return response  # must return the response object




# ═══════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════




# ── POST /auth/login ──────────────────────────────────────────
# UE5 sends:  { "username": "gebril", "password": "admin123" }
# Returns:    { "token": "...", "user": { ...no password... } }


@app.route("/auth/login", methods=["POST"])
def login():
    # request .json reads and parses the JSON body automatically
    # Returns a Python dict, or None if body isn't valid JSON
    body = request.json


    if not body:
        return jsonify({"error": "JSON body required"}), 400


    username = body.get("username")  # .get() returns None if key missing
    password = body.get("password")


    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400


    user = find_user_by_username(username)


    if not user:
        return jsonify({"error": "Invalid username or password"}), 401


    if user["password"] != password:
        return jsonify({"error": "Invalid username or password"}), 401


    # Credentials are correct — create a session token
    token = generate_token()


    active_sessions[token] = {
        "user_id": user["id"],
        "role":    user["role"]
    }


    return jsonify({
        "token": token,
        "user":  safe_user(user)
    }), 200




# ── POST /auth/signup ─────────────────────────────────────────
# Anyone can sign up — no token required
# Body: { "username": "...", "password": "..." }


@app.route("/auth/signup", methods=["POST"])
def signup():
    body = request.get_json(force=True, silent=True)


    if not body:
        return jsonify({ "success": False, "message": "Could not parse body" }), 400


    username = body.get("username")
    password = body.get("password")


    if not username or not password:
        return jsonify({ "success": False, "message": "Username and password are required" }), 400


    # Check if username is already taken
    db = read_db()
    existing = find_user_by_username(username)
    if existing:
        return jsonify({ "success": False, "message": "Username already taken" }), 409


    # Generate new ID
    new_id = f"user-{str(len(db['users']) + 1).zfill(3)}"


    # New self-registered users are always "user" — never admin
    new_user = {
        "id":                new_id,
        "username":          username,
        "password":          password,
        "role":              "user",
        "favoritePlaces":    [],
        "recentSavedPlaces": []
    }


    db["users"].append(new_user)
    write_db(db)


    return jsonify({
        "success":  True,
        "message":  "Account created successfully",
        "id":       new_user["id"],
        "username": new_user["username"],
        "role":     new_user["role"]
    }), 201




# ── POST /auth/logout ─────────────────────────────────────────


@app.route("/auth/logout", methods=["POST"])
@require_auth
# @require_auth runs first — validates the token
# If valid, the route function runs
def logout():
    from flask import g
    token = request.headers.get("Authorization").split(" ")[1]
    del active_sessions[token]  # remove the session
    return jsonify({"message": "Logged out successfully"}), 200




# ── GET /users ────────────────────────────────────────────────
# Returns all users. Admin only.


@app.route("/users", methods=["GET"])
@require_auth
@require_admin
# Decorators stack — require_auth runs first, then require_admin
def get_all_users():
    db = read_db()
    return jsonify([safe_user(u) for u in db["users"]]), 200
    # List comprehension: [safe_user(u) for u in db["users"]]
    # = loop through every user and call safe_user() on each one
    # Same as:
    #   result = []
    #   for u in db["users"]:
    #       result.append(safe_user(u))




# ── GET /users/<user_id> ──────────────────────────────────────
# Flask uses <user_id> in the URL pattern (not :id like Express)
# The value gets passed as a function argument automatically


@app.route("/users/<user_id>", methods=["GET"])
@require_auth
def get_user(user_id):
    # user_id comes directly from the URL
    # GET /users/user-001  →  user_id = "user-001"
    user = find_user_by_id(user_id)


    if not user:
        return jsonify({"error": "User not found"}), 404


    return jsonify(safe_user(user)), 200




# ── POST /users ───────────────────────────────────────────────
# Create a new user. Admin only.


@app.route("/users", methods=["POST"])
@require_auth
@require_admin
def create_user():
    body = request.json


    if not body:
        return jsonify({"error": "JSON body required"}), 400


    username = body.get("username")
    password = body.get("password")
    role     = body.get("role")


    if not all([username, password, role]):
        # all([...]) returns True only if EVERY item is truthy
        return jsonify({"error": "username, password, role are required"}), 400


    if role not in ["admin", "standard"]:
        return jsonify({"error": "role must be 'admin' or 'standard'"}), 400


    if find_user_by_username(username):
        return jsonify({"error": "Username already exists"}), 409


    db = read_db()


    # Generate new ID — pad number to 3 digits: 1 → "001"
    new_id = f"user-{str(len(db['users']) + 1).zfill(3)}"
    # zfill(3) = zero-fill to 3 characters: "1" → "001", "10" → "010"


    new_user = {
        "id":                new_id,
        "username":          username,
        "password":          password,
        "role":              role,
        "favoritePlaces":    [],
        "recentSavedPlaces": []
    }


    db["users"].append(new_user)
    write_db(db)


    return jsonify(safe_user(new_user)), 201




# ── PUT /users/<user_id>/role ─────────────────────────────────
# Change a user's role. Admin only.


@app.route("/users/<user_id>/role", methods=["PUT"])
@require_auth
@require_admin
def update_role(user_id):
    body = request.json
    role = body.get("role") if body else None


    if not role or role not in ["admin", "standard"]:
        return jsonify({"error": "role must be 'admin' or 'standard'"}), 400


    db = read_db()


    # Find the user's index in the list using enumerate
    # enumerate gives you (index, value) pairs:
    # [(0, user1), (1, user2), (2, user3) ...]
    user_index = None
    for i, u in enumerate(db["users"]):
        if u["id"] == user_id:
            user_index = i
            break  # stop looping once found


    if user_index is None:
        return jsonify({"error": "User not found"}), 404


    db["users"][user_index]["role"] = role
    write_db(db)


    return jsonify(safe_user(db["users"][user_index])), 200




# ── GET /users/<user_id>/favorites ────────────────────────────


@app.route("/users/<user_id>/favorites", methods=["GET"])
@require_auth
def get_favorites(user_id):
    user = find_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user["favoritePlaces"]), 200




# ── POST /users/<user_id>/favorites ───────────────────────────
# Add a place to favorites


@app.route("/users/<user_id>/favorites", methods=["POST"])
@require_auth
def add_favorite(user_id):
    body = request.json


    if not body:
        return jsonify({"error": "JSON body required"}), 400


    place_id = body.get("placeId")
    name     = body.get("name")


    if not place_id or not name:
        return jsonify({"error": "placeId and name are required"}), 400


    db = read_db()


    user_index = None
    for i, u in enumerate(db["users"]):
        if u["id"] == user_id:
            user_index = i
            break


    if user_index is None:
        return jsonify({"error": "User not found"}), 404


    # Check if place is already in favorites using any()
    # any() returns True if at least one element matches
    already_saved = any(
        p["placeId"] == place_id
        for p in db["users"][user_index]["favoritePlaces"]
    )


    if already_saved:
        return jsonify({"error": "Place already in favorites"}), 409


    db["users"][user_index]["favoritePlaces"].append({
        "placeId": place_id,
        "name":    name
    })


    write_db(db)
    return jsonify({"favPlaces" : db["users"][user_index]["favoritePlaces"]}), 201




# ── DELETE /users/<user_id>/favorites/<place_id> ──────────────


@app.route("/users/<user_id>/favorites/<place_id>", methods=["DELETE"])
@require_auth
def remove_favorite(user_id, place_id):
    db = read_db()


    user_index = None
    for i, u in enumerate(db["users"]):
        if u["id"] == user_id:
            user_index = i
            break


    if user_index is None:
        return jsonify({"error": "User not found"}), 404


    favorites      = db["users"][user_index]["favoritePlaces"]
    count_before   = len(favorites)


    # Keep every place EXCEPT the one with matching placeId
    db["users"][user_index]["favoritePlaces"] = [
        p for p in favorites if p["placeId"] != place_id
    ]


    if len(db["users"][user_index]["favoritePlaces"]) == count_before:
        return jsonify({"error": "Place not found in favorites"}), 404


    write_db(db)
    return jsonify({"message":"Success"},db["users"][user_index]["favoritePlaces"]), 200




# ── GET /users/<user_id>/recent ───────────────────────────────


@app.route("/users/<user_id>/recent", methods=["GET"])
@require_auth
def get_recent(user_id):
    user = find_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"recentPlaces": user["recentSavedPlaces"]}), 200




# ── POST /users/<user_id>/recent ──────────────────────────────
# Add to recent places (max 3, most recent first)


@app.route("/users/<user_id>/recent", methods=["POST"])
@require_auth
def add_recent(user_id):
    body = request.json


    if not body:
        return jsonify({"error": "JSON body required"}), 400


    place_id = body.get("placeId")
    name     = body.get("name")


    if not place_id or not name:
        return jsonify({"error": "placeId and name are required"}), 400


    db = read_db()


    user_index = None
    for i, u in enumerate(db["users"]):
        if u["id"] == user_id:
            user_index = i
            break


    if user_index is None:
        return jsonify({"error": "User not found"}), 404


    recent = db["users"][user_index]["recentSavedPlaces"]


    # Remove existing entry for this place if present (we'll re-add at top)
    recent = [p for p in recent if p["placeId"] != place_id]


    new_entry = {
        "placeId": place_id,
        "name":    name,
        # datetime.now(timezone.utc) = current time in UTC
        # .isoformat() = "2025-06-21T10:30:00+00:00"
        "savedAt": datetime.now(timezone.utc).isoformat()
    }


    # Insert at the front of the list
    recent.insert(0, new_entry)
    # insert(0, item) adds at index 0 (the beginning)
    # Same as JavaScript's unshift()


    # Keep only the 3 most recent
    recent = recent[:3]
    # [:10] = slice from start up to (not including) index 10


    db["users"][user_index]["recentSavedPlaces"] = recent
    write_db(db)


    return jsonify({"recentSavedPlaces": recent}), 201




# ── DELETE /users/<user_id> ───────────────────────────────────


@app.route("/users/<user_id>", methods=["DELETE"])
@require_auth
@require_admin
def delete_user(user_id):
    db           = read_db()
    count_before = len(db["users"])


    db["users"] = [u for u in db["users"] if u["id"] != user_id]


    if len(db["users"]) == count_before:
        return jsonify({"error": "User not found"}), 404


    write_db(db)
    return jsonify({"message": f"User {user_id} deleted"}), 200




# ── GET /health ───────────────────────────────────────────────


@app.route("/health", methods=["GET"])
def health():
    db = read_db()
    return jsonify({
        "status":    "ok",
        "userCount": len(db["users"])
    }), 200




# ═══════════════════════════════════════════════════════════════
# START THE SERVER
# ═══════════════════════════════════════════════════════════════


if __name__ == "__main__":
    # __name__ == "__main__" means "only run this if you launched
    # this file directly with: python server.py"
    # (not if it was imported by another file)


    print("\n✅  Mock server running →  http://localhost:3000\n")
    print("ROUTES:")
    print("  POST   /auth/login")
    print("  POST   /auth/logout                      (auth)")
    print("  GET    /users                            (admin)")
    print("  GET    /users/<id>                       (auth)")
    print("  POST   /users                            (admin)")
    print("  PUT    /users/<id>/role                  (admin)")
    print("  DELETE /users/<id>                       (admin)")
    print("  GET    /users/<id>/favorites             (auth)")
    print("  POST   /users/<id>/favorites             (auth)")
    print("  DELETE /users/<id>/favorites/<place_id>  (auth)")
    print("  GET    /users/<id>/recent                (auth)")
    print("  POST   /users/<id>/recent                (auth)")
    print("  GET    /health\n")


    app.run(
        host="0.0.0.0",   # accept connections from any network interface
                           # use "127.0.0.1" to restrict to localhost only
        port=3000,
        debug=True         # auto-restarts server when you save server.py
                           # also shows detailed error pages
    )