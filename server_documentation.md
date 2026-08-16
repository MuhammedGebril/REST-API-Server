# server.py — API Documentation

**Project:** UE5 User Management Mock Server  
**Language:** Python 3  
**Framework:** Flask  
**Database:** `db.json` (JSON flat file)  
**Base URL:** `http://localhost:3000`

---

## Table of Contents

1. [Overview](#overview)
2. [File Structure](#file-structure)
3. [Dependencies](#dependencies)
4. [URL Structure](#url-structure)
5. [Database Schema](#database-schema)
6. [Authentication](#authentication)
7. [Endpoints](#endpoints)
   - [Auth](#auth)
   - [Users](#users)
   - [Favorite Places](#favorite-places)
   - [Recent Saved Places](#recent-saved-places)
   - [Health](#health)
8. [Error Reference](#error-reference)
9. [Internal Functions](#internal-functions)
10. [Request Flow Diagram](#request-flow-diagram)

---

## Overview

`server.py` is a local mock REST API server built with Flask. It simulates a production user management backend for testing HTTP requests and responses from Unreal Engine 5 via the VaRest Blueprint plugin.

The server supports:
- User signup, login, and logout with token-based authentication
- Two privilege roles: `admin` and `user`
- CRUD operations on users
- Per-user favorite places and recent saved places
- Persistent storage via a local `db.json` file
- Live terminal logging of every request and response

> **This is a mock server for development and testing only.** It is not suitable for production use.

---

## File Structure

```
ue5-mock-server-python/
├── server.py    ← the server (this file)
└── db.json      ← the database
```

---

## Dependencies

| Package | Purpose | Install |
|---|---|---|
| `flask` | Web framework | `pip install flask` |
| `json` | Read/write JSON files | Built-in |
| `os` | File path handling | Built-in |
| `secrets` | Secure token generation | Built-in |
| `datetime` | Timestamps for recent places | Built-in |
| `functools` | `wraps` helper for decorators | Built-in |

**Run the server:**
```bash
python server.py
```

---

## URL Structure

Every request URL follows this pattern:

```
Base URL  +  Endpoint Route
─────────────────────────────────────────────
http://localhost:3000  +  /auth/login
```

### Base URL

```
http://localhost:3000
```

Store this in a **Game Instance string variable** called `BaseURL` in UE5. When you move from local testing to a real server, you only change it in one place.

### All Endpoint URLs

| Request | Full URL |
|---|---|
| Signup | `http://localhost:3000/auth/signup` |
| Login | `http://localhost:3000/auth/login` |
| Logout | `http://localhost:3000/auth/logout` |
| Get all users | `http://localhost:3000/users` |
| Get single user | `http://localhost:3000/users/<user_id>` |
| Create user (admin) | `http://localhost:3000/users` |
| Change role | `http://localhost:3000/users/<user_id>/role` |
| Delete user | `http://localhost:3000/users/<user_id>` |
| Get favorites | `http://localhost:3000/users/<user_id>/favorites` |
| Add favorite | `http://localhost:3000/users/<user_id>/favorites` |
| Remove favorite | `http://localhost:3000/users/<user_id>/favorites/<place_id>` |
| Get recent places | `http://localhost:3000/users/<user_id>/recent` |
| Add recent place | `http://localhost:3000/users/<user_id>/recent` |
| Health check | `http://localhost:3000/health` |

### Dynamic URLs in UE5

For routes that contain a user ID or place ID, build the URL by appending variables using **Append String** nodes in Blueprint:

```
"http://localhost:3000/users/" + UserID
→ "http://localhost:3000/users/user-001"

"http://localhost:3000/users/" + UserID + "/favorites"
→ "http://localhost:3000/users/user-001/favorites"

"http://localhost:3000/users/" + UserID + "/favorites/" + PlaceID
→ "http://localhost:3000/users/user-001/favorites/place-01"
```

---

## Database Schema

The `db.json` file acts as the database. It contains a single `users` array.

### Top-level structure

```json
{
  "users": [ ...array of user objects... ]
}
```

### User object

```json
{
  "id":                "user-001",
  "username":          "username-01",
  "password":          "password-01",
  "role":              "admin",
  "favoritePlaces":    [ ...array of place objects... ],
  "recentSavedPlaces": [ ...array of recent place objects... ]
}
```

### User fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique user ID. Format: `"user-001"` |
| `username` | `string` | Login username. Case-insensitive on lookup. |
| `password` | `string` | Plain text password (mock only — never do this in production) |
| `role` | `string` | Either `"admin"` or `"user"` |
| `favoritePlaces` | `array` | List of saved favorite place objects |
| `recentSavedPlaces` | `array` | List of recently visited place objects (max 10) |

### Place object (favoritePlaces)

```json
{
  "placeId": "place-01",
  "name":    "place-name-01",
}
```

| Field | Type | Description |
|---|---|---|
| `placeId` | `string` | Unique identifier for the place |
| `name` | `string` | Display name of the place |

### Recent place object (recentSavedPlaces)

```json
{
  "placeId": "place-01",
  "name":    "place-name-01",
  "savedAt": "2025-06-20T10:00:00+00:00"
}
```

| Field | Type | Description |
|---|---|---|
| `placeId` | `string` | Unique identifier for the place |
| `name` | `string` | Display name of the place |
| `savedAt` | `string` | ISO 8601 UTC timestamp of when it was saved |

---

## Authentication

The server uses **Bearer token authentication**.

### How it works

1. Client sends credentials to `POST /auth/login`
2. Server validates credentials and generates a random token
3. Token is stored in memory: `active_sessions[token] = { user_id, role }`
4. Client includes the token in all subsequent requests via the `Authorization` header
5. Server validates the token on every protected route
6. Token is destroyed on `POST /auth/logout`

### Sending the token

All protected endpoints require this header:

```
Authorization: Bearer <your-token-here>
```

**Example:**
```
Authorization: Bearer a3f9bc12d4e5f6a7b8c9d0e1f2a3b4c5
```

### Role levels

| Role | Symbol | Access |
|---|---|---|
| `user` | ✅ | Own data, favorites, recent places |
| `admin` | 👑 | Everything — including user management |

> **Note:** Tokens are stored in memory and reset when the server restarts. All users will need to log in again after a restart.

---

## Endpoints

### Auth

---

#### `POST /auth/login`

Authenticates a user and returns a session token.

**Auth required:** No

**Request body:**

```json
{
  "username": "gebril",
  "password": "admin123"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `username` | `string` | ✅ | The user's username (case-insensitive) |
| `password` | `string` | ✅ | The user's password |

**Success response — `200 OK`:**

```json
{
  "token": "a3f9bc12d4e5f6a7b8c9d0e1f2a3b4c5",
  "user": {
    "id":                "user-001",
    "username":          "username-01",
    "role":              "admin",
    "favoritePlaces":    [],
    "recentSavedPlaces": []
  }
}
```

> The `password` field is **never** included in the response.

**Error responses:**

| Status | Condition |
|---|---|
| `400 Bad Request` | `username` or `password` missing from body |
| `401 Unauthorized` | Username not found or password incorrect |

---

#### `POST /auth/signup`

Creates a new account. Open to anyone — no token required. New accounts are always assigned the `user` role.

**Auth required:** No

**Request body:**

```json
{
  "username": "username-01",
  "password": "password-01"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `username` | `string` | ✅ | Must be unique |
| `password` | `string` | ✅ | Plain text (mock server only) |

**Success response — `201 Created`:**

```json
{
  "success":  true,
  "message":  "Account created successfully",
  "id":       "user-003",
  "username": "username-01",
  "role":     "user"
}
```

> Role is always `"user"` on signup. Only an admin can elevate a user to `"admin"` via `PUT /users/<user_id>/role`.

**Error responses:**

| Status | Condition |
|---|---|
| `400 Bad Request` | `username` or `password` missing from body |
| `409 Conflict` | Username already taken |

---

#### `POST /auth/logout`

Invalidates the current session token.

**Auth required:** ✅

**Request body:** None

**Success response — `200 OK`:**

```json
{
  "message": "Logged out successfully"
}
```

**Error responses:**

| Status | Condition |
|---|---|
| `401 Unauthorized` | Token missing or invalid |

---

### Users

---

#### `GET /users`

Returns all users in the database.

**Auth required:** 👑 Admin only

**Request body:** None

**Success response — `200 OK`:**

```json
[
  {
    "id":       "user-001",
    "username": "username-01",
    "role":     "admin",
    "favoritePlaces":    [],
    "recentSavedPlaces": []
  },
  {
    "id":       "user-002",
    "username": "username-02",
    "role":     "user",
    "favoritePlaces":    [],
    "recentSavedPlaces": []
  }
]
```

**Error responses:**

| Status | Condition |
|---|---|
| `401 Unauthorized` | Token missing or invalid |
| `403 Forbidden` | Valid token but user is not admin |

---

#### `GET /users/<user_id>`

Returns a single user by their ID.

**Auth required:** ✅

**URL parameter:**

| Parameter | Description | Example |
|---|---|---|
| `user_id` | The user's unique ID | `user-001` |

**Example request:**
```
GET /users/user-001
Authorization: Bearer a3f9bc12...
```

**Success response — `200 OK`:**

```json
{
  "id":                "user-001",
  "username":          "username-01",
  "role":              "admin",
  "favoritePlaces":    [],
  "recentSavedPlaces": []
}
```

**Error responses:**

| Status | Condition |
|---|---|
| `401 Unauthorized` | Token missing or invalid |
| `404 Not Found` | No user exists with that ID |

---

#### `POST /users`

Creates a new user. The new user starts with empty favorites and recent places.

**Auth required:** 👑 Admin only

**Request body:**

```json
{
  "username": "username-03",
  "password": "password-03",
  "role":     "user"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `username` | `string` | ✅ | Must be unique |
| `password` | `string` | ✅ | Plain text (mock server only) |
| `role` | `string` | ✅ | Must be `"admin"` or `"user"` |

**Success response — `201 Created`:**

```json
{
  "id":                "user-003",
  "username":          "username-03",
  "role":              "user",
  "favoritePlaces":    [],
  "recentSavedPlaces": []
}
```

**Error responses:**

| Status | Condition |
|---|---|
| `400 Bad Request` | Any required field is missing |
| `400 Bad Request` | `role` is not `"admin"` or `"user"` |
| `401 Unauthorized` | Token missing or invalid |
| `403 Forbidden` | Valid token but user is not admin |
| `409 Conflict` | Username already exists |

---

#### `PUT /users/<user_id>/role`

Changes the role of an existing user.

**Auth required:** 👑 Admin only

**URL parameter:**

| Parameter | Description | Example |
|---|---|---|
| `user_id` | The user's unique ID | `user-002` |

**Request body:**

```json
{
  "role": "user"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | `string` | ✅ | Must be `"admin"` or `"user"` |

**Success response — `200 OK`:**

```json
{
  "id":       "user-002",
  "username": "username-02",
  "role":     "user",
  "favoritePlaces":    [],
  "recentSavedPlaces": []
}
```

**Error responses:**

| Status | Condition |
|---|---|
| `400 Bad Request` | `role` missing or invalid value |
| `401 Unauthorized` | Token missing or invalid |
| `403 Forbidden` | Valid token but user is not admin |
| `404 Not Found` | No user exists with that ID |

---

#### `DELETE /users/<user_id>`

Permanently deletes a user from the database.

**Auth required:** 👑 Admin only

**URL parameter:**

| Parameter | Description | Example |
|---|---|---|
| `user_id` | The user's unique ID | `user-002` |

**Example request:**
```
DELETE /users/user-002
Authorization: Bearer a3f9bc12...
```

**Success response — `200 OK`:**

```json
{
  "message": "User user-002 deleted"
}
```

**Error responses:**

| Status | Condition |
|---|---|
| `401 Unauthorized` | Token missing or invalid |
| `403 Forbidden` | Valid token but user is not admin |
| `404 Not Found` | No user exists with that ID |

---

### Favorite Places

---

#### `GET /users/<user_id>/favorites`

Returns the user's full list of favorite places.

**Auth required:** ✅

**URL parameter:**

| Parameter | Description | Example |
|---|---|---|
| `user_id` | The user's unique ID | `user-001` |

**Success response — `200 OK`:**

```json
[
  {
    "placeId": "place-01",
    "name":    "place-name-01",
  },
  {
    "placeId": "place-02",
    "name":    "place-name-02",
  }
]
```

Returns an empty array `[]` if the user has no favorites.

**Error responses:**

| Status | Condition |
|---|---|
| `401 Unauthorized` | Token missing or invalid |
| `404 Not Found` | No user exists with that ID |

---

#### `POST /users/<user_id>/favorites`

Adds a place to the user's favorites list.

**Auth required:** ✅

**URL parameter:**

| Parameter | Description | Example |
|---|---|---|
| `user_id` | The user's unique ID | `user-001` |

**Request body:**

```json
{
  "placeId": "place-03",
  "name":    "place-name-03",
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `placeId` | `string` | ✅ | Unique identifier for the place |
| `name` | `string` | ✅ | Display name of the place |
**Success response — `201 Created`:**

Returns the full updated favorites array.

```json
[
  {
    "placeId": "place-01",
    "name":    "place-name-01",
  },
  {
    "placeId": "place-03",
    "name":    "place-name-03",
  }
]
```

**Error responses:**

| Status | Condition |
|---|---|
| `400 Bad Request` | `placeId` or `name` is missing |
| `401 Unauthorized` | Token missing or invalid |
| `404 Not Found` | No user exists with that ID |
| `409 Conflict` | Place is already in the user's favorites |

---

#### `DELETE /users/<user_id>/favorites/<place_id>`

Removes a place from the user's favorites list.

**Auth required:** ✅

**URL parameters:**

| Parameter | Description | Example |
|---|---|---|
| `user_id` | The user's unique ID | `user-001` |
| `place_id` | The place's unique ID | `place-001` |

**Example request:**
```
DELETE /users/user-001/favorites/place-001
Authorization: Bearer a3f9bc12...
```

**Success response — `200 OK`:**

Returns the full updated favorites array after removal.

```json
[
  {
    "placeId": "place-02",
    "name":    "place-name-02"
  }
]
```

**Error responses:**

| Status | Condition |
|---|---|
| `401 Unauthorized` | Token missing or invalid |
| `404 Not Found` | User not found, or place not in favorites |

---

### Recent Saved Places

---

#### `GET /users/<user_id>/recent`

Returns the user's recently saved places, ordered from most to least recent.

**Auth required:** ✅

**URL parameter:**

| Parameter | Description | Example |
|---|---|---|
| `user_id` | The user's unique ID | `user-001` |

**Success response — `200 OK`:**

```json
[
  {
    "placeId": "place-03",
    "name":    "place-name-03",
    "savedAt": "2025-06-21T10:30:00+00:00"
  },
  {
    "placeId": "place-04",
    "name":    "place-name-04",
    "savedAt": "2025-06-20T14:00:00+00:00"
  }
]
```

Returns an empty array `[]` if the user has no recent places.

**Error responses:**

| Status | Condition |
|---|---|
| `401 Unauthorized` | Token missing or invalid |
| `404 Not Found` | No user exists with that ID |

---

#### `POST /users/<user_id>/recent`

Adds a place to the user's recently saved list.

**Auth required:** ✅

**URL parameter:**

| Parameter | Description | Example |
|---|---|---|
| `user_id` | The user's unique ID | `user-001` |

**Request body:**

```json
{
  "placeId": "place-05",
  "name":    "place-name-05"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `placeId` | `string` | ✅ | Unique identifier for the place |
| `name` | `string` | ✅ | Display name of the place |
**Behaviour:**

- The new place is inserted at the **top** of the list (most recent first)
- If the place already exists in the list, it is **moved to the top** (not duplicated)
- The list is capped at **10 entries** — the oldest entry is dropped when the limit is exceeded
- A `savedAt` UTC timestamp is automatically added by the server

**Success response — `201 Created`:**

Returns the full updated recent places array.

```json
[
  {
    "placeId": "place-05",
    "name":    "place-name-05",
    "savedAt": "2025-06-21T11:00:00+00:00"
  },
  {
    "placeId": "place-03",
    "name":    "place-name-03",
    "savedAt": "2025-06-21T10:30:00+00:00"
  }
]
```

**Error responses:**

| Status | Condition |
|---|---|
| `400 Bad Request` | `placeId` or `name` is missing |
| `401 Unauthorized` | Token missing or invalid |
| `404 Not Found` | No user exists with that ID |

---

### Health

---

#### `GET /health`

Checks that the server is running and returns basic stats.

**Auth required:** No

**Success response — `200 OK`:**

```json
{
  "status":    "ok",
  "userCount": 2
}
```

| Field | Type | Description |
|---|---|---|
| `status` | `string` | Always `"ok"` if the server is running |
| `userCount` | `integer` | Number of users currently in `db.json` |

---

## Error Reference

All error responses follow this format:

```json
{
  "error": "Human-readable description of the problem"
}
```

### HTTP Status Codes Used

| Code | Name | When it's returned |
|---|---|---|
| `200` | OK | Request succeeded |
| `201` | Created | A new resource was successfully created |
| `400` | Bad Request | Required field is missing or value is invalid |
| `401` | Unauthorized | No token, invalid token, or wrong credentials |
| `403` | Forbidden | Valid token but insufficient role (not admin) |
| `404` | Not Found | User ID or place ID does not exist |
| `409` | Conflict | Duplicate — username or place already exists |

---

## Internal Functions

These functions are not endpoints. They are helpers used internally by the route handlers.

| Function | Description |
|---|---|
| `read_db()` | Reads `db.json` and returns it as a Python dict |
| `write_db(data)` | Writes a Python dict back to `db.json` |
| `find_user_by_username(username)` | Returns a user dict by username (case-insensitive), or `None` |
| `find_user_by_id(user_id)` | Returns a user dict by ID, or `None` |
| `safe_user(user)` | Returns a copy of the user dict with `password` removed |
| `generate_token()` | Returns a secure random 32-character hex token string |
| `require_auth(f)` | Decorator — validates the Bearer token before the route runs |
| `require_admin(f)` | Decorator — checks the authenticated user has role `"admin"` |
| `log_request()` | `@app.before_request` hook — prints every request to the terminal |
| `log_response(response)` | `@app.after_request` hook — prints the response status code |

---

## Request Flow Diagram

```
UE5 / VaRest sends HTTP Request
            │
            ▼
┌─────────────────────────┐
│   @app.before_request   │  log_request()
│   Logs method + URL     │  prints to terminal
│   + token + body        │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   @require_auth         │  If applied to the route:
│   Reads Authorization   │  - Missing token → 401
│   header                │  - Invalid token → 401
│   Sets g.session        │  - Valid → continue
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   @require_admin        │  If applied to the route:
│   Reads g.session.role  │  - Not admin → 403
│                         │  - Is admin → continue
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Route Handler         │  The actual function runs:
│                         │  - Reads request body
│   e.g. add_favorite()   │  - Calls read_db()
│                         │  - Modifies data
│                         │  - Calls write_db()
│                         │  - Returns jsonify(...)
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   @app.after_request    │  log_response()
│   Logs response code    │  prints status to terminal
└────────────┬────────────┘
             │
             ▼
     Response sent to UE5
```

---

## Quick Reference Card

```
BASE URL:  http://localhost:3000

AUTH
  POST   /auth/signup                         (no auth)
  POST   /auth/login                          (no auth)
  POST   /auth/logout                         (auth)

USERS
  GET    /users                               (admin)
  GET    /users/<user_id>                     (auth)
  POST   /users                               (admin)
  PUT    /users/<user_id>/role                (admin)
  DELETE /users/<user_id>                     (admin)

FAVORITES
  GET    /users/<user_id>/favorites           (auth)
  POST   /users/<user_id>/favorites           (auth)
  DELETE /users/<user_id>/favorites/<place_id>(auth)

RECENT
  GET    /users/<user_id>/recent              (auth)
  POST   /users/<user_id>/recent              (auth)

HEALTH
  GET    /health                              (no auth)

ROLES
  user   → own data, favorites, recent places
  admin  → everything including user management
```
