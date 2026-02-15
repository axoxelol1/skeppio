# skeppio

Visualize ship data from [aisstream](https://aisstream.io/) on a 3D globe.
Earth texture is from [Solar System Scope](https://www.solarsystemscope.com/textures/).

## Development

For now just dev with `go run .` for backend and `npm run dev` for frontend.

### Environment variables

Copy `backend/.env.example` to `backend/.env` and change AIS_API_KEY to your key from [aisstream](https://aisstream.io/).

## Deployment

Dockerfiles are provided for the backend and frontend. Set them up together behind a reverse proxy and send /ws to the backend. Example docker-compose file:

```services:
  backend:
    image: skeppio-backend:latest
    pull_policy: never
    restart: unless-stopped
    environment:
      - AIS_API_KEY=${AIS_API_KEY}
      - ORIGIN=${ORIGIN}
  frontend:
    image: skeppio-frontend:latest
    pull_policy: never
    restart: unless-stopped
```

And either include a reverse-proxy in this compose or hook it up to your existing one.
