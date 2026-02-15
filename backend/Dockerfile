FROM golang:1.26 AS build-stage

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./

RUN CGO_ENABLED=0 GOOS=linux go build -o /skeppio-backend

FROM gcr.io/distroless/base-debian11 AS build-release-stage

WORKDIR /

COPY --from=build-stage /skeppio-backend /skeppio-backend

EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT ["/skeppio-backend"]
