FROM node:lts AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
RUN echo "server_tokens off;" > /etc/nginx/conf.d/security.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
