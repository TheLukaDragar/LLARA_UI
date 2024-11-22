FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build for production
RUN npm run build

# Install serve to run the application
RUN npm install -g serve

EXPOSE 3000

CMD ["serve", "-s", "build", "-l", "3000"] 