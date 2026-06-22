# Todo Backend

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/SH4DOW4RE/todo-backend-cicd/ci.yml?branch=main&style=for-the-badge&logo=github&label=ci%2Fcd)


Node.js, Express, and MySQL REST API for a Todo desktop application.

## Setup

Requirements: Node.js 20+ and MySQL 8+.

1. Create a MySQL database and a user with privileges on it.
2. Copy `.env.example` to `.env` and set the database credentials and a strong `JWT_SECRET`.
3. Install dependencies and create the schema:

   ```sh
   npm install
   npm run db:migrate
   npm start
   ```

The server defaults to `http://localhost:3000`. Except for registration and login, API routes require `Authorization: Bearer <token>`.

## Docker

Start the API and MySQL together:

```sh
docker compose up --build
```

The API is available at `http://localhost:3000`. The backend waits for MySQL to become healthy and applies the database schema automatically before starting. MySQL data is stored in the `mysql_data` volume.

The Compose defaults are intended for local development. For any deployed environment, set at least `JWT_SECRET`, `DB_PASSWORD`, and `MYSQL_ROOT_PASSWORD` in `.env`. Use `APP_PORT` to change the host port without changing the container port.

Stop the services with `docker compose down`. To also delete database data, run `docker compose down -v`.

## API

All request and response bodies use JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Process health check |
| `POST` | `/auth/register` | Register (`username`, `email`, `password`) |
| `POST` | `/auth/login` | Log in (`email`, `password`) |
| `GET` | `/users/me` | Read current user |
| `PATCH` | `/users/me` | Update current user |
| `DELETE` | `/users/me` | Delete current user and their todos |
| `GET` | `/folders` | List folders; optionally filter by parent |
| `POST` | `/folders` | Create a folder |
| `GET` | `/folders/:id` | Read a folder |
| `PUT` | `/folders/:id` | Replace a folder |
| `PATCH` | `/folders/:id` | Partially update a folder |
| `DELETE` | `/folders/:id` | Delete a folder |
| `GET` | `/todos` | List current user's todos |
| `GET` | `/todos/search` | Search current user's todos |
| `POST` | `/todos` | Create a todo |
| `GET` | `/todos/:id` | Read a todo |
| `PUT` | `/todos/:id` | Replace a todo |
| `PATCH` | `/todos/:id` | Partially update a todo |
| `DELETE` | `/todos/:id` | Delete a todo |

A todo body has `title`, `content`, `archived`, `status`, `folder`, `parents`, and `tags`. `title`, `content`, and `status` are required for `POST` and `PUT`. Status is one of `pending`, `in_progress`, `completed`, or `blocked`. `folder` is a folder ID or `null`. `parents` is an array of todo IDs owned by the same user; cyclic relationships are rejected. `tags` is an array of strings and is case-insensitive. The generated `date` field contains both date and time.

The list endpoint accepts `page`, `limit` (maximum 100), `status`, `archived`, `folder`, `tag`, and `search` query parameters. Use `folder=none` for todos outside folders. Its response contains `data` and `pagination`.

Folders have `name` and `parent`. `parent` is another folder ID or `null` for a root folder. Nesting can be arbitrarily deep, and cyclic nesting is rejected. `GET /folders?parent=root` returns root folders; passing a folder ID returns its direct children. Deleting a folder moves its direct child folders and todos to the root rather than deleting their contents.

The search endpoint accepts these query parameters:

- `q`: general partial match across title, content, and tags
- `title`, `content`, `tag`: field-specific partial matches (`tag` is exact and case-insensitive)
- `status`, `archived`, `folder`: exact filters; use `folder=none` for unfiled todos
- `date_from`, `date_to`: inclusive ISO 8601 date or date-time bounds
- `page`, `limit`: pagination; `limit` cannot exceed 100
- `sort`: `date`, `title`, or `status`
- `order`: `asc` or `desc`

For example: `GET /todos/search?q=release&status=in_progress&date_from=2026-06-01&sort=title&order=asc`.
