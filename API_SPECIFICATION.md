# Lendly API Specification

This document defines the REST API endpoints and data schemas designed for the Lendly frontend. Any backend (Node.js/Express, Python/FastAPI/Flask, Go, etc.) can implement these routes directly to work seamlessly with the frontend.

---

## Base URL Configuration

By default, the frontend sends requests to `/api`.

You can override the base URL by:
- Setting `window.API_BASE = 'http://localhost:8000/api'` before `main.js` loads, or
- Storing it in `localStorage.setItem('lendly_api_base', 'http://localhost:8000/api')`.

All endpoints use standard JSON request/response bodies:
`Content-Type: application/json`

---

## Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/books` | Get list of books (supports optional query filters) |
| `GET` | `/api/books/:id` | Get single book details |
| `GET` | `/api/loans` | Get list of active loans (supports optional `?memberId=`) |
| `POST` | `/api/loans` | Borrow a book |
| `POST` | `/api/loans/return` | Return a borrowed book |
| `DELETE` | `/api/loans/:id` | Alternative fallback return endpoint |
| `GET` | `/api/account` | Get account details (supports optional `?memberId=`) |
| `PUT` | `/api/account` | Create or update account profile (`POST` also supported) |

---

## Detailed Endpoint Specifications

### 1. `GET /api/books`
Returns the catalogue of books.

#### Query Parameters (Optional)
- `search` *(string)*: Case-insensitive search on title and author.
- `genre` *(string)*: Filter by genre (e.g., `fiction`, `science`, `kids`).
- `available` *(boolean)*: When `true`, only return books with available copies.

#### Response: `200 OK`
Can return either a JSON array of book objects or `{ "books": [...] }`.

```json
[
  {
    "id": 1,
    "title": "The Lighthouse Keeper",
    "author": "Marta Ellison",
    "genre": "fiction",
    "pages": 312,
    "copies": 2,
    "availableCopies": 2
  },
  {
    "id": 2,
    "title": "A Short Map of the Cosmos",
    "author": "Idris Okafor",
    "genre": "science",
    "pages": 290,
    "copies": 1,
    "availableCopies": 0
  },
  {
    "id": 3,
    "title": "Pip and the Paper Boat",
    "author": "Lena Hartwell",
    "genre": "kids",
    "pages": 32,
    "copies": 3,
    "availableCopies": 3
  }
]
```

---

### 2. `GET /api/books/:id`
Returns a single book by ID.

#### Response: `200 OK`
```json
{
  "id": 1,
  "title": "The Lighthouse Keeper",
  "author": "Marta Ellison",
  "genre": "fiction",
  "pages": 312,
  "copies": 2,
  "availableCopies": 2
}
```

#### Error Response: `404 Not Found`
```json
{
  "error": "Book not found"
}
```

---

### 3. `GET /api/loans`
Returns active loans.

#### Query Parameters (Optional)
- `memberId` *(string)*: Member ID to filter loans for.

#### Response: `200 OK`
Can return either a JSON array of loan objects or `{ "loans": [...] }`.

```json
[
  {
    "id": 101,
    "bookId": 2,
    "memberId": "10042",
    "due": "2026-10-18",
    "borrowedDate": "2026-10-04",
    "book": {
      "id": 2,
      "title": "A Short Map of the Cosmos",
      "author": "Idris Okafor"
    }
  }
]
```

*Note: The frontend will look up the book using `bookId` from the books list, or use the optional nested `book` object if provided.*

---

### 4. `POST /api/loans`
Borrow a book.

#### Request Body
```json
{
  "bookId": 1,
  "memberId": "10042",
  "days": 14
}
```

#### Response: `201 Created` or `200 OK`
```json
{
  "id": 102,
  "bookId": 1,
  "memberId": "10042",
  "due": "2026-10-18",
  "borrowedDate": "2026-10-04"
}
```

#### Error Response: `400 Bad Request`
```json
{
  "error": "No copies available to borrow"
}
```

---

### 5. `POST /api/loans/return`
Return a borrowed book.

#### Request Body
```json
{
  "loanId": 102,
  "bookId": 1,
  "memberId": "10042"
}
```

#### Response: `200 OK`
```json
{
  "success": true,
  "message": "Book returned successfully"
}
```

*Fallback Note: If `/api/loans/return` is not implemented (404/405), the frontend will attempt `DELETE /api/loans/:id`.*

---

### 6. `GET /api/account`
Fetch account profile for a member.

#### Query Parameters (Optional)
- `memberId` *(string)*: Member ID.

#### Response: `200 OK`
```json
{
  "name": "Alex Mercer",
  "memberId": "10042",
  "loanLength": 14
}
```

---

### 7. `PUT /api/account` (or `POST /api/account`)
Create or update account profile.

#### Request Body
```json
{
  "name": "Alex Mercer",
  "memberId": "10042",
  "loanLength": 14
}
```

#### Response: `200 OK`
```json
{
  "name": "Alex Mercer",
  "memberId": "10042",
  "loanLength": 14
}
```

---

## Standard Error Response Format

For errors (HTTP 4xx and 5xx), the backend should return a JSON object with an `error` or `message` property:

```json
{
  "error": "Brief explanation of what went wrong"
}
```
The frontend automatically extracts and displays this message in user-facing toasts and error containers.
