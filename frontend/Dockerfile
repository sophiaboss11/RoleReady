FROM node:20-alpine as build

WORKDIR /app
COPY package.json package-lock.json ./

RUN npm install

COPY ./ ./
RUN npm run build

FROM nginx:1.23.0-alpine
EXPOSE 8080
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
