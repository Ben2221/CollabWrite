FROM node:20-alpine
WORKDIR /usr/src/app

COPY package*.json package-lock.json ./
RUN npm ci --network-timeout=1000000

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
