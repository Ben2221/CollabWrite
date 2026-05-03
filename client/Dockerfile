FROM node:20-alpine
WORKDIR /usr/src/app

COPY package*.json package-lock.json ./
RUN npm ci --network-timeout=1000000

COPY . .
EXPOSE 4173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "4173"]
