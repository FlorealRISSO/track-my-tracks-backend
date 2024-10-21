# Use an official Node.js image as a base
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Build the TypeScript code
RUN npx tsc

# Expose the port on which your server runs (e.g., 3000)
EXPOSE 3000

# Command to run the server
CMD ["npx", "ts-node", "src/server.ts"]

